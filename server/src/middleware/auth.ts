import { Request, Response, NextFunction } from 'express';
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    actorType?: 'admin' | 'employee';
    workspaceId?: string;
    actorId?: string; // adminUserId or employeeId depending on actorType
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
