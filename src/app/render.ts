import { DateTime } from "luxon";
import { getDisplayDate, getTodayInTimeZone, toGDate } from "./schedule";
import type { AppState } from "./state";
import {
  formatGregorianDateFr,
  formatHebrewDate,
  formatHebrewWeekday,
  isShabbat,
} from "../lib/hebrew-format";
import { getHolidayDisplay } from "../lib/holiday-display";
import { formatOmerLine, getOmerDay } from "../lib/omer";
import { HDate } from "../lib/calj-jdates/HDate";
import { getWeeklyParasha } from "../lib/parasha";
import { ParashaScheme } from "../lib/calj-jdates/ParashaScheme";
import {
  computeZmanim,
  getActiveZmanIndex,
  getLiturgyMeta,
  ZMAN_ORDER,
} from "../lib/zmanim-service";
import { ZMAN_LABELS } from "../i18n/zman-labels";
import {
  getCalendarDate,
  getCalendarMonth,
  getCalendarMonths,
  type CalendarType,
} from "../lib/calendar-date";

function starSvg(): string {
  return `<svg class="zman-star" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L6 21l2.3-7-6-4.6h7.6z"/></svg>`;
}

function gearSvg(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.8h4l.58 2.28a7.7 7.7 0 0 1 1.48.86l2.25-.67 2 3.46-1.67 1.7a7.7 7.7 0 0 1 0 1.72l1.67 1.7-2 3.46-2.25-.67a7.7 7.7 0 0 1-1.48.86L14 19.8h-4l-.58-2.28a7.7 7.7 0 0 1-1.48-.86l-2.25.67-2-3.46 1.67-1.7a7.7 7.7 0 0 1 0-1.72l-1.67-1.7 2-3.46 2.25.67a7.7 7.7 0 0 1 1.48-.86L10 2.8Z"/><circle cx="12" cy="12" r="3.25"/></svg>`;
}

function calendarSvg(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
}

