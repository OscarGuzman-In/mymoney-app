const MONTH_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export interface Period {
  year: number;
  month: number;
}

export function monthLabel(period: Period): string {
  const label = MONTH_FORMATTER.format(
    new Date(Date.UTC(period.year, period.month - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function recentPeriods(count: number, from = new Date()): Period[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const date = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - offset, 1),
    );
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  });
}

export function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATE_FORMATTER.format(date);
}

export function comparePeriods(a: Period, b: Period): number {
  return a.year - b.year || a.month - b.month;
}
