// Seeds two demo workspaces from unrelated industries using the exact same
// helper functions below. Nothing in this file (or anywhere downstream) is
// industry-aware: the only difference between the two workspaces is the
// admin-entered strings passed into these generic builders.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { DataType } from '../src/types';

const prisma = new PrismaClient();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function randomPassword(): string {
  return crypto.randomBytes(6).toString('base64url');
}

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── Generic builders (workspace-agnostic) ─────────────────────────────────

async function createWorkspace(name: string, workspaceCode: string) {
  return prisma.workspace.create({
    data: { name, workspaceCode, onboardingStep: 3 }, // seeded demos skip the wizard
  });
}

async function createAdmin(workspaceId: string, email: string) {
  const password = randomPassword();
  await prisma.adminUser.create({
    data: { workspaceId, email, passwordHash: bcrypt.hashSync(password, 10) },
  });
  return { email, password };
}

async function createEmployees(workspaceId: string, names: { name: string; role: string; pin: string }[]) {
  const created: Record<string, string> = {};
  for (const e of names) {
    const emp = await prisma.employee.create({
      data: { workspaceId, name: e.name, role: e.role, pinHash: bcrypt.hashSync(e.pin, 10) },
    });
    created[e.name] = emp.id;
  }
  return created;
}

async function createSection(workspaceId: string, name: string, sortOrder: number) {
  return prisma.section.create({ data: { workspaceId, name, sortOrder } });
}

async function createLocation(sectionId: string, name: string, sortOrder: number) {
  return prisma.location.create({ data: { sectionId, name, sortOrder } });
}

async function createSubRow(locationId: string, label: string, dataType: DataType, sortOrder: number, config: object = {}) {
  return prisma.subRow.create({
    data: { locationId, label, dataType, sortOrder, config: JSON.stringify(config) },
  });
}

/** Creates a Shift + its CellValue in one step; returns the CellValue id for further attachment (e.g. staff, files). */
async function createShiftCell(
  workspaceId: string,
  subRowId: string,
  date: string,
  startTime: string,
  endTime: string,
  payload: {
    textValue?: string;
    badgeLabel?: string;
    badgeColor?: string;
    statusValue?: string;
    linkUrl?: string;
  } = {}
) {
  const shift = await prisma.shift.create({
    data: { workspaceId, subRowId, date, startTime, endTime },
  });
  const cell = await prisma.cellValue.create({
    data: { shiftId: shift.id, subRowId, ...payload },
  });
  return cell.id;
}

async function assignStaff(cellValueId: string, employeeIds: string[]) {
  for (const employeeId of employeeIds) {
    await prisma.cellStaffAssignment.create({ data: { cellValueId, employeeId } });
  }
}

