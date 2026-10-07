// Full name / preferred name validation shared by the employee and admin
// routes. Names are trimmed; the full name is required and the preferred name
// is optional (blank clears it).
export const MAX_FULL_NAME = 100;
export const MAX_PREFERRED_NAME = 60;

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

export function cleanFullName(raw: unknown): NameResult {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: false, error: 'Full name is required' };
  if (value.length > MAX_FULL_NAME) return { ok: false, error: `Full name must be ${MAX_FULL_NAME} characters or fewer` };
  return { ok: true, value };
}

// `value: null` means "no preferred name".
export function cleanPreferredName(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Preferred name must be text' };
  const value = raw.trim();
  if (value.length > MAX_PREFERRED_NAME) return { ok: false, error: `Preferred name must be ${MAX_PREFERRED_NAME} characters or fewer` };
  return { ok: true, value: value || null };
}
