import { Section } from './types';

// Every Staff-field label used anywhere in the layout — the set of values
// an Employee's roles can meaningfully "match" to restrict which Staff-
// assignment checkboxes they appear on. Shared by ManageTeamModal (role
// autocomplete suggestions) and the shift-editing modals (role filtering).
export function collectStaffFieldLabels(sections: Section[]): Set<string> {
  const labels = new Set<string>();
  for (const section of sections) {
    for (const location of section.locations) {
      for (const subRow of location.subRows) {
        if (subRow.dataType === 'STAFF') labels.add(subRow.label);
      }
    }
  }
  return labels;
}

// Whether an employee should show up as an assignable option on a given
// Staff field. No roles at all is always unrestricted. Any role that
// exactly matches this field's label (case-insensitive) is always shown.
// Any role that doesn't correspond to ANY known Staff field in the
// workspace (e.g. a generic job title like "Coach" or "Employee" that
// predates this feature) is treated as unrestricted too — an employee is
// hidden from a field only when every one of their roles is a *different*
// known field's label.
export function employeeVisibleOnStaffField(employeeRoles: string[] | undefined | null, fieldLabel: string, knownLabels: Set<string>): boolean {
  const roles = (employeeRoles ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (roles.length === 0) return true;
  const field = fieldLabel.trim().toLowerCase();
  if (roles.includes(field)) return true;
  const knownLower = new Set([...knownLabels].map((l) => l.toLowerCase()));
  return roles.some((r) => !knownLower.has(r));
}
