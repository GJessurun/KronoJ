import { HDate } from "./calj-jdates/HDate";
import { Parasha } from "./calj-jdates/Parasha";
import { HebrewParashaLocalizer } from "./calj-jdates/HebrewParashaLocalizer";
import { ParashaScheme } from "./calj-jdates/ParashaScheme";

const UNITS = [
  { value: 400, letter: "ת" },
  { value: 300, letter: "ש" },
  { value: 200, letter: "ר" },
  { value: 100, letter: "ק" },
  { value: 90, letter: "צ" },
  { value: 80, letter: "פ" },
  { value: 70, letter: "ע" },
  { value: 60, letter: "ס" },
  { value: 50, letter: "נ" },
  { value: 40, letter: "מ" },
  { value: 30, letter: "ל" },
  { value: 20, letter: "כ" },
  { value: 10, letter: "י" },
  { value: 9, letter: "ט" },
  { value: 8, letter: "ח" },
  { value: 7, letter: "ז" },
  { value: 6, letter: "ו" },
  { value: 5, letter: "ה" },
  { value: 4, letter: "ד" },
  { value: 3, letter: "ג" },
  { value: 2, letter: "ב" },
  { value: 1, letter: "א" },
];

function toGematria(num: number, addGershayim = true): string {
  if (num <= 0) return "";
  let n = num;
  let result = "";
  for (const { value, letter } of UNITS) {
    while (n >= value) {
      if (value === 15) {
        result += "טו";
        n -= 15;
      } else if (value === 16) {
        continue;
      } else {
        result += letter;
        n -= value;
      }
    }
  }
  if (!result) return String(num);
  if (addGershayim && result.length > 1) {
    return result.slice(0, -1) + "״" + result.slice(-1);
  }
  if (addGershayim && result.length === 1) {
    return result + "׳";
  }
  return result;
}

const DAY_NAMES: Record<number, string> = {
  1: "א",
  2: "ב",
  3: "ג",
  4: "ד",
  5: "ה",
  6: "ו",
  7: "ז",
  8: "ח",
  9: "ט",
  10: "י",
  11: "יא",
  12: "יב",
  13: "יג",
  14: "יד",
  15: "טו",
  16: "טז",
  17: "יז",
  18: "יח",
  19: "יט",
  20: "כ",
  21: "כא",
  22: "כב",
  23: "כג",
  24: "כד",
  25: "כה",
  26: "כו",
  27: "כז",
  28: "כח",
  29: "כט",
  30: "ל",
};

const HEBREW_WEEKDAYS = [
  "יום ראשון",
  "יום שני",
  "יום שלישי",
  "יום רביעי",
  "יום חמישי",
  "יום שישי",
  "שבת",
];

export function formatHebrewDate(h: HDate): string {
  const day = DAY_NAMES[h.getDay()] ?? toGematria(h.getDay(), true);
  const month = h.getMonthName();
  const yearShort = h.getYear() % 1000;
  const yearLetters = toGematria(yearShort, true);
  return `${day} ב${month} ה׳${yearLetters}`;
}

export function formatHebrewWeekday(date: Date): string {
  const frenchWeekday = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
  }).format(date);
  const hebrewWeekday = HEBREW_WEEKDAYS[date.getDay()];
  return `${frenchWeekday} · ${hebrewWeekday}`;
}

export function formatGregorianDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatParasha(date: Date, scheme: ParashaScheme): string | null {
  const hdate = HDate.make(date);
  const parasha = Parasha.make(hdate, scheme);
  const localizer = new HebrewParashaLocalizer();
  const sidra = parasha.getSidra();
  const special = parasha.getSpecial();
  const festival = parasha.getFestivalName();

  if (festival) return null;
  if (special) return localizer.special(special);
  if (sidra) return localizer.sidra(sidra);
  return null;
}

export function isShabbat(date: Date): boolean {
  return date.getDay() === 6;
}
