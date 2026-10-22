import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { DateTime } from "luxon";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderApp } from "./app/render";
import {
  loadPreferences,
  savePreferences,
  type Language,
  type LocationMode,
} from "./app/preferences";
import {
  addDays,
  getTodayInTimeZone,
  toDateInputValue,
} from "./app/schedule";
import { createInitialState, type AppState } from "./app/state";
import type { AppLocation } from "./lib/location";
import {
  ensureLocationReady,
  reverseGeocode,
  searchLocations,
} from "./lib/location";
import {
  getCalendarDate,
  getCalendarParts,
  getCalendarMonths,
  type CalendarType,
} from "./lib/calendar-date";
import { computeZmanim } from "./lib/zmanim-service";
import { ZMAN_LABELS } from "./i18n/zman-labels";
import { saveWidgetPreferences } from "./app/widget-settings";

let state: AppState;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let notificationPermissionGranted = false;
let notificationScheduleDay = "";
let locationMap: L.Map | null = null;
let locationMarker: L.Marker | null = null;
let selectedMapPoint: L.LatLng | null = null;
let onboardingMapSelection = false;
let mapSearchSequence = 0;
let dateCalendarType: CalendarType = "civil";
let dateCalendarYear = 0;
let dateCalendarMonth = 0;
const settingsStatusMessages: Record<string, string> = {};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function setSettingsStatus(id: string, message: string): void {
  settingsStatusMessages[id] = message;
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

async function syncWidgetPreferences(
  location: AppLocation,
  liturgy: AppState["liturgy"]
): Promise<void> {
  try {
    await saveWidgetPreferences(location, liturgy);
    navigator.serviceWorker?.controller?.postMessage({ type: "refresh-widgets" });
  } catch (error) {
    console.error("Impossible de synchroniser les réglages du widget :", error);
    setSettingsStatus(
      "widgets-status",
      "Impossible de synchroniser la position avec les widgets Windows."
    );
  }
}

async function setAutostart(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await enableAutostart();
    } else {
      await disableAutostart();
    }
    await persist({ startAtLogin: enabled });
    setSettingsStatus(
      "autostart-status",
      enabled ? "KronoJ démarrera avec Windows." : "Démarrage automatique désactivé."
    );
  } catch (error) {
    console.error("Impossible de modifier le démarrage automatique :", error);
    setSettingsStatus(
      "autostart-status",
      "Impossible de modifier le démarrage automatique. Vérifiez les autorisations du système."
    );
    refresh();
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    setSettingsStatus(
      "notification-status",
      "Les notifications système sont disponibles dans l’application de bureau."
    );
    return false;
  }

  try {
    notificationPermissionGranted = await isPermissionGranted();
    if (!notificationPermissionGranted) {
      notificationPermissionGranted = (await requestPermission()) === "granted";
    }
    setSettingsStatus(
      "notification-status",
      notificationPermissionGranted
        ? "Les alertes apparaîtront dans les notifications Windows."
        : "Autorisez les notifications système pour recevoir les alertes."
    );
    return notificationPermissionGranted;
  } catch (error) {
    console.error("Impossible de demander l’autorisation des notifications :", error);
    setSettingsStatus("notification-status", "Autorisation des notifications indisponible.");
    return false;
  }
}

async function sendTestNotification(): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    await refreshNotificationSchedule(true);
    await sendNotification({
      title: "KronoJ",
      body: "Les notifications de zmanim sont bien activées.",
    });
    setSettingsStatus("notification-status", "Notification test envoyée sur votre bureau.");
  } catch (error) {
    console.error("Impossible d’envoyer la notification de test :", error);
    setSettingsStatus("notification-status", "Échec de l’envoi de la notification de test.");
  }
}

async function updateScheduleIfNewDay(): Promise<void> {
  if (!state || !isTauri()) return;
  const now = DateTime.now().setZone(state.city.timeZone);
  const dayKey = now.toISODate();
  if (!dayKey) return;

  if (dayKey === notificationScheduleDay) return;
  await refreshNotificationSchedule();
}

