import * as Sentry from "@sentry/react";

// Read environment variables loaded by Vite (prefixed with VITE_)
// Variable names match frontend/.env exactly
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "";
const SENTRY_ENABLED = import.meta.env.VITE_SENTRY_ENABLED === "true";
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || "0.05"
);
const APP_ENV = import.meta.env.VITE_APP_ENV || "local";
const APP_RELEASE = import.meta.env.VITE_APP_RELEASE || "unknown";
const ENABLE_ERROR_MONITORING = import.meta.env.VITE_ENABLE_ERROR_MONITORING !== "false";
const SERVICE_NAME = "tailr4u-frontend";

export function initSentry() {
  // Master kill-switch: either flag is false or no DSN → skip
  if (!SENTRY_ENABLED || !ENABLE_ERROR_MONITORING) {
    console.log("[SENTRY] Frontend Sentry disabled via VITE_SENTRY_ENABLED=false.");
    return;
  }

  if (!SENTRY_DSN) {
    console.log("[SENTRY] Frontend Sentry is enabled but VITE_SENTRY_DSN is not set — skipping init.");
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: APP_ENV,
      release: APP_RELEASE,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
      sendDefaultPii: false, // never send raw user data to Sentry

      beforeSend(event) {
        // Redact message strings
        if (event.message) {
          event.message = sanitizeString(event.message);
        }

        // Remove raw React state/props context that may contain resume payloads
        if (event.contexts) {
          delete event.contexts.state;
          delete event.contexts.props;
        }

        // Sanitize breadcrumb messages and data
        if (event.breadcrumbs?.values) {
          event.breadcrumbs.values = event.breadcrumbs.values.map((b) => {
            if (b.message) b.message = sanitizeString(b.message);
            if (b.data) b.data = sanitizeObject(b.data);
            return b;
          });
        }

        // Attach service tags to every event
        event.tags = {
          ...event.tags,
          service: SERVICE_NAME,
          environment: APP_ENV,
        };

        return event;
      },
    });

    console.log(
      `[SENTRY] Frontend Sentry initialised — env=${APP_ENV}, release=${APP_RELEASE}, sampleRate=${SENTRY_TRACES_SAMPLE_RATE}`
    );
  } catch (err) {
    console.error("[SENTRY] Sentry SDK initialisation crashed:", err);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  // Redact email addresses
  let s = str.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[REDACTED_EMAIL]"
  );
  // Redact JWT / Bearer tokens
  s = s.replace(
    /Bearer\s+[a-zA-Z0-9-_=]+\.[a-zA-Z0-9-_=]+\.?[a-zA-Z0-9-_.+/=]*/gi,
    "Bearer [REDACTED_TOKEN]"
  );
  return s;
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};

  const SENSITIVE = [
    "password", "token", "access_token", "refresh_token", "jwt",
    "cookie", "authorization", "email", "phone", "resume",
    "job_description", "prompt", "response", "text", "body",
    "headers", "key", "secret", "api_key",
  ];

  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = sanitizeObject(v);
    } else if (typeof v === "string") {
      out[k] = sanitizeString(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
