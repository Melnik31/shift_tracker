import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../db';
import { requireAdmin } from '../middleware/auth';
import { STATUS_VALUES } from '../types';

const router = Router();
router.use(requireAdmin);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function subRowInWorkspace(subRowId: string, workspaceId: string) {
  return prisma.subRow.findFirst({ where: { id: subRowId, location: { section: { workspaceId } } } });
}

function cellValueInclude() {
  return {
    staffAssignments: { include: { employee: { select: { id: true, name: true } } } },
    fileUploads: true,
  } as const;
}

// GET /api/shifts?date=YYYY-MM-DD — all shift blocks for the caller's workspace on that date.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const date = String(req.query.date ?? '');
  if (!date) return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required' });

  const shifts = await prisma.shift.findMany({
    where: { workspaceId, date },
    include: { cellValues: { include: cellValueInclude() } },
    orderBy: { startTime: 'asc' },
  });
  res.json({ shifts });
});

// POST /api/shifts — creates a new shift block + an empty cell value for a sub-row.
router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { subRowId, date, startTime, endTime } = req.body ?? {};
  const subRow = await subRowInWorkspace(subRowId, workspaceId);
  if (!subRow) return res.status(404).json({ error: 'SubRow not found' });
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, endTime are required' });

  const shift = await prisma.shift.create({ data: { workspaceId, subRowId, date, startTime, endTime } });
  const cellValue = await prisma.cellValue.create({ data: { shiftId: shift.id, subRowId } });
  const full = await prisma.shift.findUnique({
    where: { id: shift.id },
    include: { cellValues: { include: cellValueInclude() } },
  });
  res.status(201).json(full);
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.shift.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Shift not found' });

  const { startTime, endTime } = req.body ?? {};
  const shift = await prisma.shift.update({
    where: { id: existing.id },
    data: {
      ...(startTime !== undefined ? { startTime } : {}),
      ...(endTime !== undefined ? { endTime } : {}),
    },
  });
  res.json(shift);
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.shift.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Shift not found' });

  const cellValues = await prisma.cellValue.findMany({ where: { shiftId: existing.id } });
  for (const cv of cellValues) {
    await prisma.fileUpload.deleteMany({ where: { cellValueId: cv.id } });
    await prisma.cellStaffAssignment.deleteMany({ where: { cellValueId: cv.id } });
  }
  await prisma.cellValue.deleteMany({ where: { shiftId: existing.id } });
  await prisma.shift.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// ── Cell values ────────────────────────────────────────────────────────

async function cellValueInWorkspace(cellValueId: string, workspaceId: string) {
  return prisma.cellValue.findFirst({
    where: { id: cellValueId, shift: { workspaceId } },
    include: { subRow: true },
  });
}

router.patch('/cells/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await cellValueInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Cell not found' });

  const { textValue, badgeLabel, badgeColor, statusValue, linkUrl, staffEmployeeIds } = req.body ?? {};

  if (statusValue !== undefined && statusValue !== null && !STATUS_VALUES.includes(statusValue)) {
    return res.status(400).json({ error: `statusValue must be one of ${STATUS_VALUES.join(', ')}` });
  }

  await prisma.cellValue.update({
    where: { id: existing.id },
    data: {
      ...(textValue !== undefined ? { textValue } : {}),
      ...(badgeLabel !== undefined ? { badgeLabel } : {}),
      ...(badgeColor !== undefined ? { badgeColor } : {}),
      ...(statusValue !== undefined ? { statusValue } : {}),
      ...(linkUrl !== undefined ? { linkUrl } : {}),
    },
  });

  if (Array.isArray(staffEmployeeIds)) {
    const validEmployees = await prisma.employee.findMany({
      where: { id: { in: staffEmployeeIds }, workspaceId },
      select: { id: true },
    });
    const validIds = new Set(validEmployees.map((e) => e.id));

    await prisma.cellStaffAssignment.deleteMany({ where: { cellValueId: existing.id } });
    for (const employeeId of staffEmployeeIds) {
      if (validIds.has(employeeId)) {
        await prisma.cellStaffAssignment.create({ data: { cellValueId: existing.id, employeeId } });
      }
    }
  }

  const full = await prisma.cellValue.findUnique({ where: { id: existing.id }, include: cellValueInclude() });
  res.json(full);
});

router.post('/cells/:id/files', upload.single('file'), async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await cellValueInWorkspace(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Cell not found' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const fileUpload = await prisma.fileUpload.create({
    data: {
      cellValueId: existing.id,
      filename: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
    },
  });
  res.status(201).json(fileUpload);
});

router.delete('/files/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const file = await prisma.fileUpload.findFirst({
    where: { id: req.params.id, cellValue: { shift: { workspaceId } } },
  });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const diskPath = path.join(UPLOAD_DIR, path.basename(file.url));
  fs.rm(diskPath, { force: true }, () => {});
  await prisma.fileUpload.delete({ where: { id: file.id } });
  res.json({ ok: true });
});

export default router;
