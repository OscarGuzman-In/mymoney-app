import {
  comparePeriods,
  formatDate,
  monthLabel,
  recentPeriods,
  toDateInputValue,
} from './date.util';

describe('date.util', () => {
  it('returns chronologically ordered periods ending at the reference date', () => {
    const periods = recentPeriods(3, new Date(Date.UTC(2026, 9, 15)));
    expect(periods).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });

  it('crosses year boundaries correctly', () => {
    const periods = recentPeriods(2, new Date(Date.UTC(2026, 0, 5)));
    expect(periods).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
    ]);
  });

  it('builds a capitalized month label including the year', () => {
    const label = monthLabel({ year: 2026, month: 1 });
    expect(label).toContain('2026');
    expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
  });

  it('extracts the date input value from an ISO timestamp', () => {
    expect(toDateInputValue('2026-01-15T00:00:00.000Z')).toBe('2026-01-15');
  });

  it('compares periods by year then month', () => {
    expect(
      comparePeriods({ year: 2026, month: 1 }, { year: 2026, month: 2 }),
    ).toBeLessThan(0);
    expect(
      comparePeriods({ year: 2026, month: 1 }, { year: 2025, month: 12 }),
    ).toBeGreaterThan(0);
  });

  it('formats a date and falls back to the raw value when invalid', () => {
    expect(formatDate('2026-01-15T00:00:00.000Z')).toContain('2026');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
