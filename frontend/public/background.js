// Enable opening the side panel on extension action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listener for content script job descriptions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOB_CHANGE_DETECTED") {
    try {
      chrome.runtime.sendMessage(message);
    } catch (e) {
      // Ignore if no listeners exist
    }
    sendResponse({ status: "success" });
  } else if (message.type === "JOB_EXTRACTED") {
    // Cache the job in chrome local storage
    chrome.storage.local.set({ lastExtractedJob: message.data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Storage error in background.js:", chrome.runtime.lastError);
      } else {
        console.log("Cached extracted job successfully:", message.data.title);
      }
    });

    // Forward the message to other extension components (like the React side panel)
    // We catch exceptions to prevent crash if side panel is not open (which is expected)
    try {
      chrome.runtime.sendMessage(message);
    } catch (e) {
      // Ignore if no listeners exist
    }
    
    sendResponse({ status: "success" });
  } else if (message.type === "APPLICATION_SUBMITTED") {
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
