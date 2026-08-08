// Persistent floating launcher injected on every page so the extension is
// discoverable even when the user hasn't opened the toolbar icon yet.
// Deliberately does nothing else -- no page scanning, no evidence capture,
// no messaging beyond "open the side panel on click". All existing
// extraction/detection behavior is untouched.
(() => {
  const HOST_ID = "tailr4u-floating-launcher-host";
  if (document.getElementById(HOST_ID)) return;
  if (!document.documentElement || document.contentType !== "text/html") return;

  const mount = () => {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    // Shadow DOM keeps the host page's CSS from leaking in (and this
    // widget's CSS from leaking out) -- the button must look the same on
    // every site regardless of that site's own styles.
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .wrap {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      .btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: #ffffff;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .btn:hover {
        transform: scale(1.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
      }
      .btn img {
        width: 28px;
        height: 28px;
        pointer-events: none;
      }
      .dismiss {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: #1f2937;
        color: #fff;
        font-size: 11px;
        line-height: 1;
        margin-left: -8px;
        margin-top: -34px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .wrap:hover .dismiss {
        opacity: 1;
      }
    `;

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    const button = document.createElement("button");
    button.className = "btn";
    button.type = "button";
    button.title = "Open Tailr4U";
    button.setAttribute("aria-label", "Open Tailr4U");

    const icon = document.createElement("img");
    try {
      icon.src = chrome.runtime.getURL("application-logo.png");
    } catch {
      // Extension context can be invalidated (e.g. right after an update
      // reload) -- fail silently rather than show a broken image.
    }
    icon.alt = "";
    button.appendChild(icon);

    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.type = "button";
    dismiss.title = "Hide for this page";
    dismiss.setAttribute("aria-label", "Hide for this page");
    dismiss.textContent = "×";

    button.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
      } catch {
        // Extension context invalidated -- nothing to recover here.
      }
    });
    dismiss.addEventListener("click", (event) => {
      event.stopPropagation();
      host.remove();
    });

    wrap.appendChild(button);
    wrap.appendChild(dismiss);
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.documentElement.appendChild(host);
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();
