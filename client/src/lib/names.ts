// The schedule (Matrix, staff pickers, My Shifts) shows an employee's
// preferred name when they have one. Every other screen, payroll included,
// uses the full `name` directly.
export function scheduleName(person: { name: string; preferredName?: string | null }): string {
  return person.preferredName?.trim() || person.name;
}

// True when `term` (already lowercased) matches the full or preferred name.
export function matchesName(person: { name: string; preferredName?: string | null }, term: string): boolean {
  return person.name.toLowerCase().includes(term) || (person.preferredName ?? '').toLowerCase().includes(term);
}
