export const COMPOSITION_ENGINE_VERSION = '2.0.0';
export const A4_PAGE = Object.freeze({
  size: 'A4',
  widthPx: 816,
  heightPx: 1122,
  widthMm: 210,
  heightMm: 297,
  margins: Object.freeze({ top: 16, right: 18, bottom: 16, left: 18 })
});

export const DENSITY_PROFILES = Object.freeze({
  comfortable: Object.freeze({
    body_font_size: 10.5, line_height: 1.28, section_heading_size: 12,
    section_gap: 12, bullet_gap: 4, divider_width: 1
  }),
  compact: Object.freeze({
    body_font_size: 9.5, line_height: 1.18, section_heading_size: 11,
    section_gap: 8, bullet_gap: 2, divider_width: 0.75
  }),
  dense: Object.freeze({
    body_font_size: 9, line_height: 1.12, section_heading_size: 10.5,
    section_gap: 6, bullet_gap: 1, divider_width: 0.5
  })
});

export const COMPOSITION_LIMITS = Object.freeze({
  minBodyFontSize: 9,
  minLineHeight: 1.1,
  minMarginPx: 14,
  maxOnePageAttempts: 6,
  maxRebalanceAttempts: 3,
  maxRendererRepairs: 2,
  maxPages: 2
});

const hashText = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fcp-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const unique = values => [...new Set(values.filter(Boolean))];
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const densityForLevel = level => level >= 7 ? 'comfortable' : level >= 5 ? 'compact' : 'dense';

function chooseBalancedBreak(sections, contentHeight, pageHeight) {
  if (sections.length < 2) return null;
  const target = contentHeight / 2;
  const valid = sections.slice(1).filter(section => {
    const offset = finite(section.offset);
    const firstPage = offset;
    const secondPage = contentHeight - offset;
    return offset > 0
      && offset < pageHeight
      && secondPage <= pageHeight
      && firstPage >= pageHeight * 0.35
      && secondPage >= pageHeight * 0.28;
  });
  return valid.sort((left, right) =>
    Math.abs(finite(left.offset) - target) - Math.abs(finite(right.offset) - target)
  )[0] || null;
}

function paginate(sections, pageCount, contentHeight, pageHeight) {
  if (pageCount === 1) {
    return [{ page_number: 1, sections: sections.map(section => section.id) }];
  }
  const breakSection = chooseBalancedBreak(sections, contentHeight, pageHeight);
  const breakIndex = breakSection ? sections.indexOf(breakSection) : -1;
  if (breakIndex > 0) {
    return [
      { page_number: 1, sections: sections.slice(0, breakIndex).map(section => section.id) },
      { page_number: 2, sections: sections.slice(breakIndex).map(section => section.id) }
    ];
  }
  return Array.from({ length: pageCount }, (_, index) => ({
    page_number: index + 1,
    sections: sections
      .filter(section => Math.min(pageCount - 1, Math.floor(finite(section.offset) / pageHeight)) === index)
      .map(section => section.id)
  }));
}

export async function waitForRenderableFonts(doc = globalThis.document) {
  if (!doc?.fonts?.ready) return;
  await doc.fonts.ready;
}

export function measureResumeElement(element) {
  if (!element) throw new Error('A rendered resume element is required.');
  const rootRect = element.getBoundingClientRect();
  const sectionMeasurements = Array.from(element.querySelectorAll('[data-section]')).map(section => {
    const rect = section.getBoundingClientRect();
    return {
      id: section.dataset.section,
      offset: rect.top - rootRect.top,
      height: rect.height,
      bottom: rect.bottom - rootRect.top
    };
  });
  return {
    contentHeight: Math.max(element.scrollHeight, rootRect.height),
    contentWidth: Math.max(element.scrollWidth, rootRect.width),
    sectionMeasurements,
    hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
    hasClipping: element.scrollHeight > element.clientHeight + 1
      && getComputedStyle(element).overflowY === 'hidden'
  };
}

