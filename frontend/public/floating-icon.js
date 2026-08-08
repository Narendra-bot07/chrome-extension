// Persistent floating launcher injected on every page so the extension is
// discoverable even when the user hasn't opened the toolbar icon yet.
// Deliberately does nothing else -- no page scanning, no evidence capture,
// no messaging beyond "open the side panel on click". All existing
// extraction/detection behavior is untouched.
(() => {
  const HOST_ID = "tailr4u-floating-launcher-host";
  if (document.getElementById(HOST_ID)) return;
  if (!document.documentElement || document.contentType !== "text/html") return;

  const STORAGE_KEY = "tailr4u_floating_icon_position";
  const MARGIN = 18;
  const SIZE = 48;
  // Movement under this, from press to release, still counts as a click
  // (opens the panel) rather than a drag -- otherwise a hand that isn't
  // perfectly still on click would never register as a click at all.
  const DRAG_THRESHOLD = 6;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
        z-index: 2147483647;
        display: flex;
        align-items: flex-start;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        touch-action: none;
      }
      .btn {
        width: ${SIZE}px;
        height: ${SIZE}px;
        border-radius: 50%;
        border: none;
        cursor: grab;
        background: #ffffff;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .btn:active { cursor: grabbing; }
      .btn:hover {
        transform: scale(1.06);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
      }
      .btn img {
        width: 28px;
        height: 28px;
        pointer-events: none;
        -webkit-user-drag: none;
        user-select: none;
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
        margin-top: -4px;
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
    button.title = "Open Tailr4U (drag to move)";
    button.setAttribute("aria-label", "Open Tailr4U");
    button.draggable = false;

    const icon = document.createElement("img");
    try {
      icon.src = chrome.runtime.getURL("application-logo.png");
    } catch {
      // Extension context can be invalidated (e.g. right after an update
      // reload) -- fail silently rather than show a broken image.
    }
    icon.alt = "";
    icon.draggable = false;
    button.appendChild(icon);

    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.type = "button";
    dismiss.title = "Hide for this page";
    dismiss.setAttribute("aria-label", "Hide for this page");
    dismiss.textContent = "×";

    wrap.appendChild(button);
    wrap.appendChild(dismiss);
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.documentElement.appendChild(host);

    // Default: top-right. Restored from a prior drag if the user moved it --
    // position is intentionally global (one preference), not saved per-site,
    // since "get it out of my way" is a one-time thing, not per-domain.
    const applyPosition = (pos) => {
      const maxLeft = Math.max(0, window.innerWidth - SIZE);
      const maxTop = Math.max(0, window.innerHeight - SIZE);
      const left = clamp(pos?.left ?? maxLeft - MARGIN, 0, maxLeft);
      const top = clamp(pos?.top ?? MARGIN, 0, maxTop);
      wrap.style.left = `${left}px`;
      wrap.style.top = `${top}px`;
    };
    applyPosition(null);
    try {
      chrome.storage?.local?.get([STORAGE_KEY], (result) => {
        const saved = result?.[STORAGE_KEY];
        if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
          applyPosition(saved);
        }
      });
    } catch {
      // Storage unavailable -- default position stands.
    }
    window.addEventListener("resize", () => {
      const rect = wrap.getBoundingClientRect();
      applyPosition({ left: rect.left, top: rect.top });
    });

    // Drag via Pointer Events (unifies mouse/touch, and setPointerCapture
    // keeps receiving move/up events even if the cursor leaves the button
    // mid-drag). `icon.draggable = false` + `-webkit-user-drag: none` above
    // stop the browser's OWN native image-drag from fighting this -- that
    // native drag-ghost is almost certainly what "it moves on its own when
    // I try to move it" was: an <img> is draggable by default, and without
    // suppressing that, any click-drag attempt triggered the browser's
    // built-in drag-and-drop instead of repositioning anything.
    let dragState = null;
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = wrap.getBoundingClientRect();
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        originLeft: rect.left,
        originTop: rect.top,
        moved: false,
      };
      try { button.setPointerCapture(event.pointerId); } catch {}
    });
    button.addEventListener("pointermove", (event) => {
      if (!dragState) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragState.moved = true;
      const maxLeft = Math.max(0, window.innerWidth - SIZE);
      const maxTop = Math.max(0, window.innerHeight - SIZE);
      wrap.style.left = `${clamp(dragState.originLeft + dx, 0, maxLeft)}px`;
      wrap.style.top = `${clamp(dragState.originTop + dy, 0, maxTop)}px`;
    });
    const endDrag = (event) => {
      if (!dragState) return;
      const wasDrag = dragState.moved;
      if (wasDrag) {
        const rect = wrap.getBoundingClientRect();
        try {
          chrome.storage?.local?.set({ [STORAGE_KEY]: { left: rect.left, top: rect.top } });
        } catch {
          // Position just won't persist across page loads -- not fatal.
        }
      }
      dragState = null;
      try { button.releasePointerCapture(event.pointerId); } catch {}
      if (!wasDrag) {
        try {
          chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
        } catch {
          // Extension context invalidated -- nothing to recover here.
        }
      }
    };
    button.addEventListener("pointerup", endDrag);
    button.addEventListener("pointercancel", () => { dragState = null; });

    dismiss.addEventListener("click", (event) => {
      event.stopPropagation();
      host.remove();
    });

    // Hide while the user already has the side panel open for this window --
    // showing a launcher for something already open is just clutter. Ask
    // for current state on load (a fresh content script on a new page
    // doesn't know it), then stay in sync via background's broadcast.
    try {
      chrome.runtime.sendMessage({ type: "TAILR4U_QUERY_PANEL_STATE" }, (response) => {
        if (chrome.runtime.lastError) return;
        host.style.display = response?.open ? "none" : "";
      });
    } catch {
      // Extension context invalidated -- default to visible.
    }
    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "TAILR4U_PANEL_STATE") {
          host.style.display = message.open ? "none" : "";
        }
      });
    } catch {
      // No messaging available -- icon just stays visible always.
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  }
})();
