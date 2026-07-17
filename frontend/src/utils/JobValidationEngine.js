/**
 * Deterministic Job Validation Engine
 * Runs BEFORE any LLM extraction to determine whether the current page is a single valid job posting.
 * Must never call an LLM unless the page passes validation (`isValid == true`).
 */

export function runDeterministicJobValidation({ text = '', title = '', url = '', company = '' }) {
  console.group("🔍 [Job Validation Engine] Running Deterministic Validation Pipeline");
  console.log("📍 Input URL:", url);
  console.log("📌 Input Title:", title);
  console.log("🏢 Input Company:", company);

  const cleanText = typeof text === 'string' ? text.trim() : '';
  const cleanTitle = typeof title === 'string' ? title.trim() : '';

  // 1. Verify extracted text length (Reject if less than 300 readable characters)
  const textLength = cleanText.length;
  console.log(`[Validation Step 1: Text Length] Length: ${textLength} chars (Minimum required: 300)`);
  if (textLength < 300) {
    const reason = `Extracted text is too short (${textLength} characters). Minimum required is 300 readable characters.`;
    console.warn(`❌ Rejection Reason: ${reason}`);
    console.log("Validation Decision: INVALID");
    console.groupEnd();
    return {
      isValid: false,
      reason
    };
  }

  // 2. Detect recommendation/search pages
  // Reject pages containing patterns such as: Top job picks, Recommended jobs, Similar jobs, Jobs for you, Browse jobs, Search results, People also viewed
  const recPatterns = [
    /top job picks/i,
    /recommended jobs/i,
    /jobs for you/i,
    /browse jobs/i,
    /search results/i,
    /people also viewed/i,
    /similar jobs/i
  ];

  // We check the title and the top portion (header/intro area) of the page text for recommendation headings
  const topIntroText = cleanText.substring(0, 600);
  let matchedRecPattern = null;

  for (const pattern of recPatterns) {
    if (pattern.test(cleanTitle)) {
      matchedRecPattern = pattern.source;
      break;
    }
    // Check top intro text for prominent recommendation headers
    if (pattern.test(topIntroText)) {
      matchedRecPattern = pattern.source;
      break;
    }
  }

  console.log(`[Validation Step 2: Recommendation-Page Detection] Pattern Match: ${matchedRecPattern || "None"}`);
  if (matchedRecPattern) {
    const reason = `Page identified as a recommendation or search listing page (matched pattern '${matchedRecPattern}').`;
    console.warn(`❌ Rejection Reason: ${reason}`);
    console.log("Validation Decision: INVALID");
    console.groupEnd();
    return {
      isValid: false,
      reason
    };
  }

  // 3. Detect multiple companies
  // If multiple distinct company names appear near the top of the extracted content, reject the page.
  const topContent = cleanText.substring(0, 1500);
  // Look for multiple company bullet separators, multiple location headers, or multiple Promoted/Actively hiring/Verified badges typical of job lists
  const badgeMatches = topContent.match(/\b(Promoted|Actively hiring|Verified job|Easy Apply|View job)\b/gi) || [];
  const bulletCompanyMatches = topContent.match(/\b([A-Z][a-zA-Z0-9\s&,-]+?)\s*•\s*(Hybrid|Remote|On-site|\d+\s*(days|weeks|months)\s*ago)\b/g) || [];
  
  // Extract potential company candidates near the top
  const distinctCompanies = new Set();
  if (company && company !== 'Target Company') {
    distinctCompanies.add(company.toLowerCase().trim());
  }
  for (const matchStr of bulletCompanyMatches) {
    const candidate = matchStr.split('•')[0].trim().toLowerCase();
    if (candidate && candidate.length > 2 && !candidate.includes('software') && !candidate.includes('engineer')) {
      distinctCompanies.add(candidate);
    }
  }

  const isMultiCompanyFeed = distinctCompanies.size >= 3 || badgeMatches.length >= 4;
  console.log(`[Validation Step 3: Company Detection] Distinct companies detected near top: ${distinctCompanies.size} (${Array.from(distinctCompanies).join(", ") || "none"}) | Feed badges count: ${badgeMatches.length}`);
  
  if (isMultiCompanyFeed) {
    const reason = `Multiple distinct company names or job cards detected near the top of the content (${distinctCompanies.size} companies / ${badgeMatches.length} badges), indicating a job board listing or feed rather than a single job posting.`;
    console.warn(`❌ Rejection Reason: ${reason}`);
    console.log("Validation Decision: INVALID");
    console.groupEnd();
    return {
      isValid: false,
      reason
    };
  }

  // 4. Verify job structure
  // Accept only if at least one section exists such as: Description, Responsibilities, Qualifications, Requirements, Preferred Qualifications, Basic Qualifications, About the role, What you'll do
  const sectionKeywords = [
    /\bdescription\b/i,
    /\bresponsibilities\b/i,
    /\bqualifications\b/i,
    /\brequirements\b/i,
    /\bpreferred qualifications\b/i,
    /\bbasic qualifications\b/i,
    /\babout the role\b/i,
    /\bwhat you'll do\b/i,
    /\bwhat you will do\b/i,
    /\bwhat you will be doing\b/i,
    /\babout this role\b/i,
    /\babout the position\b/i,
    /\bkey responsibilities\b/i,
    /\bwhat we look for\b/i,
    /\bwhat we're looking for\b/i
  ];

  const foundSections = [];
  for (const kw of sectionKeywords) {
    if (kw.test(cleanText)) {
      foundSections.push(kw.source.replace(/\\b/g, '').replace(/\\i/g, '').replace(/\//g, ''));
    }
  }

  console.log(`[Validation Step 4: Section Detection] Found required sections: ${foundSections.length > 0 ? foundSections.join(", ") : "None"}`);
  if (foundSections.length === 0) {
    const reason = "Missing required job description structure. No standard sections found (e.g. Description, Responsibilities, Qualifications, Requirements, About the role, or What you'll do).";
    console.warn(`❌ Rejection Reason: ${reason}`);
    console.log("Validation Decision: INVALID");
    console.groupEnd();
    return {
      isValid: false,
      reason
    };
  }

  // 5. Reject obvious navigation pages based on title patterns unless a complete single job description is also present
  // Navigation title patterns: Jobs | LinkedIn, Top job picks, Recommended jobs, Search, Careers
  const navTitleRegex = /(\bJobs \| LinkedIn\b|Top job picks|Recommended jobs|\bSearch\b|^Careers$|^Job Search$)/i;
  const isNavTitle = navTitleRegex.test(cleanTitle);
  // A complete single job description inside a page that has a general navigation title must be substantial (>800 chars, >= 2 structural sections, exactly 1 targeted company area)
  const isCompleteJD = cleanText.length >= 800 && foundSections.length >= 2 && !isMultiCompanyFeed && distinctCompanies.size <= 2;

  console.log(`[Validation Step 5: Navigation Title Check] Nav Title Match: ${isNavTitle} ('${cleanTitle}') | Complete Single JD Present: ${isCompleteJD}`);
  if (isNavTitle && !isCompleteJD) {
    const reason = `Page has a navigation/search title ('${cleanTitle}') and does not contain a complete, standalone single job description.`;
    console.warn(`❌ Rejection Reason: ${reason}`);
    console.log("Validation Decision: INVALID");
    console.groupEnd();
    return {
      isValid: false,
      reason
    };
  }

  // 6. Produce ValidationResult
  const reason = "Passed all deterministic validation checks. Page represents a single valid job posting.";
  console.log(`✅ Validation Decision: VALID (${reason})`);
  console.groupEnd();

  return {
    isValid: true,
    reason
  };
}
