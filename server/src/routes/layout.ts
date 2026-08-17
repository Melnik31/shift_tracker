import { Router } from 'express';
import { prisma } from '../db';
import { requireAdmin } from '../middleware/auth';
import { DATA_TYPES } from '../types';

const router = Router();
router.use(requireAdmin);

// GET /api/layout — full Section -> Location -> SubRow tree for the caller's workspace.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const sections = await prisma.section.findMany({
    where: { workspaceId },
    orderBy: { sortOrder: 'asc' },
    include: {
      locations: {
        orderBy: { sortOrder: 'asc' },
        include: { subRows: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  res.json({ sections });
});

// ── Ownership-chain helpers: every mutation below re-derives workspace scope
// from the session, then verifies the target row's ancestry matches before
// allowing the write. Nothing here trusts a client-supplied workspaceId.

async function sectionInWorkspace(sectionId: string, workspaceId: string) {
  return prisma.section.findFirst({ where: { id: sectionId, workspaceId } });
}

async function locationInWorkspace(locationId: string, workspaceId: string) {
  return prisma.location.findFirst({ where: { id: locationId, section: { workspaceId } } });
}

async function subRowInWorkspace(subRowId: string, workspaceId: string) {
  return prisma.subRow.findFirst({ where: { id: subRowId, location: { section: { workspaceId } } } });
}

// ── Sections ───────────────────────────────────────────────────────────

router.post('/sections', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const max = await prisma.section.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
  const section = await prisma.section.create({
    data: { workspaceId, name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json(section);
});

router.patch('/sections/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await sectionInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  const { name } = req.body ?? {};
  const section = await prisma.section.update({ where: { id: existing.id }, data: { name } });
  res.json(section);
});

router.delete('/sections/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await sectionInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  await deleteSectionCascade(existing.id);
  res.json({ ok: true });
});

router.post('/sections/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await sectionInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  const direction = req.body?.direction as 'up' | 'down';
  const siblings = await prisma.section.findMany({ where: { workspaceId }, orderBy: { sortOrder: 'asc' } });
  await swapSortOrder(siblings, existing.id, direction, (id, sortOrder) => prisma.section.update({ where: { id }, data: { sortOrder } }));
  res.json({ ok: true });
});

// ── Locations ──────────────────────────────────────────────────────────

router.post('/locations', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { sectionId, name } = req.body ?? {};
  const section = await sectionInWorkspace(sectionId, workspaceId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  if (!name) return res.status(400).json({ error: 'name is required' });

  const max = await prisma.location.aggregate({ where: { sectionId }, _max: { sortOrder: true } });
  const location = await prisma.location.create({
    data: { sectionId, name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json(location);
});

router.patch('/locations/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await locationInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  const { name } = req.body ?? {};
  const location = await prisma.location.update({ where: { id: existing.id }, data: { name } });
  res.json(location);
});

router.delete('/locations/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await locationInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  await deleteLocationCascade(existing.id);
  res.json({ ok: true });
});

router.post('/locations/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await locationInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  const direction = req.body?.direction as 'up' | 'down';
  const siblings = await prisma.location.findMany({ where: { sectionId: existing.sectionId }, orderBy: { sortOrder: 'asc' } });
  await swapSortOrder(siblings, existing.id, direction, (id, sortOrder) => prisma.location.update({ where: { id }, data: { sortOrder } }));
  res.json({ ok: true });
});

// ── SubRows ────────────────────────────────────────────────────────────

router.post('/subrows', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { locationId, label, dataType, config } = req.body ?? {};
  const location = await locationInWorkspace(locationId, workspaceId);
  if (!location) return res.status(404).json({ error: 'Location not found' });
  if (!label) return res.status(400).json({ error: 'label is required' });
  if (!DATA_TYPES.includes(dataType)) return res.status(400).json({ error: `dataType must be one of ${DATA_TYPES.join(', ')}` });

  const max = await prisma.subRow.aggregate({ where: { locationId }, _max: { sortOrder: true } });
  const subRow = await prisma.subRow.create({
    data: { locationId, label, dataType, sortOrder: (max._max.sortOrder ?? -1) + 1, config: JSON.stringify(config ?? {}) },
  });
  res.status(201).json(subRow);
});

router.patch('/subrows/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await subRowInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'SubRow not found' });

  const { label, config } = req.body ?? {};
  const subRow = await prisma.subRow.update({
    where: { id: existing.id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
    },
  });
  res.json(subRow);
});

