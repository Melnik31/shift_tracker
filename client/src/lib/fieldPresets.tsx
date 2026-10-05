import { DataType } from './types';

export interface FieldPreset {
  key: string;
  label: string;
  dataType: DataType;
  defaultChecked: boolean;
  // The Badge preset that names the group/tier — onboarding also marks it
  // as the Location's Group field (see SubRow.isGroupField).
  isGroupField?: boolean;
}

// Starting suggestions for the wizard's Fields step.
export const FIELD_PRESETS: FieldPreset[] = [
  { key: 'staff', label: 'Assigned staff', dataType: 'STAFF', defaultChecked: true },
  { key: 'tier', label: 'Group / Tier', dataType: 'BADGE', defaultChecked: true, isGroupField: true },
  { key: 'notes', label: 'Notes', dataType: 'TEXT', defaultChecked: true },
  { key: 'lesson', label: 'Lesson plan', dataType: 'LINK', defaultChecked: false },
];

const ICON_PATHS: Record<DataType, string> = {
  STAFF: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-6 8a6 6 0 0112 0H4z',
  BADGE: 'M3 3h6l8 8-6 6-8-8V3zm3.5 3.5a1 1 0 100 2 1 1 0 000-2z',
  TEXT: 'M5 3h7l3 3v11H5V3zm2 6h6v1.5H7V9zm0 3h6v1.5H7V12z',
  LINK: 'M8.5 11.5a3 3 0 004.2 0l2.3-2.3a3 3 0 00-4.2-4.2l-.8.8 1.1 1.1.8-.8a1.4 1.4 0 012 2l-2.3 2.3a1.4 1.4 0 01-2 0l-1.1 1.1zm3 -3a3 3 0 00-4.2 0L5 10.8a3 3 0 004.2 4.2l.8-.8-1.1-1.1-.8.8a1.4 1.4 0 01-2-2l2.3-2.3a1.4 1.4 0 012 0l1.1-1.1z',
  FILE: 'M6 3h5l4 4v10H6V3zm5 0v4h4',
  STATUS: 'M10 3a7 7 0 100 14 7 7 0 000-14zm-1 10.2L6 10.2l1.2-1.2L9 10.8l3.8-3.8L14 8.2l-5 5z',
};

export function TypeIcon({ type, className = 'w-4 h-4' }: { type: DataType; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d={ICON_PATHS[type]} />
    </svg>
  );
}
