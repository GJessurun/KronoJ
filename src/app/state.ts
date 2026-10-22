import type { AppLocation } from "../lib/location";
import type { Liturgy } from "../lib/zmanim-service";
import type { AppPreferences, Language, LocationMode } from "./preferences";
import { getTodayInTimeZone } from "./schedule";

export interface AppState {
  selectedDate: Date;
  city: AppLocation;
  liturgy: Liturgy;
  language: Language;
  locationMode: LocationMode;
  onboardingComplete: boolean;
  notifications: Record<string, boolean>;
  startAtLogin: boolean;
}

export function createInitialState(prefs: AppPreferences): AppState {
  return {
    selectedDate: getTodayInTimeZone(prefs.location.timeZone),
    city: prefs.location,
    liturgy: prefs.liturgy,
    language: prefs.language,
    locationMode: prefs.locationMode,
    onboardingComplete: prefs.onboardingComplete,
    notifications: prefs.notifications,
    startAtLogin: prefs.startAtLogin,
  };
}
