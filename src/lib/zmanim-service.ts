import {
  AstronomicalCalendar,
  ComplexZmanimCalendar,
  GeoLocation,
} from "kosher-zmanim";
import { DateTime } from "luxon";
import type { AppLocation } from "./location";

export type Liturgy = "sefarade" | "ashkenaze";

/** Séfarade = Rav Ovadia (minutes proportionnelles). Ashkénaze = Or Méir (angles solaires). */
export type ZmanimMethod = "angles" | "proportional";

export type ZmanId =
  | "alot"
  | "misheyakir"
  | "netz"
  | "sofZmanShmaGra"
  | "sofZmanShma"
  | "sofZmanTefilla"
  | "chatzos"
  | "minchaGedola"
  | "minchaKetana"
  | "plag"
  | "plagYalkutYosef"
  | "candleLighting"
  | "shkia"
  | "tzeit"
  | "shabbatEnd"
  | "rabbenuTam";

export const ZMAN_ORDER: ZmanId[] = [
  "alot",
  "misheyakir",
  "netz",
  "sofZmanShmaGra",
  "sofZmanShma",
  "sofZmanTefilla",
  "chatzos",
  "minchaGedola",
  "minchaKetana",
  "plag",
  "plagYalkutYosef",
  "candleLighting",
  "shkia",
  "tzeit",
  "shabbatEnd",
  "rabbenuTam",
];

export interface ZmanEntry {
  id: ZmanId;
  time: DateTime;
  timeLabel: string;
  alternateTimeLabel?: string;
  alternateOpinion?: string;
}

function liturgyToMethod(liturgy: Liturgy): ZmanimMethod {
  return liturgy === "sefarade" ? "proportional" : "angles";
}