async function attachFile(cellValueId: string, filename: string, contents: string) {
  const diskName = `${crypto.randomUUID()}-${filename}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, diskName), contents);
  await prisma.fileUpload.create({
    data: { cellValueId, filename, url: `/uploads/${diskName}` },
  });
}

// ── Workspace 1: Security Firm ────────────────────────────────────────────

async function seedSentry() {
  const ws = await createWorkspace('Sentry Guard Services', 'SENTRY1');
  const admin = await createAdmin(ws.id, 'admin@sentryguard.example');

  const employees = await createEmployees(ws.id, [
    { name: 'Alex Rivera', role: 'Guard', pin: '1010' },
    { name: 'Jordan Lee', role: 'Guard', pin: '2020' },
    { name: 'Sam Patel', role: 'Guard', pin: '3030' },
    { name: 'Casey Kim', role: 'Guard', pin: '4040' },
    { name: 'Morgan Diaz', role: 'Guard', pin: '5050' },
    { name: 'Taylor Brooks', role: 'Supervisor', pin: '6060' },
  ]);

  const perimeter = await createSection(ws.id, 'Perimeter', 0);
  const interior = await createSection(ws.id, 'Building Interior', 1);

  const gate1 = await createLocation(perimeter.id, 'Gate 1', 0);
  const gate2 = await createLocation(perimeter.id, 'Gate 2', 1);
  const dock = await createLocation(perimeter.id, 'Loading Dock', 2);
  const lobby = await createLocation(interior.id, 'Lobby', 0);

  const gate1Priority = await createSubRow(gate1.id, 'Post Priority', 'BADGE', 0, {
    palette: { Low: '#22c55e', Medium: '#eab308', High: '#ef4444' },
  });
  const gate1Guards = await createSubRow(gate1.id, 'Assigned Guards', 'STAFF', 1);
  const gate1Notes = await createSubRow(gate1.id, 'Post Instructions', 'TEXT', 2);

  const gate2Priority = await createSubRow(gate2.id, 'Post Priority', 'BADGE', 0, {
    palette: { Low: '#22c55e', Medium: '#eab308', High: '#ef4444' },
  });
  const gate2Guards = await createSubRow(gate2.id, 'Assigned Guards', 'STAFF', 1);

  const dockGuards = await createSubRow(dock.id, 'Assigned Guards', 'STAFF', 0);
  const dockStatus = await createSubRow(dock.id, 'Shift Status', 'STATUS', 1);

  const lobbyGuards = await createSubRow(lobby.id, 'Assigned Guards', 'STAFF', 0);
  const lobbyProtocol = await createSubRow(lobby.id, 'Incident Protocol', 'LINK', 1);
  const lobbyChecklist = await createSubRow(lobby.id, 'Post Checklist', 'FILE', 2);
  const lobbyStatus = await createSubRow(lobby.id, 'Shift Status', 'STATUS', 3);

  for (let d = 6; d >= 0; d--) {
    const date = dateOffset(d);

    // Gate 1: BADGE + TEXT, one block/day
    const g1PriorityCell = await createShiftCell(ws.id, gate1Priority.id, date, '06:00', '22:00', {
      badgeLabel: d % 3 === 0 ? 'High' : 'Medium',
      badgeColor: d % 3 === 0 ? '#ef4444' : '#eab308',
    });
    await createShiftCell(ws.id, gate1Notes.id, date, '06:00', '22:00', {
      textValue: 'Check visitor badges. Radio dispatch on channel 3 for any escalation.',
    });

    // Gate 1 STAFF: Alex Rivera - demonstrate paid-break gap and unpaid-downtime gap on specific days
    if (d === 5) {
      // paid break gap demo: 08:00-12:00, 12:10-16:00 (10 min gap)
      const c1 = await createShiftCell(ws.id, gate1Guards.id, date, '08:00', '12:00');
      await assignStaff(c1, [employees['Alex Rivera']]);
      const c2 = await createShiftCell(ws.id, gate1Guards.id, date, '12:10', '16:00');
      await assignStaff(c2, [employees['Alex Rivera']]);
    } else if (d === 2) {
      // unpaid downtime gap demo: 08:00-12:00, 13:00-17:00 (60 min gap)
      const c1 = await createShiftCell(ws.id, gate1Guards.id, date, '08:00', '12:00');
      await assignStaff(c1, [employees['Alex Rivera']]);
      const c2 = await createShiftCell(ws.id, gate1Guards.id, date, '13:00', '17:00');
      await assignStaff(c2, [employees['Alex Rivera']]);
    } else {
      const c1 = await createShiftCell(ws.id, gate1Guards.id, date, '08:00', '16:00');
      await assignStaff(c1, [employees['Alex Rivera']]);
    }

    // Gate 2
    await createShiftCell(ws.id, gate2Priority.id, date, '06:00', '22:00', {
      badgeLabel: 'Low',
      badgeColor: '#22c55e',
    });
    const g2c = await createShiftCell(ws.id, gate2Guards.id, date, '08:00', '16:00');
    await assignStaff(g2c, [employees['Jordan Lee']]);

    // Loading Dock
    const dockc = await createShiftCell(ws.id, dockGuards.id, date, '06:00', '14:00');
    await assignStaff(dockc, [employees['Sam Patel']]);
    await createShiftCell(ws.id, dockStatus.id, date, '06:00', '14:00', { statusValue: 'IN_PROGRESS' });

    // Lobby
    const lobbyc = await createShiftCell(ws.id, lobbyGuards.id, date, '14:00', '22:00');
    await assignStaff(lobbyc, [employees['Casey Kim'], employees['Morgan Diaz']]);
    await createShiftCell(ws.id, lobbyProtocol.id, date, '06:00', '22:00', {
      linkUrl: 'https://example.com/incident-protocol.pdf',
    });
    const lobbyFileCell = await createShiftCell(ws.id, lobbyChecklist.id, date, '06:00', '22:00');
    if (d === 6) {
      await attachFile(lobbyFileCell, 'post-checklist.txt', 'Lobby post checklist:\n- Verify badge scanner online\n- Confirm fire exits clear\n');
    }
    await createShiftCell(ws.id, lobbyStatus.id, date, '14:00', '22:00', { statusValue: 'SCHEDULED' });
  }

  return { workspace: ws, admin };
}

// ── Workspace 2: Event Production Company ─────────────────────────────────

async function seedSkyline() {
  const ws = await createWorkspace('Skyline Events Co.', 'SKYLINE1');
  const admin = await createAdmin(ws.id, 'admin@skylineevents.example');

  const employees = await createEmployees(ws.id, [
    { name: 'Riley Chen', role: 'Stagehand', pin: '1111' },
    { name: 'Devon Ortiz', role: 'Stagehand', pin: '2222' },
    { name: 'Jamie Fox', role: 'Vendor Staff', pin: '3333' },
    { name: 'Quinn Alvarez', role: 'Vendor Staff', pin: '4444' },
    { name: 'Skyler Reyes', role: 'Vendor Staff', pin: '5555' },
    { name: 'Harper Nguyen', role: 'Stage Manager', pin: '6666' },
  ]);

  const stages = await createSection(ws.id, 'Stages', 0);
  const vendorRow = await createSection(ws.id, 'Vendor Row', 1);

  const mainStage = await createLocation(stages.id, 'Main Stage', 0);
  const stageB = await createLocation(stages.id, 'Stage B', 1);
  const foodZone = await createLocation(vendorRow.id, 'Food Vendor Zone', 0);
  const merchBooth = await createLocation(vendorRow.id, 'Merch Booth', 1);

  const mainTier = await createSubRow(mainStage.id, 'Act Tier', 'BADGE', 0, {
    palette: { Headliner: '#a855f7', Support: '#3b82f6', Local: '#22c55e' },
  });
  const mainStagehands = await createSubRow(mainStage.id, 'Stagehands', 'STAFF', 1);
  const mainNotes = await createSubRow(mainStage.id, 'Setup Notes', 'TEXT', 2);

  const stageBTier = await createSubRow(stageB.id, 'Act Tier', 'BADGE', 0, {
    palette: { Headliner: '#a855f7', Support: '#3b82f6', Local: '#22c55e' },
  });
  const stageBHands = await createSubRow(stageB.id, 'Stagehands', 'STAFF', 1);

  const foodStaff = await createSubRow(foodZone.id, 'Vendor Staff', 'STAFF', 0);
  const foodStatus = await createSubRow(foodZone.id, 'Booth Readiness', 'STATUS', 1);

  const merchStaff = await createSubRow(merchBooth.id, 'Vendor Staff', 'STAFF', 0);
  const merchRider = await createSubRow(merchBooth.id, 'Rider Doc', 'LINK', 1);
  const merchRunOfShow = await createSubRow(merchBooth.id, 'Run of Show', 'FILE', 2);
  const merchStatus = await createSubRow(merchBooth.id, 'Booth Readiness', 'STATUS', 3);

  for (let d = 6; d >= 0; d--) {
    const date = dateOffset(d);

    await createShiftCell(ws.id, mainTier.id, date, '06:00', '22:00', {
      badgeLabel: d % 3 === 0 ? 'Headliner' : 'Support',
      badgeColor: d % 3 === 0 ? '#a855f7' : '#3b82f6',
    });
    await createShiftCell(ws.id, mainNotes.id, date, '06:00', '22:00', {
      textValue: 'Sound check at load-in +2h. Confirm rigging inspection before doors.',
    });

    // Main Stage STAFF: Riley Chen - same gap demo pattern as the security workspace,
    // proving the break engine is identical regardless of industry.
    if (d === 5) {
      const c1 = await createShiftCell(ws.id, mainStagehands.id, date, '08:00', '12:00');
      await assignStaff(c1, [employees['Riley Chen']]);
      const c2 = await createShiftCell(ws.id, mainStagehands.id, date, '12:10', '16:00');
      await assignStaff(c2, [employees['Riley Chen']]);
    } else if (d === 2) {
      const c1 = await createShiftCell(ws.id, mainStagehands.id, date, '08:00', '12:00');
      await assignStaff(c1, [employees['Riley Chen']]);
      const c2 = await createShiftCell(ws.id, mainStagehands.id, date, '13:00', '17:00');
      await assignStaff(c2, [employees['Riley Chen']]);
    } else {
      const c1 = await createShiftCell(ws.id, mainStagehands.id, date, '08:00', '16:00');
      await assignStaff(c1, [employees['Riley Chen']]);
    }

    await createShiftCell(ws.id, stageBTier.id, date, '06:00', '22:00', {
      badgeLabel: 'Local',
      badgeColor: '#22c55e',
    });
    const bHands = await createShiftCell(ws.id, stageBHands.id, date, '08:00', '16:00');
    await assignStaff(bHands, [employees['Devon Ortiz']]);

    const foodc = await createShiftCell(ws.id, foodStaff.id, date, '06:00', '14:00');
    await assignStaff(foodc, [employees['Jamie Fox']]);
    await createShiftCell(ws.id, foodStatus.id, date, '06:00', '14:00', { statusValue: 'IN_PROGRESS' });

    const merchc = await createShiftCell(ws.id, merchStaff.id, date, '14:00', '22:00');
    await assignStaff(merchc, [employees['Quinn Alvarez'], employees['Skyler Reyes']]);
    await createShiftCell(ws.id, merchRider.id, date, '06:00', '22:00', {
      linkUrl: 'https://example.com/artist-rider.pdf',
    });
    const merchFileCell = await createShiftCell(ws.id, merchRunOfShow.id, date, '06:00', '22:00');
    if (d === 6) {
      await attachFile(merchFileCell, 'run-of-show.txt', 'Run of show:\n1. Gates open 10:00\n2. Main Stage set 12:00\n3. Headliner 20:00\n');
    }
    await createShiftCell(ws.id, merchStatus.id, date, '14:00', '22:00', { statusValue: 'SCHEDULED' });
  }

  return { workspace: ws, admin };
}

// ── Workspace 3: MAP Hockey (real-world spreadsheet reproduction) ─────────
// Everything here goes through the exact same generic builders as the two
// workspaces above; the only "hockey-ness" is in the admin-entered strings
// (tier badge labels, coach names, drill names).

const TIER_PALETTE: Record<string, string> = {
  T1: '#22c55e',
  T2: '#0ea5e9',
  'T2 BLUE': '#2563eb',
  'T2 GREEN': '#16a34a',
  T3: '#eab308',
  'T4 BLACK': '#111827',
  'T4 ORANGE': '#f97316',
  HS: '#a855f7',
  COLL: '#ec4899',
};

function tierColor(label: string): string {
  return TIER_PALETTE[label] ?? '#64748b';
}

interface IceSession {
  start: string;
  end: string;
  tier?: string;
  skaters?: string[];
  goalie?: string[];
  goalieDrill?: string; // Goalie Lesson Plan label, e.g. "Change of Angle"
}

interface StrengthSession {
  start: string;
  end: string;
  tier: string;
  staff: string[];
}

async function seedMapHockey() {
  const ws = await createWorkspace('MAP Hockey', 'MAPHKY');
  const admin = await createAdmin(ws.id, 'admin@maphockey.example');

  const roster = [
    'Gunner',
    'Madson Jibber Kuhl',
    'Hobey Skulstad',
    'Drew Streeter',
    'Matt',
    'Luken Huff',
    'Brooke Poiske',
    'Adam Kimbrel',
    'Keaton LeGrande',
    'Blanch',
    'Peter Keese',
    'Henry Miller',
    'Braydon Buckingham',
    'Jackson Studebaker',
    'Gman',
    'Sam',
    'Mike',
    'Noah Duerr',
    'Nieto',
    'Jaime',
    'Evan Leggett',
    'AJ Thompson',
    'Jon',
    'Evelyn Osland',
  ];
  const employees = await createEmployees(
    ws.id,
    roster.map((name, i) => ({ name, role: 'Coach', pin: String(7001 + i) }))
  );

  const ice = await createSection(ws.id, 'ICE', 0);
  const workouts = await createSection(ws.id, 'WORKOUTS', 1);
  const skills = await createSection(ws.id, 'SKILLS', 2);
  const general = await createSection(ws.id, 'General', 3);

  // ── ICE: Rink A, B, C — each with the same 5 sub-rows in the same order ──
  const rinkA = await createLocation(ice.id, 'Rink A', 0);
  const rinkB = await createLocation(ice.id, 'Rink B', 1);
  const rinkC = await createLocation(ice.id, 'Rink C', 2);

  async function buildRinkSubRows(locationId: string) {
    return {
      tier: await createSubRow(locationId, 'TIER', 'BADGE', 0, { palette: TIER_PALETTE }),
      skaterPlan: await createSubRow(locationId, 'Skater Lesson Plan', 'TEXT', 1),
      skaterCoach: await createSubRow(locationId, 'Skater Coach', 'STAFF', 2),
      goaliePlan: await createSubRow(locationId, 'Goalie Lesson Plan', 'LINK', 3),
      goalieCoach: await createSubRow(locationId, 'Goalie Coach', 'STAFF', 4),
    };
  }

  const rinkARows = await buildRinkSubRows(rinkA.id);
  const rinkBRows = await buildRinkSubRows(rinkB.id);
  const rinkCRows = await buildRinkSubRows(rinkC.id);

  const date = dateOffset(0); // seeded for "today" (a Tuesday at seed time)

  // The weekly skater-lesson theme is the same across every rink for the day,
  // so it's modeled as one full-window cell per rink rather than per session.
  const WEEKLY_THEME =
    'Week 6: Skill: Deception/Awareness (Fakes & Dekes); Skating: Edges (can add in some stride)';
  for (const rows of [rinkARows, rinkBRows, rinkCRows]) {
    await createShiftCell(ws.id, rows.skaterPlan.id, date, '06:00', '22:00', { textValue: WEEKLY_THEME });
  }

  async function seedIceSessions(rows: Awaited<ReturnType<typeof buildRinkSubRows>>, sessions: IceSession[]) {
    for (const s of sessions) {
      if (s.tier) {
        await createShiftCell(ws.id, rows.tier.id, date, s.start, s.end, {
          badgeLabel: s.tier,
          badgeColor: tierColor(s.tier),
        });
      }
      if (s.skaters) {
        const cell = await createShiftCell(ws.id, rows.skaterCoach.id, date, s.start, s.end);
        await assignStaff(
          cell,
          s.skaters.map((name) => employees[name])
        );
      }
      if (s.goalie) {
        const cell = await createShiftCell(ws.id, rows.goalieCoach.id, date, s.start, s.end);
        await assignStaff(
          cell,
          s.goalie.map((name) => employees[name])
        );
      }
      if (s.goalieDrill) {
        await createShiftCell(ws.id, rows.goaliePlan.id, date, s.start, s.end, {
          textValue: s.goalieDrill,
          linkUrl: `#drill/${s.goalieDrill.toLowerCase().replace(/\s+/g, '-')}`,
        });
      }
    }
  }

  // Rink C — Goalie Lesson Plan is "Change of Angle" for all sessions starting
  // before 14:00 (2:00pm), blank from the 14:00 session onward.
  await seedIceSessions(rinkCRows, [
    { start: '09:00', end: '10:00', tier: 'T1', skaters: ['Gunner', 'Madson Jibber Kuhl', 'Hobey Skulstad'], goalie: ['Keaton LeGrande'], goalieDrill: 'Change of Angle' },
    { start: '10:15', end: '11:15', tier: 'T2 BLUE', skaters: ['Gunner', 'Madson Jibber Kuhl', 'Hobey Skulstad'], goalie: ['Keaton LeGrande'], goalieDrill: 'Change of Angle' },
    { start: '11:30', end: '12:30', tier: 'T2 GREEN', skaters: ['Gunner', 'Madson Jibber Kuhl', 'Hobey Skulstad', 'Drew Streeter'], goalie: ['Keaton LeGrande'], goalieDrill: 'Change of Angle' },
    { start: '12:45', end: '13:45', tier: 'T3', skaters: ['Gunner', 'Madson Jibber Kuhl', 'Hobey Skulstad', 'Drew Streeter'], goalie: ['Adam Kimbrel'], goalieDrill: 'Change of Angle' },
    { start: '14:00', end: '15:00', tier: 'HS', skaters: ['Matt', 'Drew Streeter', 'Luken Huff'], goalie: ['Adam Kimbrel'] },
    { start: '15:15', end: '16:15', tier: 'COLL', skaters: ['Matt', 'Luken Huff'], goalie: ['Adam Kimbrel'] },
    { start: '16:30', end: '17:30', tier: 'HS', skaters: ['Matt', 'Brooke Poiske', 'Luken Huff'], goalie: ['Adam Kimbrel'] },
    { start: '17:45', end: '18:45', tier: 'T2', skaters: ['Matt', 'Brooke Poiske'], goalie: ['Adam Kimbrel'] },
  ]);

  // Rink B — no Goalie Lesson Plan data given in the source, left blank.
  await seedIceSessions(rinkBRows, [
    { start: '07:00', end: '08:00', tier: 'T4 BLACK', skaters: ['Blanch', 'Peter Keese', 'Henry Miller'], goalie: ['Nieto'] },
    { start: '08:15', end: '09:15', tier: 'T4 ORANGE', skaters: ['Blanch', 'Peter Keese', 'Henry Miller', 'Braydon Buckingham'], goalie: ['Nieto'] },
    { start: '09:30', end: '10:30', tier: 'T3', skaters: ['Blanch', 'Peter Keese', 'Henry Miller', 'Braydon Buckingham'], goalie: ['Nieto'] },
    { start: '10:45', end: '11:45', tier: 'T2', skaters: ['Blanch', 'Sam', 'Jackson Studebaker', 'Braydon Buckingham'], goalie: ['Mike'] },
    { start: '12:00', end: '13:00', tier: 'COLL', skaters: ['Gman', 'Sam', 'Jackson Studebaker'], goalie: ['Mike'] },
    { start: '13:15', end: '14:15', tier: 'T1', skaters: ['Gman', 'Sam', 'Jackson Studebaker'], goalie: ['Mike', 'Noah Duerr'] },
    { start: '14:30', end: '15:30', tier: 'HS', skaters: ['Gman', 'Sam'], goalie: ['Noah Duerr'] },
  ]);

  // Rink A — sparse/ambiguous in the source spreadsheet: one compound-label
  // clinic badge, and one late slot with only coach names and no tier given.
  await createShiftCell(ws.id, rinkARows.tier.id, date, '14:30', '15:30', {
    badgeLabel: 'FHIT CLINIC – D / MEGA W',
    badgeColor: tierColor('FHIT CLINIC – D / MEGA W'),
  });
  const rinkAClinicCoach = await createShiftCell(ws.id, rinkARows.skaterCoach.id, date, '14:30', '15:30');
  await assignStaff(rinkAClinicCoach, [employees['Jackson Studebaker']]);
  const rinkALateCoach = await createShiftCell(ws.id, rinkARows.skaterCoach.id, date, '16:30', '17:30');
  await assignStaff(rinkALateCoach, [employees['Mike'], employees['Keaton LeGrande']]);

  // ── WORKOUTS: Weight Room A (T1-HS/COLL group), Weight Room B (T4 group) ──
  const weightRoomA = await createLocation(workouts.id, 'Weight Room A', 0);
  const weightRoomB = await createLocation(workouts.id, 'Weight Room B', 1);

  async function buildStrengthSubRows(locationId: string) {
    return {
      tier: await createSubRow(locationId, 'TIER', 'BADGE', 0, { palette: TIER_PALETTE }),
      phaseWeekDay: await createSubRow(locationId, 'Phase, Week, Day', 'TEXT', 1),
      strengthCoach: await createSubRow(locationId, 'Strength Coach', 'STAFF', 2),
    };
  }

  const weightRoomARows = await buildStrengthSubRows(weightRoomA.id);
  const weightRoomBRows = await buildStrengthSubRows(weightRoomB.id);

  async function seedStrengthSessions(rows: Awaited<ReturnType<typeof buildStrengthSubRows>>, sessions: StrengthSession[]) {
    for (const s of sessions) {
      await createShiftCell(ws.id, rows.tier.id, date, s.start, s.end, {
        badgeLabel: s.tier,
        badgeColor: tierColor(s.tier),
      });
      // "Phase, Week, Day" intentionally left blank: the source spreadsheet
      // didn't specify per-session values for these Weight Room rows, and an
      // empty "click to edit" cell is more honest than a fabricated one.
      const coachCell = await createShiftCell(ws.id, rows.strengthCoach.id, date, s.start, s.end);
      await assignStaff(
        coachCell,
        s.staff.map((name) => employees[name])
      );
    }
  }

  await seedStrengthSessions(weightRoomARows, [
    { start: '07:45', end: '08:45', tier: 'T1', staff: ['Jaime'] },
    { start: '09:00', end: '10:00', tier: 'T2 BLUE', staff: ['Jaime', 'Evan Leggett'] },
    { start: '10:15', end: '11:15', tier: 'T2 GREEN', staff: ['Jaime', 'Evan Leggett'] },
    { start: '11:30', end: '12:30', tier: 'T3', staff: ['Jaime', 'Evan Leggett'] },
    { start: '12:45', end: '13:45', tier: 'HS', staff: ['Jaime', 'AJ Thompson', 'Evan Leggett'] },
    { start: '14:00', end: '15:00', tier: 'COLL', staff: ['Jaime', 'AJ Thompson', 'Evan Leggett'] },
    { start: '15:15', end: '16:15', tier: 'HS', staff: ['Jon', 'AJ Thompson'] },
    { start: '16:30', end: '17:30', tier: 'T2', staff: ['Jon', 'AJ Thompson'] },
  ]);

  await seedStrengthSessions(weightRoomBRows, [
    { start: '08:15', end: '09:15', tier: 'T4 BLACK', staff: ['Jon', 'Evelyn Osland'] },
    { start: '09:30', end: '10:30', tier: 'T4 ORANGE', staff: ['Jon', 'Evelyn Osland'] },
    { start: '10:45', end: '11:45', tier: 'T3', staff: ['Jon', 'Evelyn Osland'] },
    { start: '12:00', end: '13:00', tier: 'T2', staff: ['Jon', 'Evelyn Osland'] },
    { start: '13:15', end: '14:15', tier: 'COLL', staff: ['Jon', 'AJ Thompson', 'Evelyn Osland'] },
    { start: '14:30', end: '15:30', tier: 'T1', staff: ['Jon', 'AJ Thompson', 'Evelyn Osland'] },
    { start: '15:45', end: '16:45', tier: 'HS', staff: ['Jaime'] },
  ]);

  // ── SKILLS: Skills Station — many short back-to-back blocks ───────────────
  const skillsStation = await createLocation(skills.id, 'Skills Station', 0);
  const skillsTier = await createSubRow(skillsStation.id, 'TIER', 'BADGE', 0, { palette: TIER_PALETTE });
  const skillsPhaseWeekDay = await createSubRow(skillsStation.id, 'Phase, Week, Day', 'TEXT', 1);
  const skillsSkaterCoach = await createSubRow(skillsStation.id, 'Skater Coach', 'STAFF', 2);
  const skillsGoalieCoach = await createSubRow(skillsStation.id, 'Goalie Coach', 'STAFF', 3);

  const skillsSessions: IceSession[] = [
    { start: '09:30', end: '10:00', tier: 'T4 BLACK', skaters: ['Sam', 'Drew Streeter'], goalie: ['Mike'] },
    { start: '10:15', end: '10:45', tier: 'T1', skaters: ['Gman', 'Drew Streeter'], goalie: ['Noah Duerr'] },
    { start: '10:45', end: '11:15', tier: 'T4 ORANGE', skaters: ['Matt', 'Drew Streeter'], goalie: ['Noah Duerr'] },
    { start: '11:30', end: '12:00', tier: 'T2 BLUE', skaters: ['Matt', 'Peter Keese'], goalie: ['Noah Duerr'] },
    { start: '12:00', end: '12:30', tier: 'T3', skaters: ['Matt', 'Blanch'], goalie: ['Noah Duerr'] },
    { start: '12:45', end: '13:15', tier: 'T2 GREEN', skaters: ['Matt', 'Blanch'], goalie: ['Adam Kimbrel'] },
    { start: '13:15', end: '13:45', tier: 'T2', skaters: ['Gunner', 'Blanch'], goalie: ['Adam Kimbrel'] },
    { start: '14:00', end: '14:30', tier: 'T3', skaters: ['Blanch'], goalie: ['Nieto'] },
    { start: '14:30', end: '15:00', tier: 'COLL', skaters: ['Gunner', 'Sam'], goalie: ['Nieto'] },
    { start: '15:15', end: '15:45', tier: 'HS', skaters: ['Gunner'], goalie: ['Nieto'] },
    { start: '15:45', end: '16:15', tier: 'T1', skaters: ['Gunner', 'Sam'], goalie: ['Nieto'] },
    { start: '16:30', end: '17:00', tier: 'COLL', skaters: ['Sam', 'Luken Huff'], goalie: ['Mike'] },
    { start: '17:00', end: '17:30', tier: 'HS', skaters: ['Gunner', 'Sam'], goalie: ['Mike'] },
    { start: '17:45', end: '18:15', tier: 'HS', skaters: ['Sam', 'Luken Huff'], goalie: ['Mike'] },
    { start: '19:00', end: '19:30', tier: 'T2', skaters: ['Matt', 'Brooke Poiske'], goalie: ['Adam Kimbrel'] },
  ];

  for (const s of skillsSessions) {
    await createShiftCell(ws.id, skillsTier.id, date, s.start, s.end, { badgeLabel: s.tier!, badgeColor: tierColor(s.tier!) });
    const skaterCell = await createShiftCell(ws.id, skillsSkaterCoach.id, date, s.start, s.end);
    await assignStaff(skaterCell, s.skaters!.map((name) => employees[name]));
    const goalieCell = await createShiftCell(ws.id, skillsGoalieCoach.id, date, s.start, s.end);
    await assignStaff(goalieCell, s.goalie!.map((name) => employees[name]));
  }
  void skillsPhaseWeekDay; // intentionally left blank per session, see comment above

  // ── General: preserves the banner/links from the source spreadsheet that
  // aren't per-shift data, so nothing is silently lost.
  const notesLocation = await createLocation(general.id, 'Notes', 0);
  const notesRow = await createSubRow(notesLocation.id, 'Notes', 'TEXT', 0);
  await createShiftCell(ws.id, notesRow.id, date, '06:00', '22:00', {
    textValue:
      'ICE / LOCKER ROOM MONITOR schedule and Rainy Day Activity links from the source spreadsheet are not modeled as structured shifts in this MVP — tracked here as a placeholder note only.',
  });

  return { workspace: ws, admin, employeePins: roster.map((name, i) => ({ name, pin: String(7001 + i) })) };
}

