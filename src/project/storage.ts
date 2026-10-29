import type { TrakkProject } from "./schema.ts";

const DATABASE_NAME = "trakk-projects";
const STORE_NAME = "sessions";
const ASSET_STORE_NAME = "assets";
const CURRENT_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(ASSET_STORE_NAME)) request.result.createObjectStore(ASSET_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open project storage"));
  });
}

export async function saveProject(project: TrakkProject): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project, CURRENT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save project"));
  });
  database.close();
}

export async function loadProject(): Promise<TrakkProject | null> {
  const database = await openDatabase();
  const project = await new Promise<TrakkProject | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_KEY);
    request.onsuccess = () => resolve((request.result as TrakkProject | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load project"));
  });
  database.close();
  return project;
}

export async function saveAssetData(id: string, data: ArrayBuffer): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(ASSET_STORE_NAME).put(data, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save audio asset"));
  });
  database.close();
}

export async function loadAssetData(id: string): Promise<ArrayBuffer | null> {
  const database = await openDatabase();
  const data = await new Promise<ArrayBuffer | null>((resolve, reject) => {
    const request = database.transaction(ASSET_STORE_NAME, "readonly").objectStore(ASSET_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as ArrayBuffer | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load audio asset"));
  });
  database.close();
  return data;
}
