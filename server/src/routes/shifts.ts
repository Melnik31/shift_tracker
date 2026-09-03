import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { STATUS_VALUES, SESSION_TYPES } from '../types';
import { rejectIfLocked } from '../lib/payrollLock';
import { campusScopeFor, NO_CAMPUS_ASSIGNED } from '../lib/campusScope';
import { subRowInScope, shiftInScope, cellValueInScope, fileUploadInScope, campusIdForSubRow } from '../lib/ownership';

const router = Router();
// Campus scoping is enforced per-handler below via campusScopeFor/the
// lib/ownership.ts helpers: ADMIN/CEO see every Campus in the workspace,
// DIRECTOR/SENIOR_LEAD_INSTRUCTOR only their assigned Campus.
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function isValidSessionType(sessionType: unknown): sessionType is string {
  return (SESSION_TYPES as readonly string[]).includes(sessionType as string);
}

function isBulkRowFilled(dataType: string, row: Record<string, unknown>): boolean {
  switch (dataType) {
    case 'TEXT':
      return typeof row.textValue === 'string' && row.textValue.trim() !== '';
    case 'BADGE':
      return typeof row.badgeLabel === 'string' && row.badgeLabel.trim() !== '';
    case 'STATUS':
      return typeof row.statusValue === 'string' && row.statusValue !== '';
    case 'LINK':
      return typeof row.linkUrl === 'string' && row.linkUrl.trim() !== '';
    case 'STAFF':
      return Array.isArray(row.staffEmployeeIds) && row.staffEmployeeIds.length > 0;
    case 'FILE':
      return row.hasFile === true;
    default:
      return false;
  }
}

function cellValueInclude() {
  return {
    staffAssignments: { include: { employee: { select: { id: true, name: true } } } },
    fileUploads: true,
  } as const;
}

// GET /api/shifts?date=YYYY-MM-DD — all shift blocks for the caller's
// workspace on that date, narrowed to their Campus when restricted.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const date = String(req.query.date ?? '');
  if (!date) return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required' });

  const shifts = await prisma.shift.findMany({
    where: {
      workspaceId,
      date,
      ...(scope.restricted ? { subRow: { location: { section: { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } } } } : {}),
    },
    include: { cellValues: { include: cellValueInclude() } },
    orderBy: { startTime: 'asc' },
  });
  res.json({ shifts });
});

// POST /api/shifts — creates a new shift block + an empty cell value for a sub-row.
router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { subRowId, date, startTime, endTime, sessionType } = req.body ?? {};
  const subRow = await subRowInScope(subRowId, workspaceId, scope);
  if (!subRow) return res.status(404).json({ error: 'SubRow not found' });
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, endTime are required' });
  if (sessionType !== undefined && sessionType !== null && !isValidSessionType(sessionType)) {
    return res.status(400).json({ error: `sessionType must be one of ${SESSION_TYPES.join(', ')}` });
  }
  if (await rejectIfLocked(req, res, workspaceId, date)) return;

  const shift = await prisma.shift.create({ data: { workspaceId, subRowId, date, startTime, endTime, sessionType: sessionType ?? null } });
  const cellValue = await prisma.cellValue.create({ data: { shiftId: shift.id, subRowId } });
  const full = await prisma.shift.findUnique({
    where: { id: shift.id },
    include: { cellValues: { include: cellValueInclude() } },
  });
  res.status(201).json(full);
});

