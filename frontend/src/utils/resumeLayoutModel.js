export const RESUME_LAYOUT_VERSION = 1;
export const HEADER_COMPONENTS = Object.freeze([
  'photo', 'name', 'headline', 'email', 'phone', 'location',
  'linkedin', 'github', 'portfolio', 'x', 'other_links', 'header_divider'
]);
export const FOOTER_COMPONENTS = Object.freeze([
  'page_number', 'footer_text', 'footer_links'
]);

export const SUPPORTED_LAYOUT_SECTIONS = Object.freeze([
  'summary', 'objective', 'experience', 'internships', 'projects', 'education',
  'skills', 'certifications', 'achievements', 'volunteer', 'publications',
  'languages', 'awards', 'interests', 'open_source', 'leadership',
  'extracurricular_activities', 'custom_sections'
]);

const MAIN_ONLY = new Set(['summary', 'objective', 'experience', 'internships', 'projects']);
const IMPORTANT = new Set(['summary', 'experience', 'education', 'skills']);
const DEFAULT_SIDEBAR = new Set(['skills', 'education', 'certifications', 'languages', 'interests']);

const uniqueSupported = values => [...new Set(
  (Array.isArray(values) ? values : []).filter(value => SUPPORTED_LAYOUT_SECTIONS.includes(value))
)];

const meaningful = value => {
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === 'object') return Object.values(value).some(meaningful);
  return String(value ?? '').trim().length > 0;
};

const sectionValue = (resume, section) => {
  if (section === 'skills') {
    return (
      (resume?.skills && (Array.isArray(resume.skills) ? resume.skills.length > 0 : String(resume.skills).trim() !== '')) ||
      (resume?.skills_categories && typeof resume.skills_categories === 'object' && Object.keys(resume.skills_categories).length > 0) ||
      (resume?.parsed_data?.skills && (Array.isArray(resume.parsed_data.skills) ? resume.parsed_data.skills.length > 0 : String(resume.parsed_data.skills).trim() !== '')) ||
      (resume?.parsed_data?.skills_categories && typeof resume.parsed_data.skills_categories === 'object' && Object.keys(resume.parsed_data.skills_categories).length > 0) ||
      (resume?.technical_skills)
    ) ? (resume?.skills_categories || resume?.skills || resume?.parsed_data?.skills_categories || resume?.parsed_data?.skills || resume?.technical_skills) : null;
  }
  if (section === 'volunteer') {
    return resume?.volunteer_experience || resume?.volunteer;
  }
  return resume?.[section];
};

export const sectionHasContent = (resume, section) => meaningful(sectionValue(resume, section));

export function resolveLayoutAvailability(resume = {}, templateConfig = {}) {
  const personal = resume.personal_info || {};
  const ownedLinks = [
    ...(resume.candidate_links || []),
    ...(resume.profile_links || [])
  ].filter(link =>
    link?.owner_type === 'candidate'
    && (link.validation_status || 'VALID') === 'VALID'
    && meaningful(link.normalized_url || link.url)
  );
  const ownedModel = 'candidate_links' in resume || 'profile_links' in resume;
  const platforms = new Set(ownedLinks.map(link => String(link.platform || '').toLowerCase()));
  const hasPlatform = (platform, fallback) => platforms.has(platform)
    || (!ownedModel && meaningful(fallback));
  const known = new Set([
    'email', 'phone', 'linkedin', 'github', 'portfolio', 'website', 'x'
  ]);
  const header = {
    photo: Boolean(templateConfig.profilePhoto),
    name: meaningful(personal.name),
    headline: meaningful(personal.job_title || personal.title),
    email: meaningful(personal.email),
    phone: meaningful(personal.phone),
    location: meaningful(personal.location),
    linkedin: hasPlatform('linkedin', personal.linkedin),
    github: hasPlatform('github', personal.github),
    portfolio: hasPlatform('portfolio', personal.website || resume.portfolio)
      || hasPlatform('website', personal.website || resume.portfolio),
    x: hasPlatform('x', personal.coding_profiles?.x || personal.coding_profiles?.twitter),
    other_links: ownedLinks.some(link => !known.has(String(link.platform || '').toLowerCase())),
    header_divider: Boolean(templateConfig.borders?.headerDivider)
  };
  return {
    header,
    body: Object.fromEntries(SUPPORTED_LAYOUT_SECTIONS.map(section => [
      section, sectionHasContent(resume, section)
    ])),
    footer: Object.fromEntries(FOOTER_COMPONENTS.map(component => [component, false]))
  };
}

