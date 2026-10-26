import { GDate } from "./calj-jdates/src/GDate";
import { HDate, HDateMonth } from "./calj-jdates/src/HDate";

export type CalendarType = "civil" | "hebrew";

export interface CalendarMonth {
  year: number;
  month: number;
  monthName: string;
  dayCount: number;
  leadingDays: number;
}

const HEBREW_MONTHS = [
  HDateMonth.NISSAN,
  HDateMonth.IYAR,
  HDateMonth.SIVAN,
  HDateMonth.TAMUZ,
  HDateMonth.AV,
  HDateMonth.ELUL,
  HDateMonth.TISHRI,
  HDateMonth.CHESHVAN,
  HDateMonth.KISLEV,
  HDateMonth.TEVET,
  HDateMonth.SHVAT,
  HDateMonth.ADAR,
  HDateMonth.ADAR2,
];

export function getCalendarParts(date: Date, type: CalendarType): {
  year: number;
  month: number;
} {
  if (type === "civil") {
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }
  const hebrewDate = HDate.make(date);
  return { year: hebrewDate.getYear(), month: hebrewDate.getMonth() };
}

export function getCalendarMonths(type: CalendarType, year: number): number[] {
  if (type === "civil") return Array.from({ length: 12 }, (_, index) => index + 1);
  return HEBREW_MONTHS.filter(
    (month) => month !== HDateMonth.ADAR2 || HDate.embolismicYear(year)
  );
}

export function getCalendarMonth(
  type: CalendarType,
  year: number,
  month: number
): CalendarMonth {
  if (type === "civil") {
    const firstDay = new Date(year, month - 1, 1).getDay();
    return {
      year,
      month,
      monthName: new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(
        new Date(year, month - 1, 1)
      ),
      dayCount: new Date(year, month, 0).getDate(),
      leadingDays: (firstDay + 6) % 7,
    };
  }

  const hebrewFirstDay = HDate.make(1, month, year);
  const civilFirstDay = GDate.make(hebrewFirstDay);
  return {
    year,
    month,
    monthName: hebrewFirstDay.getMonthName(),
    dayCount: hebrewFirstDay.getMonthLength(),
    leadingDays: civilFirstDay.getDayOfWeek(),
  };
}

export function getCalendarDate(
  type: CalendarType,
  year: number,
  month: number,
  day: number
): Date {
  if (type === "civil") return new Date(year, month - 1, day);
  const civil = GDate.make(HDate.make(day, month, year));
  return new Date(civil.getYear(), civil.getMonth() - 1, civil.getDay());
}
