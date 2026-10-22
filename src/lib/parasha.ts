import { HebrewDateFormatter, JewishCalendar } from "kosher-zmanim";

function isolateDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function getWeeklyParasha(date: Date, inIsrael: boolean): string {
  try {
    const isolated = isolateDate(date);
    const daysToShabbat = (6 - isolated.getDay() + 7) % 7;
    const shabbatDate = new Date(isolated);
    shabbatDate.setDate(shabbatDate.getDate() + daysToShabbat);

    let cal: JewishCalendar;
    let parasha: ReturnType<JewishCalendar["getParsha"]>;
    do {
      cal = new JewishCalendar(shabbatDate);
      cal.setInIsrael(inIsrael);
      parasha = cal.getParsha();
      if (!parasha) {
        shabbatDate.setDate(shabbatDate.getDate() + 7);
      }
    } while (!parasha);

    const formatter = new HebrewDateFormatter();
    formatter.setHebrewFormat(true);

    const name = formatter.formatParsha(parasha);

    if (!name || name.trim() === "") {
      return "";
    }

    return name.includes("פרשת") ? name : `פרשת ${name}`;
  } catch (error) {
    console.error("Erreur Parsha :", error);
    return "";
  }
}