const hasLongContent = (resume, section) => {
  const value = resume?.[section];
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  if (section === 'projects') return text.length > 280;
  if (section === 'achievements') return text.length > 220;
  return false;
};

export function validateSectionPlacement(section, column, resume) {
  if (!SUPPORTED_LAYOUT_SECTIONS.includes(section)) return { valid: false, message: 'This section is not supported.' };
  if (column === 'sidebar' && (MAIN_ONLY.has(section) || hasLongContent(resume, section))) {
    return { valid: false, message: 'This section needs more width and must remain in the main column.' };
  }
  return { valid: true };
}

export function createResumeLayoutModel(resume = {}, templateId = 'ExecutiveATS', templateConfig = {}) {
  const existing = resume.layout_model || {};
  const existingTree = existing.layout_tree || {};
  const availability = resolveLayoutAvailability(resume, templateConfig);
  const baseOrder = resume.section_order && Array.isArray(resume.section_order) && resume.section_order.length > 0
    ? [...new Set([...resume.section_order, ...SUPPORTED_LAYOUT_SECTIONS])]
    : SUPPORTED_LAYOUT_SECTIONS;
  const sourceOrder = uniqueSupported(baseOrder)
    .filter(section => availability.body[section]);
  const split = ['sidebar', 'two-column', 'marissa'].includes(templateConfig.layout);
  const treeColumns = existingTree.body?.rows?.flatMap(row => row.columns || []) || [];
  const existingMain = uniqueSupported(
    existing.main_column || treeColumns.filter(column => Number(column.width) > 4).flatMap(column => column.sections || [])
  ).filter(section => availability.body[section]);
  const existingSidebar = uniqueSupported(
    existing.sidebar || treeColumns.filter(column => Number(column.width) <= 4).flatMap(column => column.sections || [])
  ).filter(section => availability.body[section]);
  const claimed = new Set([...existingMain, ...existingSidebar]);
  const remaining = sourceOrder.filter(section => !claimed.has(section));
  const main = !split
    ? [...existingMain, ...existingSidebar, ...remaining]
    : existingMain.length || existingSidebar.length
    ? [...existingMain, ...remaining]
    : sourceOrder.filter(section => !split || !DEFAULT_SIDEBAR.has(section));
  const sidebar = split
    ? (existingMain.length || existingSidebar.length
      ? existingSidebar
      : sourceOrder.filter(section => DEFAULT_SIDEBAR.has(section)))
    : [];

  const repairedMain = [...main];
  const repairedSidebar = sidebar.filter(section => {
    if (!validateSectionPlacement(section, 'sidebar', resume).valid) {
      repairedMain.push(section);
      return false;
    }
    return true;
  });

  const hidden = [];
  const visible = new Set([...repairedMain, ...repairedSidebar]);
  sourceOrder.forEach(section => {
    if (!visible.has(section) && !hidden.includes(section)) repairedMain.push(section);
  });

  const existingHeaderOrder = existingTree.header?.components || existing.header?.components || [];
  const headerComponents = [...new Set([
    ...existingHeaderOrder,
    ...HEADER_COMPONENTS
  ].filter(component => HEADER_COMPONENTS.includes(component) && availability.header[component]))];
  const footerComponents = [...new Set(
    (existingTree.footer?.components || FOOTER_COMPONENTS)
      .filter(component => FOOTER_COMPONENTS.includes(component) && availability.footer[component])
  )];
  const mainColumn = uniqueSupported(repairedMain).filter(section => !hidden.includes(section));
  const sidebarColumn = uniqueSupported(repairedSidebar).filter(section => !hidden.includes(section));
  const layoutTree = {
    header: { components: headerComponents },
    body: {
      rows: [{
        columns: split
          ? [
              { id: 'main', width: 8, sections: mainColumn },
              { id: 'sidebar', width: 4, sections: sidebarColumn }
            ]
          : [{ id: 'main', width: 12, sections: mainColumn }]
      }]
    },
    footer: { components: footerComponents }
  };

  return {
    template_id: templateId,
    layout_version: RESUME_LAYOUT_VERSION,
    header: {
      enabled: true,
      show_avatar: false,
      alignment: 'left',
      contact_placement: 'inline',
      links_placement: 'inline',
      style: 'standard',
      show_divider: true,
      ...(existing.header || {})
    },
    main_column: mainColumn,
    sidebar: sidebarColumn,
    hidden_sections: hidden,
    layout_tree: layoutTree,
    component_metadata: Object.fromEntries([
      ...headerComponents.map((type, order) => [type, {
        id: `header_${type}`, type, region: 'header', visible: true,
        content_available: true,
        owner_type: ['linkedin', 'github', 'portfolio', 'x', 'other_links'].includes(type)
          ? 'candidate' : null,
        order
      }]),
      ...mainColumn.map((type, order) => [type, {
        id: `body_${type}`, type, region: 'body', visible: true,
        content_available: true, owner_type: null, order
      }]),
      ...sidebarColumn.map((type, order) => [type, {
        id: `body_${type}`, type, region: 'body', visible: true,
        content_available: true, owner_type: null, order
      }])
    ]),
    component_positions: Object.fromEntries([
      ...headerComponents.map((id, index) => [id, { region: 'header', index }]),
      ...footerComponents.map((id, index) => [id, { region: 'footer', index }])
    ]),
    hidden_components: [...new Set(
      (existing.hidden_components || []).filter(id => [...HEADER_COMPONENTS, ...FOOTER_COMPONENTS].includes(id))
    )]
  };
}

