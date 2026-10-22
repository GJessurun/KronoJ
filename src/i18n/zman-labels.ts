import type { ZmanId } from "../lib/zmanim-service";

export interface ZmanLabels {
  fr: string;
  he: string;
  heParen?: string;
}

export const ZMAN_LABELS: Record<ZmanId, ZmanLabels> = {
  alot: { fr: "Alot HaShachar", he: "עלות השחר", heParen: "עלות השחר" },
  misheyakir: { fr: "Misheyakir", he: "משיכיר", heParen: "משיכיר" },
  netz: { fr: "Haneitz HaChama", he: "הנץ החמה", heParen: "הנץ החמה" },
  sofZmanShmaGra: {
    fr: 'Sof Zman Shema (GR"A)',
    he: 'סוף זמן שמע (גר"א)',
    heParen: 'סוף זמן שמע (גר"א)',
  },
  sofZmanShma: {
    fr: 'Sof Zman Shema (M"A)',
    he: 'סוף זמן שמע (מג"א)',
    heParen: 'סוף זמן שמע (מג"א)',
  },
  sofZmanTefilla: {
    fr: "Sof Zman Tefilla",
    he: "סוף זמן תפילה",
    heParen: "סוף זמן תפילה",
  },
  chatzos: { fr: "Chatzos", he: "חצות", heParen: "חצות" },
  minchaGedola: { fr: "Mincha Gedola", he: "מנחה גדולה", heParen: "מנחה גדולה" },
  minchaKetana: { fr: "Mincha Ketana", he: "מנחה קטנה", heParen: "מנחה קטנה" },
  plag: { fr: "Plag HaMincha", he: "פלג המנחה", heParen: "פלג המנחה" },
  plagYalkutYosef: {
    fr: "Plag HaMincha (Yalkout Yossef)",
    he: "פלג המנחה (ילקוט יוסף)",
    heParen: "פלג המנחה (ילקוט יוסף)",
  },
  candleLighting: {
    fr: "Allumage des bougies",
    he: "הדלקת נרות",
    heParen: "הדלקת נרות",
  },
  shkia: { fr: "Shkia", he: "שקיעה", heParen: "שקיעה" },
  tzeit: {
    fr: "Tzeit HaKochavim",
    he: "צאת הכוכבים",
    heParen: "צאת הכוכבים",
  },
  shabbatEnd: {
    fr: "Fin de Shabbat",
    he: "צאת השבת",
    heParen: "צאת השבת",
  },
  rabbenuTam: {
    fr: "Tzeit Rabbénou Tam",
    he: "צאת הכוכבים — רבנו תם",
    heParen: "רבנו תם",
  },
};