// POST /api/shifts/bulk — "New Shift Block": one date/startTime/endTime/
// sessionType shared across every SubRow under a Location, but one
// Shift+CellValue created per SubRow that actually had something entered.
// Rows are skipped (never overwritten) when the SubRow isn't in this
// workspace, nothing was entered, or a shift already overlaps that window
// on that SubRow — reported back per row rather than failing the request.
router.post('/bulk', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const { date, startTime, endTime, sessionType, rows } = req.body ?? {};
  if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, endTime are required' });
  if (sessionType !== undefined && sessionType !== null && !isValidSessionType(sessionType)) {
    return res.status(400).json({ error: `sessionType must be one of ${SESSION_TYPES.join(', ')}` });
  }
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows must be a nonempty array' });
  if (await rejectIfLocked(req, res, workspaceId, date)) return;

  const created: { subRowId: string; shiftId: string; cellValueId: string }[] = [];
  const skipped: { subRowId: string; reason: string }[] = [];

  for (const row of rows) {
    const subRowId = row && typeof row === 'object' ? row.subRowId : undefined;
    if (!subRowId) {
      skipped.push({ subRowId: String(subRowId ?? ''), reason: 'subRowId is required' });
      continue;
    }

    const subRow = await subRowInScope(subRowId, workspaceId, scope);
    if (!subRow) {
      skipped.push({ subRowId, reason: 'SubRow not found' });
      continue;
    }
    if (!isBulkRowFilled(subRow.dataType, row)) {
      skipped.push({ subRowId, reason: 'Nothing entered' });
      continue;
    }
    if (row.statusValue !== undefined && row.statusValue !== null && row.statusValue !== '' && !STATUS_VALUES.includes(row.statusValue)) {
      skipped.push({ subRowId, reason: `statusValue must be one of ${STATUS_VALUES.join(', ')}` });
      continue;
    }

    const conflict = await prisma.shift.findFirst({
      where: { workspaceId, subRowId, date, startTime: { lt: endTime }, endTime: { gt: startTime } },
    });
    if (conflict) {
      skipped.push({ subRowId, reason: 'Already scheduled' });
      continue;
    }

    const shift = await prisma.shift.create({ data: { workspaceId, subRowId, date, startTime, endTime, sessionType: sessionType ?? null } });
    const cellValue = await prisma.cellValue.create({
      data: {
        shiftId: shift.id,
        subRowId,
        ...(subRow.dataType === 'TEXT' ? { textValue: row.textValue } : {}),
        ...(subRow.dataType === 'BADGE' ? { badgeLabel: row.badgeLabel, badgeColor: row.badgeColor } : {}),
        ...(subRow.dataType === 'STATUS' ? { statusValue: row.statusValue } : {}),
        ...(subRow.dataType === 'LINK' ? { linkUrl: row.linkUrl, textValue: row.textValue } : {}),
      },
    });

    if (subRow.dataType === 'STAFF' && Array.isArray(row.staffEmployeeIds)) {
      const targetCampusId = await campusIdForSubRow(subRowId);
      const validEmployees = await prisma.employee.findMany({
        where: { id: { in: row.staffEmployeeIds }, workspaceId, OR: [{ campusId: targetCampusId }, { campusId: null }] },
        select: { id: true },
      });
      const validIds = new Set(validEmployees.map((e) => e.id));
      for (const employeeId of row.staffEmployeeIds) {
        if (validIds.has(employeeId)) {
          await prisma.cellStaffAssignment.create({ data: { cellValueId: cellValue.id, employeeId } });
        }
      }
    }

    created.push({ subRowId, shiftId: shift.id, cellValueId: cellValue.id });
  }

  res.status(201).json({ created, skipped });
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await shiftInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Shift not found' });

  const { startTime, endTime, sessionType, cancelled } = req.body ?? {};
  if (sessionType !== undefined && sessionType !== null && !isValidSessionType(sessionType)) {
    return res.status(400).json({ error: `sessionType must be one of ${SESSION_TYPES.join(', ')}` });
  }
  if (await rejectIfLocked(req, res, workspaceId, existing.date)) return;

  const shift = await prisma.shift.update({
    where: { id: existing.id },
    data: {
      ...(startTime !== undefined ? { startTime } : {}),
      ...(endTime !== undefined ? { endTime } : {}),
      ...(sessionType !== undefined ? { sessionType } : {}),
      ...(cancelled !== undefined ? { cancelled: Boolean(cancelled) } : {}),
    },
  });
  res.json(shift);
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await shiftInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Shift not found' });
  if (await rejectIfLocked(req, res, workspaceId, existing.date)) return;

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

router.patch('/cells/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const existing = await cellValueInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Cell not found' });
  if (await rejectIfLocked(req, res, workspaceId, existing.shift.date)) return;

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
    const targetCampusId = await campusIdForSubRow(existing.subRowId);
    const validEmployees = await prisma.employee.findMany({
      where: { id: { in: staffEmployeeIds }, workspaceId, OR: [{ campusId: targetCampusId }, { campusId: null }] },
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
  const scope = campusScopeFor(req);
  const existing = await cellValueInScope(req.params.id, workspaceId, scope);
  if (!existing) return res.status(404).json({ error: 'Cell not found' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  // multer already wrote the file to disk before this handler runs — clean it
  // up on a lock rejection so a denied upload doesn't leave an orphan behind.
  if (await rejectIfLocked(req, res, workspaceId, existing.shift.date)) {
    fs.rm(path.join(UPLOAD_DIR, req.file.filename), { force: true }, () => {});
    return;
  }

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
  const scope = campusScopeFor(req);
  const file = await fileUploadInScope(req.params.id, workspaceId, scope);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (await rejectIfLocked(req, res, workspaceId, file.cellValue.shift.date)) return;

  const diskPath = path.join(UPLOAD_DIR, path.basename(file.url));
  fs.rm(diskPath, { force: true }, () => {});
  await prisma.fileUpload.delete({ where: { id: file.id } });
  res.json({ ok: true });
});

export default router;
