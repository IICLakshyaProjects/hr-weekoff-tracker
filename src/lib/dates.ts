import { WEEKDAYS } from "./types";

/** "YYYY-MM" for the given date (local time). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonth(value: string | undefined, fallback: Date): { year: number; month: number } {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year: Number(m[1]), month };
  }
  return { year: fallback.getFullYear(), month: fallback.getMonth() + 1 };
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type Day = { date: string; day: number; weekday: (typeof WEEKDAYS)[number] };

export function daysInMonth(year: number, month: number): Day[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1));
    return {
      date: d.toISOString().slice(0, 10),
      day: i + 1,
      weekday: WEEKDAYS[d.getUTCDay()],
    };
  });
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
