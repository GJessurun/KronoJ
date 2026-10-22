import { load } from "@tauri-apps/plugin-store";
import type { AppLocation } from "../lib/location";
import { DEFAULT_LOCATION } from "../lib/location";
import {
  loadCachedLocation,
  saveCachedLocation,
} from "../lib/location-cache";
import type { Liturgy } from "../lib/zmanim-service";

export type Language = "fr" | "he";
export type LocationMode = "auto" | "map";

export interface AppPreferences {
  location: AppLocation;
  liturgy: Liturgy;
  language: Language;
  locationMode: LocationMode;
  onboardingComplete: boolean;
  notifications: Record<string, boolean>;
  startAtLogin: boolean;
}

const DEFAULTS: AppPreferences = {
  location: DEFAULT_LOCATION,
  liturgy: "sefarade",
  language: "fr",
  locationMode: "auto",
  onboardingComplete: false,
  notifications: {},
  startAtLogin: false,
};

const STORE_PATH = "kronoj-settings.json";

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load(STORE_PATH, { defaults: {}, autoSave: true });
  }
  return storeInstance;
}

function loadLegacyLocalStorage(): Partial<AppPreferences> | null {
  try {
    const raw = localStorage.getItem("kronoj-settings");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<AppPreferences> & { cityId?: string };
  } catch {
    return null;
  }
}

function parseStoredLocation(value: unknown): AppLocation | null {
  if (!value || typeof value !== "object") return null;
  const v = value as AppLocation;
  if (
    typeof v.latitude !== "number" ||
    typeof v.longitude !== "number" ||
    typeof v.timeZone !== "string"
  ) {
    return null;
  }
  return {
    id: v.id ?? `saved:${v.latitude}:${v.longitude}`,
    label: v.label ?? "Lieu enregistré",
    subtitle: v.subtitle ?? "",
    latitude: v.latitude,
    longitude: v.longitude,
    elevation: v.elevation ?? 0,
    timeZone: v.timeZone,
    countryCode: v.countryCode,
  };
}

export function resolveInitialLocation(
  stored: AppLocation | null | undefined
): AppLocation {
  return loadCachedLocation() ?? stored ?? DEFAULT_LOCATION;
}

export async function loadPreferences(): Promise<AppPreferences> {
  const cached = loadCachedLocation();

  if (!isTauri()) {
    const legacy = loadLegacyLocalStorage();
    const loc = cached ?? parseStoredLocation(legacy?.location) ?? DEFAULTS.location;
    const legacyMode = (legacy as { locationMode?: LocationMode } | null)?.locationMode;
    return {
      ...DEFAULTS,
      ...legacy,
      location: loc,
      locationMode: legacyMode === "map" ? "map" : "auto",
      notifications: legacy?.notifications ?? DEFAULTS.notifications,
      startAtLogin: legacy?.startAtLogin ?? DEFAULTS.startAtLogin,
    };
  }

  const store = await getStore();
  const liturgy = await store.get<Liturgy>("liturgy");
  const language = await store.get<Language>("language");
  const locationMode = await store.get<LocationMode>("locationMode");
  const onboardingComplete = await store.get<boolean>("onboardingComplete");
  const startAtLogin = await store.get<boolean>("startAtLogin");
  const storedLocation = parseStoredLocation(await store.get("location"));

  return {
    location: cached ?? storedLocation ?? DEFAULTS.location,
    liturgy: liturgy ?? DEFAULTS.liturgy,
    language: language ?? DEFAULTS.language,
    locationMode: locationMode === "map" ? "map" : "auto",
    onboardingComplete: onboardingComplete ?? DEFAULTS.onboardingComplete,
    notifications: (await store.get<Record<string, boolean>>("notifications")) ?? DEFAULTS.notifications,
    startAtLogin: startAtLogin ?? DEFAULTS.startAtLogin,
  };
}

export async function savePreferences(
  partial: Partial<AppPreferences>
): Promise<AppPreferences> {
  const current = await loadPreferences();
  const next = { ...current, ...partial };

  if (next.location) {
    saveCachedLocation(next.location);
  }

  if (!isTauri()) {
    const {
      location,
      liturgy,
      language,
      locationMode,
      onboardingComplete,
      notifications,
      startAtLogin,
    } = next;
    localStorage.setItem(
      "kronoj-settings",
      JSON.stringify({
        location,
        liturgy,
        language,
        locationMode,
        onboardingComplete,
        notifications,
        startAtLogin,
      })
    );
    return next;
  }

  const store = await getStore();
  for (const [key, value] of Object.entries(next)) {
    await store.set(key, value);
  }
  await store.save();
  return next;
}