async function printSummary(label: string, workspaceId: string) {
  const [sections, locations, subRows, employees, shifts, cellValues] = await Promise.all([
    prisma.section.count({ where: { workspaceId } }),
    prisma.location.count({ where: { section: { workspaceId } } }),
    prisma.subRow.count({ where: { location: { section: { workspaceId } } } }),
    prisma.employee.count({ where: { workspaceId } }),
    prisma.shift.count({ where: { workspaceId } }),
    prisma.cellValue.count({ where: { shift: { workspaceId } } }),
  ]);
  console.log(`\n${label}`);
  console.log(`  sections=${sections} locations=${locations} subRows=${subRows} employees=${employees} shifts=${shifts} cellValues=${cellValues}`);
}

async function main() {
  console.log('Clearing existing data...');
  await prisma.fileUpload.deleteMany();
  await prisma.cellStaffAssignment.deleteMany();
  await prisma.cellValue.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.subRow.deleteMany();
  await prisma.location.deleteMany();
  await prisma.section.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.workspace.deleteMany();

  console.log('Seeding Sentry Guard Services (SENTRY1)...');
  const sentry = await seedSentry();

  console.log('Seeding Skyline Events Co. (SKYLINE1)...');
  const skyline = await seedSkyline();

  console.log('Seeding MAP Hockey (MAPHKY)...');
  const mapHockey = await seedMapHockey();

  await printSummary('Sentry Guard Services (SENTRY1)', sentry.workspace.id);
  await printSummary('Skyline Events Co. (SKYLINE1)', skyline.workspace.id);
  await printSummary('MAP Hockey (MAPHKY)', mapHockey.workspace.id);

  console.log('\n=== Admin credentials (save these — shown once) ===');
  console.log(`Sentry Guard Services  code=SENTRY1  email=${sentry.admin.email}  password=${sentry.admin.password}`);
  console.log(`Skyline Events Co.     code=SKYLINE1 email=${skyline.admin.email}  password=${skyline.admin.password}`);
  console.log(`MAP Hockey             code=MAPHKY   email=${mapHockey.admin.email}  password=${mapHockey.admin.password}`);
  console.log('\nEmployee PIN logins (workspace code + 4-digit PIN):');
  console.log('  SENTRY1: Alex Rivera=1010, Jordan Lee=2020, Sam Patel=3030, Casey Kim=4040, Morgan Diaz=5050, Taylor Brooks=6060');
  console.log('  SKYLINE1: Riley Chen=1111, Devon Ortiz=2222, Jamie Fox=3333, Quinn Alvarez=4444, Skyler Reyes=5555, Harper Nguyen=6666');
  console.log('  MAPHKY: ' + mapHockey.employeePins.map((e) => `${e.name}=${e.pin}`).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
