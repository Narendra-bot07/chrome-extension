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
  'job_title', 'title', 'portfolio_url', 'coding_profiles', 'photo_url', 'photo_position_y', 'photo_zoom'
];

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const fingerprint = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isPlaceholderText = value => /^(?:0+\.?|null|none|undefined|n\/a|na)$/i.test(cleanText(value));

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
  for (const value of values) {
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

const INTERNAL_EVIDENCE_FIELDS = new Set([
  'confidence', 'source', 'source_span', 'source_text',
  'normalized_text', 'raw_text', 'provenance', 'metadata',
  'item_index', 'bullet_index', 'index', 'order', 'sort_order',
  'itemIndex', 'bulletIndex', 'change_id', 'status', 'category'
]);

const cleanCertification = item => {
  const source = typeof item === 'string'
    ? { name: splitDetailedText(item).title }
    : structuredClone(item || {});
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([key, value]) =>
      !INTERNAL_EVIDENCE_FIELDS.has(key)
      && value !== null
      && value !== undefined
      && value !== ''
      && !(key === 'description' && String(value).trim().match(/^[0-9]+\.?$/))
    )
  );
  if (!cleaned.name && cleaned.title) cleaned.name = cleaned.title;
  delete cleaned.title;
  // Canonicalize provider/date aliases before the workflow snapshot is saved.
  // Different parsers use different field names; downstream templates consume
  // these two stable keys.
  if (!cleaned.issuing_organization) {
    cleaned.issuing_organization =
      cleaned.organization ||
      cleaned.issuer ||
      cleaned.provider ||
      cleaned.authority ||
      cleaned.institution ||
      cleaned.metadata?.organization ||
      cleaned.metadata?.issuer ||
      '';
  }
  if (!cleaned.issue_date) {
    cleaned.issue_date =
      cleaned.date ||
      cleaned.issued_date ||
      cleaned.date_issued ||
      cleaned.completion_date ||
      cleaned.awarded_date ||
      cleaned.year ||
      cleaned.metadata?.issue_date ||
      cleaned.metadata?.date ||
      '';
  }
  if (isPlaceholderText(cleaned.name)) cleaned.name = '';
  return cleaned;
};

const splitDetailedText = value => {
  const text = cleanText(value);
  const parts = text.split(/\s+(?:\u2014|\u2013|â€”|â€“|-)\s+/, 2);
  return parts.length === 2
    ? { title: parts[0], description: parts[1] }
    : { title: text, description: '' };
};

const sanitizeAchievementEvidence = values => {
  const texts = values.map(achievementText).filter(Boolean);
  const split = texts.map(splitDetailedText);
  const anchors = unique(split.map(part => part.title).filter(title => title.length >= 4));
  return texts.map((text, index) => {
    const part = split[index];
    let hasLeadingSeparator = false;
    if (text.length > 180) {
      const separatorPositions = [
        text.indexOf('\u2014'),
        text.indexOf('\u2013'),
        text.indexOf('â€”'),
        text.indexOf('â€“'),
        text.indexOf(' - ')
      ].filter(position => position > 2 && position < 90);
      if (separatorPositions.length) {
        hasLeadingSeparator = true;
        return cleanText(text.slice(0, Math.min(...separatorPositions)));
      }
    }
    const otherAnchors = anchors.filter(anchor => fingerprint(anchor) !== fingerprint(part.title));
    const searchFrom = hasLeadingSeparator ? Math.min(text.length, part.title.length + 3) : 20;
    const foreignPositions = otherAnchors
      .map(anchor => {
        const match = text.toLowerCase().indexOf(anchor.toLowerCase(), searchFrom);
        return match;
      })
      .filter(position => position > 0);
    const firstForeign = foreignPositions.length ? Math.min(...foreignPositions) : -1;

    // The bad parser output repeats the complete achievements section after
    // each title. Keep only the selected item's title instead of displaying
    // unsupported neighboring evidence.
    if (part.description && part.description.length > 160) {
      return part.title;
    }
    // A section-wide blob without a separator is usually the first genuine
    // achievement followed by every subsequent one. Preserve its own leading
    // evidence and cut at the next independently detected achievement.
    if (!hasLeadingSeparator && text.length > 180 && firstForeign > 20) {
      return cleanText(text.slice(0, firstForeign)).replace(/[.;,\s]+$/, '');
    }
    return text;
  });
};

const safeArray = val => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) {
    const keys = Object.keys(val);
    const isNumericDict = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    if (isNumericDict) {
      return keys.sort((a, b) => Number(a) - Number(b)).map(k => val[k]);
    }
    return [val];
  }
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
};