function isolateCivilDate(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function formatTime(dt: DateTime, timeZone: string): string {
  return dt.setZone(timeZone).toFormat("HH:mm");
}

function offsetMs(time: DateTime | null, milliseconds: number): DateTime | null {
  return AstronomicalCalendar.getTimeOffset(time, milliseconds);
}

/** `minutes * (shaahZmanit / 60)` — minutes zmaniyot. */
function zmaniyotMinutes(shaahMs: number, minutes: number): number {
  return minutes * (shaahMs / 60);
}

function shaot(shaahMs: number, hours: number): number {
  return hours * shaahMs;
}

function midpoint(a: DateTime, b: DateTime): DateTime {
  return DateTime.fromMillis(Math.floor((a.toMillis() + b.toMillis()) / 2), {
    zone: a.zone,
  });
}

function createCalendar(date: Date, city: AppLocation): ComplexZmanimCalendar {
  const { year, month, day } = isolateCivilDate(date);
  const geo = new GeoLocation(
    city.label,
    city.latitude,
    city.longitude,
    city.elevation ?? 0,
    city.timeZone
  );
  const cal = new ComplexZmanimCalendar(geo);
  cal.setDate(DateTime.fromObject({ year, month, day, hour: 12 }, { zone: city.timeZone }));
  return cal;
}

function ceilOrFloorToMinute(time: DateTime, direction: "ceil" | "floor"): DateTime {
  const minute = time.toMillis() / 60_000;
  const roundedMinute = Math[direction](minute);
  return DateTime.fromMillis(roundedMinute * 60_000, { zone: time.zone });
}

function isNearJerusalem(city: AppLocation): boolean {
  const latitude = (city.latitude * Math.PI) / 180;
  const jerusalemLatitude = (31.778 * Math.PI) / 180;
  const latitudeDelta = latitude - jerusalemLatitude;
  const longitudeDelta =
    (city.longitude * Math.PI) / 180 - (35.235 * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude) *
      Math.cos(jerusalemLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(haversine));
  return distanceKm <= 15;
}

function getSelectedOpinionTimes(
  cal: ComplexZmanimCalendar,
  method: ZmanimMethod,
  hanetz: DateTime,
  shekia: DateTime,
  shaahGraMs: number
): {
  alot: DateTime | null;
  misheyakir: DateTime | null;
  tzeit: DateTime | null;
  rabbenuTam: DateTime | null;
} {
  if (method === "angles") {
    return {
      alot: cal.getAlos16Point1Degrees(),
      misheyakir: cal.getMisheyakir11Degrees(),
      tzeit: cal.getTzaisGeonim7Point083Degrees(),
      rabbenuTam: cal.getTzais16Point1Degrees(),
    };
  }

  const alot = offsetMs(hanetz, -zmaniyotMinutes(shaahGraMs, 72));
  return {
    alot,
    misheyakir: offsetMs(alot, zmaniyotMinutes(shaahGraMs, 6)),
    tzeit: cal.getTzaisGeonim7Point083Degrees(),
    rabbenuTam: offsetMs(shekia, zmaniyotMinutes(shaahGraMs, 72)),
  };
}

function computeZmanimUnrounded(
  date: Date,
  city: AppLocation,
  liturgy: Liturgy
): {
  id: ZmanId;
  time: DateTime;
  rounding: "ceil" | "floor";
  alternateTime: DateTime | null;
  alternateOpinion: string | null;
}[] {
  const cal = createCalendar(date, city);
  const hanetz = cal.getSunrise();
  const shekia = cal.getSunset();
  if (!hanetz?.isValid || !shekia?.isValid) return [];

  const shaahGraMs = (shekia.toMillis() - hanetz.toMillis()) / 12;
  const method = liturgyToMethod(liturgy);
  const selected = getSelectedOpinionTimes(
    cal,
    method,
    hanetz,
    shekia,
    shaahGraMs
  );
  const alotPosen = cal.getAlos16Point1Degrees();
  const rabbenuTamPosen = cal.getTzais16Point1Degrees();
  const alotOvadia = offsetMs(hanetz, -zmaniyotMinutes(shaahGraMs, 72));
  const misheyakirPosen = cal.getMisheyakir11Degrees();
  const misheyakirOvadia = offsetMs(alotOvadia, zmaniyotMinutes(shaahGraMs, 6));
  const rabbenuTamOvadia = offsetMs(shekia, zmaniyotMinutes(shaahGraMs, 72));
  const shaahMaMs =
    alotPosen?.isValid && rabbenuTamPosen?.isValid
      ? (rabbenuTamPosen.toMillis() - alotPosen.toMillis()) / 12
      : null;
  const hatzot = midpoint(hanetz, shekia);
  const ovadiaTzeit = offsetMs(shekia, zmaniyotMinutes(shaahGraMs, 13.5));
  const isFriday = date.getDay() === 5;
  const isSaturday = date.getDay() === 6;
  const entries: {
    id: ZmanId;
    time: DateTime | null;
    rounding: "ceil" | "floor";
    alternateTime?: DateTime | null;
    alternateOpinion?: string;
  }[] = [
    {
      id: "alot",
      time: selected.alot,
      rounding: "floor",
      alternateTime: method === "angles" ? alotOvadia : alotPosen,
      alternateOpinion: method === "angles" ? "Rav Ovadia" : "Rav Posen",
    },
    {
      id: "misheyakir",
      time: selected.misheyakir,
      rounding: "floor",
      alternateTime: method === "angles" ? misheyakirOvadia : misheyakirPosen,
      alternateOpinion: method === "angles" ? "Rav Ovadia" : "Rav Posen",
    },
    { id: "netz", time: hanetz, rounding: "floor" },
    {
      id: "sofZmanShmaGra",
      time: offsetMs(hanetz, shaot(shaahGraMs, 3)),
      rounding: "floor",
    },
    {
      id: "sofZmanShma",
      time:
        shaahMaMs === null
          ? null
          : offsetMs(alotPosen, shaot(shaahMaMs, 3)),
      rounding: "floor",
    },
    {
      id: "sofZmanTefilla",
      time: offsetMs(hanetz, shaot(shaahGraMs, 4)),
      rounding: "floor",
    },
    { id: "chatzos", time: hatzot, rounding: "floor" },
    {
      id: "minchaGedola",
      time: offsetMs(
        hatzot,
        Math.max(shaot(shaahGraMs, 0.5), 30 * 60_000)
      ),
      rounding: "floor",
    },
    {
      id: "minchaKetana",
      time: offsetMs(hanetz, shaot(shaahGraMs, 9.5)),
      rounding: "floor",
    },
    {
      id: "plag",
      time: offsetMs(hanetz, shaot(shaahGraMs, 10.75)),
      rounding: "floor",
    },
    {
      id: "plagYalkutYosef",
      time:
        liturgy === "sefarade" && ovadiaTzeit?.isValid
          ? offsetMs(ovadiaTzeit, -shaot(shaahGraMs, 1.25))
          : null,
      rounding: "floor",
    },
    {
      id: "candleLighting",
      time: isFriday
        ? offsetMs(shekia, -(isNearJerusalem(city) ? 40 : 18) * 60_000)
        : null,
      rounding: "floor",
    },
    { id: "shkia", time: shekia, rounding: "ceil" },
    { id: "tzeit", time: selected.tzeit, rounding: "ceil" },
    {
      id: "shabbatEnd",
      time: isSaturday ? cal.getTzaisGeonim8Point5Degrees() : null,
      rounding: "ceil",
    },
    {
      id: "rabbenuTam",
      time: selected.rabbenuTam,
      rounding: "ceil",
      alternateTime: method === "angles" ? rabbenuTamOvadia : rabbenuTamPosen,
      alternateOpinion: method === "angles" ? "Rav Ovadia" : "Rav Posen",
    },
  ];

  return entries.flatMap((entry) =>
    entry.time?.isValid
      ? [{
          id: entry.id,
          time: entry.time,
          rounding: entry.rounding,
          alternateTime: entry.alternateTime?.isValid ? entry.alternateTime : null,
          alternateOpinion: entry.alternateTime?.isValid
            ? entry.alternateOpinion ?? null
            : null,
        }]
      : []
  );
}

export function computeZmanim(
  date: Date,
  city: AppLocation,
  liturgy: Liturgy
): ZmanEntry[] {
  try {
    return computeZmanimUnrounded(date, city, liturgy)
      .map(({ id, time, rounding, alternateTime, alternateOpinion }) => {
        const roundedTime = ceilOrFloorToMinute(time, rounding);
        const roundedAlternateTime = alternateTime
          ? ceilOrFloorToMinute(alternateTime, rounding)
          : null;
        return {
          id,
          time: roundedTime,
          timeLabel: formatTime(roundedTime, city.timeZone),
          ...(roundedAlternateTime && alternateOpinion
            ? {
                alternateTimeLabel: formatTime(
                  roundedAlternateTime,
                  city.timeZone
                ),
                alternateOpinion,
              }
            : {}),
        };
      })
      .sort((a, b) => a.time.toMillis() - b.time.toMillis());
  } catch (error) {
    console.error("Erreur calcul zmanim :", error);
    return [];
  }
}

export function getActiveZmanIndex(
  zmanim: ZmanEntry[],
  now: DateTime,
  timeZone: string
): number {
  const nowLocal = now.setZone(timeZone);
  for (let i = 0; i < zmanim.length; i++) {
    const zmanLocal = zmanim[i].time.setZone(timeZone);
    if (zmanLocal > nowLocal) {
      return i;
    }
  }
  return -1;
}

export function getTzeitTime(
  date: Date,
  city: AppLocation,
  liturgy: Liturgy
): DateTime | null {
  try {
    const zmanim = computeZmanim(date, city, liturgy);
    return zmanim.find((z) => z.id === "tzeit")?.time ?? null;
  } catch (error) {
    console.error("Erreur Tzeit :", error);
    return null;
  }
}

export function getLiturgyMeta(liturgy: Liturgy): string {
  if (liturgy === "sefarade") {
    return "Rav Ovadia · minutes proportionnelles";
  }
  return "Or Méir · angles solaires";
}
