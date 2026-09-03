import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { campusScopeFor } from '../lib/campusScope';

const router = Router();
// SENIOR_LEAD_INSTRUCTOR gets the same full-workspace-minus-campus access
// DIRECTOR already had; campus scoping below narrows both the same way.
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

function employeeSelect() {
  return {
    id: true,
    name: true,
    role: true,
    createdAt: true,
    campusId: true,
    campus: { select: { id: true, name: true } },
  } as const;
}

// Resolves which Campus a new Employee belongs to. Mirrors
// routes/layout.ts's resolveCampusIdForCreate, but unlike a Section an
// Employee can legitimately have no Campus at all ("floats" across every
// Campus — see the schema comment on Employee.campusId) — so, unlike
// Sections, an unrestricted caller who omits campusId gets `null` here,
// not a default-campus fallback.
async function resolveCampusIdForCreate(workspaceId: string, scope: ReturnType<typeof campusScopeFor>, bodyCampusId: unknown) {
  if (scope.restricted) return scope.campusId; // null (unassigned Director/SLI) falls through to the 404 below
  if (typeof bodyCampusId === 'string' && bodyCampusId) {
    const campus = await prisma.campus.findFirst({ where: { id: bodyCampusId, workspaceId } });
    return campus?.id ?? null;
  }
  return null;
}

// GET /api/employees — narrowed to the caller's Campus plus every floating
// (campusId: null) Employee when restricted; ADMIN/CEO see everyone, or can
// narrow with ?campusId= (folded into `scope` by campusScopeFor).
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const employees = await prisma.employee.findMany({
    where: {
      workspaceId,
      ...(scope.restricted ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
    },
    orderBy: { name: 'asc' },
    select: employeeSelect(),
  });
  res.json({ employees });
});

router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { name, role, pin, campusId: bodyCampusId } = req.body ?? {};
  if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });

  if (scope.restricted && !scope.campusId) return res.status(404).json({ error: 'Campus not found' });
  const campusId = await resolveCampusIdForCreate(workspaceId, scope, bodyCampusId);

  const employee = await prisma.employee.create({
    data: { workspaceId, name, role: role || 'Employee', pinHash: bcrypt.hashSync(pin, 10), campusId },
    select: employeeSelect(),
  });
  res.status(201).json(employee);
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await prisma.employee.findFirst({
    where: {
      id: req.params.id,
      workspaceId,
      ...(scope.restricted ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
    },
  });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, role, pin, campusId: bodyCampusId } = req.body ?? {};
  if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });

  let campusId: string | null | undefined;
  // Reassigning an Employee's Campus (as opposed to setting it at creation)
  // is ADMIN/CEO-only — same tier as moving a Section between Campuses.
  if (bodyCampusId !== undefined) {
    if (scope.restricted) return res.status(400).json({ error: 'Only Admin/CEO can move an employee between campuses' });
    if (bodyCampusId === null) {
      campusId = null;
    } else {
      const campus = await prisma.campus.findFirst({ where: { id: bodyCampusId, workspaceId } });
      if (!campus) return res.status(404).json({ error: 'Campus not found' });
      if (!campus.active) return res.status(400).json({ error: 'Cannot move an employee to an inactive campus' });
      campusId = campus.id;
    }
  }

  const employee = await prisma.employee.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(pin ? { pinHash: bcrypt.hashSync(pin, 10) } : {}),
      ...(campusId !== undefined ? { campusId } : {}),
    },
    select: employeeSelect(),
  });
  res.json(employee);
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await prisma.employee.findFirst({
    where: {
      id: req.params.id,
      workspaceId,
      ...(scope.restricted ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
    },
  });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  await prisma.cellStaffAssignment.deleteMany({ where: { employeeId: existing.id } });
  await prisma.employee.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
