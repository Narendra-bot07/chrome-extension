import { toRenderableResume } from '../utils/renderableResume.js';
import {
  mergeReviewResume,
  normalizeReviewOperations,
  validateWorkingResume
} from '../utils/resumeReviewMerge.js';

export const RESUME_WORKFLOW_SCHEMA_VERSION = 1;
export const RESUME_WORKFLOW_STORAGE_KEY = 'resumeWorkflowState';

const clone = value => value == null ? value : structuredClone(value);
const clean = value => String(value ?? '').trim();
const semantic = value => clean(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, '-').replace(/^-|-$/g, '');

export const stableEditId = edit => {
  if (edit.editId || edit.change_id || edit.id) {
    return String(edit.editId || edit.change_id || edit.id);
  }
  const section = edit.section || edit.sectionType || 'other';
  const operation = edit.operation || (section === 'skills' ? 'add' : 'update');
  const entity = edit.entityId || edit.target?.entry_id || edit.skillName || edit.suggested || 'entry';
  const field = edit.fieldPath || edit.target?.bullet_id || edit.target?.section_id || section;
  return `${semantic(section)}:${semantic(operation)}:${semantic(entity)}:${semantic(field)}`;
};

export function normalizeReviewDecisions(edits = [], existing = {}) {
  const decisions = {};
  normalizeReviewOperations(edits).forEach(edit => {
    const editId = stableEditId(edit);
    decisions[editId] = {
      editId,
      section: edit.section || edit.sectionType || 'other',
      operation: edit.operation || (edit.sectionType === 'skills' ? 'add' : 'update'),
      status: edit.status || existing[editId]?.status || 'pending',
      originalValue: clone(edit.originalValue ?? edit.original_text ?? edit.original),
      suggestedValue: clone(edit.suggestedValue ?? edit.proposed_text ?? edit.suggested),
      entityId: edit.entityId || edit.target?.entry_id || null,
      fieldPath: edit.fieldPath || edit.target?.bullet_id || edit.target?.section_id || null
    };
  });
  return decisions;
}

export function finalizeTailoredResume({
  originalResume,
  tailoredDraft,
  edits = [],
  reviewDecisions = {}
}) {
  const original = toRenderableResume(originalResume);
  if (!original) throw new Error('FINAL_RESUME_VALIDATION_FAILED: Original resume is missing.');
  const normalizedEdits = normalizeReviewOperations(edits)
    .map(edit => {
      const editId = stableEditId(edit);
      return {
        ...edit,
        id: editId,
        change_id: editId,
        status: reviewDecisions[editId]?.status || edit.status || 'pending'
      };
    })
    .sort((left, right) => stableEditId(left).localeCompare(stableEditId(right)));
  const merged = mergeReviewResume(original, normalizedEdits);
  const validation = validateWorkingResume(original, merged.workingResume, merged.operations);
  const issues = [
    ...validation.issues,
    ...merged.invalidOperations.map(issue => issue.reason)
  ];
  if (issues.length) {
    throw new Error(`FINAL_RESUME_VALIDATION_FAILED: ${[...new Set(issues)].join(' ')}`);
  }
  // tailoredDraft is deliberately not used as a merge base. It is retained
  // only for audit/debugging; accepted user decisions own final content.
  void tailoredDraft;
  return toRenderableResume(merged.workingResume);
}

export function selectRenderableResume(workflow) {
  if (!workflow) return null;
  if (workflow.finalizedTailoredResume) {
    return toRenderableResume(workflow.finalizedTailoredResume);
  }
  if (workflow.tailoredDraft && workflow.originalResume) {
    return finalizeTailoredResume({
      originalResume: workflow.originalResume,
      tailoredDraft: workflow.tailoredDraft,
      edits: workflow.edits || [],
      reviewDecisions: workflow.reviewDecisions || {}
    });
  }
  return toRenderableResume(workflow.originalResume);
}

export function createResumeWorkflowState({
  originalResume,
  tailoredDraft = null,
  edits = [],
  reviewDecisions = {},
  finalizedTailoredResume = null,
  selectedTemplateId = null,
  workflowVersion = 0,
  originalResumeId = null,
  jobFingerprint = null
}) {
  const normalizedEdits = normalizeReviewOperations(edits).map(edit => ({
    ...edit,
    id: stableEditId(edit),
    change_id: stableEditId(edit)
  }));
  return {
    schemaVersion: RESUME_WORKFLOW_SCHEMA_VERSION,
    originalResumeId,
    jobFingerprint,
    originalResume: toRenderableResume(originalResume),
    tailoredDraft: toRenderableResume(tailoredDraft),
    edits: normalizedEdits,
    reviewDecisions: normalizeReviewDecisions(normalizedEdits, reviewDecisions),
    finalizedTailoredResume: toRenderableResume(finalizedTailoredResume),
    selectedTemplateId,
    workflowVersion,
    lastUpdatedAt: new Date().toISOString()
  };
}

export function validateResumeWorkflowState(value) {
  if (!value || typeof value !== 'object') return { valid: false, error: 'Workflow state is missing.' };
  if (!value.originalResume) return { valid: false, error: 'Original resume is missing.' };
  if (!Number.isInteger(value.workflowVersion) || value.workflowVersion < 0) {
    return { valid: false, error: 'Workflow version is invalid.' };
  }
  if (!value.reviewDecisions || typeof value.reviewDecisions !== 'object') {
    return { valid: false, error: 'Review decisions are invalid.' };
  }
  return { valid: true };
}

const extensionStorage = () => (
  typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
);

export const resumeWorkflowRepository = {
  async load() {
    const storage = extensionStorage();
    let value = null;
    if (storage) {
      value = (await storage.get(RESUME_WORKFLOW_STORAGE_KEY))[RESUME_WORKFLOW_STORAGE_KEY] || null;
    } else {
      const raw = localStorage.getItem(RESUME_WORKFLOW_STORAGE_KEY);
      value = raw ? JSON.parse(raw) : null;
    }
    if (!value) return null;
    // Safe v0 migration from the first canonical-workflow rollout.
    const migrated = value.schemaVersion
      ? value
      : { ...value, schemaVersion: RESUME_WORKFLOW_SCHEMA_VERSION };
    const validation = validateResumeWorkflowState(migrated);
    if (!validation.valid) throw new Error(`WORKFLOW_PERSISTENCE_FAILED: ${validation.error}`);
    return clone(migrated);
  },

  async save(nextState, expectedVersion = null) {
    const validation = validateResumeWorkflowState(nextState);
    if (!validation.valid) throw new Error(`WORKFLOW_PERSISTENCE_FAILED: ${validation.error}`);
    const current = await this.load();
    if (
      expectedVersion !== null
      && current
      && current.workflowVersion !== expectedVersion
    ) {
      throw new Error('WORKFLOW_PERSISTENCE_CONFLICT: A newer resume review exists in another tab.');
    }
    const saved = {
      ...clone(nextState),
      schemaVersion: RESUME_WORKFLOW_SCHEMA_VERSION,
      workflowVersion: (current?.workflowVersion ?? nextState.workflowVersion ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString()
    };
    const storage = extensionStorage();
    if (storage) await storage.set({ [RESUME_WORKFLOW_STORAGE_KEY]: saved });
    else localStorage.setItem(RESUME_WORKFLOW_STORAGE_KEY, JSON.stringify(saved));
    return clone(saved);
  },

  async clear() {
    const storage = extensionStorage();
    if (storage) await storage.remove(RESUME_WORKFLOW_STORAGE_KEY);
    else localStorage.removeItem(RESUME_WORKFLOW_STORAGE_KEY);
  }
};
