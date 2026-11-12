# Week Off Tracker

Employee week-off marking and tracking portal (Next.js 16 + built-in SQLite).

## Run

```bash
npm install
npm run dev          # http://localhost:3000
# or for production
npm run build && npm start
```

Data is stored in **PostgreSQL** (Neon) and mirrored to a **Google Sheet** (one tab per Business Unit).
Tables are created automatically on first start.

### Settings (`.env`, not committed)

```
DATABASE_URL=postgresql://...                     # Neon connection string
ADMIN_EMAIL=<admin email>                         # first admin, created when the DB is empty
ADMIN_PASSWORD=<admin password>
HEAD_DEFAULT_PASSWORD=<initial password for Department Heads>
APP_TIMEZONE=Asia/Kolkata                         # for "Date of Request"
GOOGLE_SHEET_ID=19roD8uJ03xm6BfFTOmzHyVYd2UzK_86OM5up9qkoNfk
GOOGLE_SERVICE_ACCOUNT_FILE=google-service-account.json
```

### Google Sheet setup (one time)

1. Google Cloud Console → create a project (or use one) → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → create one → Keys → **Add key → JSON**. Save it in the project folder as
   `google-service-account.json` (git-ignored).
3. Open the spreadsheet → **Share** → add the service account's `client_email` as **Editor**.
4. Restart the app. The **Week Off Sheet** page (admin) shows "connected"; press **Sync all tabs now** once.

Tab ↔ Business Unit mapping lives in `src/lib/gsheets.ts` (`SHEET_TABS`, by tab gid). Each change rewrites columns A–F of that
Business Unit's tab from the database, so the sheet always matches the DB.

### Moving old local data

`node --env-file=.env scripts/migrate-sqlite-to-postgres.mjs` copies `data/hr-weekoff.db` into Postgres (refuses if Postgres
already has data). Already done for the current data.

## Roles and access

| Role | Sees | Can do |
|------|------|--------|
| **Admin** | All employees | Add / edit / delete (single and bulk), bulk CSV upload, assign roles, map employees to heads, grant login, view / download the Week Off Sheet, view activity log (does not mark week offs) |
| **Department Head** | Only employees mapped under them (including under their sub-heads) | View their team; mark week offs for the team **if** "Can update week offs" is enabled |
| **Employee** | Only themselves | View own week offs; mark own **if** "Can update week offs" is enabled |

- **Login** uses **Employee ID + Email ID + password**. Only people with **Portal (login) access** turned on can sign in — everybody else is just a record in the system.
- Revoking portal access or setting someone Inactive signs them out immediately.
- Mapping: each employee has a **Reporting / Department head** (any Head or Admin).

## Department Heads

Every Department Head (anyone with the Head role, or anyone others report to in the bulk upload) gets login access and
week-off permission automatically, with the initial password from `HEAD_DEFAULT_PASSWORD`. They sign in at `/login` with
Employee ID + Email + password, and can change the password under **My Account**. Admins can still revoke a head's access.

## Week Off Sheet

Every mark / unmark is saved in the database and mirrored to `data/WeekOff-Sheet.csv` (also viewable and downloadable on the
**Week Off Sheet** page) with the columns:

`Emp ID · Associate Name · Designation · Date of Request · Week off Date - 1 · Week off Date - 2`

- One row per employee per week (Monday–Sunday).
- Two week offs in the week → both are shown as day and date.
- One week off → Date - 1 is `Working`, Date - 2 is the selected day and date.
- At most 2 week offs can be marked in a week.

## Features

- **Week Offs** – monthly grid; click a day to mark/unmark. Per-employee and per-day totals, department filter, search, CSV export.
  - *Auto-fill default week offs* – fills the month from each employee's default day(s) (e.g. `SUN` or `SAT,SUN`).
  - *Clear month*, and bulk week-off CSV upload (`employee_id,date,action,note`).
- **Employees** – add / edit / delete; select many rows to bulk-edit department, reporting head, role, portal access, week-off permission, status or default day, or bulk-delete.
- **Bulk Upload** – CSV import that creates new employees and updates existing ones (matched by `employee_id`; blank cells keep current values). Download the template from the page.
- **Activity Log** – who did what and when.

## Project layout

```
src/lib/          db (schema + seed), auth (sessions, visibility rules), employees, csv, dates
src/app/actions/  server actions: auth, employees (CRUD/bulk/import), weekoffs
src/app/(portal)/ authenticated pages: weekoffs, employees, employees/import, account, activity
src/app/api/      CSV export + template downloads
src/proxy.ts      redirects signed-out users to /login
```
