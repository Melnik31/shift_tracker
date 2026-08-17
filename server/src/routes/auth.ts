import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';

const router = Router();

// Admin signup: creates a brand-new Workspace + first AdminUser in one step,
// then logs the admin in. This is what feeds a fresh workspace into the
// onboarding wizard (onboardingStep starts at 0).
router.post('/admin/signup', async (req, res) => {
  const { workspaceName, workspaceCode, email, password } = req.body ?? {};
  if (!workspaceName || !workspaceCode || !email || !password) {
    return res.status(400).json({ error: 'workspaceName, workspaceCode, email, and password are required' });
  }

  const codeTaken = await prisma.workspace.findUnique({ where: { workspaceCode } });
  if (codeTaken) return res.status(409).json({ error: 'That workspace code is already taken' });

  const workspace = await prisma.workspace.create({
    data: { name: workspaceName, workspaceCode, onboardingStep: 0 },
  });
  const admin = await prisma.adminUser.create({
    data: { workspaceId: workspace.id, email, passwordHash: bcrypt.hashSync(password, 10) },
  });

  req.session.actorType = 'admin';
  req.session.workspaceId = workspace.id;
  req.session.actorId = admin.id;

  res.status(201).json({
    workspace: { id: workspace.id, name: workspace.name, workspaceCode: workspace.workspaceCode, onboardingStep: workspace.onboardingStep },
  });
});

// Admin login requires workspace code + email + password. AdminUser.email is
// only unique per-workspace (not globally), so the workspace code disambiguates
// which tenant's admin table to check — this also means we never have to
// guess/search across tenants to find a match.
router.post('/admin/login', async (req, res) => {
  const { workspaceCode, email, password } = req.body ?? {};
  if (!workspaceCode || !email || !password) {
    return res.status(400).json({ error: 'workspaceCode, email, and password are required' });
  }

  const workspace = await prisma.workspace.findUnique({ where: { workspaceCode } });
  if (!workspace) return res.status(401).json({ error: 'Invalid credentials' });

  const admin = await prisma.adminUser.findUnique({
    where: { workspaceId_email: { workspaceId: workspace.id, email } },
  });
  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.actorType = 'admin';
  req.session.workspaceId = workspace.id;
  req.session.actorId = admin.id;

  res.json({
    workspace: { id: workspace.id, name: workspace.name, workspaceCode: workspace.workspaceCode, onboardingStep: workspace.onboardingStep },
  });
});

// Employee login: workspace code + 4-digit PIN, no email/username. PINs are
// hashed at rest, so we fetch the (small) employee roster for the workspace
// and bcrypt-compare against each until we find a match.
router.post('/employee/login', async (req, res) => {
  const { workspaceCode, pin } = req.body ?? {};
  if (!workspaceCode || !pin) {
    return res.status(400).json({ error: 'workspaceCode and pin are required' });
  }

  const workspace = await prisma.workspace.findUnique({ where: { workspaceCode } });
  if (!workspace) return res.status(401).json({ error: 'Invalid credentials' });

  const employees = await prisma.employee.findMany({ where: { workspaceId: workspace.id } });
  const match = employees.find((e) => bcrypt.compareSync(pin, e.pinHash));
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.actorType = 'employee';
  req.session.workspaceId = workspace.id;
  req.session.actorId = match.id;

  res.json({
    employee: { id: match.id, name: match.name, role: match.role },
    workspace: { id: workspace.id, name: workspace.name },
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.actorType || !req.session.workspaceId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: req.session.workspaceId } });
  if (!workspace) return res.status(401).json({ error: 'Not authenticated' });

  if (req.session.actorType === 'admin') {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.session.actorId } });
    return res.json({
      actorType: 'admin',
      admin: admin ? { id: admin.id, email: admin.email } : null,
      workspace: { id: workspace.id, name: workspace.name, workspaceCode: workspace.workspaceCode, onboardingStep: workspace.onboardingStep },
    });
  }

  const employee = await prisma.employee.findUnique({ where: { id: req.session.actorId } });
  res.json({
    actorType: 'employee',
    employee: employee ? { id: employee.id, name: employee.name, role: employee.role } : null,
    workspace: { id: workspace.id, name: workspace.name },
  });
});

export default router;
