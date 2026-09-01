import { Request, Response, NextFunction } from 'express';
import 'express-session';
import { Role } from '../types';

declare module 'express-session' {
  interface SessionData {
    actorType?: 'admin' | 'employee';
    workspaceId?: string;
    actorId?: string; // adminUserId or employeeId depending on actorType
    role?: Role; // set once at login from the DB record (admin) or implicitly (employee -> COACH); never from client input
  }
}

// workspace_id is NEVER read from the client (query/body/params) for data
// access — it is always derived from the authenticated session, here.

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.actorType !== 'admin' || !req.session.workspaceId) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  next();
}

export function requireEmployee(req: Request, res: Response, next: NextFunction) {
  if (req.session.actorType !== 'employee' || !req.session.workspaceId) {
    return res.status(401).json({ error: 'Employee authentication required' });
  }
  next();
}

export function requireAnyActor(req: Request, res: Response, next: NextFunction) {
  if (!req.session.actorType || !req.session.workspaceId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Gates on req.session.role only — never on any client-supplied value (body,
// params, query). Denial is 404, not 403, matching the tenant-isolation
// convention (see tenantIsolation.test.ts): a resource an actor can't access
// should look identical to one that doesn't exist.
export function requireRole(...roles: Role[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.session.actorType || !req.session.workspaceId || !req.session.role || !roles.includes(req.session.role)) {
      return res.status(404).json({ error: 'Not found' });
    }
    next();
  };
}
