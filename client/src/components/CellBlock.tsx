import { Fragment, useState } from 'react';
import { CellValue, SubRow } from '../lib/types';
import { STATUS_COLORS } from '../lib/constants';

// Every branch below follows the same overflow contract: never let content
// hard-clip mid-character. Single-line values get `truncate` (ellipsis) plus
// a `title` tooltip with the untruncated text; multi-line values (STAFF,
// TEXT) wrap/clamp instead of relying on a fixed line, with row height sized
// by MatrixView to actually fit what's clamped. The cell-edit popover is
// always the full-fidelity fallback (whole cell is one button).
export default function CellBlock({ cellValue, subRow }: { cellValue: CellValue; subRow: SubRow }) {
  switch (subRow.dataType) {
    case 'BADGE':
      return cellValue.badgeLabel ? (
        <span
          title={cellValue.badgeLabel}
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white truncate max-w-full"
          style={{ backgroundColor: cellValue.badgeColor || '#64748b' }}
        >
          {cellValue.badgeLabel}
        </span>
      ) : (
        <EmptyHint />
      );

    case 'STAFF':
      return <StaffCell cellValue={cellValue} />;

    case 'TEXT':
      return cellValue.textValue ? (
        <p title={cellValue.textValue} className="text-xs text-slate-700 line-clamp-3 whitespace-pre-wrap break-words">
          {cellValue.textValue}
        </p>
      ) : (
        <EmptyHint />
      );

    case 'LINK':
      return cellValue.linkUrl ? (
        <a
          href={cellValue.linkUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={cellValue.textValue || cellValue.linkUrl}
          className="text-xs text-blue-600 hover:underline truncate max-w-full block"
        >
          🔗 {cellValue.textValue || 'Link'}
        </a>
      ) : (
        <EmptyHint />
      );

    case 'FILE':
      return cellValue.fileUploads.length > 0 ? (
        <span
          title={cellValue.fileUploads.map((f) => f.filename).join(', ')}
          className="text-xs text-slate-700 truncate block max-w-full"
        >
          📎 {cellValue.fileUploads.length} file(s)
        </span>
      ) : (
        <EmptyHint />
      );

    case 'STATUS':
      return cellValue.statusValue ? (
        <span
          title={cellValue.statusValue.replace('_', ' ')}
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white truncate max-w-full"
          style={{ backgroundColor: STATUS_COLORS[cellValue.statusValue] ?? '#64748b' }}
        >
          {cellValue.statusValue.replace('_', ' ')}
        </span>
      ) : (
        <EmptyHint />
      );

    default:
      return null;
  }
}

function EmptyHint() {
  return <span className="text-xs text-slate-300 italic">click to edit</span>;
}

// Renders the roster for a STAFF cell. Up to 3 names show inline; beyond
// that, hovering the "+N more" line reveals every assigned name in a
// fixed-position tooltip so it isn't clipped by the shift button's
// `overflow-hidden` (fixed positioning escapes ancestor clipping).
function StaffCell({ cellValue }: { cellValue: CellValue }) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  if (cellValue.staffAssignments.length === 0) return <EmptyHint />;

  const names = cellValue.staffAssignments.map((a) => a.employee.name);
  const visible = names.length > 3 ? names.slice(0, 2) : names;
  const remaining = names.slice(visible.length);

  function showTooltip(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 4;
    if (x + 220 > window.innerWidth) x = window.innerWidth - 228;
    if (y + 24 * names.length > window.innerHeight) y = rect.top - 8 - 20 * names.length;
    setTooltipPos({ x, y });
  }

  return (
    <Fragment>
      <ul className="text-xs leading-tight text-slate-700 w-full min-w-0">
        {visible.map((name, i) => (
          <li key={i} title={name} className="truncate">
            • {name}
          </li>
        ))}
        {remaining.length > 0 && (
          <li
            className="text-slate-400 truncate cursor-default"
            onMouseEnter={showTooltip}
            onMouseLeave={() => setTooltipPos(null)}
          >
            +{remaining.length} more
          </li>
        )}
      </ul>
      {tooltipPos && (
        <div
          style={{ position: 'fixed', left: tooltipPos.x, top: tooltipPos.y, zIndex: 50 }}
          className="pointer-events-none w-52 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg"
        >
          <div className="mb-1 font-medium text-slate-500">All staff ({names.length})</div>
          <ul className="space-y-0.5">
            {names.map((name, i) => (
              <li key={i} className="truncate">
                • {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Fragment>
  );
}
