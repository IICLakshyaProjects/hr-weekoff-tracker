import fs from "node:fs";
import path from "node:path";
import { createSign } from "node:crypto";
import { buildSheetRows, sheetValues } from "./sheet";
import { db, logActivity } from "./db";

/**
 * Google Sheet sync. Each business unit has a tab with the same name (for example "Human Resources",
 * "Corporate Finance"). Whenever a week off changes, that tab is rewritten (columns A–F) from the
 * database, so the sheet always matches the DB.
 *
 * Config (.env):
 *   GOOGLE_SHEET_ID=...
 *   GOOGLE_SERVICE_ACCOUNT_FILE=google-service-account.json
 *     or the service-account JSON itself (raw or base64)
 *     or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 * The spreadsheet must be shared (Editor) with the service account's email.
 */

type Credentials = { client_email: string; private_key: string };

function parseServiceAccount(text: string): Credentials | null {
  try {
    const json = JSON.parse(text) as Partial<Credentials>;
    if (!json.client_email || !json.private_key) return null;
    const private_key = json.private_key.includes("\\n") ? json.private_key.replace(/\\n/g, "\n") : json.private_key;
    return { client_email: json.client_email, private_key };
  } catch {
    return null;
  }
}

const g = globalThis as unknown as {
  __gsCreds?: Credentials | null;
  __gsToken?: { token: string; exp: number };
  __gsTitles?: string[];
  __gsRunning?: Map<string, Promise<void>>;
  __gsDirty?: Set<string>;
};

/** File path, raw JSON, or base64 JSON. The env value is not always a path. */
function credentials(): Credentials | null {
  if (g.__gsCreds !== undefined) return g.__gsCreds;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  let parsed: Credentials | null = null;
  if (raw) {
    // A pasted key is far longer than a path; existsSync on it throws ENAMETOOLONG on Windows.
    if (raw.length < 260 && !raw.startsWith("{")) {
      const full = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) parsed = parseServiceAccount(fs.readFileSync(full, "utf8"));
    }
    if (!parsed && raw.startsWith("{")) parsed = parseServiceAccount(raw);
    if (!parsed) {
      const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) parsed = parseServiceAccount(decoded);
    }
  }
  if (!parsed && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    parsed = {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.includes("\\n")
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : process.env.GOOGLE_PRIVATE_KEY,
    };
  }
  g.__gsCreds = parsed;
  return parsed;
}

export function sheetsConfigured(): boolean {
  return !!process.env.GOOGLE_SHEET_ID && credentials() !== null;
}

async function accessToken(): Promise<string> {
  if (g.__gsToken && g.__gsToken.exp > Date.now() + 60_000) return g.__gsToken.token;
  const creds = credentials();
  if (!creds) throw new Error("Google service account is not configured");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(creds.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  g.__gsToken = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function api(pathAndQuery: string, init: RequestInit = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${pathAndQuery}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Tab titles in the spreadsheet. Cached until a write fails (a tab may have been renamed). */
export async function listTabTitles(force = false): Promise<string[]> {
  if (!force && g.__gsTitles) return g.__gsTitles;
  const meta = (await api("?fields=sheets.properties(title)")) as { sheets: { properties: { title: string } }[] };
  g.__gsTitles = meta.sheets.map((s) => s.properties.title);
  return g.__gsTitles;
}

/** Spreadsheet tab whose title matches `name`, ignoring case and surrounding spaces. */
async function resolveTitle(name: string): Promise<string | undefined> {
  const found = (list: string[]) => list.find((t) => sameName(t, name));
  return found(await listTabTitles()) ?? found(await listTabTitles(true));
}

/**
 * Rewrites the tab named after this business unit (columns A–F).
 * Employees in "Finance" / "Academics" / "Digital Marketing" land on the tab for their business
 * unit — "Corporate Finance", "Central Academics", "Marketing" — because those are the tab names.
 */
async function writeTab(businessUnit: string) {
  const title = await resolveTitle(businessUnit);
  if (!title) throw new Error(`No sheet tab named "${businessUnit}"`);
  const range = `'${title.replace(/'/g, "''")}'!A:F`;
  const values = sheetValues(await buildSheetRows({ businessUnit }));
  await api(`/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" });
  await api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values }) });
}

/**
 * Syncs the given Business Units. Runs one sync per tab at a time; changes made while a sync is
 * running trigger exactly one follow-up sync, so the tab always ends up matching the database.
 */
export async function syncBusinessUnits(units: (string | null | undefined)[]): Promise<string[]> {
  if (!sheetsConfigured()) return [];
  g.__gsRunning ??= new Map();
  g.__gsDirty ??= new Set();
  const errors: string[] = [];
  await Promise.all(
    [...new Set(units.filter((u): u is string => !!u?.trim()))].map(async (bu) => {
      const running = g.__gsRunning!.get(bu);
      if (running) {
        g.__gsDirty!.add(bu);
        return running;
      }
      const job = (async () => {
        do {
          g.__gsDirty!.delete(bu);
          try {
            await writeTab(bu);
          } catch (err) {
            const msg = `${bu}: ${(err as Error).message}`;
            errors.push(msg);
            console.error("[sheet sync]", msg);
            await logActivity(null, "SHEET_SYNC_FAILED", msg).catch(() => {});
            g.__gsTitles = undefined; // tab may have been renamed/recreated
            break;
          }
        } while (g.__gsDirty!.has(bu));
      })().finally(() => g.__gsRunning!.delete(bu));
      g.__gsRunning!.set(bu, job);
      return job;
    }),
  );
  return errors;
}

export async function syncAllTabs(): Promise<string[]> {
  const rows = await (await db()).q<{ business_unit: string }>(
    "SELECT DISTINCT business_unit FROM employees WHERE business_unit IS NOT NULL AND btrim(business_unit) <> ''",
  );
  return syncBusinessUnits(rows.map((r) => r.business_unit));
}

/** Business units of the given employees (for deciding which tabs to refresh). */
export async function businessUnitsOf(employeeIds: number[]): Promise<string[]> {
  if (employeeIds.length === 0) return [];
  const rows = await (await db()).q<{ business_unit: string | null }>(
    "SELECT DISTINCT business_unit FROM employees WHERE id = ANY($1::int[])",
    [employeeIds],
  );
  return rows.map((r) => r.business_unit).filter((b): b is string => !!b);
}
