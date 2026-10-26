import { getDisplayDate, getTodayInTimeZone } from "./app/schedule";
import {
  loadWidgetPreferences,
  type WidgetSettings,
} from "./app/widget-settings";
import {
  formatGregorianDateFr,
  formatHebrewDate,
} from "./lib/hebrew-format";
import { HDate } from "./lib/calj-jdates/src/HDate";

interface WidgetInstance {
  id: string;
}

interface WidgetDefinition {
  tag: string;
  msAcTemplate: string;
}

interface Widget {
  definition: WidgetDefinition;
  instances: WidgetInstance[];
}

interface WidgetManager {
  getByTag(tag: string): Promise<Widget | undefined>;
  matchAll(options: { installed: boolean }): Promise<Widget[]>;
  updateByTag(
    tag: string,
    payload: { template: string; data: string }
  ): Promise<void>;
}

interface PeriodicSyncManager {
  getTags(): Promise<string[]>;
  register(tag: string, options: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

interface WidgetRegistration extends ServiceWorkerRegistration {
  periodicSync: PeriodicSyncManager;
}

interface WidgetEvent {
  widget: Widget;
  tag?: string;
  data?: { type?: string };
  waitUntil(promise: Promise<unknown>): void;
}

interface WidgetServiceWorkerScope {
  readonly location: Location;
  readonly registration: WidgetRegistration;
  readonly widgets: WidgetManager;
  addEventListener(
    type: string,
    listener: (event: WidgetEvent) => void
  ): void;
}

const widgetScope = globalThis as unknown as WidgetServiceWorkerScope;
const SYNC_INTERVAL_SECONDS = 60 * 60;

async function renderWidget(widget: Widget, settings?: WidgetSettings): Promise<void> {
  const preferences = settings ?? (await loadWidgetPreferences());
  const now = new Date();
  const today = getTodayInTimeZone(preferences.location.timeZone, now);
  const displayDate = getDisplayDate(
    today,
    preferences.location,
    preferences.liturgy,
    now
  );
  const hebrewDate = formatHebrewDate(HDate.make(displayDate));
  const templateUrl = new URL(
    widget.definition.msAcTemplate,
    widgetScope.location.origin
  );
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`Lecture du modèle de widget impossible : ${response.status}`);
  }

  await widgetScope.widgets.updateByTag(widget.definition.tag, {
    template: await response.text(),
    data: JSON.stringify({
      hebrewDate,
      gregorianDate: formatGregorianDateFr(displayDate),
      location: preferences.location.label,
    }),
  });
}

async function updateInstalledWidgets(): Promise<void> {
  const settings = await loadWidgetPreferences();
  const widgets = await widgetScope.widgets.matchAll({ installed: true });
  await Promise.all(widgets.map((widget) => renderWidget(widget, settings)));
}

async function onWidgetInstall(widget: Widget): Promise<void> {
  await renderWidget(widget);
  try {
    const tags = await widgetScope.registration.periodicSync.getTags();
    if (!tags.includes(widget.definition.tag)) {
      await widgetScope.registration.periodicSync.register(
        widget.definition.tag,
        { minInterval: SYNC_INTERVAL_SECONDS }
      );
    }
  } catch (error) {
    console.error("Impossible d’activer l’actualisation périodique du widget :", error);
  }
}

async function onWidgetUninstall(widget: Widget): Promise<void> {
  if (widget.instances.length > 1) return;
  try {
    await widgetScope.registration.periodicSync.unregister(widget.definition.tag);
  } catch (error) {
    console.error("Impossible d’arrêter l’actualisation du widget désinstallé :", error);
  }
}

widgetScope.addEventListener("widgetinstall", (event) => {
  event.waitUntil(onWidgetInstall(event.widget));
});

widgetScope.addEventListener("widgetuninstall", (event) => {
  event.waitUntil(onWidgetUninstall(event.widget));
});

widgetScope.addEventListener("widgetresume", (event) => {
  event.waitUntil(renderWidget(event.widget));
});

widgetScope.addEventListener("periodicsync", (event) => {
  if (!event.tag) return;
  event.waitUntil(
    widgetScope.widgets
      .getByTag(event.tag)
      .then((widget) => (widget ? renderWidget(widget) : undefined))
  );
});

widgetScope.addEventListener("message", (event) => {
  if (
    !("widgets" in globalThis) ||
    event.data?.type !== "refresh-widgets"
  ) {
    return;
  }
  void updateInstalledWidgets().catch((error: unknown) => {
    console.error("Impossible d’actualiser les widgets KronoJ :", error);
  });
});
