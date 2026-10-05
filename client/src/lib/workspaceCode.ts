import { hashString } from './colors';

export const WORKSPACE_CODE_PATTERN = /^[A-Za-z0-9]{3,16}$/;

// Normalizes whatever is typed into a workspace-code box: uppercase letters
// and digits only, capped at the server's 16-character limit.
export function cleanWorkspaceCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

// A short, typeable sign-in code derived from the workspace name: the first
// word's letters/digits (up to 6) plus two digits, e.g. "MEGA Goaltending" ->
// "MEGA47". The digits come from a hash of the name, so the suggestion is
// stable while the name stays the same and doesn't flicker as you type.
export function suggestWorkspaceCode(name: string): string {
  const word = name
    .split(/\s+/)
    .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .find((w) => w.length > 0);
  if (!word) return '';
  const digits = String((hashString(name.trim().toLowerCase()) % 90) + 10);
  return word.slice(0, 6) + digits;
}
