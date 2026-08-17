// Fixed palettes reused everywhere a section's or employee's color appears
// (legend chips, timeline segments, shift chips, avatars) so colors stay
// consistent across a single view without ever being randomized per render.

export const SECTION_PALETTE = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#0ea5e9', '#eab308', '#ef4444'];
export const AVATAR_PALETTE = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable color per section, based on its position in the workspace's own Section list (ordered by sortOrder). */
export function buildSectionColorMap(sections: { id: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  sections.forEach((s, i) => map.set(s.id, SECTION_PALETTE[i % SECTION_PALETTE.length]));
  return map;
}

/** Stable color per employee, derived by hashing their id — never randomized on render. */
export function colorForEmployee(employeeId: string): string {
  return AVATAR_PALETTE[hashString(employeeId) % AVATAR_PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
