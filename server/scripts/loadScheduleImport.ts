// Loads a parsed shift-schedule CSV into a fresh test workspace on a real
// deployed API — entirely through the real HTTP endpoints (signup, layout,
// employees, shifts), never touching the database directly, so it's
// exercised exactly the way a real admin's actions would be.
//
// CSV columns: date,start_time,end_time,session_type,section,location,staff
//   - staff is a semicolon-separated list of names; each unique name across
//     the whole file becomes one Employee, with an auto-assigned PIN.
//
// Usage:
//   npx tsx scripts/loadScheduleImport.ts <path-to-csv> [apiBaseUrl]
//
// Prints the workspace code, admin login, and every employee's PIN at the
// end — that's the only place this data is recorded.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const csvPath = process.argv[2];
const API_BASE = (process.argv[3] || 'https://shift-tracker-y1s3.onrender.com').replace(/\/$/, '') + '/api';

if (!csvPath) {
  console.error('Usage: npx tsx scripts/loadScheduleImport.ts <path-to-csv> [apiBaseUrl]');
  process.exit(1);
}

interface ShiftRow {
  date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  section: string;
  location: string;
  staff: string[];
}

function parseCsv(text: string): ShiftRow[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // Simple CSV split is fine here — none of our fields legitimately
    // contain commas (staff names are semicolon-separated on purpose).
    const cols = line.split(',');
    const row: any = {};
    header.forEach((h, i) => (row[h] = (cols[i] ?? '').trim()));
    return {
      date: row.date,
      start_time: row.start_time,
      end_time: row.end_time,
      session_type: row.session_type || null,
      section: row.section,
      location: row.location,
      staff: row.staff ? row.staff.split(';').map((s: string) => s.trim()).filter(Boolean) : [],
    };
  });
}

// ── tiny cookie-jar fetch wrapper ───────────────────────────────────────
let sessionCookie = '';

async function api(pathAndQuery: string, options: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) sessionCookie = setCookie.split(';')[0];
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${pathAndQuery} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function randomPin(used: Set<string>): string {
  let pin: string;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(pin));
  used.add(pin);
  return pin;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  console.log(`Loaded ${rows.length} shift rows from ${csvPath}`);

  const suffix = Date.now().toString().slice(-5);
  const workspaceCode = `PLYMTEST${suffix}`;
  const adminEmail = `admin@plymouthtest.example`;
  const adminPassword = crypto.randomBytes(9).toString('base64url');

  console.log(`\nSigning up workspace ${workspaceCode}...`);
  await api('/auth/admin/signup', {
    body: { workspaceName: 'Plymouth Summer Schedule (Test)', workspaceCode, email: adminEmail, password: adminPassword },
  });

  // Skip the onboarding wizard's UI flow — just mark it done. We're
  // building the real layout ourselves below, so no placeholder needed.
  await api('/layout/onboarding-step', { method: 'PATCH', body: { step: 4 } });

  // ── Build layout: one Section per distinct `section`, one Location per
  // distinct (section, location), one Staff Sub-Row on each Location. ────
  const sectionIds = new Map<string, string>();
  const locationIds = new Map<string, string>();
  const subRowIds = new Map<string, string>();

  for (const row of rows) {
    if (!sectionIds.has(row.section)) {
      const section = await api('/layout/sections', { body: { name: row.section } });
      sectionIds.set(row.section, section.id);
      console.log(`Created Section: ${row.section}`);
    }
    const locKey = `${row.section}::${row.location}`;
    if (!locationIds.has(locKey)) {
      const location = await api('/layout/locations', { body: { sectionId: sectionIds.get(row.section), name: row.location } });
      locationIds.set(locKey, location.id);
      const subRow = await api('/layout/subrows', { body: { locationId: location.id, label: 'Staff', dataType: 'STAFF' } });
      subRowIds.set(locKey, subRow.id);
      console.log(`Created Location: ${row.section} / ${row.location}`);
    }
  }

  // ── Create employees, one per unique staff name across the whole file. ──
  const staffNames = Array.from(new Set(rows.flatMap((r) => r.staff))).sort();
  const usedPins = new Set<string>();
  const employeeIds = new Map<string, string>();
  const employeePins = new Map<string, string>();

  console.log(`\nCreating ${staffNames.length} employees...`);
  for (const name of staffNames) {
    const pin = randomPin(usedPins);
    const employee = await api('/employees', { body: { name, role: 'Employee', pin } });
    employeeIds.set(name, employee.id);
    employeePins.set(name, pin);
  }

  // ── Load shifts, a handful at a time so we don't hammer a free-tier
  // instance, but fast enough that 1000+ rows don't take forever. ────────
  console.log(`\nLoading ${rows.length} shifts...`);
  let created = 0;
  await mapLimit(rows, 6, async (row) => {
    const subRowId = subRowIds.get(`${row.section}::${row.location}`)!;
    const shift = await api('/shifts', {
      body: { subRowId, date: row.date, startTime: row.start_time, endTime: row.end_time, sessionType: row.session_type || null },
    });
    const staffEmployeeIds = row.staff.map((n) => employeeIds.get(n)).filter(Boolean);
    if (staffEmployeeIds.length > 0) {
      await api(`/shifts/cells/${shift.cellValues[0].id}`, { method: 'PATCH', body: { staffEmployeeIds } });
    }
    created++;
    if (created % 100 === 0) console.log(`  ...${created}/${rows.length}`);
  });

  console.log('\n=== Done ===');
  console.log(`Workspace code: ${workspaceCode}`);
  console.log(`Admin login:    ${adminEmail} / ${adminPassword}`);
  console.log(`\nEmployee PINs:`);
  for (const name of staffNames) {
    console.log(`  ${name}: ${employeePins.get(name)}`);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
