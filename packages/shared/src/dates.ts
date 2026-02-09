/** Format a Date as YYYY-MM-DD (UTC). */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return today's date string in UTC. */
export function todayUTC(): string {
  return toDateString(new Date());
}

/** Parse YYYY-MM-DD into a Date (midnight UTC). */
export function parseDate(s: string): Date {
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${s}`);
  }
  return d;
}

/** Get path segments for a date: { year, month, day }. */
export function datePathParts(dateStr: string): {
  year: string;
  month: string;
  day: string;
} {
  const [year, month, day] = dateStr.split("-");
  return { year, month, day };
}

/** Return an array of date strings from start to end inclusive. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = parseDate(start);
  const endDate = parseDate(end);
  while (current <= endDate) {
    dates.push(toDateString(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/** Subtract N days from a date string. */
export function subtractDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() - n);
  return toDateString(d);
}
