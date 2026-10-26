import { GDate } from "../lib/calj-jdates/src/GDate";
import type { AppLocation } from "../lib/location";
import type { Liturgy } from "../lib/zmanim-service";
import { getTzeitTime } from "../lib/zmanim-service";
import { DateTime } from "luxon";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getTodayInTimeZone(
  timeZone: string,
  now: Date = new Date()
): Date {
  const localNow = DateTime.fromJSDate(now).setZone(timeZone);
  return new Date(localNow.year, localNow.month - 1, localNow.day);
}

export function getDisplayDate(
  selectedDate: Date,
  city: AppLocation,
  liturgy: Liturgy,
  now: Date = new Date()
): Date {
  const today = getTodayInTimeZone(city.timeZone, now);
  const selected = startOfDay(selectedDate);

  if (!isSameDay(selected, today)) {
    return selected;
  }

  const tzeit = getTzeitTime(selected, city, liturgy);
  if (!tzeit) return selected;

  const nowDt = DateTime.fromJSDate(now).setZone(city.timeZone);
  const tzeitLocal = tzeit.setZone(city.timeZone);

  if (nowDt > tzeitLocal) {
    const next = new Date(selected);
    next.setDate(next.getDate() + 1);
    return startOfDay(next);
  }

  return selected;
}

export function toGDate(date: Date): GDate {
  return GDate.make(date.getDate(), date.getMonth() + 1, date.getFullYear());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
