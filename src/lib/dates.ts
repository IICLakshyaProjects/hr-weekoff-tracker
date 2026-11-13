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

export type Day = { date: string; day: number; weekday: (typeof WEEKDAYS)[number]; month: string };

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wednesday through the next Wednesday, both included. */
export const CYCLE_DAYS = 8;

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Wednesday on or before `iso`. Marking runs from that Wednesday to the next one. */
export function cycleStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 4) % 7));
  return d.toISOString().slice(0, 10);
}

export function parseCycleStart(value: string | undefined, today: string): string {
  if (value && isIsoDate(value)) return cycleStart(value);
  return cycleStart(today);
}

/** This week's Wednesday, including today when today is Wednesday. Marking is open through this day. */
export function markingWednesday(today: string): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** Monday, Tuesday, and Wednesday are the regular days when week offs can be changed. */
export function isScheduleEditDay(iso: string): boolean {
  const wd = WEEKDAYS[new Date(iso + "T00:00:00Z").getUTCDay()];
  return wd === "MON" || wd === "TUE" || wd === "WED";
}

export function formatPrettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${SHORT_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatCycleRange(start: string): string {
  return `${formatPrettyDate(start)} – ${formatPrettyDate(addDays(start, CYCLE_DAYS - 1))}`;
}

export function daysFrom(start: string, count: number): Day[] {
  return Array.from({ length: count }, (_, i) => dayOf(addDays(start, i)));
}

function dayOf(date: string): Day {
  const d = new Date(date + "T00:00:00Z");
  return { date, day: d.getUTCDate(), weekday: WEEKDAYS[d.getUTCDay()], month: SHORT_MONTHS[d.getUTCMonth()] };
}

export function daysInMonth(year: number, month: number): Day[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => dayOf(new Date(Date.UTC(year, month - 1, i + 1)).toISOString().slice(0, 10)));
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in the app timezone, as YYYY-MM-DD. */
export function todayIso(timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True when `iso` is before today. Today itself can still be marked. */
export function isPastDate(iso: string, today = todayIso()): boolean {
  return iso < today;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