async function refreshNotificationSchedule(force = false): Promise<void> {
  if (!state || !isTauri()) return;
  const now = DateTime.now().setZone(state.city.timeZone);
  const dayKey = now.toISODate();
  if (!dayKey || (!force && dayKey === notificationScheduleDay)) return;
  const enabledIds = Object.entries(state.notifications)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);

  try {
    notificationPermissionGranted = await isPermissionGranted();
    if (enabledIds.length > 0 && !notificationPermissionGranted) {
      await invoke("set_notification_schedule", { schedule: [] });
      notificationScheduleDay = dayKey;
      setSettingsStatus(
        "notification-status",
        "Autorisez les notifications système pour activer les alertes."
      );
      return;
    }

    const schedule: {
      id: string;
      atMillis: number;
      title: string;
      body: string;
    }[] = [];

    for (let offset = 0; offset < 2; offset++) {
      const date = now.plus({ days: offset });
      const civilDate = new Date(date.year, date.month - 1, date.day, 12);
      for (const zman of computeZmanim(civilDate, state.city, state.liturgy)) {
        if (state.notifications[zman.id] !== true) continue;
        const atMillis = zman.time.setZone(state.city.timeZone).toMillis();
        if (atMillis <= now.toMillis()) continue;
        schedule.push({
          id: `${date.toISODate()}-${zman.id}`,
          atMillis,
          title: `KronoJ · ${ZMAN_LABELS[zman.id][state.language]}`,
          body: `Il est ${zman.timeLabel} à ${state.city.label}.`,
        });
      }
    }
    schedule.sort((a, b) => a.atMillis - b.atMillis);
    await invoke("set_notification_schedule", { schedule });
    notificationScheduleDay = dayKey;
    setSettingsStatus(
      "notification-status",
      enabledIds.length === 0
        ? "Choisissez les horaires pour recevoir des alertes."
        : `${schedule.length} alerte${schedule.length > 1 ? "s" : ""} planifiée${schedule.length > 1 ? "s" : ""} sur les deux prochains jours.`
    );
  } catch (error) {
    console.error("Impossible de planifier les notifications :", error);
    setSettingsStatus("notification-status", "Échec de la planification des notifications.");
  }
}

function setLocationStatus(message: string): void {
  const el = document.getElementById("location-status");
  if (el) el.textContent = message;
  const toast = document.getElementById("location-toast");
  if (toast) {
    toast.textContent = message;
    toast.hidden = message.length === 0;
  }
}

function setGeoStatus(message: string, statusId: string): void {
  const status = document.getElementById(statusId);
  if (status) status.textContent = message;
  const toast = document.getElementById("location-toast");
  if (toast) {
    toast.textContent = message;
    toast.hidden = message.length === 0;
  }
}

function refresh(): void {
  const settingsPanel = document.getElementById("settings-panel") as HTMLDialogElement | null;
  const keepSettings = settingsPanel?.open === true;
  const dateDialog = document.getElementById("date-dialog") as HTMLDialogElement | null;
  const keepDateDialog = dateDialog?.open === true;
  const settingsScrollTop =
    settingsPanel?.querySelector<HTMLElement>(".settings-content")?.scrollTop ?? 0;
  renderApp(state, {
    type: dateCalendarType,
    year: dateCalendarYear,
    month: dateCalendarMonth,
  });
  bindEvents();
  if (keepSettings) {
    const nextPanel = document.getElementById("settings-panel") as HTMLDialogElement | null;
    nextPanel?.showModal();
    const content = nextPanel?.querySelector<HTMLElement>(".settings-content");
    if (content) content.scrollTop = settingsScrollTop;
  }
  if (keepDateDialog) {
    (document.getElementById("date-dialog") as HTMLDialogElement | null)?.showModal();
  }
  for (const [id, message] of Object.entries(settingsStatusMessages)) {
    setSettingsStatus(id, message);
  }
}

async function applyLocation(location: AppLocation): Promise<void> {
  setLocationStatus("Mise à jour des horaires…");
  const previousSelectedDate = state.selectedDate;
  const selectedDateWasToday =
    toDateInputValue(previousSelectedDate) ===
    toDateInputValue(getTodayInTimeZone(state.city.timeZone));
  try {
    const ready = await ensureLocationReady(location);
    if (selectedDateWasToday) {
      state.selectedDate = getTodayInTimeZone(ready.timeZone);
    }
    await persist({ location: ready });
    setLocationStatus("");
  } catch (error) {
    state.selectedDate = previousSelectedDate;
    console.error("Impossible de préparer ce lieu :", error);
    setLocationStatus("Impossible d’obtenir le fuseau horaire de ce lieu.");
  }
}

