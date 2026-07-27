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

const credentialKeywords = [
  'certified', 'certification', 'certificate', 'license', 'licence', 'aws',
  'azure', 'gcp', 'comptia', 'cisco', 'pmp', 'scrum', 'itil', 'cissp', 'oracle'
];

const isCredential = item => {
  const text = typeof item === 'string'
    ? item
    : [item?.name, item?.title, item?.issuing_organization, item?.issuer].filter(Boolean).join(' ');
  const fp = fingerprint(text);
  if (!fp) return false;
  if (credentialKeywords.some(keyword => fp.includes(keyword))) return true;
  return Boolean(item?.issue_date || item?.credential_id || item?.credential_url || item?.url);
};

const achievementText = item => {
  if (typeof item === 'string') return cleanText(item);
  if (!item || typeof item !== 'object') return '';
  const title = cleanText(item.title || item.name || item.award);
  const description = cleanText(item.description || item.summary || item.details);
  if (title && description && !fingerprint(description).startsWith(fingerprint(title))) {
    return `${title} — ${description}`;
  }
  return title || description;
};

const certificationTitle = item => {
  if (typeof item === 'string') return fingerprint(item);
  return fingerprint(item?.name || item?.title || item?.certificate_name || '');
};

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

  const personal = {
    ...(record?.personal_info || {}),
    ...(source?.personal_info || {})
  };

  const rawName = personal.name 
    || personal.full_name 
    || personal.candidate_name 
    || source.name 
    || source.full_name 
    || record?.name 
    || record?.full_name 
    || record?.parsed_content?.name;

  let resolvedName = cleanText(rawName);

  if (!resolvedName) {
    const rawText = String(source.raw_text || record.raw_text || '').trim();
    if (rawText) {
      const firstLine = rawText.split('\n')[0]?.trim();
      if (firstLine && firstLine.length < 50 && !firstLine.includes('@') && !firstLine.includes('http')) {
        resolvedName = cleanText(firstLine);
      }
    }
  }

  if (!resolvedName && personal.email && typeof personal.email === 'string') {
    const emailPrefix = personal.email.split('@')[0].replace(/[0-9_.]+/g, ' ').trim();
    if (emailPrefix) {
      resolvedName = emailPrefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  output.personal_info = Object.fromEntries(
    PERSONAL_FIELDS
      .filter(field => personal[field] !== undefined && personal[field] !== null && personal[field] !== '')
      .map(field => [field, structuredClone(personal[field])])
  );

  if (resolvedName) {
    output.personal_info.name = resolvedName;
  }

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
  }));

  output.certifications = output.certifications.map(item => {
    if (typeof item === 'string') {
      const split = splitDetailedText(item);
      return split.description
        ? { name: split.title, issuing_organization: split.description }
        : { name: split.title };
    }
    const normalized = structuredClone(item);
    if (!normalized.name && normalized.title) normalized.name = normalized.title;
    return normalized;
  });

  return repairResumeLinks(output);
}
