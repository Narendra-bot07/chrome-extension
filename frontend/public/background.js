// Enable opening the side panel on extension action click safely
const setupSidePanel = () => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
      console.warn("[Background] sidePanel behavior warning (safe to ignore):", error.message || error);
    });
  }
};

chrome.runtime.onInstalled.addListener(setupSidePanel);
chrome.runtime.onStartup.addListener(setupSidePanel);
setupSidePanel();

// Listener for background messages (non-extraction events)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "APPLICATION_SUBMITTED") {
    console.log("[Background] Application submission event intercepted:", message.data);
    try {
      chrome.runtime.sendMessage(message);
    } catch (e) {
      // Ignore if no listeners exist
    }
    sendResponse({ status: "success" });
  }
  return true;
});
