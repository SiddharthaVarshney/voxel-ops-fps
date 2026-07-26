const DB_NAME = "voxel-ops-db";
const DB_VERSION = 1;
const SCORES_STORE = "scores";
const SETTINGS_STORE = "settings";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        const store = db.createObjectStore(SCORES_STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("score", "score", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export async function saveScore({ score, wave, kills, difficulty, level }) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SCORES_STORE, "readwrite");
      const store = tx.objectStore(SCORES_STORE);
      store.add({ score, wave, kills, difficulty, level, date: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB unavailable, score not saved locally.", e);
    return false;
  }
}

export async function clearScores() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SCORES_STORE, "readwrite");
      tx.objectStore(SCORES_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

export async function getTopScores(limit = 10) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SCORES_STORE, "readonly");
      const store = tx.objectStore(SCORES_STORE);
      const index = store.index("score");
      const results = [];
      const req = index.openCursor(null, "prev");
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("IndexedDB unavailable, returning empty scores.", e);
    return [];
  }
}

export async function isNewHighScore(score) {
  const top = await getTopScores(1);
  return top.length === 0 || score > top[0].score;
}

export async function getSetting(key, fallback) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, "readonly");
      const store = tx.objectStore(SETTINGS_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return fallback;
  }
}

export async function setSetting(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, "readwrite");
      const store = tx.objectStore(SETTINGS_STORE);
      store.put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}
