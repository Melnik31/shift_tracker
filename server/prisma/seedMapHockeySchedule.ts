// Reseeds MAP Hockey's (MAPHKY) employee roster and Aug 31 - Sep 3, 2026
// schedule from four daily schedule screenshots (Mon/Tue/Wed/Thu). Transcribed
// by hand from dense spreadsheet-style images — coach names, tiers, and times
// should be accurate, but double-check anything that looks off, since a few
// cells (e.g. duplicate "Phase, Week, Day" labels, stacked multi-name coach
// cells) required judgment calls to map onto this app's data model.
//
// This does NOT touch AdminUser records, and does NOT touch any other
// workspace. It deletes MAPHKY's existing Employee rows (and, by extension,
// their CellStaffAssignment rows) and any Shift/CellValue data MAPHKY already
// had on the four target dates, then rebuilds both from scratch.
//
// Run with: npx tsx prisma/seedMapHockeySchedule.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { DataType } from '../src/types';

const prisma = new PrismaClient();

const WORKSPACE_CODE = 'MAPHKY';

// Badge colors — reuses the same palette style as prisma/seed.ts's TIER_PALETTE,
// extended with the combined tiers and special activity labels these screenshots use.
const TIER_COLORS: Record<string, string> = {
  T1: '#22c55e',
  HS: '#a855f7',
  'COLL & HS': '#ec4899',
  'T1 & HS': '#0ea5e9',
  'Skating Treadmill': '#111827',
  'Small Group Training': '#22c55e',
};

function tierColor(label: string): string {
  return TIER_COLORS[label] ?? '#64748b';
}

// ── Transcribed schedule ────────────────────────────────────────────────

interface RinkShift {
  start: string;
  end: string;
  tier: string;
  gameDay?: boolean; // shown as a "GAME DAY" note in the Skater Lesson Plan cell
  skaterCoach: string[];
  goalieCoach: string[];
}

interface WorkoutShift {
  start: string;
  end: string;
  tier: string;
  exercise?: string; // stored in the "Phase, Week, Day" text cell, which these sheets repurpose for the exercise/activity name
  strengthCoach: string[];
}

interface SkillsShift {
  start: string;
  end: string;
  tier: string;
  skatingCoach: string[];
  goalieCoach: string[];
}

interface DaySchedule {
  date: string;
  label: string;
  rinkC: RinkShift[];
  workoutBlock1: WorkoutShift[];
  workoutBlock2: WorkoutShift[];
  workoutBlock3: WorkoutShift[];
  skills: SkillsShift[];
}

