// SQLite/Prisma has no native enum support, so these unions are the source of
// truth for valid values stored as plain strings in SubRow.dataType and
// CellValue.statusValue.

export const DATA_TYPES = ['BADGE', 'STAFF', 'TEXT', 'LINK', 'FILE', 'STATUS'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];