function geolocate(statusId = "location-status"): void {
  if (!navigator.geolocation) {
    setGeoStatus("Géolocalisation non supportée sur cet appareil.", statusId);
    return;
  }

  setGeoStatus("Acquisition GPS…", statusId);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const loc = await reverseGeocode(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.altitude ?? 0
        );
        await applyLocation(loc);
      } catch (error) {
        console.error("Impossible de résoudre la position GPS :", error);
        setGeoStatus("Impossible de résoudre la position GPS.", statusId);
      }
    },
    (err) => {
      const msg =
        err.code === err.PERMISSION_DENIED
          ? "Autorisez l’accès à la position dans les réglages système."
          : "La géolocalisation a échoué.";
      setGeoStatus(msg, statusId);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 }
  );
}

async function persist(
  partial: Parameters<typeof savePreferences>[0]
): Promise<void> {
  const prefs = await savePreferences(partial);
  if (!isTauri()) {
    await syncWidgetPreferences(prefs.location, prefs.liturgy);
  }
  state = {
    ...state,
    liturgy: prefs.liturgy,
    language: prefs.language,
    locationMode: prefs.locationMode,
    onboardingComplete: prefs.onboardingComplete,
    notifications: prefs.notifications,
  };
  if (partial.location) state.city = prefs.location;
  if (partial.locationMode) state.locationMode = prefs.locationMode;
  if ("startAtLogin" in partial) {
    state.startAtLogin = prefs.startAtLogin;
  }
  await refreshNotificationSchedule(true);
  refresh();
}

function openLocationMap(forOnboarding = false): void {
  onboardingMapSelection = forOnboarding;
  selectedMapPoint = L.latLng(state.city.latitude, state.city.longitude);
  const dialog = document.getElementById("map-dialog") as HTMLDialogElement | null;
  if (!dialog) return;
  dialog.showModal();

  const mapElement = document.getElementById("location-map");
  if (!mapElement) return;
  locationMap?.remove();
  locationMap = L.map(mapElement).setView([20, 0], 2);
  const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
  tileLayer.on("tileerror", () => {
    const status = document.getElementById("map-status");
    if (status) status.textContent = "La carte nécessite une connexion internet.";
  });
  tileLayer.addTo(locationMap);
  locationMarker = L.marker(selectedMapPoint, {
    draggable: true,
    icon: L.divIcon({
      className: "map-location-marker",
      html: "<span></span>",
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    }),
  }).addTo(locationMap);
  locationMarker.on("dragend", () => {
    const point = locationMarker?.getLatLng();
    if (point) selectedMapPoint = point;
  });
  locationMap.on("click", (event: L.LeafletMouseEvent) => {
    selectedMapPoint = event.latlng;
    locationMarker?.setLatLng(event.latlng);
  });
  window.setTimeout(() => locationMap?.invalidateSize(), 100);
}

function closeLocationMap(): void {
  const dialog = document.getElementById("map-dialog") as HTMLDialogElement | null;
  if (dialog?.open) dialog.close();
  locationMap?.remove();
  locationMap = null;
  locationMarker = null;
  selectedMapPoint = null;
  mapSearchSequence++;
  if (onboardingMapSelection) {
    onboardingMapSelection = false;
    const onboarding = document.getElementById("onboarding-dialog") as HTMLDialogElement | null;
    onboarding?.showModal();
  }
}

async function searchMapPlaces(query: string): Promise<void> {
  const results = document.getElementById("map-search-results");
  const status = document.getElementById("map-status");
  if (!results || !status) return;
  const searchId = ++mapSearchSequence;
  results.replaceChildren();
  if (query.trim().length < 2) {
    status.textContent = "Saisissez au moins deux caractères.";
    return;
  }

  status.textContent = "Recherche dans le monde entier…";
  try {
    const locations = await searchLocations(query);
    if (searchId !== mapSearchSequence) return;
    if (locations.length === 0) {
      status.textContent = "Aucun lieu trouvé. Essayez un autre nom.";
      return;
    }

    status.textContent = `${locations.length} lieu${locations.length > 1 ? "x" : ""} trouvé${locations.length > 1 ? "s" : ""}.`;
    for (const location of locations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-search-result";
      const name = document.createElement("strong");
      name.textContent = location.label;
      const subtitle = document.createElement("small");
      subtitle.textContent = location.subtitle;
      button.append(name, subtitle);
      button.addEventListener("click", () => {
        const point = L.latLng(location.latitude, location.longitude);
        selectedMapPoint = point;
        locationMarker?.setLatLng(point);
        locationMap?.setView(point, 10);
        results.replaceChildren();
        status.textContent = `${location.label} — ${location.subtitle}`;
      });
      results.append(button);
    }
  } catch (error) {
    if (searchId !== mapSearchSequence) return;
    console.error("Impossible de rechercher ce lieu :", error);
    status.textContent = "La recherche a échoué. Vérifiez votre connexion et réessayez.";
  }
}

