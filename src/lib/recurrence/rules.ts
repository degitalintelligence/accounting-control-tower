export const recurrenceFrequencies = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export const holidayHandlingValues = ["allow", "skip", "next_working_day"] as const;
export const weekdayValues = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export type HolidayHandling = (typeof holidayHandlingValues)[number];
export type RecurrencePreview = { date: string; adjusted_from: string | null };
export type RecurrenceOptions = {
  skipWeekends?: boolean;
  holidayHandling?: HolidayHandling;
  holidays?: string[];
};

const weekdayNumbers: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRRule(value: string): Record<string, string> {
  return Object.fromEntries(value.replace(/^RRULE:/i, "").split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [part.slice(0, separator).toUpperCase(), part.slice(separator + 1).toUpperCase()] : [];
  }).filter((part) => part.length === 2));
}

export function selectTemplateVersion<T extends { version_number: number; effective_from?: string | null }>(versions: T[], occurrenceDate?: string): T | null {
  const eligible = versions.filter((version) => !occurrenceDate || !version.effective_from || version.effective_from <= occurrenceDate);
  return [...eligible].sort((left, right) => right.version_number - left.version_number)[0] ?? null;
}

export function validateRRule(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "RRULE wajib diisi.";
  const rule = parseRRule(value.trim());
  if (!recurrenceFrequencies.includes(rule.FREQ as (typeof recurrenceFrequencies)[number])) return "FREQ harus DAILY, WEEKLY, MONTHLY, atau YEARLY.";
  for (const key of ["INTERVAL", "COUNT", "BYMONTH", "BYMONTHDAY"]) {
    if (rule[key] && (!/^\d+$/.test(rule[key]) || Number(rule[key]) < 1)) return `${key} harus bilangan positif.`;
  }
  if (rule.BYDAY && !rule.BYDAY.split(",").every((day) => /^(MO|TU|WE|TH|FR|SA|SU)([-+]?\d+)?$/.test(day))) return "BYDAY tidak valid.";
  if (rule.FREQ === "WEEKLY" && !rule.BYDAY) return "FREQ WEEKLY membutuhkan BYDAY.";
  if (rule.BYMONTH && Number(rule.BYMONTH) > 12) return "BYMONTH harus antara 1 dan 12.";
  if (rule.BYMONTHDAY && Number(rule.BYMONTHDAY) > 31) return "BYMONTHDAY harus antara 1 dan 31.";
  if (rule.UNTIL && !/^\d{8}(T\d{6}Z?)?$/.test(rule.UNTIL)) return "UNTIL harus berformat YYYYMMDD atau YYYYMMDDTHHMMSSZ.";
  return null;
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function parseDate(value: string) { return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`); }
function matches(date: Date, rule: Record<string, string>) {
  if (rule.BYDAY && !rule.BYDAY.split(",").some((day) => weekdayNumbers[day.replace(/[-+]?\d+$/, "")] === date.getUTCDay())) return false;
  if (rule.BYMONTH && Number(rule.BYMONTH) !== date.getUTCMonth() + 1) return false;
  if (rule.BYMONTHDAY && Number(rule.BYMONTHDAY) !== date.getUTCDate()) return false;
  return true;
}

export function previewOccurrences(rrule: string, timezone: string, from = new Date(), count = 5, options: RecurrenceOptions = {}): RecurrencePreview[] {
  const rule = parseRRule(rrule);
  const start = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(from)}T00:00:00.000Z`);
  const result: RecurrencePreview[] = [];
  const holidaySet = new Set(options.holidays ?? []);
  const skipWeekends = options.skipWeekends ?? false;
  const holidayHandling = options.holidayHandling ?? "allow";
  for (let cursor = start, scanned = 0; result.length < Math.min(count, 20) && scanned < 3700; scanned++, cursor = new Date(cursor.getTime() + 86400000)) {
    const elapsedDays = Math.floor((cursor.getTime() - start.getTime()) / 86400000);
    const monthDistance = (cursor.getUTCFullYear() - start.getUTCFullYear()) * 12 + cursor.getUTCMonth() - start.getUTCMonth();
    const interval = Math.max(1, Number(rule.INTERVAL || 1));
    const intervalMatch = rule.FREQ === "DAILY" ? elapsedDays % interval === 0 : rule.FREQ === "WEEKLY" ? Math.floor(elapsedDays / 7) % interval === 0 : rule.FREQ === "MONTHLY" ? monthDistance % interval === 0 : (cursor.getUTCFullYear() - start.getUTCFullYear()) % interval === 0;
    if (!intervalMatch || !matches(cursor, rule)) continue;
    const original = dateKey(cursor);
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    const holiday = holidaySet.has(original);
    if (skipWeekends && weekend) continue;
    if (holidayHandling === "skip" && holiday) continue;
    if (holidayHandling === "next_working_day" && (weekend || holiday)) {
      let adjusted = new Date(cursor);
      while (adjusted.getUTCDay() === 0 || adjusted.getUTCDay() === 6 || holidaySet.has(dateKey(adjusted))) adjusted = new Date(adjusted.getTime() + 86400000);
      result.push({ date: dateKey(adjusted), adjusted_from: original });
    } else result.push({ date: original, adjusted_from: null });
  }
  return result;
}
