/**
 * Unified, 100% deterministic JD Match and ATS Friendliness scoring engine across Tailr4U workflow.
 * Mirrors the exact Python algorithm from backend ATSScoringEngine.
 */

export function calculateJDMatchScore(parsedResume, jobAnalysis) {
  if (!parsedResume || !jobAnalysis) {
    return {
      score: 0,
      atsScore: 0,
      matchedSkills: [],
      missingSkills: [],
      reason: 'Missing resume or job details'
    };
  }

  const cleanText = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();

  // 1. Candidate Skills & Text Corpus
  const resumeSkills = new Set();
  const extractSkills = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      val.split(/[,;•|\n]/).forEach(s => {
        const clean = s.trim().toLowerCase();
        if (clean && clean.length < 50) resumeSkills.add(clean);
      });
    } else if (Array.isArray(val)) {
      val.forEach(extractSkills);
    } else if (typeof val === 'object') {
      Object.values(val).forEach(extractSkills);
    }
  };

  extractSkills(parsedResume.skills);
  extractSkills(parsedResume.skills_categories);
  extractSkills(parsedResume.technical_skills);
  extractSkills(parsedResume.parsed_content?.skills);
  extractSkills(parsedResume.parsed_content?.skills_categories);

  const fullResumeText = JSON.stringify(parsedResume).toLowerCase();
  const fullResumeClean = cleanText(fullResumeText);

  // 2. JD Skills & Keywords
  const jdSkillsSet = new Set();
  const addJDSkills = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      val.split(/[,;•|\n]/).forEach(s => {
        const clean = s.trim().toLowerCase();
        if (clean && clean.length > 1 && clean.length < 50) jdSkillsSet.add(clean);
      });
    } else if (Array.isArray(val)) {
      val.forEach(addJDSkills);
    } else if (typeof val === 'object') {
      Object.values(val).forEach(addJDSkills);
    }
  };

  const reqSkills = jobAnalysis.required_skills || jobAnalysis.skills;
  addJDSkills(reqSkills);

  if (jdSkillsSet.size === 0 && jobAnalysis.skills_categories) {
    addJDSkills(jobAnalysis.skills_categories);
  }

  const jdSkills = Array.from(jdSkillsSet);

  // A. Skills Score (20%)
  let matchedSkillsCount = 0;
  let skillsScore = 100.0;
  const matchedSkillsList = [];
  const missingSkillsList = [];

  if (jdSkills.length > 0) {
    jdSkills.forEach(skill => {
      const isMatched = resumeSkills.has(skill) ||
                        Array.from(resumeSkills).some(rs => rs.includes(skill) || skill.includes(rs)) ||
                        fullResumeClean.includes(cleanText(skill));
      if (isMatched) {
        matchedSkillsCount++;
        matchedSkillsList.push(skill);
      } else {
        missingSkillsList.push(skill);
      }
    });
    skillsScore = (matchedSkillsCount / jdSkills.length) * 100.0;
  }

  // B. Keyword Score (20%)
  const jdKeywordsSet = new Set();
  addJDSkills(jobAnalysis.ats_keywords);
  addJDSkills(jobAnalysis.keywords);

  const jdKeywords = Array.from(jdKeywordsSet);
  const searchKeywords = jdKeywords.length > 0 ? jdKeywords : jdSkills;

  let keywordScore = 100.0;
  if (searchKeywords.length > 0) {
    let matchedKwCount = 0;
    searchKeywords.forEach(kw => {
      if (fullResumeClean.includes(cleanText(kw))) matchedKwCount++;
    });
    keywordScore = (matchedKwCount / searchKeywords.length) * 100.0;
  }

  // C. Experience Alignment (20%)
  const experienceList = parsedResume.experience || parsedResume.parsed_content?.experience || [];
  let experienceScore = 0.0;
  if (experienceList.length > 0) {
    experienceScore = 80.0;
  }

  // D. Role Similarity (15%)
  const jdTitle = (jobAnalysis.title || jobAnalysis.job_title || '').toLowerCase();
  const jdTitleWords = new Set(
    (jdTitle.match(/\b[a-zA-Z0-9+#.]+\b/g) || []).filter(w => !['and', 'or', 'of', 'in', 'the', 'a', 'an', 'for', 'with', 'to', 'at', 'by'].includes(w))
  );

  let roleSimilarityScore = 0.0;
  if (jdTitleWords.size === 0) {
    roleSimilarityScore = 100.0;
  } else if (experienceList.length > 0) {
    let maxMatch = 0;
    experienceList.forEach(exp => {
      const role = (exp.role || exp.title || '').toLowerCase();
      let matched = 0;
      jdTitleWords.forEach(w => {
        if (role.includes(w)) matched++;
      });
      const ratio = (matched / jdTitleWords.size) * 100.0;
      if (ratio > maxMatch) maxMatch = ratio;
    });
    roleSimilarityScore = maxMatch;
  }

  // E. Project Relevance (10%)
  const projectsList = parsedResume.projects || parsedResume.parsed_content?.projects || [];
  let projectsScore = 0.0;
  if (projectsList.length > 0) {
    let relevantCount = 0;
    projectsList.forEach(p => {
      const desc = (Array.isArray(p.description) ? p.description.join(' ') : String(p.description || '')).toLowerCase();
      const isRel = jdSkills.some(s => desc.includes(s)) || searchKeywords.some(k => desc.includes(k));
      if (isRel) relevantCount++;
    });
    projectsScore = (relevantCount / projectsList.length) * 100.0;
  }

  // F. Education Fit (10%)
  const educationList = parsedResume.education || parsedResume.parsed_content?.education || [];
  let educationScore = 0.0;
  if (educationList.length > 0) {
    educationScore = 80.0;
  }

  // G. Certification Relevance (5%)
  const certificationsList = parsedResume.certifications || parsedResume.parsed_content?.certifications || [];
  const certScore = certificationsList.length > 0 ? 100.0 : 0.0;

  // Final Match Score
  const rawScore = Math.round(
    (skillsScore * 0.20) +
    (keywordScore * 0.20) +
    (experienceScore * 0.20) +
    (roleSimilarityScore * 0.15) +
    (projectsScore * 0.10) +
    (educationScore * 0.10) +
    (certScore * 0.05)
  );

  const score = Math.max(0, Math.min(100, rawScore));

  // ATS Score (0-100)
  let parseability = 100.0;
  if (!parsedResume.personal_info) parseability -= 25;
  if (experienceList.length === 0) parseability -= 25;
  if (educationList.length === 0) parseability -= 25;
  if (resumeSkills.size === 0) parseability -= 25;

  const atsScore = Math.max(0, Math.min(100, Math.round(
    (parseability * 0.30) +
    (skillsScore * 0.30) +
    (keywordScore * 0.20) +
    (experienceScore * 0.20)
  )));

  return {
    score,
    atsScore,
    matchedSkills: matchedSkillsList.slice(0, 10),
    missingSkills: missingSkillsList.slice(0, 10),
    requiredCount: jdSkills.length,
    matchedCount: matchedSkillsList.length,
    // Sub-scores this function already computes internally, surfaced so
    // callers can build a "current" breakdown that's actually consistent
    // with `score`/`atsScore` above -- previously thrown away, forcing
    // callers to fake a breakdown via linear interpolation between two
    // unrelated backend snapshots (see ResumeReviewView.jsx), which could
    // show numbers totally disconnected from the live headline score.
    breakdown: {
      resume_match: {
        "Skills Match": Math.round(skillsScore),
        "Keyword Relevance": Math.round(keywordScore),
        "Experience Alignment": Math.round(experienceScore),
        "Role Similarity": Math.round(roleSimilarityScore),
        "Project Relevance": Math.round(projectsScore),
        "Education Fit": Math.round(educationScore),
        "Certification Relevance": Math.round(certScore)
      },
      ats_optimization: {
        "ATS Parseability": Math.round(parseability),
        "Keyword Optimization": Math.round(keywordScore),
        "Required Skills Coverage": Math.round(skillsScore),
        "Overall Optimization": atsScore
      }
    }
  };
}