async function confirmMapLocation(): Promise<void> {
  if (!selectedMapPoint) return;
  const status = document.getElementById("map-status");
  if (status) status.textContent = "Résolution du lieu et du fuseau horaire…";
  const point = selectedMapPoint;
  try {
    const location = await reverseGeocode(point.lat, point.lng);
    const completeOnboarding = onboardingMapSelection;
    (document.getElementById("map-dialog") as HTMLDialogElement | null)?.close();
    locationMap?.remove();
    locationMap = null;
    locationMarker = null;
    selectedMapPoint = null;
    onboardingMapSelection = false;
    await persist({
      location,
      locationMode: "map",
      ...(completeOnboarding ? { onboardingComplete: true } : {}),
    });
  } catch (error) {
    console.error("Impossible d’utiliser le lieu sélectionné sur la carte :", error);
    if (status) status.textContent = "Impossible de déterminer le fuseau horaire de ce lieu.";
  }
}

function bindEvents(): void {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const nav = (e.currentTarget as HTMLElement).dataset.nav;

      if (nav === "today") {
        state.selectedDate = getTodayInTimeZone(state.city.timeZone);
        refresh();
        return;
      }

      if (nav === "picker") {
        dateCalendarType = "civil";
        ({ year: dateCalendarYear, month: dateCalendarMonth } = getCalendarParts(
          state.selectedDate,
          dateCalendarType
        ));
        (document.getElementById("date-dialog") as HTMLDialogElement | null)?.showModal();
        return;
      }

      const delta =
        nav === "-7" ? -7 : nav === "7" ? 7 : nav === "-1" ? -1 : nav === "1" ? 1 : 0;
      if (delta) {
        state.selectedDate = addDays(state.selectedDate, delta);
        refresh();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-calendar-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.calendarType as CalendarType | undefined;
      if (!type) return;
      dateCalendarType = type;
      ({ year: dateCalendarYear, month: dateCalendarMonth } = getCalendarParts(
        state.selectedDate,
        type
      ));
      refresh();
    });
  });

  document.getElementById("calendar-month")?.addEventListener("change", (event) => {
    dateCalendarMonth = Number((event.currentTarget as HTMLSelectElement).value);
    refresh();
  });

  document.getElementById("calendar-year")?.addEventListener("change", (event) => {
    dateCalendarYear = Number((event.currentTarget as HTMLSelectElement).value);
    const availableMonths = getCalendarMonths(dateCalendarType, dateCalendarYear);
    if (!availableMonths.includes(dateCalendarMonth)) {
      dateCalendarMonth = availableMonths[availableMonths.length - 1];
    }
    refresh();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const day = Number(button.dataset.calendarDay);
      state.selectedDate = getCalendarDate(
        dateCalendarType,
        dateCalendarYear,
        dateCalendarMonth,
        day
      );
      (document.getElementById("date-dialog") as HTMLDialogElement | null)?.close();
      refresh();
    });
  });
  document.getElementById("date-dialog-close")?.addEventListener("click", () => {
    (document.getElementById("date-dialog") as HTMLDialogElement | null)?.close();
  });

  const settingsOpen = document.getElementById("settings-open");
  const settingsPanel = document.getElementById("settings-panel") as HTMLDialogElement | null;
  const settingsClose = document.getElementById("settings-close");

  settingsOpen?.addEventListener("click", () => {
    settingsPanel?.showModal();
    for (const [id, message] of Object.entries(settingsStatusMessages)) {
      setSettingsStatus(id, message);
    }
  });
  settingsClose?.addEventListener("click", () => settingsPanel?.close());

  settingsPanel?.querySelectorAll('input[name="liturgy"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      const val = (e.target as HTMLInputElement).value as "sefarade" | "ashkenaze";
      void persist({ liturgy: val });
    });
  });

  settingsPanel?.querySelectorAll('input[name="language"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      const val = (e.target as HTMLInputElement).value as Language;
      void persist({ language: val });
    });
  });

  settingsPanel?.querySelectorAll('input[name="location-mode"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      const mode = (e.target as HTMLInputElement).value as LocationMode;
      void persist({ locationMode: mode }).then(() => {
        if (mode === "auto") geolocate();
        else openLocationMap();
      });
    });
  });

  settingsPanel?.querySelectorAll('input[name="notification"]').forEach((input) => {
    input.addEventListener("change", async (e) => {
      const zmanId = (e.target as HTMLInputElement).dataset.zmanId;
      if (!zmanId) return;
      const isChecked = (e.target as HTMLInputElement).checked;
      if (isChecked && !(await ensureNotificationPermission())) {
        (e.target as HTMLInputElement).checked = false;
        return;
      }
      const updatedNotifications = { ...state.notifications, [zmanId]: isChecked };
      void persist({ notifications: updatedNotifications });
    });
  });

  settingsPanel?.querySelector("#notifications-test")?.addEventListener("click", () => {
    void sendTestNotification();
  });

  settingsPanel?.querySelector("#start-at-login")?.addEventListener("change", (e) => {
    void setAutostart((e.target as HTMLInputElement).checked);
  });

  document.getElementById("geolocate-btn")?.addEventListener("click", () => geolocate());
  document.getElementById("map-open")?.addEventListener("click", () => {
    void persist({ locationMode: "map" }).then(() => openLocationMap());
  });
  document.getElementById("map-close")?.addEventListener("click", closeLocationMap);
  document.getElementById("map-cancel")?.addEventListener("click", closeLocationMap);
  document.getElementById("map-dialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLocationMap();
  });
  document.getElementById("map-confirm")?.addEventListener("click", () => {
    void confirmMapLocation();
  });
  document.getElementById("map-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("map-search-input") as HTMLInputElement | null;
    if (input) void searchMapPlaces(input.value);
  });

  document.getElementById("onboarding-continue")?.addEventListener("click", () => {
    const language = document.querySelector<HTMLInputElement>(
      'input[name="onboarding-language"]:checked'
    )?.value as Language | undefined;
    const locationMode = document.querySelector<HTMLInputElement>(
      'input[name="onboarding-location-mode"]:checked'
    )?.value as LocationMode | undefined;
    if (!language || !locationMode) return;

    const onboarding = document.getElementById("onboarding-dialog") as HTMLDialogElement | null;
    if (locationMode === "map") {
      onboardingMapSelection = true;
      onboarding?.close();
      void persist({ language, locationMode }).then(() => {
        openLocationMap(true);
      }).catch((error: unknown) => {
        onboardingMapSelection = false;
        console.error("Impossible d’enregistrer les préférences initiales :", error);
        const status = document.getElementById("onboarding-status");
        if (status) status.textContent = "Impossible d’enregistrer vos préférences.";
        (document.getElementById("onboarding-dialog") as HTMLDialogElement | null)?.showModal();
      });
      return;
    }

    void persist({
      language,
      locationMode,
      onboardingComplete: true,
    }).then(() => {
      onboarding?.close();
      geolocate("location-status");
    }).catch((error: unknown) => {
      console.error("Impossible d’enregistrer les préférences initiales :", error);
      const status = document.getElementById("onboarding-status");
      if (status) status.textContent = "Impossible d’enregistrer vos préférences.";
    });
  });

  if (!state.onboardingComplete && !onboardingMapSelection) {
    const onboarding = document.getElementById("onboarding-dialog") as HTMLDialogElement | null;
    onboarding?.showModal();
  }
}

