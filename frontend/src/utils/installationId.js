/**
 * Device Abuse Prevention: Installation ID Helper
 * Generates and stores a non-invasive persistent installation_id for web & extension.
 */

export function getOrCreateInstallationId() {
  const STORAGE_KEY = 'tailr4u_installation_id';
  let id = null;

  // 1. Web LocalStorage
  try {
    id = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn('LocalStorage unavailable for installation_id', e);
  }

  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'inst_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {}
  }

  // 2. Extension storage sync
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (!result || !result[STORAGE_KEY]) {
          chrome.storage.local.set({ [STORAGE_KEY]: id });
        }
      });
    } catch (e) {}
  }

  return id;
}
