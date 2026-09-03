import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';

const router = Router();
// Campus management is ADMIN/CEO only, same as Manage Admins.
router.use(requireRole('ADMIN', 'CEO'));

async function campusInWorkspace(campusId: string, workspaceId: string) {
  return prisma.campus.findFirst({ where: { id: campusId, workspaceId } });
}

// GET /api/campuses — sectionCount/adminCount give the UI enough context to
// warn before deactivating a campus with live data on it.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const campuses = await prisma.campus.findMany({
    where: { workspaceId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { sections: true, adminUsers: true } } },
  });
  res.json({
    campuses: campuses.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isDefault: c.isDefault,
      active: c.active,
      sectionCount: c._count.sections,
      adminCount: c._count.adminUsers,
    })),
  });
});

router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { name } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const max = await prisma.campus.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
  const campus = await prisma.campus.create({
    data: { workspaceId, name: name.trim(), sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json({ ...campus, sectionCount: 0, adminCount: 0 });
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await campusInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Campus not found' });

  const { name } = req.body ?? {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'name cannot be blank' });
  }
  const campus = await prisma.campus.update({ where: { id: existing.id }, data: { ...(name !== undefined ? { name: name.trim() } : {}) } });
  res.json(campus);
});

// POST /api/campuses/:id/set-default — transactionally unsets the current
// default and sets this one, preserving the "exactly one isDefault=true
// Campus per workspace" invariant defaultCampusId() relies on.
router.post('/:id/set-default', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await campusInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Campus not found' });
  if (!existing.active) return res.status(409).json({ error: 'Cannot set an inactive campus as default' });

  await prisma.$transaction([
    prisma.campus.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } }),
    prisma.campus.update({ where: { id: existing.id }, data: { isDefault: true } }),
  ]);
  res.json({ ok: true });
});

router.post('/:id/deactivate', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await campusInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Campus not found' });
  if (existing.isDefault) {
    return res.status(409).json({ error: 'Cannot deactivate the default campus — set another campus as default first' });
  }

  const campus = await prisma.campus.update({ where: { id: existing.id }, data: { active: false } });
  res.json(campus);
});

router.post('/:id/activate', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await campusInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Campus not found' });

  const campus = await prisma.campus.update({ where: { id: existing.id }, data: { active: true } });
  res.json(campus);
});

export default router;