async function init(): Promise<void> {
  const prefs = await loadPreferences();
  state = createInitialState(prefs);
  if (!isTauri()) {
    await syncWidgetPreferences(prefs.location, prefs.liturgy);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      try {
        const widgetWorkerPath = import.meta.env.DEV
          ? "/widget-service-worker-dev.js"
          : "/widget-service-worker.js";
        await navigator.serviceWorker.register(
          widgetWorkerPath,
          { type: "module" }
        );
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "refresh-widgets" });
      } catch (error) {
        console.error("Impossible d’enregistrer le service worker des widgets :", error);
      }
    }
  }
  ({ year: dateCalendarYear, month: dateCalendarMonth } = getCalendarParts(
    state.selectedDate,
    dateCalendarType
  ));

  if (isTauri()) {
    try {
      const actualAutostart = await isAutostartEnabled();
      state.startAtLogin = actualAutostart;
      if (actualAutostart !== prefs.startAtLogin) {
        await savePreferences({ startAtLogin: actualAutostart });
      }
      notificationPermissionGranted = await isPermissionGranted();
    } catch (error) {
      console.error("Impossible de charger l’état des fonctions système :", error);
    }
  }

  refresh();
  await refreshNotificationSchedule(true);
  if (state.onboardingComplete && state.locationMode === "auto") geolocate();

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    refresh();
    void updateScheduleIfNewDay();
  }, 30_000);
}

init().catch(console.error);
