export const SIDEBAR_DEFAULT_SECTIONS = [
  'skills', 'education', 'certifications', 'languages', 'interests'
];

const sectionWeight = (resume, section) => {
  const value = resume?.[section];
  if (!value) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const entries = Array.isArray(value) ? value.length : 1;
  return Math.max(1, entries * 1.5 + text.length / 115);
};

export function getTemplateSectionLayout(templateConfig, activeSections = [], resume = null) {
  const ordered = activeSections.filter(section => section !== 'personal_info');
  const layout = templateConfig?.layout || 'single-column';
  if (layout === 'single-column') {
    return {
      split: false,
      primaryLabel: 'Resume Order',
      secondaryLabel: '',
      primary: ordered,
      secondary: []
    };
  }

  const sidebarSections = templateConfig?.id === 'AltaATS'
    ? ['skills', 'certifications', 'languages', 'interests']
    : SIDEBAR_DEFAULT_SECTIONS;
  let sidebar = ordered.filter(section => sidebarSections.includes(section));
  let main = ordered.filter(section => !sidebarSections.includes(section));
  // Two-column ATS has equal-height page columns. Reassign only supporting
  // sections when doing so lowers the taller column; otherwise a long
  // certification block can create page 2 while the main column remains empty.
  if (layout === 'two-column' && resume) {
    const movable = new Set([
      'certifications', 'achievements', 'awards', 'publications',
      'volunteer_experience', 'languages', 'interests'
    ]);
    const total = sections => sections.reduce(
      (sum, section) => sum + sectionWeight(resume, section), 0
    );
    const moved = new Set();
    for (let pass = 0; pass < 3; pass += 1) {
      const sidebarTotal = total(sidebar);
      const mainTotal = total(main);
      const fromSidebar = sidebarTotal > mainTotal;
      const source = fromSidebar ? sidebar : main;
      const target = fromSidebar ? main : sidebar;
      const currentMax = Math.max(sidebarTotal, mainTotal);
      const candidate = source
        .filter(section => movable.has(section) && !moved.has(section))
        .map(section => {
          const weight = sectionWeight(resume, section);
          const nextSource = total(source) - weight;
          const nextTarget = total(target) + weight;
          return { section, nextMax: Math.max(nextSource, nextTarget) };
        })
        .sort((left, right) => left.nextMax - right.nextMax)[0];
      const severeImbalance = currentMax > Math.max(1, Math.min(sidebarTotal, mainTotal)) * 1.45;
      if (
        !candidate
        || (
          candidate.nextMax >= currentMax * 0.94
          && !(severeImbalance && candidate.nextMax <= currentMax * 1.25)
        )
      ) break;
      moved.add(candidate.section);
      const sidebarSet = new Set(sidebar);
      if (fromSidebar) sidebarSet.delete(candidate.section);
      else sidebarSet.add(candidate.section);
      sidebar = ordered.filter(section => sidebarSet.has(section));
      main = ordered.filter(section => !sidebarSet.has(section));
    }
  }
  const sidebarLike = layout === 'sidebar' || layout === 'marissa';

  return {
    split: true,
    primaryLabel: sidebarLike ? 'Sidebar' : 'Left Column',
    secondaryLabel: sidebarLike ? 'Main Column' : 'Right Column',
    primary: sidebar,
    secondary: main
  };
}
