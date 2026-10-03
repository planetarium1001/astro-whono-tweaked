import { describe, expect, it } from 'vitest';
import { formatViewStatValue } from '../src/lib/view-stats';

describe('view stats helpers', () => {
  it('formats numbers with thousands separators', () => {
    expect(formatViewStatValue(0)).toBe('0');
    expect(formatViewStatValue(1234)).toBe('1,234');
    expect(formatViewStatValue(1234567)).toBe('1,234,567');
  });

  it('normalizes numeric strings but keeps custom text', () => {
    expect(formatViewStatValue('1234')).toBe('1,234');
    expect(formatViewStatValue(' 1,234 ')).toBe('1,234');
    expect(formatViewStatValue('1.2万')).toBe('1.2万');
    expect(formatViewStatValue('—')).toBe('—');
  });

  it('returns an empty string for unusable input', () => {
    expect(formatViewStatValue(Number.NaN)).toBe('');
    expect(formatViewStatValue('')).toBe('');
    expect(formatViewStatValue('   ')).toBe('');
  });
});
