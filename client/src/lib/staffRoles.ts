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
// Staff field: only when one of their roles equals the field's label
// (case-insensitive). A coach with no roles, or only roles that name other
// fields or nothing at all, is hidden — give them the role in Manage Team.
export function employeeVisibleOnStaffField(employeeRoles: string[] | undefined | null, fieldLabel: string): boolean {
  const field = fieldLabel.trim().toLowerCase();
  return (employeeRoles ?? []).some((r) => r.trim().toLowerCase() === field);
}
