/**
 * Browser mirror of backend/services/resume/scoring.py::ATSScoringEngine.
 * Keep the weights and rules identical so optimistic review updates cannot
 * jump when the authoritative backend response arrives.
 */

const cleanText = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9+#.]+/g, ' ')
  .trim();

const asList = value => Array.isArray(value) ? value : [];
const descriptions = item => Array.isArray(item?.description) ? item.description : [];
const bounded = value => Math.max(0, Math.min(100, Math.round(value)));

const skillSet = resume => {
  const result = new Set(asList(resume?.skills).map(value => String(value).toLowerCase().trim()).filter(Boolean));
  Object.values(resume?.skills_categories || {}).forEach(values => {
    asList(values).forEach(value => result.add(String(value).toLowerCase().trim()));
  });
  return result;
};

const jobSkillSet = job => {
  const result = new Set(asList(job?.required_skills).map(value => String(value).toLowerCase().trim()).filter(Boolean));
  if (!result.size) {
    Object.values(job?.skills_categories || {}).forEach(values => {
      asList(values).forEach(value => result.add(String(value).toLowerCase().trim()));
    });
  }
  return result;
};

const resumeCorpus = resume => [
  resume?.summary,
  resume?.raw_text,
  JSON.stringify(asList(resume?.experience)),
  JSON.stringify(asList(resume?.projects)),
  JSON.stringify(asList(resume?.skills)),
  JSON.stringify(resume?.skills_categories || {}),
  JSON.stringify(asList(resume?.certifications)),
  JSON.stringify(asList(resume?.achievements))
].join(' ');

