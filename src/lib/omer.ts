import { Festival } from "./calj-jdates/Festival";
import { GDate } from "./calj-jdates/GDate";
import { HDate, HDateMonth } from "./calj-jdates/HDate";
import { ParashaScheme } from "./calj-jdates/ParashaScheme";

export function getOmerDay(gdate: GDate, scheme: ParashaScheme): number | null {
  const h = HDate.make(gdate);
  const month = h.getMonth();
  if (
    month !== HDateMonth.NISSAN &&
    month !== HDateMonth.IYAR &&
    month !== HDateMonth.SIVAN
  ) {
    return null;
  }

  const hyear = h.getYear();
  const pesach = Festival.pesach(hyear, scheme);
  const omerStart = pesach.getStartDate().plus(1);
  const shavuot = Festival.shavuot(hyear, scheme);
  const omerEnd = shavuot.getStartDate().plus(-1);

  if (h.lt(omerStart) || h.gt(omerEnd)) {
    return null;
  }

  let day = 1;
  let current = omerStart;
  while (current.lt(h)) {
    day++;
    current = current.plus(1);
  }
  return day;
}

export function formatOmerLine(day: number): string {
  if (day === 1) return "1er jour du Omer";
  return `${day}ème jour du Omer`;
}
