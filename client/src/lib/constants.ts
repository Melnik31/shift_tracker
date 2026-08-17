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
