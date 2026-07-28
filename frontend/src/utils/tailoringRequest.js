const PATCHABLE_SECTIONS = new Set(['summary', 'skills', 'experience', 'projects']);

export function canonicalTailoringSelections(selectedSections = []) {
  return [...new Set(
    selectedSections
      .map(value => String(value || '').trim().toLowerCase())
      .filter(value => PATCHABLE_SECTIONS.has(value))
  )].sort();
}

export function buildTailoringComparePayload({
  resumeId,
  resume,
  job,
  selectedSections
}) {
  return {
    resume_id: resumeId,
    resume,
    job,
    selected_sections: canonicalTailoringSelections(selectedSections)
  };
}
