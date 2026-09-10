import { Section } from './types';

// Every Staff-field label used anywhere in the layout — the set of values
// an Employee.role can meaningfully "match" to restrict which Staff-
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
// Staff field. A blank role is always unrestricted. A role that exactly
// matches this field's label (case-insensitive) is always shown. A role
// that doesn't correspond to ANY known Staff field in the workspace (e.g.
// a generic job title like "Coach" or "Employee" that predates this
// feature) is treated as unrestricted too — only a role that specifically
// matches a *different* known field restricts them away from this one.
export function employeeVisibleOnStaffField(employeeRole: string | undefined | null, fieldLabel: string, knownLabels: Set<string>): boolean {
  const role = employeeRole?.trim().toLowerCase();
  if (!role) return true;
  if (role === fieldLabel.trim().toLowerCase()) return true;
  const knownLower = new Set([...knownLabels].map((l) => l.toLowerCase()));
  return !knownLower.has(role);
}
