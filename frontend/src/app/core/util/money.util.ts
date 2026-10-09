const MONEY_FORMATTER = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface CurrencyLike {
  code?: string | null;
  symbol?: string | null;
}

export function formatAmount(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '0,00';
  }
  return MONEY_FORMATTER.format(numeric);
}

export function formatMoney(
  value: string | number,
  currency?: CurrencyLike | null,
): string {
  const formatted = formatAmount(value);
  const prefix = currency?.symbol ?? currency?.code ?? '';
  return prefix ? `${prefix} ${formatted}` : formatted;
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function progressPercent(
  current: string | number,
  target: string | number,
): number {
  const targetValue = toNumber(target);
  if (targetValue <= 0) {
    return 0;
  }
  const ratio = (toNumber(current) / targetValue) * 100;
  return Math.max(0, Math.min(100, ratio));
}
