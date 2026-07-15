/**
 * Persistent content script for LinkedIn.
 * Detects SPA routing changes, waits for DOM stability, extracts job information,
 * and notifies the background script to update state.
 */

// Local caches to prevent redundant duplicate extractions
let lastJobId = null;
let lastExtractedUrl = "";
let lastExtractedText = "";
let lastObservedUrl = window.location.href;

let stabilityTimer = null;
let navigationCheckInterval = null;
let domObserver = null;

// Helpers to extract parameters from URL
function getLinkedInJobId(url) {
  try {
    const urlObj = new URL(url);
    const currentJobId = urlObj.searchParams.get("currentJobId");
    if (currentJobId) return currentJobId;

    const pathMatch = urlObj.pathname.match(/\/jobs\/view\/(\d+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
  } catch (e) {
    console.error("[TailorFlow Content] URL parsing error:", e);
  }
  return "";
}

// Quick hash helper for fallback IDs
function generateHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// Scrape elements from the DOM
function scrapeJobDetails() {
  let title = "";
  let company = "";
  let location = "";
  let employmentType = "";
  let text = "";

  // Title
  const titleEl = document.querySelector(
    '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .p5, h1, [class*="job-title"], [class*="jobTitle"]'
  );
  if (titleEl) title = titleEl.innerText.trim();

  // Company
  const companyEl = document.querySelector(
    '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .jobs-unified-top-card__primary-description a, [class*="company-name"], [class*="companyName"], a[href*="/company/"]'
  );
  if (companyEl) company = companyEl.innerText.trim();

  // Location
  const locationEl = document.querySelector(
    '.job-details-jobs-unified-top-card__primary-description span:nth-of-type(1), .jobs-unified-top-card__primary-description span:first-of-type, [class*="job-location"], [class*="location"]'
  );
  if (locationEl) location = locationEl.innerText.trim();

  // Employment Type
  const typeEl = document.querySelector(
    '.jobs-description-details__list-item, [class*="job-type"], [class*="employment-type"]'
  );
  if (typeEl) employmentType = typeEl.innerText.trim();

  // Description
  const descEl = document.querySelector(
    '.jobs-description__content, .jobs-description-content__text, .jobs-box__html-content, .jobs-description, #job-details, .job-details, [class*="job-description"], [class*="jobDescription"]'
  );
  if (descEl) text = descEl.innerText.trim();

  return { title, company, location, employmentType, text };
}

// Perform stability check and final extraction
function triggerExtraction() {
  // Check if there is an active job change detected
  const currentUrl = window.location.href;
  const { title, company, location, employmentType, text } = scrapeJobDetails();

  // Calculate unique Job ID
  const linkedInJobId = getLinkedInJobId(currentUrl);
  const compositeId = generateHash(
    `${company || "UnknownCompany"}_${title || "UnknownTitle"}_${location || "UnknownLocation"}_${linkedInJobId}`
  );

  // If we detect a new job ID, notify the UI immediately so it shows a loading transition
  if (compositeId !== lastJobId && (title || company)) {
    lastJobId = compositeId;
    console.log("[TailorFlow Content] New Job ID detected:", compositeId);
    chrome.runtime.sendMessage({ type: "JOB_CHANGE_DETECTED" }, () => {
      if (chrome.runtime.lastError) { /* Silenced */ }
    });
  }

  // Clear any existing debounce timer
  if (stabilityTimer) {
    clearTimeout(stabilityTimer);
  }

  // Debounce (400ms) to ensure asynchronous DOM rendering completes
  stabilityTimer = setTimeout(() => {
    const freshDetails = scrapeJobDetails();
    const freshTitle = freshDetails.title;
    const freshCompany = freshDetails.company;
    const freshLocation = freshDetails.location;
    const freshType = freshDetails.employmentType;
    const freshText = freshDetails.text;

    // Check if required elements are present and fully loaded
    if (!freshTitle || !freshCompany || !freshText || freshText.length < 150) {
      console.log("[TailorFlow Content] DOM elements missing or unstable. Retrying...");
      return;
    }

    const freshUrl = window.location.href;
    const freshJobId = getLinkedInJobId(freshUrl) || generateHash(`${freshCompany}_${freshTitle}`);

    // Skip extraction if nothing has actually changed
    const hasJobChanged =
      freshUrl !== lastExtractedUrl ||
      freshText.length !== lastExtractedText.length;

    if (!hasJobChanged) {
      return;
    }

    // Update local caches
    lastExtractedUrl = freshUrl;
    lastExtractedText = freshText;

    console.log("[TailorFlow Content] Extracted stable Job Description:", freshTitle, "at", freshCompany);

    // Send payload to background service worker
    chrome.runtime.sendMessage({
      type: "JOB_EXTRACTED",
      data: {
        id: freshJobId,
        title: freshTitle,
        company: freshCompany,
        location: freshLocation,
        employmentType: freshType,
        text: freshText,
        url: freshUrl,
        timestamp: Date.now()
      }
    }, (response) => {
      if (chrome.runtime.lastError) { /* Silenced */ }
    });

  }, 400); // 400ms debounce
}

// Scan DOM for application success text indicators
function checkApplicationSuccess() {
  try {
    const pageText = document.body.innerText || "";
    const successPatterns = [
      "application submitted",
      "application received",
      "thank you for applying",
      "your application was sent",
      "application successful",
      "success! your application",
      "thanks for applying",
      "easy apply submitted"
    ];
    
    const hasSuccess = successPatterns.some(pattern => pageText.toLowerCase().includes(pattern));
    if (hasSuccess) {
      const currentUrl = window.location.href;
      const cacheKey = `success_${currentUrl}`;
      if (!sessionStorage.getItem(cacheKey)) {
        sessionStorage.setItem(cacheKey, "true");
        console.log("[TailorFlow Content] Application success detected in DOM!");
        
        const details = scrapeJobDetails();
        chrome.runtime.sendMessage({
          type: "APPLICATION_SUBMITTED",
          data: {
            company: details.company || "Target Company",
            title: details.title || "Software Engineer",
            url: currentUrl
          }
        }, (response) => {
          if (chrome.runtime.lastError) { /* Silenced */ }
        });
      }
    }
  } catch (e) {
    console.error("[TailorFlow Content] Error scanning for application success:", e);
  }
}

// Init observers and checks
function init() {
  console.log("[TailorFlow Content] Initializing event-driven LinkedIn observer...");

  // 1. Initial invocation check
  triggerExtraction();
  checkApplicationSuccess();

  // 2. DOM Mutation Observer to capture updates when job listings are clicked
  if (domObserver) {
    domObserver.disconnect();
  }
  domObserver = new MutationObserver(() => {
    triggerExtraction();
    checkApplicationSuccess();
  });

  domObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 3. SPA URL Navigation Poller (as backup for history pushState overrides)
  if (navigationCheckInterval) {
    clearInterval(navigationCheckInterval);
  }
  navigationCheckInterval = setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastObservedUrl) {
      lastObservedUrl = currentUrl;
      console.log("[TailorFlow Content] SPA Navigation detected (URL Poller)");
      triggerExtraction();
      checkApplicationSuccess();
    }
  }, 500);

  // 4. Browser History back/forward navigation event listener
  window.addEventListener("popstate", () => {
    const currentUrl = window.location.href;
    lastObservedUrl = currentUrl;
    console.log("[TailorFlow Content] Browser popstate Navigation detected");
    triggerExtraction();
    checkApplicationSuccess();
  });
}

// Start Content Script
init();