export function buildMeasuredCompositionPlan({
  contentHeight,
  contentWidth = A4_PAGE.widthPx,
  sectionMeasurements = [],
  layoutLevel = 6,
  templateName = 'ExecutiveATS',
  preference = 'auto',
  pageSize = A4_PAGE,
  measurementFlags = {},
  optimizationActions = []
}) {
  const safeHeight = Math.max(1, finite(pageSize.heightPx));
  const measuredHeight = Math.max(0, finite(contentHeight));
  const sections = sectionMeasurements
    .map(section => ({
      id: String(section.id || ''),
      offset: finite(section.offset),
      height: finite(section.height),
      bottom: finite(section.bottom) || finite(section.offset) + finite(section.height)
    }))
    .filter(section => section.id);
  const sectionOrder = unique(sections.map(section => section.id));
  const naturalPageCount = Math.max(1, Math.ceil(measuredHeight / safeHeight));
  const canPreferTwo = preference === 'two'
    && sections.length >= 2
    && measuredHeight >= safeHeight * 0.72;
  const pageCount = Math.min(
    COMPOSITION_LIMITS.maxPages,
    Math.max(canPreferTwo ? 2 : 1, naturalPageCount)
  );
  const pages = paginate(sections, pageCount, measuredHeight, safeHeight);
  if (pageCount > 1 && pages[pageCount - 1].sections.length === 0) {
    pages[pageCount - 1].continued_from_previous_page = true;
  }
  const pageBreaks = pages.slice(1).map(page => page.sections[0]).filter(Boolean);
  const density = densityForLevel(layoutLevel);
  const typography = DENSITY_PROFILES[density];
  const missingSections = sectionOrder.filter(id =>
    !pages.some(page => page.sections.includes(id))
  );
  const overflow = measuredHeight > pageCount * safeHeight + 1;
  const emptyTrailingPage = pageCount > 1
    && pages[pageCount - 1].sections.length === 0
    && !pages[pageCount - 1].continued_from_previous_page;
  const readabilityValid = typography.body_font_size >= COMPOSITION_LIMITS.minBodyFontSize
    && typography.line_height >= COMPOSITION_LIMITS.minLineHeight
    && Math.min(...Object.values(pageSize.margins || A4_PAGE.margins)) >= COMPOSITION_LIMITS.minMarginPx;
  const validationReport = {
    valid: !overflow
      && !emptyTrailingPage
      && !missingSections.length
      && !measurementFlags.hasHorizontalOverflow
      && !measurementFlags.hasClipping
      && readabilityValid,
    overflow,
    horizontal_overflow: Boolean(measurementFlags.hasHorizontalOverflow),
    clipping: Boolean(measurementFlags.hasClipping),
    blank_trailing_page: emptyTrailingPage,
    missing_sections: missingSections,
    content_preserved: missingSections.length === 0,
    readable: readabilityValid
  };
  const breakOffsets = Object.fromEntries(pageBreaks.map(id => [
    id, sections.find(section => section.id === id)?.offset
  ]).filter(([, offset]) => Number.isFinite(offset)));
  const plan = {
    version: 2,
    engine_version: COMPOSITION_ENGINE_VERSION,
    page_count: pageCount,
    density,
    page_size: pageSize.size,
    page_width_px: pageSize.widthPx,
    page_height_px: pageSize.heightPx,
    margins: { ...pageSize.margins },
    typography: { ...typography },
    section_order: sectionOrder,
    section_layouts: Object.fromEntries(sectionOrder.map(id => [id, {
      representation: ['skills', 'education', 'certifications'].includes(id) && density !== 'comfortable'
        ? 'compact'
        : 'standard',
      keep_together: ['experience', 'projects'].includes(id)
    }])),
    compactness_level: layoutLevel,
    layout_strategy: templateName,
    template_name: templateName,
    preference,
    pages,
    page_breaks: pageBreaks,
    measured_break_offsets: breakOffsets,
    measurement_summary: {
      content_height_px: measuredHeight,
      content_width_px: finite(contentWidth),
      page_capacity_px: safeHeight,
      natural_page_count: naturalPageCount,
      measured_section_count: sections.length
    },
    optimization_actions: optimizationActions.slice(0, COMPOSITION_LIMITS.maxOnePageAttempts),
    validation_report: validationReport,
    explanation: pageCount === 1
      ? 'Your resume fits cleanly on one page.'
      : preference === 'one'
        ? 'Your resume needs 2 pages because one page would reduce readability.'
        : 'Two pages were selected to preserve readability and complete content.'
  };
  return { ...plan, composition_plan_hash: hashText(JSON.stringify(plan)), plan_hash: hashText(JSON.stringify(plan)) };
}
