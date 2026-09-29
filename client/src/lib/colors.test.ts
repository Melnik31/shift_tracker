import { describe, it, expect } from 'vitest';
import { blockColorFromBadge, colorForBlock } from './colors';

describe('blockColorFromBadge', () => {
  it('uses the badge hex as-is for the accent, and a low-opacity rgba of it for the tint', () => {
    const { accent, tint } = blockColorFromBadge('#a855f7');
    expect(accent).toBe('#a855f7');
    expect(tint).toBe('rgba(168, 85, 247, 0.16)');
  });

  it('is case-insensitive on the hex digits', () => {
    const lower = blockColorFromBadge('#ff0000');
    const upper = blockColorFromBadge('#FF0000');
    expect(lower.tint).toBe(upper.tint);
  });

  it('falls back to a neutral slate color for malformed input rather than producing rgba(NaN, NaN, NaN)', () => {
    const { accent, tint } = blockColorFromBadge('not-a-hex-color');
    expect(accent).toBe('#64748b');
    expect(tint).not.toContain('NaN');
  });
});

describe('colorForBlock', () => {
  it('is deterministic for the same groupKey', () => {
    expect(colorForBlock('block-123')).toEqual(colorForBlock('block-123'));
  });
});
