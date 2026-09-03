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

function adminSummary(admin: {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  campus: { id: string; name: string } | null;
}) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    active: admin.active,
    mustChangePassword: admin.mustChangePassword,
    campus: admin.campus,
    createdAt: admin.createdAt,
  };
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

// POST /api/admin-users { name?, email, password, role, campusId? } —
// always creates with mustChangePassword: true (a temp password the new
// admin must replace on first login, see routes/auth.ts) and logs a
// RoleChange row (oldRole: null) so account creation shows up in the same
// audit trail as every later promotion/demotion.
router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { name, email, password, role, campusId: bodyCampusId } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (!isAssignableRole(role)) return res.status(400).json({ error: `role must be one of ${ASSIGNABLE_ADMIN_ROLES.join(', ')}` });

  const existing = await prisma.adminUser.findUnique({ where: { workspaceId_email: { workspaceId, email } } });
  if (existing) return res.status(409).json({ error: 'An admin with that email already exists in this workspace' });

  const resolved = await resolveCampusForRole(workspaceId, role, bodyCampusId);
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });

  const admin = await prisma.adminUser.create({
    data: {
      workspaceId,
      name: name || null,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
      campusId: resolved.campusId,
      mustChangePassword: true,
    },
    include: { campus: { select: { id: true, name: true } } },
  });
  await prisma.roleChange.create({
    data: { workspaceId, targetUserId: admin.id, actorId: req.session.actorId!, oldRole: null, newRole: role, reason: 'Account created' },
  });
  res.status(201).json(adminSummary(admin));
});

// PATCH /api/admin-users/:id { email?, password?, campusId? } — role is
// deliberately NOT accepted here anymore: every role change must go
// through PATCH /:id/role below, which requires a reason and writes a
// RoleChange audit row. A plain campusId (no role change — e.g. moving a
// Director to a different campus) still works here, cross-validated
// against the admin's *existing* role via resolveCampusForRole, same as
// before. Cross-validation only runs when the request actually touches
// campusId — an email/password-only edit leaves it untouched and
// unvalidated, so it can't be broken by an unrelated later event like that
// campus being deactivated after the assignment was made.
router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.adminUser.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });

  const { email, password, role, campusId: bodyCampusId } = req.body ?? {};
  if (role !== undefined) {
    return res.status(400).json({ error: 'Use PATCH /api/admin-users/:id/role to change role (requires a reason and is audited)' });
  }
  if (email !== undefined && email !== existing.email) {
    const clash = await prisma.adminUser.findUnique({ where: { workspaceId_email: { workspaceId, email } } });
    if (clash) return res.status(409).json({ error: 'An admin with that email already exists in this workspace' });
  }

  let campusId = existing.campusId;
  if (bodyCampusId !== undefined) {
    const resolved = await resolveCampusForRole(workspaceId, existing.role as AssignableAdminRole, bodyCampusId);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    campusId = resolved.campusId;
  }

  const admin = await prisma.adminUser.update({
    where: { id: existing.id },
    data: {
      ...(email !== undefined ? { email } : {}),
      ...(password ? { passwordHash: bcrypt.hashSync(password, 10) } : {}),
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

// PATCH /api/admin-users/:id/role { newRole, reason } — the only way to
// change an AdminUser's role. Requires a reason (matches
// PayrollPeriodReopen's reason-required convention), blocks changing your
// own role (avoid accidental self-lockout), blocks demoting the workspace's
// last remaining active ADMIN/CEO to a non-unrestricted role (same
// protection /:id/deactivate already has, for the same reason), reuses
// resolveCampusForRole for the same campus cross-validation POST/PATCH use,
// and writes a RoleChange audit row on success.
router.patch('/:id/role', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.adminUser.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Admin not found' });

  const { newRole, campusId: bodyCampusId, reason } = req.body ?? {};
  if (!isAssignableRole(newRole)) return res.status(400).json({ error: `newRole must be one of ${ASSIGNABLE_ADMIN_ROLES.join(', ')}` });
  if (!reason || typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'reason is required' });

  if (existing.id === req.session.actorId) {
    return res.status(409).json({ error: 'You cannot change your own role' });
  }
  if (['ADMIN', 'CEO'].includes(existing.role) && !['ADMIN', 'CEO'].includes(newRole) && existing.active) {
    const remaining = await activeAdminCount(workspaceId, existing.id);
    if (remaining === 0) {
      return res.status(409).json({ error: 'Cannot demote the last remaining active Admin/CEO in this workspace' });
    }
  }

  const resolved = await resolveCampusForRole(workspaceId, newRole, bodyCampusId !== undefined ? bodyCampusId : existing.campusId);
  if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });

  const admin = await prisma.adminUser.update({
    where: { id: existing.id },
    data: { role: newRole, campusId: resolved.campusId },
    include: { campus: { select: { id: true, name: true } } },
  });
  await prisma.roleChange.create({
    data: {
      workspaceId,
      targetUserId: existing.id,
      actorId: req.session.actorId!,
      oldRole: existing.role,
      newRole,
      reason: reason.trim(),
    },
  });
  res.json(adminSummary(admin));
});

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
