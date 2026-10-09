import {
  formatAmount,
  formatMoney,
  progressPercent,
  toNumber,
} from './money.util';

describe('money.util', () => {
  it('converts string decimals to numbers and guards invalid values', () => {
    expect(toNumber('100.50')).toBe(100.5);
    expect(toNumber('')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('abc')).toBe(0);
  });

  it('formats amounts with two decimals', () => {
    expect(formatAmount('1234.5')).toMatch(/1\.?234,50/);
    expect(formatAmount(0)).toMatch(/0,00/);
  });

  it('prefixes the currency symbol or code when provided', () => {
    expect(formatMoney('10', { symbol: '$', code: 'USD' })).toContain('$');
    expect(formatMoney('10', { symbol: null, code: 'EUR' })).toContain('EUR');
    expect(formatMoney('10')).not.toContain('USD');
  });

  it('computes a bounded progress percentage', () => {
    expect(progressPercent('50', '100')).toBe(50);
    expect(progressPercent('200', '100')).toBe(100);
    expect(progressPercent('10', '0')).toBe(0);
  });
});
