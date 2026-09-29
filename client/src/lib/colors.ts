// Fixed palettes reused everywhere a section's or employee's color appears
// (legend chips, timeline segments, shift chips, avatars) so colors stay
// consistent across a single view without ever being randomized per render.

export const SECTION_PALETTE = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#0ea5e9', '#eab308', '#ef4444'];
export const AVATAR_PALETTE = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];

// One {accent, tint} pair per shift-block "practice" in the Matrix view's
// overlap lanes (see lib/lanes.ts) — accent is a left-border color, tint a
// very light matching background. Keyed by groupKey (a Shift's blockId, or
// its own id when standalone), not by lane index, so two unrelated
// single-shift groups that happen to land in the same lane in different
// Locations aren't forced to look identical.
export const BLOCK_PALETTE: { accent: string; tint: string }[] = [
  { accent: '#7c3aed', tint: '#ede9fe' }, // violet
  { accent: '#0d9488', tint: '#ccfbf1' }, // teal
  { accent: '#2563eb', tint: '#dbeafe' }, // blue
  { accent: '#d97706', tint: '#fef3c7' }, // amber
  { accent: '#e11d48', tint: '#ffe4e6' }, // rose
  { accent: '#059669', tint: '#d1fae5' }, // emerald
];

export function hashString(s: string): number {
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

/** Stable {accent, tint} per shift-block group, derived by hashing its groupKey. Fallback when the group has no user-chosen BADGE color — see blockColorFromBadge. */
export function colorForBlock(groupKey: string): { accent: string; tint: string } {
  return BLOCK_PALETTE[hashString(groupKey) % BLOCK_PALETTE.length];
}

/**
 * {accent, tint} for a Matrix shift-block derived from the actual color an
 * admin chose for that practice's BADGE cell — accent is the badge color
 * as-is, tint is the same color at low opacity ("just more transparent"),
 * so the block visually matches the badge the user picked instead of an
 * arbitrary hash-based color. `hex` must be a 6-digit "#rrggbb" string
 * (BADGE_COLORS/SavedBadgeColor values always are); malformed input falls
 * back to a neutral slate tint rather than rendering `rgba(NaN,NaN,NaN,…)`.
 */
export function blockColorFromBadge(hex: string, tintAlpha = 0.16): { accent: string; tint: string } {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return { accent: '#64748b', tint: 'rgba(100, 116, 139, 0.16)' };
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return { accent: hex, tint: `rgba(${r}, ${g}, ${b}, ${tintAlpha})` };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
