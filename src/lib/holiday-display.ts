import { Festival } from "./calj-jdates/src/Festival";
import { GDate } from "./calj-jdates/src/GDate";
import { HDate } from "./calj-jdates/src/HDate";
import { ParashaScheme } from "./calj-jdates/src/ParashaScheme";
import { formatGregorianDateFr, formatHebrewDate } from "./hebrew-format";

const FESTIVAL_FR: Record<string, string> = {
  "ראש השנה": "Roch Hachana",
  גדליה: "Tsom Gédalia",
  "יום כיפור": "Yom Kippour",
  סוכות: "Souccot",
  "הושענה רבה": "Hoshana Rabbah",
  "שמיני עצרת": "Chemini Atseret",
  "שמחת תורה": "Sim'hat Torah",
  חנוכה: "Hanoucca",
  "תענית טבת": "Tsom Tevet",
  "טו בשבט": "Tou Bishvat",
  "פורים קטן": "Pourim Katan",
  "תענית אסתר": "Tsom Esther",
  פורים: "Pourim",
  "פורים שושן": "Pourim Chouchan",
  פסח: "Pessah",
  "יום השואה": "Yom HaShoah",
  "יום הזכרון": "Yom HaZikaron",
  "יום העצמאות": "Yom HaAtsmaout",
  "פסח שני": "Pessah Sheni",
  "לג בעומר": "Lag BaOmer",
  "יום ירושלים": "Yom Yeroushalayim",
  שבועות: "Chavouot",
  "יז תמוז": "17 Tamouz",
  "תשעה באב": "9 Av",
  "טו באב": "15 Av",
};

export interface HolidayDisplayInfo {
  hebrewName: string;
  frenchSubtitle: string;
}

function isHolHaMoedDay(festival: Festival, hdate: HDate): boolean {
  const yamim = festival.getYamimTovim();
  if (yamim.length === 0) return false;

  let current = festival.getStartDate();
  let i = 0;
  while (current.lte(festival.getEndDate()) && i < yamim.length) {
    if (current.eq(hdate)) {
      return yamim[i] === false;
    }
    current = current.plus(1);
    i++;
  }
  return false;
}

function isYomTovDay(festival: Festival, hdate: HDate): boolean {
  const yamim = festival.getYamimTovim();
  if (yamim.length === 0) {
    return festival.getStartDate().eq(hdate) || festival.getEndDate().eq(hdate);
  }

  let current = festival.getStartDate();
  let i = 0;
  while (current.lte(festival.getEndDate()) && i < yamim.length) {
    if (current.eq(hdate)) {
      return yamim[i] === true;
    }
    current = current.plus(1);
    i++;
  }
  return false;
}

export function getHolidayDisplay(
  gdate: GDate,
  scheme: ParashaScheme
): HolidayDisplayInfo | null {
  const hdate = HDate.make(gdate);
  const festivals = Festival.onDate(hdate, scheme);

  for (const festival of festivals) {
    if (!festival.contains(hdate)) continue;

    const isYomTov = isYomTovDay(festival, hdate);
    const isHolHaMoed = isHolHaMoedDay(festival, hdate);
    const isSingleDay =
      festival.getStartDate().eq(festival.getEndDate()) &&
      festival.getStartDate().eq(hdate);

    if (!isYomTov && !isHolHaMoed && !isSingleDay) continue;

    const hebrewName = festival.getName();
    const frName = FESTIVAL_FR[hebrewName] ?? hebrewName;
    const jsDate = new Date(
      gdate.getYear(),
      gdate.getMonth() - 1,
      gdate.getDay()
    );

    return {
      hebrewName,
      frenchSubtitle: `${frName} — ${formatGregorianDateFr(jsDate)} · ${formatHebrewDate(hdate)}`,
    };
  }

  return null;
}