export function toRenderableResume(record) {
  if (!record || typeof record !== 'object') return null;

  let parsedContentObj = {};
  if (record?.parsed_content) {
    if (typeof record.parsed_content === 'object') {
      parsedContentObj = record.parsed_content;
    } else if (typeof record.parsed_content === 'string') {
      try {
        parsedContentObj = JSON.parse(record.parsed_content);
      } catch (e) {}
    }
  }

  let parsedDataObj = {};
  if (record?.parsed_data) {
    if (typeof record.parsed_data === 'object') {
      parsedDataObj = record.parsed_data;
    } else if (typeof record.parsed_data === 'string') {
      try {
        parsedDataObj = JSON.parse(record.parsed_data);
      } catch (e) {}
    }
  }

  const source = {
    ...record,
    ...(record?.sections && typeof record.sections === 'object' ? record.sections : {}),
    ...parsedDataObj,
    ...parsedContentObj
  };
  const output = {};

  TOP_LEVEL_FIELDS.forEach(field => {
    const val = source[field] ?? parsedContentObj[field] ?? parsedDataObj[field];
    if (val !== undefined && val !== null) {
      output[field] = structuredClone(val);
    }
  });

  // Older parser versions and imported resume providers use equivalent names.
  output.summary = structuredClone(
    (source.summary && String(source.summary).trim() ? source.summary : null)
    || (parsedContentObj.summary && String(parsedContentObj.summary).trim() ? parsedContentObj.summary : null)
    || source.professional_summary
    || source.career_summary
    || source.profile_summary
    || source.profile
    || ''
  );
  output.objective = structuredClone(
    source.objective || parsedContentObj.objective || source.career_objective || ''
  );
  const rawExperience = (safeArray(source.experience).length > 0 ? source.experience : null)
    || (safeArray(parsedContentObj.experience).length > 0 ? parsedContentObj.experience : null)
    || (safeArray(parsedDataObj.experience).length > 0 ? parsedDataObj.experience : null)
    || source.work_experience || source.employment_history || source.professional_experience;

  output.experience = safeArray(rawExperience).map(item => {
    const normalized = typeof item === 'string' ? { description: [item] } : { ...item };
    const descriptions = normalized.description
      ?? normalized.responsibilities
      ?? normalized.bullet_points
      ?? normalized.bullets
      ?? [];
    normalized.description = Array.isArray(descriptions)
      ? descriptions.map(cleanText).filter(Boolean)
      : String(descriptions || '').split(/\r?\n/).map(cleanText).filter(Boolean);
    return normalized;
  });

  const rawProjects = (safeArray(source.projects).length > 0 ? source.projects : null)
    || (safeArray(parsedContentObj.projects).length > 0 ? parsedContentObj.projects : null)
    || (safeArray(parsedDataObj.projects).length > 0 ? parsedDataObj.projects : null)
    || source.project_experience || source.key_projects;

  output.projects = safeArray(rawProjects).map(item => {
    const normalized = typeof item === 'string' ? { name: item, description: [item] } : { ...item };
    const descriptions = normalized.description
      ?? normalized.responsibilities
      ?? normalized.bullet_points
      ?? normalized.bullets
      ?? [];
    normalized.description = Array.isArray(descriptions)
      ? descriptions.map(cleanText).filter(Boolean)
      : String(descriptions || '').split(/\r?\n/).map(cleanText).filter(Boolean);
    normalized.technology_stack = Array.isArray(normalized.technology_stack)
      ? normalized.technology_stack.map(cleanText).filter(Boolean)
      : String(normalized.technology_stack || '').split(',').map(cleanText).filter(Boolean);
    return normalized;
  });

  const rawEducation = (safeArray(source.education).length > 0 ? source.education : null)
    || (safeArray(parsedContentObj.education).length > 0 ? parsedContentObj.education : null)
    || (safeArray(parsedDataObj.education).length > 0 ? parsedDataObj.education : null)
    || source.academic_background || source.education_history;

  output.education = safeArray(rawEducation).map(item => {
    return typeof item === 'string' ? { degree: cleanText(item) } : { ...item };
  });

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

  const extractedPhotoUrl = personal.photo_url
    || source.photo_url
    || source.personal_info?.photo_url
    || source.parsed_content?.personal_info?.photo_url
    || source.parsed_data?.personal_info?.photo_url;

  if (extractedPhotoUrl) {
    output.photo_url = extractedPhotoUrl;
    output.personal_info.photo_url = extractedPhotoUrl;
  }
  if (personal.photo_position_y !== undefined || source.photo_position_y !== undefined) {
    output.photo_position_y = personal.photo_position_y ?? source.photo_position_y ?? 50;
    output.personal_info.photo_position_y = output.photo_position_y;
  }

  const explicitAchievements = [];
  const achievementCredentials = [];
  safeArray(source.achievements).forEach(item => {
    const normalized = typeof item === 'string'
      ? { name: splitDetailedText(item).title, description: splitDetailedText(item).description }
      : item;
    if (isCredential(normalized)) achievementCredentials.push(normalized);
    else {
      const evidence = achievementText(item);
      if (evidence) explicitAchievements.push(evidence);
    }
  });
  output.awards = safeArray(source.awards);

  const reclassifiedAchievements = [];
  const credentialItems = [...achievementCredentials, ...safeArray(source.certifications)].filter(item => {
    const normalized = typeof item === 'string' ? { name: cleanText(item) } : item;
    if (isCredential(normalized)) return true;
    const evidence = achievementText(normalized);
    if (evidence) reclassifiedAchievements.push(evidence);
    return false;
  });
  output.achievements = uniqueAchievementEvidence(
    sanitizeAchievementEvidence([...explicitAchievements, ...reclassifiedAchievements])
  );

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
      const desc = split.description && split.description !== '0' && split.description !== '0.' ? split.description : null;
      return desc
        ? { name: split.title, issuing_organization: desc }
        : { name: split.title };
    }
    const normalized = structuredClone(item);
    if (!normalized.name && normalized.title) normalized.name = normalized.title;
    for (const key of Object.keys(normalized)) {
      const val = String(normalized[key] || '').trim();
      if (val === '0' || val === '0.') {
        delete normalized[key];
      }
    }
    return normalized;
  });

  // Final source-authoritative override. Earlier compatibility classification
  // supports legacy imports, but must never alter the two lossless static
  // sections in the final renderer payload.
  output.achievements = safeArray(source.achievements)
    .map(item => typeof item === 'string' ? item : achievementText(item))
    .filter(value => cleanText(value));
  output.certifications = unique(
    safeArray(source.certifications)
      .map(cleanCertification)
      .filter(item => cleanText(item.name) && !isPlaceholderText(item.name))
      // "Credential verification" is a link/action belonging to the real
      // certificate, not a second certification record.
      .filter(item => !/\bcredential\s+verification$/i.test(cleanText(item.name)))
  );

  return repairResumeLinks(output);
}
