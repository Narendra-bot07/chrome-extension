const SENTRY_EXTENSION_DSN = "https://9f53ad2c4d9c8f8aa1b90375fcd828e0@o4511828596031488.ingest.us.sentry.io/4511842280472576";
// Read from manifest.json at runtime instead of hardcoding -- this file isn't
// processed by Vite (public/ is copied as-is), so a hardcoded string here
// silently drifts from the real manifest version on every release bump.
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const APP_RELEASE = `tailr4u-extension@${EXTENSION_VERSION}`;

// Asynchronous lightweight Sentry reporter avoiding external dependencies in Extension worker
const reportErrorToSentry = (error, contextName) => {
  if (!SENTRY_EXTENSION_DSN) return;
  try {
    const url = new URL(SENTRY_EXTENSION_DSN);
    const publicKey = url.username;
    const host = url.host;
    const projectId = url.pathname.replace("/", "");
    const sentryUrl = `https://${host}/api/${projectId}/store/`;
    const eventId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID().replace(/-/g, "") 
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    
    const payload = {
      event_id: eventId,
      timestamp: new Date().toISOString().split(".")[0],
      logger: "chrome-extension",
      platform: "javascript",
      release: APP_RELEASE,
      environment: "production",
      exception: {
        values: [{
          type: error.name || "Error",
          value: (error.message || String(error)).slice(0, 1000),
          stacktrace: error.stack ? {
            frames: error.stack.split("\n").map(line => ({ filename: line.trim() })).reverse()
          } : undefined
        }]
      },
      tags: {
        extension_version: EXTENSION_VERSION,
        execution_context: contextName,
        browser_family: "chrome"
      }
    };

    fetch(sentryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=tailr4u-extension/1.0, sentry_key=${publicKey}`
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (err) {
    console.warn("[Background] Sentry send error:", err);
  }
};

// Enable opening the side panel on extension action click safely
const setupSidePanel = () => {
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
        console.warn("[Background] sidePanel behavior warning (safe to ignore):", error.message || error);
      });
    }
  } catch (e) {
    reportErrorToSentry(e, "setup_side_panel");
  }
};

try {
  chrome.runtime.onInstalled.addListener(setupSidePanel);
  chrome.runtime.onStartup.addListener(setupSidePanel);
  setupSidePanel();
} catch (e) {
  reportErrorToSentry(e, "initial_load");
}

// Tracks which browser windows currently have the side panel open, so the
// floating launcher (floating-icon.js) can hide itself while the user is
// already using the extension instead of sitting there redundantly. The
// side panel's own React app (App.jsx) opens a long-lived port on mount and
// tells us its windowId; the port disconnecting (panel closed, or the tab/
// window it belonged to closed) is Chrome's own reliable "it's gone" signal
// -- far more robust than trying to catch an unload event from the panel
// itself, which is not guaranteed to fire in time.
const openPanelWindows = new Set();

function broadcastPanelState(windowId, isOpen) {
  if (windowId == null) return;
  chrome.tabs.query({ windowId }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: "TAILR4U_PANEL_STATE", open: isOpen }, () => {
        // No content script on this tab (chrome:// page, etc.) -- expected, ignore.
        void chrome.runtime.lastError;
      });
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "tailr4u-side-panel") return;
  let boundWindowId = null;
  port.onMessage.addListener((msg) => {
    if (msg?.type === "INIT" && typeof msg.windowId === "number") {
      boundWindowId = msg.windowId;
      openPanelWindows.add(boundWindowId);
      broadcastPanelState(boundWindowId, true);
    }
  });
  port.onDisconnect.addListener(() => {
    if (boundWindowId != null) {
      openPanelWindows.delete(boundWindowId);
      broadcastPanelState(boundWindowId, false);
    }
  });
});

// Listener for background messages (non-extraction events)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "TAILR4U_QUERY_PANEL_STATE") {
      const windowId = sender.tab?.windowId;
      sendResponse({ open: windowId != null && openPanelWindows.has(windowId) });
    } else if (message.type === "APPLICATION_SUBMITTED") {
      console.log("[Background] Application submission event intercepted:", message.data);
      try {
        chrome.runtime.sendMessage(message);
      } catch (e) {
        // Ignore if no listeners exist
      }
      sendResponse({ status: "success" });
    } else if (message.type === "OPEN_SIDE_PANEL") {
      // Sent by the floating launcher (floating-icon.js) injected on every
      // page. A content script cannot reliably call chrome.sidePanel.open()
      // itself, so it asks the background worker, which has the tab/window
      // context from `sender` and already holds the sidePanel permission.
      const tabId = sender.tab?.id;
      const windowId = sender.tab?.windowId;
      if (chrome.sidePanel && tabId != null) {
        chrome.sidePanel
          .open(windowId != null ? { tabId, windowId } : { tabId })
          .then(() => sendResponse({ status: "success" }))
          .catch((e) => {
            reportErrorToSentry(e, "open_side_panel_from_floating_icon");
            sendResponse({ status: "error", error: e.message });
          });
        return true;
      }
      sendResponse({ status: "error", error: "No side panel context available." });
    }
  } catch (e) {
    reportErrorToSentry(e, "message_listener");
    sendResponse({ status: "error", error: e.message });
  }
  return true;
});
