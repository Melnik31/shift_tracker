import { describe, it, expect } from 'vitest';
import { cleanWorkspaceCode, suggestWorkspaceCode, WORKSPACE_CODE_PATTERN } from './workspaceCode';

describe('suggestWorkspaceCode', () => {
  it('uses the first word plus two digits, uppercased', () => {
    expect(suggestWorkspaceCode('MEGA Goaltending')).toMatch(/^MEGA\d\d$/);
    expect(suggestWorkspaceCode('acme corp operations')).toMatch(/^ACME\d\d$/);
  });

  it('caps the word at 6 characters and always satisfies the server pattern', () => {
    const code = suggestWorkspaceCode('Extraordinary Hockey Academy');
    expect(code).toMatch(/^EXTRAO\d\d$/);
    expect(WORKSPACE_CODE_PATTERN.test(code)).toBe(true);
  });

  it('strips punctuation and skips words with no letters or digits', () => {
    expect(suggestWorkspaceCode("St. Paul's Rink")).toMatch(/^ST\d\d$/);
    expect(suggestWorkspaceCode('--- Ice Works')).toMatch(/^ICE\d\d$/);
  });

  it('is stable for the same name and empty for a blank one', () => {
    expect(suggestWorkspaceCode('Plymouth Hockey')).toBe(suggestWorkspaceCode('Plymouth Hockey'));
    expect(suggestWorkspaceCode('')).toBe('');
    expect(suggestWorkspaceCode('   !!! ')).toBe('');
  });

  it('even a one-letter name yields a valid 3-character code', () => {
    expect(WORKSPACE_CODE_PATTERN.test(suggestWorkspaceCode('A'))).toBe(true);
  });
});

describe('cleanWorkspaceCode', () => {
  it('uppercases, drops everything but letters/digits, and caps at 16', () => {
    expect(cleanWorkspaceCode('my code-1!')).toBe('MYCODE1');
    expect(cleanWorkspaceCode('abcdefghijklmnopqrstuvwxyz')).toHaveLength(16);
  });
});
