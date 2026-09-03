// Default operational window shared by the Facility Matrix View and the
// Daily Overview dashboard, so both always render the same hours.
export const OPERATIONAL_START = '06:00';
export const OPERATIONAL_END = '22:00';

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