router.delete('/subrows/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await subRowInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'SubRow not found' });

  await deleteSubRowCascade(existing.id);
  res.json({ ok: true });
});

router.post('/subrows/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await subRowInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'SubRow not found' });

  const direction = req.body?.direction as 'up' | 'down';
  const siblings = await prisma.subRow.findMany({ where: { locationId: existing.locationId }, orderBy: { sortOrder: 'asc' } });
  await swapSortOrder(siblings, existing.id, direction, (id, sortOrder) => prisma.subRow.update({ where: { id }, data: { sortOrder } }));
  res.json({ ok: true });
});

// ── Onboarding progress ────────────────────────────────────────────────

router.patch('/onboarding-step', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { step } = req.body ?? {};
  if (typeof step !== 'number') return res.status(400).json({ error: 'step must be a number' });
  const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: { onboardingStep: step } });
  res.json({ onboardingStep: workspace.onboardingStep });
});

router.patch('/workspace', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { name, workspaceCode } = req.body ?? {};
  if (workspaceCode) {
    const clash = await prisma.workspace.findUnique({ where: { workspaceCode } });
    if (clash && clash.id !== workspaceId) return res.status(409).json({ error: 'That workspace code is already taken' });
  }
  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(workspaceCode !== undefined ? { workspaceCode } : {}),
    },
  });
  res.json({ id: workspace.id, name: workspace.name, workspaceCode: workspace.workspaceCode, onboardingStep: workspace.onboardingStep });
});

// If the admin exits onboarding early, ensure at least one Section/Location/SubRow
// exists (so the matrix isn't empty) and mark onboarding complete.
router.post('/skip-onboarding', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const sectionCount = await prisma.section.count({ where: { workspaceId } });

  if (sectionCount === 0) {
    const section = await prisma.section.create({ data: { workspaceId, name: 'General', sortOrder: 0 } });
    const location = await prisma.location.create({ data: { sectionId: section.id, name: 'Location 1', sortOrder: 0 } });
    await prisma.subRow.create({
      data: { locationId: location.id, label: 'Status', dataType: 'STATUS', sortOrder: 0, config: '{}' },
    });
  } else {
    // Sections exist but maybe no locations/subrows yet — fill only what's missing.
    const sections = await prisma.section.findMany({ where: { workspaceId }, include: { locations: { include: { subRows: true } } } });
    for (const section of sections) {
      if (section.locations.length === 0) {
        const location = await prisma.location.create({ data: { sectionId: section.id, name: 'Location 1', sortOrder: 0 } });
        await prisma.subRow.create({
          data: { locationId: location.id, label: 'Status', dataType: 'STATUS', sortOrder: 0, config: '{}' },
        });
      } else {
        for (const location of section.locations) {
          if (location.subRows.length === 0) {
            await prisma.subRow.create({
              data: { locationId: location.id, label: 'Status', dataType: 'STATUS', sortOrder: 0, config: '{}' },
            });
          }
        }
      }
    }
  }

  const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: { onboardingStep: 3 } });
  res.json({ onboardingStep: workspace.onboardingStep });
});

// ── shared helpers ─────────────────────────────────────────────────────

async function swapSortOrder(
  siblings: { id: string; sortOrder: number }[],
  targetId: string,
  direction: 'up' | 'down',
  update: (id: string, sortOrder: number) => Promise<unknown>
) {
  const idx = siblings.findIndex((s) => s.id === targetId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];
  await update(a.id, b.sortOrder);
  await update(b.id, a.sortOrder);
}

async function deleteSubRowCascade(subRowId: string) {
  const cellValues = await prisma.cellValue.findMany({ where: { subRowId } });
  for (const cv of cellValues) {
    await prisma.fileUpload.deleteMany({ where: { cellValueId: cv.id } });
    await prisma.cellStaffAssignment.deleteMany({ where: { cellValueId: cv.id } });
  }
  await prisma.cellValue.deleteMany({ where: { subRowId } });
  await prisma.shift.deleteMany({ where: { subRowId } });
  await prisma.subRow.delete({ where: { id: subRowId } });
}

async function deleteLocationCascade(locationId: string) {
  const subRows = await prisma.subRow.findMany({ where: { locationId } });
  for (const sr of subRows) await deleteSubRowCascade(sr.id);
  await prisma.location.delete({ where: { id: locationId } });
}

async function deleteSectionCascade(sectionId: string) {
  const locations = await prisma.location.findMany({ where: { sectionId } });
  for (const loc of locations) await deleteLocationCascade(loc.id);
  await prisma.section.delete({ where: { id: sectionId } });
}

export default router;
