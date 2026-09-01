import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';

const router = Router();
// TODO(campus-scoping): once Campus scoping exists, DIRECTOR access here
// should narrow to their own campus only, rather than the whole workspace.
router.use(requireRole('DIRECTOR', 'ADMIN', 'CEO'));

router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const employees = await prisma.employee.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true, createdAt: true },
  });
  res.json({ employees });
});

router.post('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { name, role, pin } = req.body ?? {};
  if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });

  const employee = await prisma.employee.create({
    data: { workspaceId, name, role: role || 'Employee', pinHash: bcrypt.hashSync(pin, 10) },
  });
  res.status(201).json({ id: employee.id, name: employee.name, role: employee.role });
});

router.patch('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, role, pin } = req.body ?? {};
  if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits' });

  const employee = await prisma.employee.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(pin ? { pinHash: bcrypt.hashSync(pin, 10) } : {}),
    },
  });
  res.json({ id: employee.id, name: employee.name, role: employee.role });
});

router.delete('/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const existing = await prisma.employee.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  await prisma.cellStaffAssignment.deleteMany({ where: { employeeId: existing.id } });
  await prisma.employee.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

export default router;
