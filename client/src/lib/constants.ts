import { DataType } from './types';

// Default operational window shared by the Facility Matrix View and the
// Daily Overview dashboard, so both always render the same hours.
export const OPERATIONAL_START = '06:00';
export const OPERATIONAL_END = '22:00';

// The onboarding wizard (Onboarding.tsx) has this many steps; a
// workspace's onboardingStep reaching this value means it's done — checked
// by App.tsx's route guards and AdminLogin's post-login redirect. Kept as
// one named constant instead of a scattered magic number so adding/removing
// a step only requires updating it here.
export const ONBOARDING_COMPLETE_STEP = 4;

// Display-only — the raw DataType value is still what's sent to/from the
// API everywhere. Shared by the "add sub-row" dropdown and every compact
// inline badge (ManageLayoutModal's sub-row list, NewShiftBlockModal,
// EditShiftBlockModal) so a dataType reads the same everywhere.
export const DATA_TYPE_INFO: Record<DataType, { label: string }> = {
  STAFF: { label: 'Staff' },
  BADGE: { label: 'Badge' },
  LINK: { label: 'Link' },
  TEXT: { label: 'Text' },
  FILE: { label: 'File' },
  STATUS: { label: 'Status' },
};

// Shared with CellBlock (matrix cell rendering) and MyShifts (employee
// event view) so a STATUS pill looks the same everywhere it's rendered.
export const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#22c55e',
};

// Shared with EditShiftBlockModal (edit control), MatrixView (block
// indicator), and MyShifts (employee badge) so a session type reads the
// same everywhere.
export const SESSION_TYPE_COLORS: Record<string, string> = {
  'Ice Session': '#3b82f6',
  'Skill Session': '#a855f7',
  Workout: '#f97316',
  Association: '#64748b',
};
