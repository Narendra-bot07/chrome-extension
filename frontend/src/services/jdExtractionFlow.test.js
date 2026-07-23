import assert from "node:assert/strict";
import test from "node:test";
import { assessBrowserJobEvidence, classifyBrowserPageUrl, classifyJDResult, collectJobSkills, formatSalary, isExtractableHttpUrl, JD_LOG_PREFIX, validateJDResponse } from "./jdExtractionFlow.js";

const base = { success: true, request_id: "req-1", classification_confidence: .9 };

test("maps every stable backend result state", () => {
  assert.equal(classifyJDResult({ ...base, page_type: "job_detail", extracted_job: { job_title: "Engineer" } }), "ready");
  assert.equal(classifyJDResult({ ...base, page_type: "job_list", extracted_job: null }), "job-list");
  assert.equal(classifyJDResult({ ...base, page_type: "non_job", extracted_job: null }), "non-job");
  assert.equal(classifyJDResult({ ...base, page_type: "job_detail", extracted_job: {}, needs_manual_review: true }), "manual-review");
  assert.equal(classifyJDResult({ ...base, success: false, page_type: null, error: { code: "PAGE_BLOCKED" } }), "blocked");
  assert.equal(classifyJDResult({ ...base, success: false, page_type: null, error: { code: "JD_EXTRACTION_FAILED" } }), "extraction-failed");
});

test("rejects malformed responses", () => {
  assert.throws(() => validateJDResponse({ success: true }), /Malformed/);
  assert.throws(() => validateJDResponse({ ...base, page_type: "unknown" }), /Malformed/);
});

test("classifies browser pages before backend extraction", () => {
  assert.equal(classifyBrowserPageUrl("chrome://newtab/"), "browser-new-tab");
  assert.equal(classifyBrowserPageUrl("edge://newtab/"), "browser-new-tab");
  assert.equal(classifyBrowserPageUrl("chrome-extension://abc/index.html#/tailor"), "extension-internal");
  assert.equal(classifyBrowserPageUrl("chrome://settings/"), "page-inaccessible");
  assert.equal(classifyBrowserPageUrl("https://example.com/jobs/1"), "web");
});

test("rejects structurally non-job web pages without domain hardcoding", () => {
  const result = assessBrowserJobEvidence({
    visible_text: "Session expired. Please log in to continue the course.",
    selected_panel_text: "Session expired",
    jsonld: []
  }, "https://example.com/learn/data-structures");
  assert.equal(result.readiness, "NOT_READY");
  assert.equal(result.isLikelyJob, false);
});

test("allows coherent job evidence and split-panel job identity", () => {
  const traditional = assessBrowserJobEvidence({
    visible_text: "Job description Responsibilities Requirements Full-time Apply now",
    selected_panel_text: "Responsibilities Build services. Requirements Five years experience.",
    jsonld: []
  }, "https://example.com/careers/opening/123");
  assert.equal(traditional.readiness, "READY");

  const splitPanel = assessBrowserJobEvidence({
    visible_text: "Recommended roles",
    selected_panel_text: "A complete selected role description ".repeat(12),
    capture: { portal_optimized_panel: true },
    jsonld: []
  }, "https://example.com/search?currentJobId=123");
  assert.equal(splitPanel.readiness, "READY");
});

test("logging prefix is scoped and contains no secret value", () => {
  assert.equal(JD_LOG_PREFIX, "[JD-EXTRACTION][FRONTEND]");
  assert.doesNotMatch(JD_LOG_PREFIX, /token|password|cookie|authorization/i);
});

test("formats structured salary without rendering an object", () => {
  assert.equal(
    formatSalary({ minimum: 100000, maximum: 140000, currency: "USD", period: "year" }),
    "USD 100000 - 140000 year"
  );
  assert.equal(formatSalary({ raw: "$50/hour" }), "$50/hour");
  assert.equal(formatSalary(null), "");
});

test("collects canonical and compatibility skill fields", () => {
  assert.deepEqual(
    collectJobSkills({
      skills: ["Python", "SQL"],
      required_skills: ["Python", "Tableau"],
      requiredSkills: ["LLMs"],
      suggested_skills: ["AWS"],
    }),
    {
      explicit: ["Python", "SQL", "Tableau", "LLMs"],
      suggested: ["AWS"],
    }
  );
});

test("allows job web URLs and rejects extension-internal URLs", () => {
  assert.equal(isExtractableHttpUrl("https://example.com/jobs/123?source=search#details"), true);
  assert.equal(isExtractableHttpUrl("http://localhost:3000/job"), true);
  assert.equal(isExtractableHttpUrl("chrome-extension://extension-id/index.html#/tailor"), false);
  assert.equal(isExtractableHttpUrl("chrome://settings"), false);
});
