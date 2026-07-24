import { toRenderableResume } from './renderableResume.js';

export const PROFESSIONAL_SECTION_PRIORITY = [
  'summary', 'experience', 'projects', 'skills', 'education', 'achievements',
  'certifications', 'leadership', 'volunteer_experience', 'publications',
  'open_source', 'extracurricular_activities', 'languages', 'interests',
  'custom_sections'
];

const hasContent = value => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value && typeof value === 'object' && Object.keys(value).length > 0;
};

const allBullets = resume => [
  ...(resume.experience || []),
  ...(resume.projects || []),
  ...(resume.internships || [])
].flatMap(item => item.description || item.bullets || []);

const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function analyzeResumeQuality(input) {
  const resume = toRenderableResume(input) || {};
  const issues = [];
  const warnings = [];
  let score = 100;
  const personal = resume.personal_info || {};
  if (!personal.name) issues.push({ code: 'missing-name', section: 'personal_info', message: 'Candidate name is missing.' });
  if (!personal.email && !personal.phone) issues.push({ code: 'missing-contact', section: 'personal_info', message: 'Add an email or phone number.' });
  if (!(resume.experience || []).length && !(resume.projects || []).length) {
    issues.push({ code: 'missing-evidence', section: 'experience', message: 'Add experience or projects to establish candidate evidence.' });
  }
  if (!resume.skills?.length) warnings.push({ code: 'missing-skills', section: 'skills', message: 'A focused skills section improves ATS scanning.' });

  const bullets = allBullets(resume);
  const metricBullets = bullets.filter(bullet => /(?:\d+(?:\.\d+)?%|\d+\+|\$\s?\d|10,?000|[2-9]x)/i.test(bullet));
  if (bullets.length && metricBullets.length / bullets.length < 0.2) {
    warnings.push({ code: 'low-metrics', section: 'experience', message: 'Few bullets contain measurable outcomes.' });
  }
  const longBullets = bullets.filter(bullet => String(bullet).length > 190);
  if (longBullets.length) warnings.push({ code: 'long-bullets', section: 'experience', message: `${longBullets.length} bullet${longBullets.length > 1 ? 's are' : ' is'} difficult to scan.` });

  const fingerprints = new Set();
  let duplicates = 0;
  for (const item of [...(resume.achievements || []), ...(resume.certifications || []), ...(resume.awards || [])]) {
    const key = normalized(typeof item === 'string' ? item : item.name || item.title);
    if (key && fingerprints.has(key)) duplicates += 1;
    if (key) fingerprints.add(key);
  }
  if (duplicates) issues.push({ code: 'duplicates', section: 'achievements', message: `${duplicates} duplicated credential or achievement item${duplicates > 1 ? 's' : ''}.` });

  const links = [
    personal.linkedin, personal.github, personal.website, resume.portfolio,
    ...Object.values(resume.links || {}),
    ...(resume.projects || []).map(project => project.link || project.url),
    ...(resume.certifications || []).map(cert => cert.credential_url || cert.url)
  ].filter(Boolean);
  const invalidLinks = links.filter(link => !/^(?:https?:\/\/|www\.|mailto:|tel:)/i.test(String(link)));
  if (invalidLinks.length) warnings.push({ code: 'link-format', section: 'personal_info', message: `${invalidLinks.length} professional link${invalidLinks.length > 1 ? 's need' : ' needs'} URL normalization.` });

  score -= issues.length * 15 + warnings.length * 6;
  const contentUnits =
    bullets.length * 2.3 +
    (resume.experience?.length || 0) * 2 +
    (resume.projects?.length || 0) * 2 +
    PROFESSIONAL_SECTION_PRIORITY.filter(section => hasContent(resume[section])).length * 1.2;
  const estimatedPages = contentUnits <= 34 ? 1 : Math.ceil(contentUnits / 42);
  const density = contentUnits < 20 ? 'spacious' : contentUnits <= 34 ? 'balanced' : 'dense';

  return {
    score: Math.max(0, Math.round(score)),
    status: issues.length ? 'needs-attention' : warnings.length ? 'good' : 'excellent',
    issues,
    warnings,
    metrics: {
      estimatedPages,
      density,
      bulletCount: bullets.length,
      quantifiedBulletCount: metricBullets.length,
      sectionCount: PROFESSIONAL_SECTION_PRIORITY.filter(section => hasContent(resume[section])).length,
      linkCount: links.length
    }
  };
}

export function createCompositionPlan(input, templateName = 'ExecutiveATS') {
  const resume = toRenderableResume(input);
  if (!resume) return null;
  const quality = analyzeResumeQuality(resume);
  const populated = PROFESSIONAL_SECTION_PRIORITY.filter(section => hasContent(resume[section]));
  const requested = (resume.section_order || []).filter(section => populated.includes(section));
  const sectionOrder = [...new Set([...requested, ...populated])];
  const recommendedLayoutLevel =
    quality.metrics.estimatedPages > 1 ? 3 :
    quality.metrics.density === 'spacious' ? 8 :
    quality.metrics.density === 'dense' ? 2 : 6;
  return {
    version: 1,
    templateName,
    sectionOrder,
    layoutLevel: resume.layout_level ?? recommendedLayoutLevel,
    estimatedPages: quality.metrics.estimatedPages,
    quality,
    resume: { ...resume, section_order: sectionOrder, layout_level: resume.layout_level ?? recommendedLayoutLevel }
  };
}