const requiredYears = job => {
  const text = [
    job?.experience_required,
    ...asList(job?.qualifications),
    ...asList(job?.responsibilities)
  ].join(' ').toLowerCase();
  const matches = [...text.matchAll(/\b(\d{1,2})\+?\s+years?\b/g)].map(match => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
};

const candidateYears = resume => [...asList(resume?.experience), ...asList(resume?.internships)]
  .reduce((total, item) => {
    const startMatch = String(item?.start_date || '').match(/\b(?:19|20)\d{2}\b/);
    if (!startMatch) return total;
    const startYear = Number(startMatch[0]);
    const endText = String(item?.end_date || '');
    const ongoing = /present|current|now/i.test(endText);
    const endMatch = endText.match(/\b(?:19|20)\d{2}\b/);
    const endYear = !ongoing && endMatch ? Number(endMatch[0]) : new Date().getUTCFullYear();
    return total + Math.max(0.5, endYear - startYear);
  }, 0);

// The job-extraction pipeline (ExtractedJob) uses different field names than
// this scoring function expects (job_title vs title, skills vs
// required_skills, requirements vs qualifications, no experience_required/
// ats_keywords field at all) -- this function used to read job.title,
// job.required_skills, job.qualifications directly against a raw
// ExtractedJob object where none of those keys exist, so titleWords/jdSkills
// silently came back empty and Role Similarity/Skills Match/Education
// Fit/the experience-years regex all defaulted to a hollow 100 instead of
// measuring anything -- while the Skills section elsewhere in the UI read
// the correct field names directly, so it displayed real skills while the
// score next to it was computed from almost none of them. Mirrors the same
// aliasing backend/app/routers/api.py::normalize_job_payload already does
// server-side for /api/ats/live-score, so this client-side estimate and the
// authoritative backend score are actually measuring the same inputs.
const normalizeJob = job => {
  if (!job) return job;
  const normalized = { ...job };
  if (!normalized.title && job.job_title) normalized.title = job.job_title;
  if ((!normalized.required_skills || !normalized.required_skills.length) && job.skills) {
    normalized.required_skills = job.skills;
  }
  if ((!normalized.preferred_skills || !normalized.preferred_skills.length) && job.suggested_skills) {
    normalized.preferred_skills = job.suggested_skills;
  }
  const requirements = asList(job.requirements);
  const preferredQualifications = asList(job.preferred_qualifications);
  if (requirements.length || preferredQualifications.length) {
    normalized.qualifications = [...asList(normalized.qualifications), ...requirements, ...preferredQualifications];
  }
  return normalized;
};

export function calculateJDMatchScore(resume, rawJob) {
  if (!resume || !rawJob) {
    return { score: 0, atsScore: 0, matchedSkills: [], missingSkills: [], requiredCount: 0, matchedCount: 0, breakdown: {} };
  }
  const job = normalizeJob(rawJob);

  const resumeSkills = skillSet(resume);
  const jdSkills = jobSkillSet(job);
  const corpus = cleanText(resumeCorpus(resume));
  const matchedSkills = [...jdSkills].filter(skill => resumeSkills.has(skill) || corpus.includes(cleanText(skill)));
  const missingSkills = [...jdSkills].filter(skill => !matchedSkills.includes(skill));
  const skillsScore = jdSkills.size ? matchedSkills.length / jdSkills.size * 100 : 100;

  const jdKeywords = new Set([
    ...asList(job.ats_keywords),
    ...asList(job.keywords)
  ].map(value => String(value).toLowerCase().trim()).filter(Boolean));
  if (!jdKeywords.size) jdSkills.forEach(skill => jdKeywords.add(skill));
  const matchedKeywords = [...jdKeywords].filter(keyword => corpus.includes(cleanText(keyword))).length;
  const keywordScore = jdKeywords.size ? matchedKeywords / jdKeywords.size * 100 : 100;

  const experience = asList(resume.experience);
  const yearsRequired = requiredYears(job);
  const experienceScore = yearsRequired === 0
    ? (experience.length ? 100 : 50)
    : (experience.length ? Math.min(100, candidateYears(resume) / yearsRequired * 100) : 0);

  const titleWords = new Set(((String(job.title || '').toLowerCase().match(/\b[a-zA-Z0-9+#.]+\b/g)) || [])
    .filter(word => !['and', 'or', 'of', 'in', 'the', 'a', 'an', 'for', 'with', 'to', 'at', 'by'].includes(word)));
  let roleScore = titleWords.size ? 0 : 100;
  experience.forEach(item => {
    const title = String(item?.role || '').toLowerCase();
    const matches = [...titleWords].filter(word => title.includes(word)).length;
    roleScore = Math.max(roleScore, titleWords.size ? matches / titleWords.size * 100 : 100);
  });

  const projects = asList(resume.projects);
  const relevantProjects = projects.filter(project => {
    const text = descriptions(project).join(' ').toLowerCase();
    return [...jdSkills].some(skill => text.includes(skill)) || [...jdKeywords].some(keyword => text.includes(keyword));
  }).length;
  const projectsScore = projects.length ? relevantProjects / projects.length * 100 : 0;

  const education = asList(resume.education);
  let educationScore = education.length ? 80 : 0;
  if (education.length) {
    const qualifications = asList(job.qualifications).join(' ').toLowerCase();
    const degrees = education.map(item => item?.degree || '').join(' ').toLowerCase();
    if (['bachelor', 'master', 'phd', 'bs', 'ms', 'ph.d', 'btech', 'mtech'].some(key => degrees.includes(key) && qualifications.includes(key))) {
      educationScore = 100;
    }
  }
  const certificationScore = asList(resume.certifications).length ? 100 : 0;
  const score = bounded(skillsScore * .20 + keywordScore * .20 + experienceScore * .20 + roleScore * .15 + projectsScore * .10 + educationScore * .10 + certificationScore * .05);

  let missingSections = 0;
  if (!resume.personal_info) missingSections += 1;
  if (!experience.length) missingSections += 1;
  if (!education.length) missingSections += 1;
  if (!asList(resume.skills).length) missingSections += 1;
  const parseability = Math.max(0, 100 - missingSections * 25);
  const keywordOptimization = jdKeywords.size
    ? [...jdKeywords].filter(keyword => String(resume.summary || '').toLowerCase().includes(keyword) || resumeSkills.has(keyword)).length / jdKeywords.size * 100
    : 100;
  const skillsCoverage = jdSkills.size
    ? [...jdSkills].filter(skill => resumeSkills.has(skill)).length / jdSkills.size * 100
    : 100;
  const bullets = [...experience, ...projects].flatMap(descriptions);
  const actionVerbs = new Set(['developed', 'built', 'managed', 'designed', 'created', 'led', 'optimized', 'implemented', 'engineered', 'collaborated', 'reduced', 'increased', 'saved', 'achieved', 'delivered', 'coordinated', 'analyzed', 'resolved', 'spearheaded', 'directed', 'formulated', 'established', 'tailored', 'pioneered', 'refactored']);
  const actionVerbScore = bullets.length
    ? bullets.filter(bullet => actionVerbs.has((String(bullet).trim().toLowerCase().match(/\b[a-zA-Z]+\b/) || [])[0])).length / bullets.length * 100
    : 100;
  const info = resume.personal_info;
  const completeness = info ? (info.email ? 30 : 0) + (info.phone ? 30 : 0) + (info.linkedin || info.github || info.website ? 40 : 0) : 0;
  const readability = bullets.length ? bullets.filter(bullet => String(bullet).trim().length >= 30 && String(bullet).trim().length <= 180).length / bullets.length * 100 : 100;
  const measurableImpact = bullets.length ? Math.min(100, bullets.filter(bullet => /\b\d+\b|%|\$/.test(String(bullet))).length / Math.max(1, Math.floor(bullets.length / 2)) * 100) : 100;
  const overallOptimization = jdSkills.size + jdKeywords.size
    ? (matchedSkills.length + matchedKeywords) / (jdSkills.size + jdKeywords.size) * 100
    : 100;
  const atsScore = bounded(parseability * .15 + keywordOptimization * .15 + skillsCoverage * .15 + actionVerbScore * .15 + completeness * .10 + readability * .10 + measurableImpact * .10 + overallOptimization * .10);

  return {
    score,
    atsScore,
    matchedSkills: matchedSkills.slice(0, 10),
    missingSkills: missingSkills.slice(0, 10),
    requiredCount: jdSkills.size,
    matchedCount: matchedSkills.length,
    breakdown: {
      resume_match: {
        'Skills Match': bounded(skillsScore),
        'Keyword Relevance': bounded(keywordScore),
        'Experience Alignment': bounded(experienceScore),
        'Role Similarity': bounded(roleScore),
        'Project Relevance': bounded(projectsScore),
        'Education Fit': bounded(educationScore),
        'Certification Relevance': bounded(certificationScore)
      },
      ats_optimization: {
        'ATS Parseability': bounded(parseability),
        'Keyword Optimization': bounded(keywordOptimization),
        'Required Skills Coverage': bounded(skillsCoverage),
        'Formatting & Action Verbs': bounded(actionVerbScore),
        'Section Completeness': bounded(completeness),
        'Readability': bounded(readability),
        'Measurable Impact': bounded(measurableImpact),
        'Overall Optimization': bounded(overallOptimization),
        'Content Originality': 100
      }
    }
  };
}
