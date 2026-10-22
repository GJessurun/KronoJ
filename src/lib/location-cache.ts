import type { AppLocation } from "./location";

const CACHE_KEY = "kronoj-location";

export function loadCachedLocation(): AppLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppLocation;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      typeof parsed.timeZone !== "string" ||
      typeof parsed.label !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id ?? `cached:${parsed.latitude}:${parsed.longitude}`,
      label: parsed.label,
      subtitle: parsed.subtitle ?? "",
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      elevation: parsed.elevation ?? 0,
      timeZone: parsed.timeZone,
      countryCode: parsed.countryCode,
    };
  } catch {
    return null;
  }
}

export function saveCachedLocation(location: AppLocation): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(location));
}

export function clearCachedLocation(): void {
  localStorage.removeItem(CACHE_KEY);
}