const SCHEDULE: DaySchedule[] = [
  {
    date: '2026-08-31',
    label: 'Monday',
    rinkC: [
      { start: '04:00', end: '05:00', tier: 'COLL & HS', skaterCoach: ['Gunner', 'Gman', 'Blanch'], goalieCoach: ['Mike'] },
      { start: '05:15', end: '06:15', tier: 'T1', skaterCoach: ['Gunner', 'Gman', 'Blanch'], goalieCoach: ['Mike'] },
      { start: '06:30', end: '07:30', tier: 'T1', skaterCoach: ['Gunner', 'Gman', 'Blanch'], goalieCoach: ['Noah Duerr'] },
      { start: '07:45', end: '08:45', tier: 'COLL & HS', skaterCoach: ['Jack', 'Sam'], goalieCoach: ['Mike'] },
      { start: '09:00', end: '10:00', tier: 'HS', skaterCoach: ['Jack', 'Sam'], goalieCoach: ['Noah Duerr'] },
    ],
    workoutBlock1: [
      { start: '05:15', end: '06:15', tier: 'COLL & HS', strengthCoach: ['Jaime', 'Jon'] },
      { start: '06:30', end: '07:30', tier: 'COLL & HS', strengthCoach: ['Jon'] },
      { start: '07:45', end: '08:45', tier: 'HS', strengthCoach: ['Jon'] },
    ],
    workoutBlock2: [
      { start: '06:30', end: '07:30', tier: 'T1', strengthCoach: ['Jaime'] },
      { start: '08:30', end: '09:30', tier: 'T1', strengthCoach: ['Jaime'] },
    ],
    workoutBlock3: [],
    skills: [
      { start: '04:30', end: '05:00', tier: 'T1', skatingCoach: ['Jack', 'Sam'], goalieCoach: ['Noah Duerr'] },
      { start: '05:45', end: '06:15', tier: 'COLL & HS', skatingCoach: ['Jack', 'Sam'], goalieCoach: ['Noah Duerr'] },
      { start: '06:30', end: '07:00', tier: 'COLL & HS', skatingCoach: ['Jack', 'Sam'], goalieCoach: ['Mike'] },
      { start: '07:00', end: '07:30', tier: 'HS', skatingCoach: ['Jack', 'Sam'], goalieCoach: ['Mike'] },
      { start: '07:45', end: '08:15', tier: 'T1', skatingCoach: ['Blanch', 'Gunner'], goalieCoach: ['Noah Duerr'] },
    ],
  },
  {
    date: '2026-09-01',
    label: 'Tuesday',
    rinkC: [
      { start: '04:00', end: '05:00', tier: 'HS', skaterCoach: ['Matt', 'Sam', 'Katrina'], goalieCoach: ['Mike'] },
      { start: '05:15', end: '06:15', tier: 'HS', skaterCoach: ['Matt', 'Sam', 'Katrina'], goalieCoach: ['Mike'] },
      { start: '06:30', end: '07:30', tier: 'T1', skaterCoach: ['Matt', 'Sam', 'Katrina'], goalieCoach: ['Mike'] },
      { start: '07:45', end: '08:45', tier: 'T1', skaterCoach: ['Gunner', 'Blanch', 'Katrina'], goalieCoach: ['Nieto', 'Jason'] },
      { start: '09:00', end: '10:00', tier: 'COLL & HS', skaterCoach: ['Gunner', 'Blanch', 'Gman', 'Katrina'], goalieCoach: ['Nieto', 'Jason'] },
    ],
    workoutBlock1: [
      { start: '05:15', end: '06:15', tier: 'HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jaime', 'AJ Thompson'] },
      { start: '06:30', end: '07:30', tier: 'T1', exercise: 'Hands on Hips Jump', strengthCoach: ['Jaime', 'AJ Thompson'] },
      { start: '07:45', end: '08:45', tier: 'COLL & HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jaime'] },
    ],
    workoutBlock2: [
      { start: '05:00', end: '06:00', tier: 'Skating Treadmill', strengthCoach: ['Gunner'] },
      { start: '06:30', end: '07:30', tier: 'HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jon'] },
      { start: '08:30', end: '09:30', tier: 'T1', exercise: 'Hands on Hips Jump', strengthCoach: ['Jon', 'AJ Thompson'] },
    ],
    workoutBlock3: [{ start: '05:00', end: '06:00', tier: 'Small Group Training', strengthCoach: ['Jon'] }],
    skills: [
      { start: '04:30', end: '05:00', tier: 'HS', skatingCoach: ['Blanch'], goalieCoach: ['Nieto'] },
      { start: '05:45', end: '06:15', tier: 'T1', skatingCoach: ['Gunner'], goalieCoach: ['Noah Duerr'] },
      { start: '06:30', end: '07:00', tier: 'HS', skatingCoach: ['Blanch'], goalieCoach: ['Noah Duerr'] },
      { start: '07:00', end: '07:30', tier: 'COLL & HS', skatingCoach: ['Gman'], goalieCoach: ['Noah Duerr'] },
      { start: '07:45', end: '08:15', tier: 'T1', skatingCoach: ['Matt'], goalieCoach: ['Mike'] },
    ],
  },
  {
    date: '2026-09-02',
    label: 'Wednesday',
    rinkC: [
      { start: '04:00', end: '05:00', tier: 'COLL & HS', skaterCoach: ['Matt', 'Blanch'], goalieCoach: ['Nieto'] },
      { start: '05:15', end: '06:15', tier: 'HS', gameDay: true, skaterCoach: ['Matt', 'Blanch', 'Jack'], goalieCoach: ['Nieto'] },
      { start: '06:30', end: '07:30', tier: 'COLL & HS', skaterCoach: ['Matt', 'Blanch', 'Jack'], goalieCoach: ['Nieto'] },
      { start: '07:45', end: '08:45', tier: 'T1', skaterCoach: ['Sam', 'Gman', 'Gunner'], goalieCoach: ['Mike'] },
      { start: '09:00', end: '10:00', tier: 'HS', skaterCoach: ['Sam', 'Gman', 'Gunner'], goalieCoach: ['Mike'] },
    ],
    workoutBlock1: [
      { start: '05:15', end: '06:15', tier: 'COLL & HS', strengthCoach: ['AJ Thompson', 'Jaime'] },
      { start: '06:30', end: '07:30', tier: 'T1', strengthCoach: ['AJ Thompson', 'Jaime'] },
      { start: '07:45', end: '08:45', tier: 'HS', strengthCoach: ['AJ Thompson', 'Jaime'] },
    ],
    workoutBlock2: [
      { start: '04:00', end: '05:00', tier: 'Skating Treadmill', strengthCoach: ['Sam'] },
      { start: '06:30', end: '07:30', tier: 'HS', strengthCoach: ['Jon'] },
      { start: '08:30', end: '09:30', tier: 'COLL & HS', strengthCoach: ['Jon'] },
    ],
    workoutBlock3: [{ start: '05:00', end: '06:00', tier: 'Small Group Training', strengthCoach: ['Jon'] }],
    skills: [
      { start: '04:30', end: '05:00', tier: 'HS', skatingCoach: ['Gunner', 'Jack'], goalieCoach: ['Mike'] },
      { start: '05:45', end: '06:15', tier: 'T1', skatingCoach: ['Gunner', 'Gman'], goalieCoach: ['Mike'] },
      { start: '06:30', end: '07:00', tier: 'COLL & HS', skatingCoach: ['Sam', 'Gman'], goalieCoach: ['Mike'] },
      { start: '07:00', end: '07:30', tier: 'HS', skatingCoach: ['Gunner', 'Sam'], goalieCoach: ['Mike'] },
      { start: '07:45', end: '08:15', tier: 'COLL & HS', skatingCoach: ['Matt', 'Blanch'], goalieCoach: ['Nieto'] },
    ],
  },
  {
    date: '2026-09-03',
    label: 'Thursday',
    rinkC: [
      { start: '04:00', end: '05:00', tier: 'COLL & HS', gameDay: true, skaterCoach: ['Gunner', 'Gman'], goalieCoach: ['Mike'] },
      { start: '05:15', end: '06:15', tier: 'T1', gameDay: true, skaterCoach: ['Gunner', 'Gman'], goalieCoach: ['Mike'] },
      { start: '06:30', end: '07:30', tier: 'HS', skaterCoach: ['Gunner', 'Matt'], goalieCoach: ['Mike'] },
      { start: '07:45', end: '08:45', tier: 'COLL & HS', gameDay: true, skaterCoach: ['Matt', 'Sam', 'Blanch'], goalieCoach: ['Nieto'] },
      { start: '09:00', end: '10:00', tier: 'T1 & HS', gameDay: true, skaterCoach: ['Matt', 'Sam', 'Blanch'], goalieCoach: ['Nieto'] },
    ],
    workoutBlock1: [
      { start: '05:15', end: '06:15', tier: 'COLL & HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jon', 'AJ Thompson'] },
      { start: '06:30', end: '07:30', tier: 'COLL & HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jon', 'AJ Thompson'] },
      { start: '07:45', end: '08:45', tier: 'T1 & HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jon', 'AJ Thompson'] },
    ],
    workoutBlock2: [
      { start: '05:00', end: '06:00', tier: 'Skating Treadmill', strengthCoach: ['Matt'] },
      { start: '06:30', end: '07:30', tier: 'T1', exercise: 'Hands on Hips Jump', strengthCoach: ['Jaime'] },
      { start: '08:30', end: '09:30', tier: 'HS', exercise: 'Hands on Hips Jump', strengthCoach: ['Jaime'] },
    ],
    workoutBlock3: [{ start: '05:00', end: '06:00', tier: 'Small Group Training', strengthCoach: ['Jaime'] }],
    skills: [
      { start: '04:30', end: '05:00', tier: 'T1', skatingCoach: ['Matt', 'Blanch'], goalieCoach: ['Nieto'] },
      { start: '05:45', end: '06:15', tier: 'COLL & HS', skatingCoach: ['Sam', 'Blanch'], goalieCoach: ['Noah Duerr'] },
      { start: '06:30', end: '07:00', tier: 'COLL & HS', skatingCoach: ['Gman', 'Blanch'], goalieCoach: ['Noah Duerr'] },
      { start: '07:00', end: '07:30', tier: 'T1 & HS', skatingCoach: ['Sam', 'Blanch'], goalieCoach: ['Noah Duerr'] },
      { start: '07:45', end: '08:15', tier: 'HS', skatingCoach: ['Gunner', 'Gman'], goalieCoach: ['Mike'] },
    ],
  },
];