function brandSvg(): string {
  return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5.5 28.7 18l12.8 1.2-9.7 8.4 3 12.5L24 33.4l-10.8 6.7 3-12.5-9.7-8.4L19.3 18 24 5.5Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.6"/><circle cx="24" cy="23.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M24 14.5v3M24 29.5v3M15 23.5h3M30 23.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderApp(
  state: AppState,
  dateCalendar: { type: CalendarType; year: number; month: number }
): void {
  const app = document.getElementById("app");
  if (!app) return;

  const now = new Date();
  const displayDate = getDisplayDate(
    state.selectedDate,
    state.city,
    state.liturgy,
    now
  );

    getTodayInTimeZone(state.city.timeZone, now),
    state.city,
    state.liturgy,
    now
    
  const inIsrael =
    state.city.countryCode === "il" || state.city.timeZone === "Asia/Jerusalem";
  const scheme = inIsrael ? ParashaScheme.ISRAEL : ParashaScheme.WORLD;
  const gdate = toGDate(displayDate);
  const hdate = HDate.make(gdate);

  const gregorian = formatGregorianDateFr(displayDate);
  const hebrew = formatHebrewDate(hdate);
  const isShabbatDay = isShabbat(displayDate);
  const omerDay = getOmerDay(gdate, scheme);
  const holiday = getHolidayDisplay(gdate, scheme);
  const parashaDisplay = getWeeklyParasha(displayDate, inIsrael);

  let zmanim: ReturnType<typeof computeZmanim> = [];
  try {
    zmanim = computeZmanim(displayDate, state.city, state.liturgy);
  } catch (error) {
    console.error("Erreur rendu zmanim :", error);
  }
  const nowDt = DateTime.fromJSDate(now);
  const activeIdx = getActiveZmanIndex(
    zmanim,
    nowDt,
    state.city.timeZone
  );
  const liturgyMeta =
    state.language === "he"
      ? state.liturgy === "sefarade"
        ? "רב עובדיה · שעות זמניות"
        : "אור מאיר · זוויות שמש"
      : getLiturgyMeta(state.liturgy);
  const isHe = state.language === "he";
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const zmanRows = zmanim
    .map((z, i) => {
      const labels = ZMAN_LABELS[z.id];
      const isActive = i === activeIdx;
      let metaText = "";
      if (
        z.id === "alot" ||
        z.id === "misheyakir" ||
        z.id === "rabbenuTam"
      ) {
        metaText = `${liturgyMeta}${
          z.id === "rabbenuTam" ? (isHe ? " · רבנו תם" : " · Rabbénou Tam") : ""
        }`;
      } else if (z.id === "sofZmanShma") {
        metaText = isHe
          ? "אור מאיר · שעות זמניות (מג״א)"
          : "Or Méir · heures proportionnelles (M\"A)";
      } else if (z.id === "sofZmanShmaGra") {
        metaText = isHe ? 'גר"א · שעות זמניות' : 'GR"A · heures proportionnelles';
      } else if (z.id === "tzeit") {
        metaText = isHe ? "זווית שמש 7,08°" : "angle solaire de 7,08°";
      } else if (z.id === "plagYalkutYosef") {
        metaText = isHe
          ? "ילקוט יוסף · 75 דקות זמניות לפני צאת הכוכבים"
          : "Yalkout Yossef · 75 min saisonnières avant Tzeit";
      } else if (z.id === "candleLighting") {
        metaText = isHe
          ? "18 דקות לפני השקיעה · 40 בירושלים"
          : "18 min avant la Shkia · 40 à Jérusalem";
      } else if (z.id === "shabbatEnd") {
        metaText = isHe
          ? "הרב טוקצ'ינסקי · 8,5°"
          : "Rav Tucazinski · angle solaire de −8,5°";
      }
      const meta = metaText
        ? `<span class="zman-meta">(${metaText})</span>`
        : "";
      const alternateTime = z.alternateTimeLabel
        ? `<small class="zman-time-alternate">${escapeHtml(z.alternateOpinion ?? "")}: ${z.alternateTimeLabel}</small>`
        : "";

      let labelHtml: string;
      if (isHe) {
        labelHtml = `<span class="zman-label-he">${labels.he}</span>`;
      } else {
        labelHtml = `<span class="zman-label-fr">${labels.fr}</span><span class="zman-label-he-paren">(${labels.heParen ?? labels.he})</span>`;
      }

      return `
        <div class="zman-row${isActive ? " zman-row--active" : ""}" data-zman-id="${z.id}">
          ${isActive ? `<span class="zman-active-marker">${starSvg()}</span>` : '<span class="zman-active-marker"></span>'}
          <div class="zman-row-inner">
            <div class="zman-labels">${labelHtml}${meta}</div>
            <span class="zman-time">${z.timeLabel}${alternateTime}</span>
          </div>
        </div>`;
    })
    .join("");

  const calendarMonth = getCalendarMonth(
    dateCalendar.type,
    dateCalendar.year,
    dateCalendar.month
  );
  const calendarMonths = getCalendarMonths(dateCalendar.type, dateCalendar.year);
  const calendarMonthNames = calendarMonths.map((month) => ({
    month,
    label:
      dateCalendar.type === "civil"
        ? new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(
            new Date(dateCalendar.year, month - 1, 1)
          )
        : HDate.make(1, month, dateCalendar.year).getMonthName(),
  }));
  const calendarWeekdays =
    dateCalendar.type === "civil"
      ? ["L", "M", "M", "J", "V", "S", "D"]
      : ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  const calendarCells = [
    ...Array.from({ length: calendarMonth.leadingDays }, () => '<span class="calendar-empty" aria-hidden="true"></span>'),
    ...Array.from({ length: calendarMonth.dayCount }, (_, index) => {
      const day = index + 1;
      const selected = toDateKey(
        getCalendarDate(dateCalendar.type, dateCalendar.year, dateCalendar.month, day)
      ) === toDateKey(state.selectedDate);
      return `<button type="button" class="calendar-day${selected ? " is-selected" : ""}" data-calendar-day="${day}" aria-pressed="${selected}">${day}</button>`;
    }),
  ].join("");
  const yearRange = Array.from(
    { length: 201 },
    (_, index) => dateCalendar.year - 100 + index
  );

  app.innerHTML = `
    <header class="header">
      <p class="location-toast" id="location-toast" aria-live="polite" hidden></p>
      <p class="gregorian-date">${gregorian}</p>
      <div class="date-wrapper${isShabbatDay ? " date-wrapper--shabbat" : ""}">
        <p class="hebrew-date">${hebrew}</p>
        <p class="hebrew-weekday"><span>Jour hébraïque</span> ${escapeHtml(formatHebrewWeekday(displayDate))}</p>
        ${parashaDisplay ? `<div class="parasha-line"><span class="parasha-caption">Paracha de la semaine</span><span class="parasha-name">${escapeHtml(parashaDisplay)}</span></div>` : ""}
      </div>
      <p class="omer-line" style="${omerDay ? "" : "display:none"}">${omerDay ? formatOmerLine(omerDay) : ""}</p>
      <div class="holiday-box" style="${holiday ? "" : "display:none"}">
        ${holiday ? `<p class="holiday-hebrew">${holiday.hebrewName}</p><p class="holiday-sub">${holiday.frenchSubtitle}</p>` : ""}
      </div>
    </header>

    <main class="zmanim-timeline">
      <div class="timeline-heading"><span>${isHe ? "זמני היום" : "HORAIRES DU JOUR"}</span><span title="${escapeHtml(state.city.timeZone)}">${escapeHtml(state.city.label)}</span></div>
      <div class="zman-list">${zmanRows}</div>
    </main>

    <nav class="bottom-dock" aria-label="Navigation date">
      <div class="date-navigation">
        <button type="button" class="dock-btn dock-btn--week" data-nav="-7" aria-label="Reculer de 7 jours"><<</button>
        <button type="button" class="dock-btn dock-btn--step" data-nav="-1" aria-label="Jour précédent">‹</button>
        <button type="button" class="dock-btn dock-btn--today" data-nav="today">Aujourd’hui</button>
        <button type="button" class="dock-btn dock-btn--calendar" data-nav="picker" aria-label="Choisir une date">${calendarSvg()}<span>Choisir une date</span></button>
        <button type="button" class="dock-btn dock-btn--step" data-nav="1" aria-label="Jour suivant">›</button>
        <button type="button" class="dock-btn dock-btn--week" data-nav="7" aria-label="Avancer de 7 jours">>></button>
      </div>
    </nav>

    <dialog class="date-dialog" id="date-dialog">
      <section class="date-dialog-inner" aria-labelledby="date-dialog-title">
        <header class="date-dialog-heading">
          <div><h2 id="date-dialog-title">Choisir une date</h2><p>Sélectionnez un jour dans le calendrier civil ou hébraïque.</p></div>
          <button type="button" class="settings-icon-close" id="date-dialog-close" aria-label="Fermer">×</button>
        </header>
        <div class="calendar-type-switch" role="group" aria-label="Type de calendrier">
          <button type="button" data-calendar-type="civil" class="${dateCalendar.type === "civil" ? "is-active" : ""}" aria-pressed="${dateCalendar.type === "civil"}">Civil</button>
          <button type="button" data-calendar-type="hebrew" class="${dateCalendar.type === "hebrew" ? "is-active" : ""}" aria-pressed="${dateCalendar.type === "hebrew"}">Hébraïque</button>
        </div>
        <div class="calendar-selectors">
          <label><span>Mois</span><select id="calendar-month">${calendarMonthNames.map(({ month, label }) => `<option value="${month}" ${month === dateCalendar.month ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
          <label><span>Année</span><select id="calendar-year">${yearRange.map((year) => `<option value="${year}" ${year === dateCalendar.year ? "selected" : ""}>${year}</option>`).join("")}</select></label>
        </div>
        <div class="calendar-grid${dateCalendar.type === "hebrew" ? " calendar-grid--hebrew" : ""}" role="grid">
          ${calendarWeekdays.map((weekday) => `<span class="calendar-weekday" role="columnheader">${weekday}</span>`).join("")}
          ${calendarCells}
        </div>
        <p class="calendar-selected-date">${escapeHtml(formatGregorianDateFr(state.selectedDate))}<span>${escapeHtml(formatHebrewDate(HDate.make(state.selectedDate)))}</span></p>
      </section>
    </dialog>

    <button type="button" class="settings-gear" id="settings-open" aria-label="Réglages">${gearSvg()}</button>

    <dialog class="settings-panel" id="settings-panel">
      <div class="settings-inner">
        <div class="settings-header">
          <span class="settings-brand-mark">${brandSvg()}</span>
          <div class="settings-brand-copy"><strong>KronoJ</strong><span>Le temps, au rythme du calendrier hébraïque</span></div>
          <button type="button" class="settings-icon-close" id="settings-close" aria-label="Fermer les réglages">×</button>
        </div>

        <div class="settings-content">
          <section class="settings-card">
            <div class="settings-card-heading"><span class="settings-card-icon">◷</span><div><h2>Horaires & méthode</h2><p>Choisissez la méthode de calcul qui vous correspond.</p></div></div>
            <fieldset class="settings-group">
              <legend>Méthode de calcul</legend>
              <label class="radio-card"><input type="radio" name="liturgy" value="sefarade" ${state.liturgy === "sefarade" ? "checked" : ""} /><span><strong>Rav Ovadia Yossef</strong><small>Séfarade · heures proportionnelles</small></span></label>
              <label class="radio-card"><input type="radio" name="liturgy" value="ashkenaze" ${state.liturgy === "ashkenaze" ? "checked" : ""} /><span><strong>Or Méir (Rav Meir Posen)</strong><small>Ashkénaze · angles solaires</small></span></label>
            </fieldset>
          </section>

          <section class="settings-card">
            <div class="settings-card-heading"><span class="settings-card-icon">א</span><div><h2>Langue des horaires</h2><p>Choisissez la langue des noms de zmanim.</p></div></div>
            <fieldset class="settings-group">
              <div class="choice-pills">
                <label class="choice-pill"><input type="radio" name="language" value="fr" ${state.language === "fr" ? "checked" : ""} /><span>Français</span></label>
                <label class="choice-pill"><input type="radio" name="language" value="he" ${state.language === "he" ? "checked" : ""} /><span>Hébreu</span></label>
              </div>
            </fieldset>
          </section>

          <section class="settings-card">
            <div class="settings-card-heading"><span class="settings-card-icon">⌖</span><div><h2>Votre lieu</h2><p>Les horaires sont calculés selon votre position.</p></div></div>
            <div class="settings-location">
              <fieldset class="settings-group">
                <legend>Mode de localisation</legend>
                <div class="choice-pills">
                  <label class="choice-pill"><input type="radio" name="location-mode" value="auto" ${state.locationMode === "auto" ? "checked" : ""} /><span>Automatique</span></label>
                  <label class="choice-pill"><input type="radio" name="location-mode" value="map" ${state.locationMode === "map" ? "checked" : ""} /><span>Sur la carte</span></label>
                </div>
              </fieldset>
              <button type="button" class="geolocate-btn" id="geolocate-btn">◎ &nbsp; Me géolocaliser</button>
              <button type="button" class="secondary-action map-open-btn" id="map-open">⌖ &nbsp; Choisir sur la carte</button>
              <p class="location-status" id="location-status" aria-live="polite"></p>
              <p class="location-current">${escapeHtml(state.city.label)}<span class="location-current-sub">${escapeHtml(state.city.subtitle)}</span></p>
            </div>
          </section>

          <section class="settings-card">
            <div class="settings-card-heading"><span class="settings-card-icon">♧</span><div><h2>Notifications de zmanim</h2><p>Recevez une alerte native à l’heure de chaque zman choisi.</p></div></div>
            <div class="notification-actions">
              <button type="button" class="secondary-action" id="notifications-test">Envoyer une notification test</button>
              <p class="settings-status" id="notification-status" aria-live="polite">${isTauri ? "" : "Disponible dans l’application de bureau installée."}</p>
            </div>
            <fieldset class="settings-group notification-list">
              <legend>Me prévenir pour</legend>
              ${ZMAN_ORDER.map((id) => {
                const labels = ZMAN_LABELS[id];
                const isChecked = state.notifications[id] === true;
                const label = isHe ? labels.he : labels.fr;
                return `<label class="toggle-row"><span class="toggle-copy"><strong>${label}</strong><small>${isHe ? labels.fr : labels.he}</small></span><input type="checkbox" name="notification" data-zman-id="${id}" ${isChecked ? "checked" : ""} ${isTauri ? "" : "disabled"} /><span class="toggle-switch" aria-hidden="true"></span></label>`;
              }).join("")}
            </fieldset>
          </section>

          <section class="settings-card settings-card--startup">
            <div class="settings-card-heading"><span class="settings-card-icon">↗</span><div><h2>Démarrage du système</h2><p>Lancer KronoJ automatiquement à l’ouverture de Windows.</p></div></div>
            <label class="toggle-row startup-toggle"><span class="toggle-copy"><strong>Ouvrir avec Windows</strong><small>Vous pourrez toujours masquer l’application dans la zone de notification.</small></span><input type="checkbox" id="start-at-login" ${state.startAtLogin ? "checked" : ""} ${isTauri ? "" : "disabled"} /><span class="toggle-switch" aria-hidden="true"></span></label>
            <p class="settings-status" id="autostart-status">${isTauri ? (state.startAtLogin ? "Lancement automatique activé." : "Lancement automatique désactivé.") : "Disponible dans l’application de bureau."}</p>
          </section>
        </div>
      </div>
    </dialog>

    <dialog class="map-dialog" id="map-dialog">
      <div class="map-dialog-inner">
        <div class="map-dialog-heading"><div><h2>Choisir un lieu sur la carte</h2><p>Cliquez sur la carte pour placer le repère.</p></div><button type="button" class="settings-icon-close" id="map-close" aria-label="Fermer la carte">×</button></div>
        <form class="map-search" id="map-search-form" role="search">
          <input id="map-search-input" type="search" autocomplete="off" placeholder="Rechercher une ville ou un endroit dans le monde" aria-label="Rechercher un lieu sur la carte" />
          <button type="submit">Rechercher</button>
        </form>
        <div class="map-search-results" id="map-search-results" role="list"></div>
        <div id="location-map" class="location-map" role="application" aria-label="Carte interactive"></div>
        <p class="location-status" id="map-status" aria-live="polite"></p>
        <div class="map-dialog-actions"><button type="button" class="secondary-action" id="map-cancel">Annuler</button><button type="button" class="geolocate-btn" id="map-confirm">Utiliser ce lieu</button></div>
      </div>
    </dialog>

    <dialog class="onboarding-dialog" id="onboarding-dialog">
      <div class="onboarding-inner">
        <div class="onboarding-brand-mark">${brandSvg()}</div>
        <h2>Bienvenue sur KronoJ</h2>
        <p>Personnalisez l’affichage des horaires et votre position.</p>
        <fieldset class="settings-group onboarding-choice">
          <legend>Langue des horaires</legend>
          <div class="choice-pills">
            <label class="choice-pill"><input type="radio" name="onboarding-language" value="fr" ${state.language === "fr" ? "checked" : ""} /><span>Français</span></label>
            <label class="choice-pill"><input type="radio" name="onboarding-language" value="he" ${state.language === "he" ? "checked" : ""} /><span>Hébreu</span></label>
          </div>
        </fieldset>
        <fieldset class="settings-group onboarding-choice">
          <legend>Choisissez votre position</legend>
          <label class="radio-card"><input type="radio" name="onboarding-location-mode" value="auto" ${state.locationMode === "auto" ? "checked" : ""} /><span><strong>Géolocalisation automatique</strong><small>Utiliser la position de cet appareil</small></span></label>
          <label class="radio-card"><input type="radio" name="onboarding-location-mode" value="map" ${state.locationMode === "map" ? "checked" : ""} /><span><strong>Choisir sur la carte</strong><small>Placer le repère sur une carte</small></span></label>
        </fieldset>
        <p class="location-status" id="onboarding-status" aria-live="polite"></p>
        <button type="button" class="onboarding-btn" id="onboarding-continue">Continuer</button>
      </div>
    </dialog>
  `;

  document.body.classList.toggle("lang-he", isHe);
  document.documentElement.lang = isHe ? "he" : "fr";
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}