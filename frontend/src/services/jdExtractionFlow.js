export const JD_LOG_PREFIX = "[JD-EXTRACTION][FRONTEND]";

export function isExtractableHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatSalary(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value);
  if (value.raw) return String(value.raw);
  const minimum = value.minimum ?? value.min;
  const maximum = value.maximum ?? value.max;
  const amount = minimum != null && maximum != null
    ? `${minimum} - ${maximum}`
    : String(minimum ?? maximum ?? "");
  return [value.currency, amount, value.period].filter(Boolean).join(" ");
}

const toStringList = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
};

export function collectJobSkills(job = {}) {
  const details = job.normalized_content || job;
  const explicit = [
    ...toStringList(details.skills),
    ...toStringList(details.required_skills),
    ...toStringList(details.requiredSkills),
  ];
  const suggested = [
    ...toStringList(details.suggested_skills),
    ...toStringList(details.preferred_skills),
    ...toStringList(details.preferredSkills),
  ];
  return {
    explicit: [...new Set(explicit)],
    suggested: [...new Set(suggested)].filter((skill) => !explicit.includes(skill)),
  };
}

export function validateJDResponse(data) {
  if (!data || typeof data !== "object" || typeof data.success !== "boolean" || !data.request_id) {
    throw new Error("Malformed extraction response received.");
  }
  if (data.success && !["job_detail", "job_list", "non_job"].includes(data.page_type)) {
    throw new Error("Malformed extraction response received.");
  }
  return data;
}

export function classifyJDResult(data) {
  const response = validateJDResponse(data);
  if (!response.success) {
    return response.error?.code === "PAGE_BLOCKED" ? "blocked" : "extraction-failed";
  }
  if (response.needs_manual_review) return "manual-review";
  if (response.page_type === "job_detail" && response.extracted_job) return "ready";
  if (response.page_type === "job_list") return "job-list";
  return "non-job";
}
