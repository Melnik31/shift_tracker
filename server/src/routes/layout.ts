import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { DATA_TYPES } from '../types';
import { campusScopeFor, campusWhere, defaultCampusId } from '../lib/campusScope';
import { sectionInScope, locationInScope, subRowInScope } from '../lib/ownership';

const router = Router();
// Campus scoping is enforced per-handler below via campusScopeFor/the
// lib/ownership.ts helpers: ADMIN/CEO see every Campus in the workspace,
// DIRECTOR/SENIOR_LEAD_INSTRUCTOR only their assigned Campus.
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

// GET /api/layout — full Section -> Location -> SubRow tree for the caller's
// workspace, narrowed to their Campus when restricted.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const sections = await prisma.section.findMany({
    where: { workspaceId, ...campusWhere(scope) },
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

// ── Sections ───────────────────────────────────────────────────────────

// Resolves which Campus a new Section belongs to. A restricted caller
// (DIRECTOR/SENIOR_LEAD_INSTRUCTOR) can only ever create in their own assigned Campus — any
// campusId in the request body is ignored, never trusted. An unrestricted
// caller (ADMIN/CEO) may specify a campusId explicitly (validated against
// the workspace); if they don't, it falls back to the workspace's default
// Campus, which is what keeps the existing "Manage Layout" UI working
// unchanged (it has no campus picker yet).
async function resolveCampusIdForCreate(workspaceId: string, scope: ReturnType<typeof campusScopeFor>, bodyCampusId: unknown) {
  if (scope.restricted) return scope.campusId; // null falls through to the 404 below — a Director/Senior Lead Instructor with no campus can't create anywhere
  if (typeof bodyCampusId === 'string' && bodyCampusId) {
    const campus = await prisma.campus.findFirst({ where: { id: bodyCampusId, workspaceId } });
    return campus?.id ?? null;
  }
  return defaultCampusId(workspaceId);
}

router.post('/sections', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { name, campusId: bodyCampusId } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const campusId = await resolveCampusIdForCreate(workspaceId, scope, bodyCampusId);
  if (!campusId) return res.status(404).json({ error: 'Campus not found' });

  const max = await prisma.section.aggregate({ where: { workspaceId, campusId }, _max: { sortOrder: true } });
  const section = await prisma.section.create({
    data: { workspaceId, campusId, name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json(section);
});

// Moving a Section between Campuses is an ADMIN/CEO-only action (same tier
// as creating/editing Campuses themselves) — a restricted DIRECTOR/SENIOR_
// LEAD_INSTRUCTOR can rename their own Section but not relocate it, since
// that's a structural decision, not day-to-day schedule management.
router.patch('/sections/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await sectionInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  const { name, campusId: bodyCampusId } = req.body ?? {};
  const data: { name?: string; campusId?: string } = {};
  if (name !== undefined) data.name = name;

  if (bodyCampusId !== undefined) {
    if (scope.restricted) return res.status(400).json({ error: 'Only Admin/CEO can move a section between campuses' });
    const campus = await prisma.campus.findFirst({ where: { id: bodyCampusId, workspaceId } });
    if (!campus) return res.status(404).json({ error: 'Campus not found' });
    if (!campus.active) return res.status(400).json({ error: 'Cannot move a section to an inactive campus' });
    data.campusId = campus.id;
  }

  const section = await prisma.section.update({ where: { id: existing.id }, data });
  res.json(section);
});

router.delete('/sections/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await sectionInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  await deleteSectionCascade(existing.id);
  res.json({ ok: true });
});

router.post('/sections/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await sectionInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Section not found' });

  const direction = req.body?.direction as 'up' | 'down';
  // Siblings are scoped the same way the section itself was looked up, so
  // a restricted caller only ever reorders within the Sections they can
  // actually see — never adjacent to a Section in another Campus.
  const siblings = await prisma.section.findMany({ where: { workspaceId, ...campusWhere(scope) }, orderBy: { sortOrder: 'asc' } });
  await swapSortOrder(siblings, existing.id, direction, (id, sortOrder) => prisma.section.update({ where: { id }, data: { sortOrder } }));
  res.json({ ok: true });
});

// ── Locations ──────────────────────────────────────────────────────────

router.post('/locations', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { sectionId, name } = req.body ?? {};
  const section = await sectionInScope(sectionId, workspaceId, scope);
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
  const scope = campusScopeFor(req);
  const existing = await locationInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  const { name } = req.body ?? {};
  const location = await prisma.location.update({ where: { id: existing.id }, data: { name } });
  res.json(location);
});

router.delete('/locations/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await locationInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  await deleteLocationCascade(existing.id);
  res.json({ ok: true });
});

router.post('/locations/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await locationInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Location not found' });

  const direction = req.body?.direction as 'up' | 'down';
  const siblings = await prisma.location.findMany({ where: { sectionId: existing.sectionId }, orderBy: { sortOrder: 'asc' } });
  await swapSortOrder(siblings, existing.id, direction, (id, sortOrder) => prisma.location.update({ where: { id }, data: { sortOrder } }));
  res.json({ ok: true });
});

// ── SubRows ────────────────────────────────────────────────────────────

router.post('/subrows', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { locationId, label, dataType, config } = req.body ?? {};
  const location = await locationInScope(locationId, workspaceId, scope);
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
  const scope = campusScopeFor(req);
  const existing = await subRowInScope(req.params.id, workspaceId, scope);
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
  const scope = campusScopeFor(req);
  const existing = await subRowInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'SubRow not found' });

  await deleteSubRowCascade(existing.id);
  res.json({ ok: true });
});

router.post('/subrows/:id/move', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await subRowInScope(req.params.id, workspaceId, scope);
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
    // Onboarding is only ever completed by the workspace's original root
    // admin (there's no way yet for a DIRECTOR/SENIOR_LEAD_INSTRUCTOR to exist before it's
    // done), so the new Section always lands in the workspace's one default
    // Campus — no scope branching needed here.
    const campusId = await defaultCampusId(workspaceId);
    const section = await prisma.section.create({ data: { workspaceId, campusId, name: 'General', sortOrder: 0 } });
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
