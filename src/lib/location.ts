import tzLookup from "tz-lookup";

export interface AppLocation {
  id: string;
  label: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timeZone: string;
  countryCode?: string;
}

const NOMINATIM_SEARCH =
  "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&extratags=1";
const NOMINATIM_REVERSE =
  "https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&extratags=1";

const USER_AGENT = "KronoJ/0.1.0";

export const DEFAULT_LOCATION: AppLocation = {
  id: "default-paris",
  label: "Paris, France",
  subtitle: "Île-de-France, France",
  latitude: 48.8575,
  longitude: 2.3792,
  elevation: 36,
  timeZone: "Europe/Paris",
  countryCode: "fr",
};

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
  extratags?: Record<string, string>;
}

function nominatimHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
}

function placeName(address?: NominatimAddress, displayName?: string): string {
  if (!address) return displayName?.split(",")[0] ?? "Lieu inconnu";
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    displayName?.split(",")[0] ??
    "Lieu inconnu"
  );
}

function regionLine(address?: NominatimAddress): string {
  if (!address) return "";
  const parts = [address.state, address.county, address.country].filter(Boolean);
  return parts.join(", ");
}

let lastRequestAt = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastRequestAt = Date.now();
  return fetch(url, { headers: nominatimHeaders() });
}

async function resolveTimeZone(
  latitude: number,
  longitude: number,
  extratags?: Record<string, string>
): Promise<string> {
  const fromTags = extratags?.timezone;
  if (fromTags) return fromTags;
  return tzLookup(latitude, longitude);
}

function resultToLocation(r: NominatimResult): AppLocation {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  const label = placeName(r.address, r.display_name);
  const subtitle =
    regionLine(r.address) ||
    r.display_name.split(",").slice(1).join(",").trim();

  return {
    id: `${r.osm_type}:${r.osm_id}`,
    label,
    subtitle,
    latitude: lat,
    longitude: lng,
    elevation: 0,
    timeZone: r.extratags?.timezone ?? "",
    countryCode: r.address?.country_code?.toLowerCase(),
  };
}

/** Resolves IANA timezone when missing (after Nominatim pick or GPS). */
export async function ensureLocationReady(
  loc: AppLocation,
  extratags?: Record<string, string>
): Promise<AppLocation> {
  if (loc.timeZone) return loc;
  const timeZone = await resolveTimeZone(
    loc.latitude,
    loc.longitude,
    extratags
  );
  return { ...loc, timeZone };
}

export async function searchLocations(
  query: string,
  limit = 8
): Promise<AppLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${NOMINATIM_SEARCH}&q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = (await res.json()) as NominatimResult[];
  return data.map(resultToLocation);
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  elevation = 0
): Promise<AppLocation> {
  const url = `${NOMINATIM_REVERSE}&lat=${latitude}&lon=${longitude}`;
  try {
    const res = await rateLimitedFetch(url);
    if (res.ok) {
      const data = (await res.json()) as NominatimResult;
      const loc = resultToLocation(data);
      const ready = await ensureLocationReady(loc, data.extratags);
      return { ...ready, elevation };
    }
  } catch {
    /* fallback below */
  }

  const fallback: AppLocation = {
    id: `gps:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    label: "Ma position",
    subtitle: `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
    latitude,
    longitude,
    elevation,
    timeZone: "",
    countryCode: undefined,
  };
  return ensureLocationReady(fallback);
}
