import { repairResumeLinks } from './resumeLinks.js';

const TOP_LEVEL_FIELDS = [
  'personal_info', 'summary', 'objective', 'experience', 'internships',
  'projects', 'education', 'skills', 'skills_categories', 'certifications',
  'achievements', 'publications', 'languages', 'volunteer_experience',
  'open_source', 'leadership', 'extracurricular_activities',
  'custom_sections', 'awards', 'interests', 'portfolio', 'links',
  'section_order', 'layout_level', 'layout_model', 'candidate_links',
  'profile_links', 'unresolved_links', 'link_review', 'links_intelligence_version'
];

const PERSONAL_FIELDS = [
  'name', 'email', 'phone', 'location', 'linkedin', 'website', 'github',
  'job_title', 'title', 'portfolio_url', 'coding_profiles'
];

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const fingerprint = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const unique = values => {
  const seen = new Set();
  return values.filter(value => {
    const key = fingerprint(typeof value === 'string' ? value : JSON.stringify(value));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueAchievementEvidence = values => {
  const kept = [];
  for (const value of [...values].sort((left, right) => right.length - left.length)) {
    const key = fingerprint(value);
    if (!kept.some(existing => {
      const existingKey = fingerprint(existing);
      return existingKey === key || existingKey.startsWith(`${key} `) || key.startsWith(`${existingKey} `);
    })) kept.push(value);
  }
  return kept;
};

const achievementText = item => {
  if (typeof item === 'string') return cleanText(item);
  if (!item || typeof item !== 'object') return '';
  const title = cleanText(item.title || item.name || item.achievement || item.award);
  const descriptions = [
    item.description,
    item.details,
    item.summary,
    item.result,
    ...(Array.isArray(item.bullets) ? item.bullets : []),
    ...(Array.isArray(item.highlights) ? item.highlights : [])
  ].flat().filter(Boolean).map(cleanText);
  const detail = unique(descriptions).join(' ');
  return title && detail && !fingerprint(detail).startsWith(fingerprint(title))
    ? `${title} — ${detail}`
    : detail || title;
};

const isCredential = item => {
  if (!item || typeof item !== 'object') return false;
  const combined = cleanText([
    item.name, item.title, item.description, item.details
  ].filter(Boolean).join(' '));
  const explicitlyCredentialed = /\b(certifi|credential|course|training|license)\b/i.test(combined);
  const achievementLike = /\b(hackathon|finalist|scholar(?:ship)?|competitive programming|leetcode|volunteer|leadership|student chapter|membership|selected (?:among|as)|top \d+)\b/i.test(combined);
  if (achievementLike && !explicitlyCredentialed) return false;
  return Boolean(
    item.credential_id || item.credential_url || item.url ||
    item.issuing_organization || item.issue_date || item.expiration_date ||
    explicitlyCredentialed
  );
};

const certificationTitle = item => fingerprint(
  typeof item === 'string' ? item : item?.name || item?.title || ''
);

const splitDetailedText = value => {
  const text = cleanText(value);
  const parts = text.split(/\s+(?:—|–|â€”|â€“|-)\s+/, 2);
  return parts.length === 2
    ? { title: parts[0], description: parts[1] }
    : { title: text, description: '' };
};

export function toRenderableResume(record) {
  if (!record || typeof record !== 'object') return null;
  const source = record?.parsed_content && typeof record.parsed_content === 'object'
    ? record.parsed_content
    : record;
  const output = {};

  TOP_LEVEL_FIELDS.forEach(field => {
    if (source[field] !== undefined && source[field] !== null) {
      output[field] = structuredClone(source[field]);
    }
  });

  // Older parser versions and imported resume providers use equivalent names.
  // Normalize them at the content boundary so review never loses valid source
  // content merely because a field used a supported alias.
  output.summary = structuredClone(
    source.summary
    || source.professional_summary
    || source.career_summary
    || source.profile_summary
    || source.profile
    || ''
  );
  output.objective = structuredClone(
    source.objective || source.career_objective || ''
  );

  const personal = source.personal_info || {};
  output.personal_info = Object.fromEntries(
    PERSONAL_FIELDS
      .filter(field => personal[field] !== undefined && personal[field] !== null && personal[field] !== '')
      .map(field => [field, structuredClone(personal[field])])
  );

  const explicitAchievements = [];
  const achievementCredentials = [];
  (source.achievements || []).forEach(item => {
    const normalized = typeof item === 'string'
      ? { name: splitDetailedText(item).title, description: splitDetailedText(item).description }
      : item;
    if (isCredential(normalized)) achievementCredentials.push(normalized);
    else {
      const evidence = achievementText(item);
      if (evidence) explicitAchievements.push(evidence);
    }
  });
  output.awards = Array.isArray(source.awards) ? structuredClone(source.awards) : [];

  const reclassifiedAchievements = [];
  const credentialItems = [...achievementCredentials, ...(source.certifications || [])].filter(item => {
    const normalized = typeof item === 'string' ? { name: cleanText(item) } : item;
    if (isCredential(normalized)) return true;
    const evidence = achievementText(normalized);
    if (evidence) reclassifiedAchievements.push(evidence);
    return false;
  });
  output.achievements = uniqueAchievementEvidence([...explicitAchievements, ...reclassifiedAchievements]);

  const achievementTitles = new Set([
    ...output.achievements.map(value => fingerprint(value.split('—')[0])),
    ...output.awards.map(item => fingerprint(item?.title || item?.name || item))
  ].filter(Boolean));
  output.certifications = unique(credentialItems.filter(item => {
    const title = certificationTitle(item);
    return !achievementTitles.has(title) || isCredential(item);
  }).map(item => {
    if (typeof item === 'string') {
      const detailed = splitDetailedText(item);
      return { name: detailed.title, ...(detailed.description ? { description: detailed.description } : {}) };
    }
    const normalized = structuredClone(item);
    if (!normalized.name && normalized.title) normalized.name = normalized.title;
    return normalized;
  }));

  const sectionAliases = {
    experience: ['experience', 'work_experience', 'employment_history'],
    internships: ['internships', 'internship_experience'],
    projects: ['projects', 'personal_projects', 'academic_projects'],
    education: ['education', 'academic_background'],
    publications: ['publications', 'research', 'research_publications'],
    languages: ['languages'],
    volunteer_experience: ['volunteer_experience', 'volunteering'],
    open_source: ['open_source', 'open_source_contributions'],
    leadership: ['leadership', 'leadership_experience'],
    extracurricular_activities: ['extracurricular_activities', 'activities'],
    custom_sections: ['custom_sections']
  };
  for (const field of [
    'experience', 'internships', 'projects', 'education', 'publications',
    'languages', 'volunteer_experience', 'open_source', 'leadership',
    'extracurricular_activities', 'custom_sections'
  ]) {
    const alias = sectionAliases[field].find(key => Array.isArray(source[key]));
    output[field] = alias ? structuredClone(source[alias]) : [];
  }
  for (const field of ['experience', 'internships', 'projects']) {
    output[field] = output[field].map(item => {
      if (!item || typeof item !== 'object') return item;
      const normalized = structuredClone(item);
      const description = normalized.description
        ?? normalized.bullet_points
        ?? normalized.bullets
        ?? normalized.responsibilities
        ?? normalized.highlights;
      normalized.description = Array.isArray(description)
        ? structuredClone(description)
        : (description ? [cleanText(description)] : []);
      return normalized;
    });
  }
  output.skills = unique(Array.isArray(source.skills) ? source.skills.map(cleanText).filter(Boolean) : []);
  output.interests = unique(Array.isArray(source.interests) ? source.interests.map(cleanText).filter(Boolean) : []);
  output.skills_categories = source.skills_categories && typeof source.skills_categories === 'object'
    ? structuredClone(source.skills_categories)
    : {};
  output.links = source.links && typeof source.links === 'object' ? structuredClone(source.links) : {};

  return repairResumeLinks(output);
}

export const RENDERABLE_RESUME_FIELDS = Object.freeze([...TOP_LEVEL_FIELDS]);
