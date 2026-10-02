import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';

const router = Router();
// Same roles allowed to actually edit a BADGE cell (see routes/shifts.ts) —
// no point letting anyone else see/manage the shared quick-pick palette.
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// GET /api/badge-colors — every custom color an admin in this workspace has
// saved from the BADGE color picker, newest first so a just-saved color is
// immediately visible as the first "recent" swatch.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const colors = await prisma.savedBadgeColor.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ colors });
});

// POST /api/badge-colors { color, label } — saves a new named quick-pick
// color. `label` is required: an unnamed preset would have nothing for the
// picker to auto-fill into the badge's text field when selected (see
// CellFieldEditor.tsx). Silently no-ops (200, not 409) if this exact color
// is already saved — the picker just wants "make sure this is in the
// list," not a strict create; renaming an existing preset isn't supported
// here (delete + re-save covers it, consistent with there being no other
// rename affordance for saved colors).
router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { color, label } = req.body ?? {};
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
    return res.status(400).json({ error: 'color must be a 6-digit hex string, e.g. #ff6b35' });
  }
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }

  const existing = await prisma.savedBadgeColor.findUnique({ where: { workspaceId_color: { workspaceId, color } } });
  if (existing) return res.status(200).json(existing);

  const saved = await prisma.savedBadgeColor.create({ data: { workspaceId, color, label: label.trim() } });
  res.status(201).json(saved);
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.savedBadgeColor.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Saved color not found' });

  await prisma.savedBadgeColor.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
