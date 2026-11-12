import fs from "node:fs";
import path from "node:path";
import { createSign } from "node:crypto";
import { buildSheetRows, sheetValues } from "./sheet";
import { db, logActivity } from "./db";

/**
 * Google Sheet sync. Each Business Unit has its own tab (identified by its gid, so renaming a tab
 * doesn't break anything). Whenever a week off changes, that Business Unit's tab is rewritten
 * (columns A–F) from the database, so the sheet always matches the DB.
 *
 * Config (.env):
 *   GOOGLE_SHEET_ID=19roD8uJ03xm6BfFTOmzHyVYd2UzK_86OM5up9qkoNfk
 *   GOOGLE_SERVICE_ACCOUNT_FILE=google-service-account.json   (or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY)
 * The spreadsheet must be shared (Editor) with the service account's email.
 */
export const SHEET_TABS: Record<string, number> = {
  "Central Academics": 1739267925,
  "Admissions Training & Development": 2062434494,
  "COO's Office": 2105434252,
  "Chairman's Office": 1146983224,
  "Corporate Administration": 1598115911,
  "Information Technology": 0,
  "Corporate Finance": 829525143,
  MIS: 1554646720,
  Marketing: 701495975,
  "Institutional Marketing": 103001795,
  "Online Operations": 894578876,
  "Quality Assurance & Knowledge Management": 757481064,
  "Student Services": 741576647,
  "Strategy and Planning": 481955020,
  // "Human Resources": <gid>  ← add once the HR tab exists
};

type Credentials = { client_email: string; private_key: string };

function credentials(): Credentials | null {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (file) {
    const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
    if (fs.existsSync(full)) return JSON.parse(fs.readFileSync(full, "utf8")) as Credentials;
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  return null;
}

export function sheetsConfigured(): boolean {
  return !!process.env.GOOGLE_SHEET_ID && credentials() !== null;
}

const g = globalThis as unknown as {
  __gsToken?: { token: string; exp: number };
  __gsTitles?: Map<number, string>;
  __gsRunning?: Map<string, Promise<void>>;
  __gsDirty?: Set<string>;
};

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

async function tabTitle(gid: number): Promise<string> {
  if (!g.__gsTitles?.has(gid)) {
    const meta = (await api("?fields=sheets.properties(sheetId,title)")) as { sheets: { properties: { sheetId: number; title: string } }[] };
    g.__gsTitles = new Map(meta.sheets.map((s) => [s.properties.sheetId, s.properties.title]));
  }
  const title = g.__gsTitles.get(gid);
  if (title === undefined) throw new Error(`Tab with gid ${gid} not found in the spreadsheet`);
  return title;
}

/** Rewrites one Business Unit's tab from the database. */
async function writeTab(businessUnit: string) {
  const gid = SHEET_TABS[businessUnit];
  if (gid === undefined) return; // no tab for this business unit
  const range = `'${(await tabTitle(gid)).replace(/'/g, "''")}'!A:F`;
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
    [...new Set(units.filter((u): u is string => !!u && u in SHEET_TABS))].map(async (bu) => {
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
  return syncBusinessUnits(Object.keys(SHEET_TABS));
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
