import { toRenderableResume } from './renderableResume.js';

const clone = value => structuredClone(value);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter(key => value[key] !== undefined && value[key] !== null && value[key] !== '')
        .sort()
        .map(key => [key, canonical(value[key])])
    );
  }
  return value;
};
const stable = value => JSON.stringify(canonical(value));
const metricTokens = value => String(value || '').match(/(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?/gi) || [];

export function suggestionToOperation(suggestion) {
  const section = suggestion.sectionType;
  const target = section === 'skills'
    ? { section_id: 'skills', entry_id: null, bullet_id: null }
    : {
        section_id: section,
        entry_id: `${section}:${suggestion.itemIndex ?? 0}`,
        bullet_id: `${section}:${suggestion.itemIndex ?? 0}:bullet:${suggestion.bulletIndex ?? 0}`
      };
  return {
    ...suggestion,
    change_id: suggestion.change_id || suggestion.id,
    operation: section === 'skills'
      ? 'add_supported_keyword'
      : section === 'summary'
        ? 'add_supported_summary'
        : 'replace_text',
    target,
    original_text: suggestion.original,
    proposed_text: suggestion.suggested,
    status: suggestion.status || 'pending'
  };
}

export function normalizeReviewOperations(suggestions = []) {
  return suggestions.map(suggestionToOperation);
}

export function hasReviewOperation(suggestions = [], sectionType) {
  return suggestions.some(suggestion => suggestion.sectionType === sectionType);
}

export function mergeReviewResume(originalInput, suggestions = []) {
  const original = toRenderableResume(originalInput);
  if (!original) return { workingResume: null, operations: [], invalidOperations: [] };
  const working = clone(original);
  const operations = normalizeReviewOperations(suggestions);
  const invalidOperations = [];

  for (const operation of operations) {
    if (operation.status !== 'accepted') continue;
    const section = operation.sectionType;
    if (section === 'summary') {
      working.summary = operation.proposed_text || '';
      continue;
    }
    if (section === 'skills') {
      // Skills are source evidence, not prose. Never add a JD keyword to the
      // candidate's resume through the tailoring workflow.
      invalidOperations.push({ change_id: operation.change_id, reason: 'Skills are source-owned and cannot be added by tailoring.' });
      continue;
    }
    if (section === 'experience' || section === 'projects') {
      const item = working[section]?.[operation.itemIndex];
      const bullets = item?.description;
      if (!item || !Array.isArray(bullets) || operation.bulletIndex < 0 || operation.bulletIndex >= bullets.length) {
        invalidOperations.push({ change_id: operation.change_id, reason: 'Target bullet does not exist.' });
        continue;
      }
      bullets[operation.bulletIndex] = operation.proposed_text;
      continue;
    }
    if (section === 'achievements') {
      if (operation.itemIndex < 0 || operation.itemIndex >= (working.achievements || []).length) {
        invalidOperations.push({ change_id: operation.change_id, reason: 'Achievement record does not exist.' });
      } else {
        working.achievements[operation.itemIndex] = operation.proposed_text;
      }
      continue;
    }
    if (section === 'education') {
      if (operation.itemIndex < 0 || operation.itemIndex >= (working.education || []).length) {
        invalidOperations.push({ change_id: operation.change_id, reason: 'Education record does not exist.' });
      } else {
        try {
          working.education[operation.itemIndex] = typeof operation.proposed_text === 'string'
            ? JSON.parse(operation.proposed_text)
            : clone(operation.proposed_text);
        } catch {
          invalidOperations.push({ change_id: operation.change_id, reason: 'Education edit returned invalid structured data.' });
        }
      }
      continue;
    }
    invalidOperations.push({ change_id: operation.change_id, reason: `Unsupported operation section: ${section}` });
  }

  return { originalResume: original, workingResume: working, operations, invalidOperations };
}

const sectionCounts = resume => Object.fromEntries(
  ['experience', 'internships', 'projects', 'education', 'certifications', 'achievements',
    'awards', 'leadership', 'volunteer_experience', 'publications', 'languages',
    'extracurricular_activities', 'custom_sections']
    .map(section => [section, Array.isArray(resume?.[section]) ? resume[section].length : 0])
);

export function validateWorkingResume(originalInput, workingInput, operations = []) {
  const original = toRenderableResume(originalInput);
  const working = toRenderableResume(workingInput);
  const issues = [];
  if (!original || !working) return { valid: false, issues: ['Original or working resume is missing.'] };
  const originalCounts = sectionCounts(original);
  const workingCounts = sectionCounts(working);
  for (const [section, count] of Object.entries(originalCounts)) {
    if (workingCounts[section] !== count) {
      issues.push(`${section} record count changed from ${count} to ${workingCounts[section]}.`);
    }
  }
  const immutableSections = [
    'personal_info', 'skills', 'skills_categories',
    'certifications', 'awards', 'leadership',
    'volunteer_experience', 'publications', 'languages', 'links',
    'candidate_links', 'profile_links', 'extracurricular_activities',
    'custom_sections', 'open_source', 'interests'
  ];
  immutableSections.forEach(section => {
    if (stable(original[section] ?? null) !== stable(working[section] ?? null)) {
      issues.push(`${section} contains changes outside the allowed prose fields.`);
    }
  });
  for (const section of ['achievements', 'education']) {
    (original[section] || []).forEach((item, index) => {
      const next = working[section]?.[index];
      if (stable(metricTokens(JSON.stringify(item))) !== stable(metricTokens(JSON.stringify(next)))) {
        issues.push(`${section}.${index} changed factual metrics or dates.`);
      }
    });
  }
  for (const section of ['experience', 'projects', 'internships']) {
    (original[section] || []).forEach((item, index) => {
      const before = item.description?.length || 0;
      const after = working[section]?.[index]?.description?.length || 0;
      if (after !== before) issues.push(`${section}.${index} bullet count changed from ${before} to ${after}.`);
      const sourceIdentity = { ...item, description: undefined };
      const workingIdentity = { ...(working[section]?.[index] || {}), description: undefined };
      if (stable(sourceIdentity) !== stable(workingIdentity)) {
        issues.push(`${section}.${index} identity, dates, links, or metadata changed.`);
      }
      (item.description || []).forEach((sourceBullet, bulletIndex) => {
        const nextBullet = working[section]?.[index]?.description?.[bulletIndex] || '';
        if (stable(metricTokens(sourceBullet)) !== stable(metricTokens(nextBullet))) {
          issues.push(`${section}.${index}.description.${bulletIndex} changed factual metrics.`);
        }
      });
    });
  }
  if (operations.some(operation => operation.status === 'accepted' && !operation.change_id)) {
    issues.push('An accepted operation has no stable change ID.');
  }
  return { valid: issues.length === 0, issues };
}

export function reviewProgress(suggestions = []) {
  const operations = normalizeReviewOperations(suggestions);
  const accepted = operations.filter(operation => operation.status === 'accepted').length;
  const rejected = operations.filter(operation => operation.status === 'rejected').length;
  return {
    total: operations.length,
    accepted,
    rejected,
    pending: operations.length - accepted - rejected
  };
}
