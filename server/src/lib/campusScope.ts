import { Request } from 'express';
import { prisma } from '../db';

// The second scoping dimension alongside requireRole: ADMIN/CEO see every
// Campus in the workspace (restricted=false); DIRECTOR/SENIOR_LEAD_INSTRUCTOR
// are scoped to exactly the one Campus recorded on their session at login
// (restricted=true). A Director/Senior Lead Instructor with no campus
// assigned yet gets campusId=null, which is deliberately NOT "unrestricted"
// — every real Section has a non-null campusId, so filtering on
// `campusId: null` matches zero rows (fail closed) rather than silently
// granting full-workspace access.
export interface CampusScope {
  restricted: boolean;
  campusId: string | null;
}

const UNRESTRICTED_ROLES = ['ADMIN', 'CEO'];

// Section.campusId is a required (non-nullable) column, so Prisma's
// generated where-input types don't accept `campusId: null` as a filter
// value. A restricted DIRECTOR/SENIOR_LEAD_INSTRUCTOR with no campus
// assigned still needs to match zero rows (fail closed, never
// "unrestricted") — this sentinel,
// substituted for a genuinely-unassigned campusId, can never collide with a
// real Campus id (those are uuids) and reliably matches nothing.
export const NO_CAMPUS_ASSIGNED = '__no_campus_assigned__';

// An unrestricted ADMIN/CEO may optionally narrow their own view with
// `?campusId=<id>` (the Campus selector's dropdown) — this turns into the
// exact same `{restricted: true, campusId}` shape a DIRECTOR/SENIOR_LEAD_INSTRUCTOR's
// session produces, so every existing campusWhere/lib/ownership.ts filter
// applies identically either way; no route logic is duplicated for it. A
// bogus/foreign campusId here just yields an empty result set, same as any
// other filter value that matches nothing — no separate validation needed,
// since an unrestricted caller already has full access to every campus.
export function campusScopeFor(req: Request): CampusScope {
  if (req.session.role && UNRESTRICTED_ROLES.includes(req.session.role)) {
    const queryCampusId = typeof req.query.campusId === 'string' && req.query.campusId ? req.query.campusId : null;
    return queryCampusId ? { restricted: true, campusId: queryCampusId } : { restricted: false, campusId: null };
  }
  return { restricted: true, campusId: req.session.campusId ?? null };
}

// The `campusId` fragment to splice into a `where` clause already scoped to
// the caller's workspace — `{}` when unrestricted, `{ campusId }` when
// restricted (substituting NO_CAMPUS_ASSIGNED for a null/unassigned
// campusId, since the column can't be filtered on `null`). Only valid for
// models with a direct `campusId` column (Section, AdminUser); routes
// reaching Section through a relation (Location/SubRow/Shift/CellValue/
// FileUpload) build their own nested version of this same fragment in
// lib/ownership.ts.
export function campusWhere(scope: CampusScope): { campusId?: string } {
  return scope.restricted ? { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } : {};
}

export async function defaultCampusId(workspaceId: string): Promise<string> {
  const campus = await prisma.campus.findFirstOrThrow({ where: { workspaceId, isDefault: true } });
  return campus.id;
}
