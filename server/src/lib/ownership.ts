import { prisma } from '../db';
import { CampusScope, NO_CAMPUS_ASSIGNED } from './campusScope';

// Single source of truth for "does this row belong to the caller's
// workspace (and, if restricted, their Campus)". Previously duplicated as
// near-identical ad hoc helpers in routes/layout.ts and routes/shifts.ts —
// factored out here so campus scoping only has one implementation to get
// right, rather than three-plus copies that can drift out of sync. Every
// helper re-derives scope from values already verified against the
// session (workspaceId, CampusScope) — never from client input — and
// returns null (routes turn that into 404) rather than throwing, matching
// the existing tenant-isolation convention: a denied resource looks
// identical to a nonexistent one.

function sectionCampusWhere(scope: CampusScope) {
  return scope.restricted ? { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } : {};
}

export async function sectionInScope(sectionId: string, workspaceId: string, scope: CampusScope) {
  return prisma.section.findFirst({ where: { id: sectionId, workspaceId, ...sectionCampusWhere(scope) } });
}

export async function locationInScope(locationId: string, workspaceId: string, scope: CampusScope) {
  return prisma.location.findFirst({
    where: { id: locationId, section: { workspaceId, ...sectionCampusWhere(scope) } },
  });
}

export async function subRowInScope(subRowId: string, workspaceId: string, scope: CampusScope) {
  return prisma.subRow.findFirst({
    where: { id: subRowId, location: { section: { workspaceId, ...sectionCampusWhere(scope) } } },
  });
}

export async function shiftInScope(shiftId: string, workspaceId: string, scope: CampusScope) {
  return prisma.shift.findFirst({
    where: {
      id: shiftId,
      workspaceId,
      ...(scope.restricted ? { subRow: { location: { section: { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } } } } : {}),
    },
  });
}

export async function cellValueInScope(cellValueId: string, workspaceId: string, scope: CampusScope) {
  return prisma.cellValue.findFirst({
    where: {
      id: cellValueId,
      shift: { workspaceId },
      ...(scope.restricted ? { subRow: { location: { section: { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } } } } : {}),
    },
    include: { subRow: true, shift: true },
  });
}

// The Campus a SubRow's Shifts belong to (via Location -> Section) — used
// to decide which Employees are eligible for STAFF assignment on it (same
// Campus, or floating/campusId-null). Every Section has a required,
// non-null campusId, so this is never itself null in practice.
export async function campusIdForSubRow(subRowId: string): Promise<string | null> {
  const subRow = await prisma.subRow.findUnique({
    where: { id: subRowId },
    select: { location: { select: { section: { select: { campusId: true } } } } },
  });
  return subRow?.location.section.campusId ?? null;
}

export async function fileUploadInScope(fileId: string, workspaceId: string, scope: CampusScope) {
  return prisma.fileUpload.findFirst({
    where: {
      id: fileId,
      cellValue: {
        shift: { workspaceId },
        ...(scope.restricted ? { subRow: { location: { section: { campusId: scope.campusId ?? NO_CAMPUS_ASSIGNED } } } } : {}),
      },
    },
    include: { cellValue: { include: { shift: true } } },
  });
}