const TARGET_DATES = SCHEDULE.map((d) => d.date);

const EMPLOYEE_NAMES = [
  'Gunner',
  'Matt',
  'Sam',
  'Katrina',
  'Blanch',
  'Mike',
  'Nieto',
  'Jack',
  'Gman',
  'Noah Duerr',
  'Jaime',
  'AJ Thompson',
  'Jon',
  'Jason',
];

// ── Helpers (mirror prisma/seed.ts's shape) ─────────────────────────────

async function createSubRow(locationId: string, label: string, dataType: DataType, sortOrder: number) {
  return prisma.subRow.create({ data: { locationId, label, dataType, sortOrder, config: '{}' } });
}

// The schedule below is transcribed using the sheet's own hour labels
// (3:00-10:00), which are afternoon/evening ice times for a hockey rink, not
// 3-10 AM — the sheet just never wrote "PM". Converting once here, at the
// single choke point every shift passes through, keeps SCHEDULE readable in
// the sheet's own terms while storing correct 24h PM times.
function toPM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${String(h + 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function createShiftCell(
  workspaceId: string,
  subRowId: string,
  date: string,
  startTime: string,
  endTime: string,
  payload: { textValue?: string; badgeLabel?: string; badgeColor?: string } = {}
) {
  const shift = await prisma.shift.create({ data: { workspaceId, subRowId, date, startTime: toPM(startTime), endTime: toPM(endTime) } });
  const cell = await prisma.cellValue.create({ data: { shiftId: shift.id, subRowId, ...payload } });
  return cell.id;
}

async function assignStaff(cellValueId: string, employeeIds: string[]) {
  for (const employeeId of employeeIds) {
    await prisma.cellStaffAssignment.create({ data: { cellValueId, employeeId } });
  }
}

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { workspaceCode: WORKSPACE_CODE } });
  if (!workspace) throw new Error(`Workspace ${WORKSPACE_CODE} not found`);

  console.log(`Reseeding ${workspace.name} (${WORKSPACE_CODE})...`);

  // ── 1. Remove all employee data (never touches AdminUser) ──────────────
  const existingEmployees = await prisma.employee.findMany({ where: { workspaceId: workspace.id }, select: { id: true } });
  const existingEmployeeIds = existingEmployees.map((e) => e.id);
  await prisma.cellStaffAssignment.deleteMany({ where: { employeeId: { in: existingEmployeeIds } } });
  await prisma.payrollAdjustment.deleteMany({ where: { workspaceId: workspace.id } });
  const deletedEmployees = await prisma.employee.deleteMany({ where: { workspaceId: workspace.id } });
  console.log(`  removed ${deletedEmployees.count} existing employees`);

  // ── 2. Clear out any existing shift data on the four target dates ──────
  const staleShifts = await prisma.shift.findMany({
    where: { workspaceId: workspace.id, date: { in: TARGET_DATES } },
    select: { id: true },
  });
  const staleShiftIds = staleShifts.map((s) => s.id);
  const staleCellValues = await prisma.cellValue.findMany({ where: { shiftId: { in: staleShiftIds } }, select: { id: true } });
  const staleCellValueIds = staleCellValues.map((c) => c.id);
  await prisma.fileUpload.deleteMany({ where: { cellValueId: { in: staleCellValueIds } } });
  await prisma.cellStaffAssignment.deleteMany({ where: { cellValueId: { in: staleCellValueIds } } });
  await prisma.cellValue.deleteMany({ where: { shiftId: { in: staleShiftIds } } });
  const deletedShifts = await prisma.shift.deleteMany({ where: { id: { in: staleShiftIds } } });
  console.log(`  cleared ${deletedShifts.count} existing shifts on ${TARGET_DATES.join(', ')}`);

  // ── 3. Fresh employee roster ─────────────────────────────────────────
  const employeeIdByName = new Map<string, string>();
  for (let i = 0; i < EMPLOYEE_NAMES.length; i++) {
    const name = EMPLOYEE_NAMES[i];
    const emp = await prisma.employee.create({
      data: { workspaceId: workspace.id, name, role: 'Coach', pinHash: bcrypt.hashSync(String(7001 + i), 10) },
    });
    employeeIdByName.set(name, emp.id);
  }
  console.log(`  created ${EMPLOYEE_NAMES.length} employees`);

  function staffIds(names: string[]): string[] {
    return names.map((n) => {
      const id = employeeIdByName.get(n);
      if (!id) throw new Error(`Unknown employee "${n}" — not in EMPLOYEE_NAMES`);
      return id;
    });
  }

  // ── 4. Layout: reuse ICE/WORKOUTS/SKILLS sections, add the locations
  // these screenshots need (Rink C, three parallel workout blocks) without
  // touching whatever already existed (Rink A/B, Weight Room, Skills Station).
  const iceSection = await prisma.section.findFirst({ where: { workspaceId: workspace.id, name: 'ICE' } });
  const workoutsSection = await prisma.section.findFirst({ where: { workspaceId: workspace.id, name: 'WORKOUTS' } });
  const skillsSection = await prisma.section.findFirst({ where: { workspaceId: workspace.id, name: 'SKILLS' } });
  if (!iceSection || !workoutsSection || !skillsSection) {
    throw new Error('Expected ICE, WORKOUTS, and SKILLS sections to already exist in MAPHKY');
  }

  let rinkCLocation = await prisma.location.findFirst({ where: { sectionId: iceSection.id, name: 'Rink C' } });
  let rinkCSubRows: { tier: string; skaterLessonPlan: string; skaterCoach: string; goalieLessonPlan: string; goalieCoach: string };
  if (!rinkCLocation) {
    rinkCLocation = await prisma.location.create({ data: { sectionId: iceSection.id, name: 'Rink C', sortOrder: 2 } });
    const tier = await createSubRow(rinkCLocation.id, 'TIER', 'BADGE', 0);
    const skaterLessonPlan = await createSubRow(rinkCLocation.id, 'Skater Lesson Plan', 'TEXT', 1);
    const skaterCoach = await createSubRow(rinkCLocation.id, 'Skater Coach', 'STAFF', 2);
    const goalieLessonPlan = await createSubRow(rinkCLocation.id, 'Goalie Lesson Plan', 'LINK', 3);
    const goalieCoach = await createSubRow(rinkCLocation.id, 'Goalie Coach', 'STAFF', 4);
    rinkCSubRows = { tier: tier.id, skaterLessonPlan: skaterLessonPlan.id, skaterCoach: skaterCoach.id, goalieLessonPlan: goalieLessonPlan.id, goalieCoach: goalieCoach.id };
  } else {
    const subRows = await prisma.subRow.findMany({ where: { locationId: rinkCLocation.id } });
    const byLabel = (label: string) => subRows.find((s) => s.label === label)!.id;
    rinkCSubRows = {
      tier: byLabel('TIER'),
      skaterLessonPlan: byLabel('Skater Lesson Plan'),
      skaterCoach: byLabel('Skater Coach'),
      goalieLessonPlan: byLabel('Goalie Lesson Plan'),
      goalieCoach: byLabel('Goalie Coach'),
    };
  }

  async function ensureWorkoutBlock(name: string, sortOrder: number) {
    let location = await prisma.location.findFirst({ where: { sectionId: workoutsSection!.id, name } });
    if (!location) {
      location = await prisma.location.create({ data: { sectionId: workoutsSection!.id, name, sortOrder } });
      const tier = await createSubRow(location.id, 'TIER', 'BADGE', 0);
      const phaseWeekDay = await createSubRow(location.id, 'Phase, Week, Day', 'TEXT', 1);
      const strengthCoach = await createSubRow(location.id, 'Strength Coach', 'STAFF', 2);
      return { tier: tier.id, phaseWeekDay: phaseWeekDay.id, strengthCoach: strengthCoach.id };
    }
    const subRows = await prisma.subRow.findMany({ where: { locationId: location.id } });
    const byLabel = (label: string) => subRows.find((s) => s.label === label)!.id;
    return { tier: byLabel('TIER'), phaseWeekDay: byLabel('Phase, Week, Day'), strengthCoach: byLabel('Strength Coach') };
  }

  const workoutBlock1 = await ensureWorkoutBlock('Workout Block 1', 1);
  const workoutBlock2 = await ensureWorkoutBlock('Workout Block 2', 2);
  const workoutBlock3 = await ensureWorkoutBlock('Workout Block 3', 3);

  const skillsLocation = await prisma.location.findFirst({ where: { sectionId: skillsSection.id } });
  if (!skillsLocation) throw new Error('Expected a SKILLS location to already exist in MAPHKY');
  const skillsSubRows = await prisma.subRow.findMany({ where: { locationId: skillsLocation.id } });
  const skillsByLabel = (label: string) => skillsSubRows.find((s) => s.label === label)!.id;
  const skills = {
    tier: skillsByLabel('TIER'),
    skatingCoach: skillsByLabel('Skater Coach'),
    goalieCoach: skillsByLabel('Goalie Coach'),
  };

  // ── 5. Create the four days of shifts ───────────────────────────────
  for (const day of SCHEDULE) {
    console.log(`  seeding ${day.label} (${day.date})...`);

    for (const s of day.rinkC) {
      await createShiftCell(workspace.id, rinkCSubRows.tier, day.date, s.start, s.end, { badgeLabel: s.tier, badgeColor: tierColor(s.tier) });
      await createShiftCell(workspace.id, rinkCSubRows.skaterLessonPlan, day.date, s.start, s.end, s.gameDay ? { textValue: 'GAME DAY' } : {});
      const skaterCell = await createShiftCell(workspace.id, rinkCSubRows.skaterCoach, day.date, s.start, s.end);
      await assignStaff(skaterCell, staffIds(s.skaterCoach));
      await createShiftCell(workspace.id, rinkCSubRows.goalieLessonPlan, day.date, s.start, s.end);
      const goalieCell = await createShiftCell(workspace.id, rinkCSubRows.goalieCoach, day.date, s.start, s.end);
      await assignStaff(goalieCell, staffIds(s.goalieCoach));
    }

    for (const [block, shifts] of [
      [workoutBlock1, day.workoutBlock1],
      [workoutBlock2, day.workoutBlock2],
      [workoutBlock3, day.workoutBlock3],
    ] as const) {
      for (const s of shifts) {
        await createShiftCell(workspace.id, block.tier, day.date, s.start, s.end, { badgeLabel: s.tier, badgeColor: tierColor(s.tier) });
        await createShiftCell(workspace.id, block.phaseWeekDay, day.date, s.start, s.end, s.exercise ? { textValue: s.exercise } : {});
        const coachCell = await createShiftCell(workspace.id, block.strengthCoach, day.date, s.start, s.end);
        await assignStaff(coachCell, staffIds(s.strengthCoach));
      }
    }

    for (const s of day.skills) {
      await createShiftCell(workspace.id, skills.tier, day.date, s.start, s.end, { badgeLabel: s.tier, badgeColor: tierColor(s.tier) });
      const skatingCell = await createShiftCell(workspace.id, skills.skatingCoach, day.date, s.start, s.end);
      await assignStaff(skatingCell, staffIds(s.skatingCoach));
      const goalieCell = await createShiftCell(workspace.id, skills.goalieCoach, day.date, s.start, s.end);
      await assignStaff(goalieCell, staffIds(s.goalieCoach));
    }
  }

  const totalShifts = await prisma.shift.count({ where: { workspaceId: workspace.id, date: { in: TARGET_DATES } } });
  console.log(`Done. ${totalShifts} shifts across ${TARGET_DATES.length} days for ${EMPLOYEE_NAMES.length} employees.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
