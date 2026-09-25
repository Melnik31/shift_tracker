import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { campusScopeFor, employeeCampusMatch } from '../lib/campusScope';
import { EMPLOYMENT_TYPES } from '../types';

const router = Router();
// SENIOR_LEAD_INSTRUCTOR gets the same full-workspace-minus-campus access
// DIRECTOR already had; campus scoping below narrows both the same way.
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

function employeeSelect() {
  return {
    id: true,
    name: true,
    roles: true,
    employmentType: true,
    createdAt: true,
    campuses: { select: { campus: { select: { id: true, name: true } } } },
  } as const;
}

// employeeSelect()'s shape nests campus memberships one level deeper than
// the wire format the client expects (campuses: [{campus:{id,name}}] vs.
// campuses: [{id,name}]) — flatten it here so every response (create,
// update, list) goes through one place.
function serializeEmployee<T extends { campuses: { campus: { id: string; name: string } }[] }>(employee: T) {
  return { ...employee, campuses: employee.campuses.map((c) => c.campus) };
}

// Resolves which Campuses a new Employee belongs to. Mirrors
// routes/layout.ts's resolveCampusIdForCreate, but unlike a Section an
// Employee can legitimately belong to zero Campuses ("floats" across every
// Campus — see the schema comment on Employee.campuses) — so, unlike
// Sections, an unrestricted caller who omits campusIds gets `[]` here, not a
// default-campus fallback. A restricted Director/SLI always gets exactly
// their own single Campus, ignoring the request body entirely.
async function resolveCampusIdsForCreate(workspaceId: string, scope: ReturnType<typeof campusScopeFor>, bodyCampusIds: unknown): Promise<string[]> {
  if (scope.restricted) return scope.campusId ? [scope.campusId] : []; // null (unassigned Director/SLI) falls through to the 404 below
  if (!Array.isArray(bodyCampusIds) || bodyCampusIds.length === 0) return [];
  const ids = [...new Set(bodyCampusIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const found = await prisma.campus.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true } });
  if (found.length !== ids.length) throw new Error('INVALID_CAMPUS_IDS');
  return ids;
}

function cleanRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) throw new Error('INVALID_ROLES');
  if (!roles.every((r) => typeof r === 'string')) throw new Error('INVALID_ROLES');
  return [...new Set(roles.map((r) => r.trim()).filter(Boolean))];
}

// GET /api/employees — narrowed to the caller's Campus plus every floating
// Employee when restricted; ADMIN/CEO see everyone, or can narrow with
// ?campusId= (folded into `scope` by campusScopeFor).
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const employees = await prisma.employee.findMany({
    where: {
      workspaceId,
      ...(scope.restricted ? employeeCampusMatch(scope.campusId) : {}),
    },
    orderBy: { name: 'asc' },
    select: employeeSelect(),
  });
  res.json({ employees: employees.map(serializeEmployee) });
});

router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { name, roles, pin, employmentType, campusIds: bodyCampusIds } = req.body ?? {};
  if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });
  if (employmentType !== undefined && !EMPLOYMENT_TYPES.includes(employmentType)) {
    return res.status(400).json({ error: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` });
  }
  let parsedRoles: string[];
  try {
    parsedRoles = roles !== undefined ? cleanRoles(roles) : [];
  } catch {
    return res.status(400).json({ error: 'roles must be an array of strings' });
  }

  if (scope.restricted && !scope.campusId) return res.status(404).json({ error: 'Campus not found' });
  let campusIds: string[];
  try {
    campusIds = await resolveCampusIdsForCreate(workspaceId, scope, bodyCampusIds);
  } catch {
    return res.status(400).json({ error: 'One or more campusIds are invalid' });
  }

  const employee = await prisma.employee.create({
    data: {
      workspaceId,
      name,
      roles: parsedRoles,
      employmentType: employmentType || 'PT',
      pinHash: bcrypt.hashSync(pin, 10),
      campuses: { create: campusIds.map((campusId) => ({ campusId })) },
    },
    select: employeeSelect(),
  });
  res.status(201).json(serializeEmployee(employee));
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await prisma.employee.findFirst({
    where: {
      id: req.params.id,
      workspaceId,
      ...(scope.restricted ? employeeCampusMatch(scope.campusId) : {}),
    },
  });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, roles, pin, employmentType, campusIds: bodyCampusIds } = req.body ?? {};
  if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });
  if (employmentType !== undefined && !EMPLOYMENT_TYPES.includes(employmentType)) {
    return res.status(400).json({ error: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` });
  }
  let parsedRoles: string[] | undefined;
  if (roles !== undefined) {
    try {
      parsedRoles = cleanRoles(roles);
    } catch {
      return res.status(400).json({ error: 'roles must be an array of strings' });
    }
  }

  let campusIds: string[] | undefined;
  // Reassigning an Employee's Campuses (as opposed to setting them at
  // creation) is ADMIN/CEO-only — same tier as moving a Section between
  // Campuses.
  if (bodyCampusIds !== undefined) {
    if (scope.restricted) return res.status(400).json({ error: 'Only Admin/CEO can move an employee between campuses' });
    if (!Array.isArray(bodyCampusIds)) return res.status(400).json({ error: 'campusIds must be an array' });
    const ids = [...new Set(bodyCampusIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (ids.length > 0) {
      const campusesFound = await prisma.campus.findMany({ where: { id: { in: ids }, workspaceId } });
      if (campusesFound.length !== ids.length) return res.status(404).json({ error: 'Campus not found' });
      const existingCampusIds = new Set((await prisma.employeeCampus.findMany({ where: { employeeId: existing.id } })).map((c) => c.campusId));
      const newlyAdded = campusesFound.filter((c) => !existingCampusIds.has(c.id));
      if (newlyAdded.some((c) => !c.active)) return res.status(400).json({ error: 'Cannot move an employee to an inactive campus' });
    }
    campusIds = ids;
  }

  const employee = await prisma.employee.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(parsedRoles !== undefined ? { roles: parsedRoles } : {}),
      ...(employmentType !== undefined ? { employmentType } : {}),
      ...(pin ? { pinHash: bcrypt.hashSync(pin, 10) } : {}),
      ...(campusIds !== undefined ? { campuses: { deleteMany: {}, create: campusIds.map((campusId) => ({ campusId })) } } : {}),
    },
    select: employeeSelect(),
  });
  res.json(serializeEmployee(employee));
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await prisma.employee.findFirst({
    where: {
      id: req.params.id,
      workspaceId,
      ...(scope.restricted ? employeeCampusMatch(scope.campusId) : {}),
    },
  });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  await prisma.cellStaffAssignment.deleteMany({ where: { employeeId: existing.id } });
  await prisma.employeeCampus.deleteMany({ where: { employeeId: existing.id } });
  await prisma.employee.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