export function applyLayoutChange(resume, model, section, destination, index) {
  const validation = validateSectionPlacement(section, destination, resume);
  if (!validation.valid) return { model, ...validation };
  const main = model.main_column.filter(id => id !== section);
  const sidebar = model.sidebar.filter(id => id !== section);
  const target = destination === 'sidebar' ? sidebar : main;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, section);
  return {
    valid: true,
    model: withLayoutTree({
      ...model,
      main_column: main,
      sidebar,
      hidden_sections: model.hidden_sections.filter(id => id !== section)
    })
  };
}

export function withLayoutTree(model) {
  const split = model.sidebar.length > 0 || model.layout_tree?.body?.rows?.[0]?.columns?.length > 1;
  return {
    ...model,
    layout_tree: {
      ...(model.layout_tree || {}),
      header: { components: model.layout_tree?.header?.components || HEADER_COMPONENTS },
      body: {
        rows: [{
          columns: split
            ? [
                { id: 'main', width: 8, sections: model.main_column },
                { id: 'sidebar', width: 4, sections: model.sidebar }
              ]
            : [{ id: 'main', width: 12, sections: model.main_column }]
        }]
      },
      footer: { components: model.layout_tree?.footer?.components || FOOTER_COMPONENTS }
    }
  };
}

export function reorderRegionComponents(model, region, sourceIndex, destinationIndex) {
  if (!['header', 'footer'].includes(region)) return { valid: false };
  const components = [...(model.layout_tree?.[region]?.components || [])];
  const [component] = components.splice(sourceIndex, 1);
  if (!component) return { valid: false };
  components.splice(destinationIndex, 0, component);
  if (region === 'header' && !components.includes('name')) return { valid: false };
  const layoutTree = {
    ...model.layout_tree,
    [region]: { ...model.layout_tree?.[region], components }
  };
  return {
    valid: true,
    model: {
      ...model,
      layout_tree: layoutTree,
      component_positions: {
        ...model.component_positions,
        ...Object.fromEntries(components.map((id, index) => [id, { region, index }]))
      }
    }
  };
}
