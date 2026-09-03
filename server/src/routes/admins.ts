import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, CAMPUS_SCOPED_ROLES } from '../types';

const router = Router();
// Manage Admins is ADMIN/CEO only — matches the existing Payroll precedent,
// where CEO already gets full, non-read-only parity with ADMIN.
router.use(requireRole('ADMIN', 'CEO'));

function isAssignableRole(role: unknown): role is AssignableAdminRole {
  return (ASSIGNABLE_ADMIN_ROLES as readonly string[]).includes(role as string);
}

function isCampusScopedRole(role: AssignableAdminRole): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(role);
}

function adminSummary(admin: { id: string; email: string; role: string; active: boolean; createdAt: Date; campus: { id: string; name: string } | null }) {
  return { id: admin.id, email: admin.email, role: admin.role, active: admin.active, campus: admin.campus, createdAt: admin.createdAt };
}

// GET /api/admin-users — every AdminUser in the workspace, self included
// (so "you can't deactivate yourself" is visible in context). Never
// includes passwordHash.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const admins = await prisma.adminUser.findMany({
    where: { workspaceId },
    include: { campus: { select: { id: true, name: true } } },
    orderBy: { email: 'asc' },
  });
  res.json({ admins: admins.map(adminSummary) });
});

// Resolves the campusId to store for a given role + client-supplied value.
// `ok: false` on validation failure (caller responds with the given
// status/error). `campusId: null` for unrestricted roles (campusId always
// cleared, client input ignored — never trust the client for a security-
// relevant field). Otherwise the validated campus id for a campus-scoped role.
async function resolveCampusForRole(
  workspaceId: string,
  role: AssignableAdminRole,
  bodyCampusId: unknown
): Promise<{ ok: true; campusId: string | null } | { ok: false; status: number; error: string }> {
  if (!isCampusScopedRole(role)) return { ok: true, campusId: null };

  if (typeof bodyCampusId !== 'string' || !bodyCampusId) {
    return { ok: false, status: 400, error: 'campusId is required for DIRECTOR/SENIOR_LEAD_INSTRUCTOR' };
  }
  // 404, not 400 — matches the "referenced entity not found" convention
  // every other *InScope/*InWorkspace ownership check in this codebase uses
  // (see lib/ownership.ts).
  const campus = await prisma.campus.findFirst({ where: { id: bodyCampusId, workspaceId } });
  if (!campus) return { ok: false, status: 404, error: 'Campus not found' };
  if (!campus.active) return { ok: false, status: 400, error: 'Cannot assign an inactive campus' };
  return { ok: true, campusId: campus.id };
}

// POST /api/admin-users { email, password, role, campusId? }
router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { email, password, role, campusId: bodyCampusId } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (!isAssignableRole(role)) return res.status(400).json({ error: `role must be one of ${ASSIGNABLE_ADMIN_ROLES.join(', ')}` });

  const existing = await prisma.adminUser.findUnique({ where: { workspaceId_email: { workspaceId, email } } });
  if (existing) return res.status(409).json({ error: 'An admin with that email already exists in this workspace' });

  const resolved = await resolveCampusForRole(workspaceId, role, bodyCampusId);
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });

  const admin = await prisma.adminUser.create({
    data: { workspaceId, email, passwordHash: bcrypt.hashSync(password, 10), role, campusId: resolved.campusId },
    include: { campus: { select: { id: true, name: true } } },
  });
  res.status(201).json(adminSummary(admin));
});

// PATCH /api/admin-users/:id { email?, password?, role?, campusId? } — role
// and campusId are cross-validated together using the *effective* role (the
// new one if provided, else the existing one), exactly like POST: changing
// into a campus-scoped role requires a campusId in the same request;
// changing out of one clears campusId regardless of what's sent.
//
// Cross-validation (including the "campus must be active" check) only runs
// when the request actually touches role or campusId — an email/password-
// only edit leaves the existing campusId untouched and unvalidated, so it
// can't be broken by an unrelated later event like that campus being
// deactivated after the assignment was made.
router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.adminUser.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });

  const { email, password, role, campusId: bodyCampusId } = req.body ?? {};
  if (role !== undefined && !isAssignableRole(role)) {
    return res.status(400).json({ error: `role must be one of ${ASSIGNABLE_ADMIN_ROLES.join(', ')}` });
  }
  if (email !== undefined && email !== existing.email) {
    const clash = await prisma.adminUser.findUnique({ where: { workspaceId_email: { workspaceId, email } } });
    if (clash) return res.status(409).json({ error: 'An admin with that email already exists in this workspace' });
  }

  let campusId = existing.campusId;
  if (role !== undefined || bodyCampusId !== undefined) {
    const effectiveRole = (role ?? existing.role) as AssignableAdminRole;
    const resolved = await resolveCampusForRole(workspaceId, effectiveRole, bodyCampusId !== undefined ? bodyCampusId : existing.campusId);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    campusId = resolved.campusId;
  }

  const admin = await prisma.adminUser.update({
    where: { id: existing.id },
    data: {
      ...(email !== undefined ? { email } : {}),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
      ...(role !== undefined ? { role } : {}),
      campusId,
    },
    include: { campus: { select: { id: true, name: true } } },
  });
  res.json(adminSummary(admin));
});

async function activeAdminCount(workspaceId: string, excludeId?: string): Promise<number> {
  return prisma.adminUser.count({
    where: { workspaceId, active: true, role: { in: ['ADMIN', 'CEO'] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

// POST /api/admin-users/:id/deactivate — blocks self-deactivation and
// blocks deactivating the workspace's last remaining active ADMIN/CEO
// (would lock the workspace out of its own admin tooling entirely).
router.post('/:id/deactivate', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.adminUser.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });

  if (existing.id === req.session.actorId) {
    return res.status(409).json({ error: 'You cannot deactivate your own account' });
  }
  if (['ADMIN', 'CEO'].includes(existing.role) && existing.active) {
    const remaining = await activeAdminCount(workspaceId, existing.id);
    if (remaining === 0) {
      return res.status(409).json({ error: 'Cannot deactivate the last remaining Admin/CEO in this workspace' });
    }
  }

  const admin = await prisma.adminUser.update({
    where: { id: existing.id },
    data: { active: false },
    include: { campus: { select: { id: true, name: true } } },
  });
  res.json(adminSummary(admin));
});

router.post('/:id/activate', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.adminUser.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });

  const admin = await prisma.adminUser.update({
    where: { id: existing.id },
    data: { active: true },
    include: { campus: { select: { id: true, name: true } } },
  });
  res.json(adminSummary(admin));
});

export default router;
