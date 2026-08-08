import type { Automation } from "@workspace/db";

export type AutomationSchedule = Automation["schedule"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedYMD(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function zonedWeekday(ymd: string, timeZone: string): number {
  // Noon avoids landing on the wrong calendar day around a DST transition.
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(`${ymd}T12:00:00Z`));
  return WEEKDAYS.indexOf(wd);
}

function addDaysToYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Approximates civil "YYYY-MM-DD HH:mm in timeZone" -> UTC instant using the
 *  standard double-format offset trick. Good enough for reminder/automation
 *  scheduling; not exact across DST-transition instants. */
function zonedDateTimeToUtc(ymd: string, time: string, timeZone: string): Date {
  const asIfUTC = new Date(`${ymd}T${time}:00Z`);
  const tzString = asIfUTC.toLocaleString("en-US", { timeZone });
  const utcString = asIfUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs = new Date(utcString).getTime() - new Date(tzString).getTime();
  return new Date(asIfUTC.getTime() + offsetMs);
}

/** Computes the next UTC instant a schedule should fire, strictly after `from`. */
export function computeNextRunAt(schedule: AutomationSchedule, from: Date = new Date()): Date {
  const tz = schedule.timezone || "UTC";
  let ymd = zonedYMD(from, tz);

  if (schedule.freq === "weekly" && schedule.dayOfWeek != null) {
    const currentWeekday = zonedWeekday(ymd, tz);
    const diff = (schedule.dayOfWeek - currentWeekday + 7) % 7;
    ymd = addDaysToYMD(ymd, diff);
  }

  let candidate = zonedDateTimeToUtc(ymd, schedule.time, tz);
  if (candidate.getTime() <= from.getTime()) {
    const stepDays = schedule.freq === "weekly" ? 7 : 1;
    ymd = addDaysToYMD(ymd, stepDays);
    candidate = zonedDateTimeToUtc(ymd, schedule.time, tz);
  }
  return candidate;
}
