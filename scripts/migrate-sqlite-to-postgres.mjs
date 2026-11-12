// One-time copy of the old local SQLite data (data/hr-weekoff.db) into the Postgres DATABASE_URL.
// Usage:  node --env-file=.env scripts/migrate-sqlite-to-postgres.mjs
// Refuses to run if Postgres already has data beyond the auto-created admin.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import pg from "pg";

const SQLITE_FILE = process.argv[2] ?? "data/hr-weekoff.db";
if (!fs.existsSync(SQLITE_FILE)) throw new Error(`${SQLITE_FILE} not found`);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

// Reuse the exact schema from src/lib/db.ts.
const schema = fs.readFileSync("src/lib/db.ts", "utf8").match(/const SCHEMA = `([\s\S]*?)`;/)[1];

const lite = new DatabaseSync(SQLITE_FILE, { readOnly: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query(schema);
  const { rows: [counts] } = await client.query(
    "SELECT (SELECT count(*) FROM employees WHERE role <> 'ADMIN')::int AS emps, (SELECT count(*) FROM weekoffs)::int AS wos",
  );
  if (counts.emps > 0 || counts.wos > 0) {
    throw new Error(`Postgres already has ${counts.emps} employees / ${counts.wos} week offs — not migrating again.`);
  }

  const employees = lite.prepare("SELECT * FROM employees ORDER BY id").all();
  const weekoffs = lite.prepare("SELECT * FROM weekoffs ORDER BY id").all();
  const logs = lite.prepare("SELECT * FROM activity_log ORDER BY id").all();
  const utc = (s) => (s ? s.replace(" ", "T") + "Z" : null); // SQLite datetime('now') is UTC

  await client.query("BEGIN");
  await client.query("DELETE FROM sessions");
  await client.query("DELETE FROM activity_log");
  await client.query("DELETE FROM employees"); // only the auto-seeded admin can be here (checked above)

  // Insert without manager links first, then link (heads can appear after their team).
  for (const e of employees) {
    await client.query(
      `INSERT INTO employees (id, emp_code, name, email, phone, department, designation, business_unit, location, band, role,
         portal_access, can_edit_weekoff, default_weekoff, status, password_hash, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [e.id, e.emp_code, e.name, e.email || null, e.phone, e.department, e.designation, e.business_unit, e.location, e.band, e.role,
        !!e.portal_access, !!e.can_edit_weekoff, e.default_weekoff, e.status, e.password_hash, utc(e.created_at), utc(e.updated_at)],
    );
  }
  for (const e of employees) {
    if (e.manager_id) await client.query("UPDATE employees SET manager_id = $1 WHERE id = $2", [e.manager_id, e.id]);
  }
  for (const w of weekoffs) {
    await client.query(
      "INSERT INTO weekoffs (id, employee_id, date, note, marked_by, marked_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [w.id, w.employee_id, w.date, w.note, w.marked_by, utc(w.marked_at)],
    );
  }
  for (const l of logs) {
    await client.query("INSERT INTO activity_log (id, actor_id, action, details, at) VALUES ($1,$2,$3,$4,$5)", [
      l.id, l.actor_id, l.action, l.details, utc(l.at),
    ]);
  }
  // Continue identity numbering after the copied ids.
  for (const t of ["employees", "weekoffs", "activity_log"]) {
    await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT max(id) FROM ${t}), 1))`);
  }
  await client.query("COMMIT");
  console.log(`Migrated ${employees.length} employees, ${weekoffs.length} week offs, ${logs.length} log entries.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
