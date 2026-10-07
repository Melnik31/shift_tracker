import { describe, it, expect } from 'vitest';
import { scheduleName, matchesName } from './names';

describe('scheduleName', () => {
  it('uses the preferred name when set', () => {
    expect(scheduleName({ name: 'Mikhail Melnikov', preferredName: 'Mike' })).toBe('Mike');
  });
  it('falls back to the full name when the preferred name is missing or blank', () => {
    expect(scheduleName({ name: 'Mikhail Melnikov' })).toBe('Mikhail Melnikov');
    expect(scheduleName({ name: 'Mikhail Melnikov', preferredName: null })).toBe('Mikhail Melnikov');
    expect(scheduleName({ name: 'Mikhail Melnikov', preferredName: '  ' })).toBe('Mikhail Melnikov');
  });
});

describe('matchesName', () => {
  it('matches either name, case-insensitively via a lowercased term', () => {
    const p = { name: 'Mikhail Melnikov', preferredName: 'Mike' };
    expect(matchesName(p, 'mike')).toBe(true);
    expect(matchesName(p, 'melnik')).toBe(true);
    expect(matchesName(p, 'zzz')).toBe(false);
  });
});
