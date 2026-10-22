import { DEFAULT_LOCATION, type AppLocation } from "../lib/location";
import type { Liturgy } from "../lib/zmanim-service";

export interface WidgetSettings {
  location: AppLocation;
  liturgy: Liturgy;
}

const DATABASE_NAME = "kronoj-widgets";
const STORE_NAME = "settings";
const SETTINGS_KEY = "widget";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Échec IndexedDB."));
    });
  }
  return databasePromise;
}

export async function saveWidgetPreferences(
  location: AppLocation,
  liturgy: Liturgy
): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ location, liturgy }, SETTINGS_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Échec d’enregistrement des réglages du widget."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Enregistrement du widget annulé."));
  });
}

export async function loadWidgetPreferences(): Promise<WidgetSettings> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(SETTINGS_KEY);
    request.onsuccess = () => {
      const stored = request.result as WidgetSettings | undefined;
      resolve(
        stored ?? {
          location: DEFAULT_LOCATION,
          liturgy: "sefarade",
        }
      );
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Échec de lecture des réglages du widget."));
  });
}
