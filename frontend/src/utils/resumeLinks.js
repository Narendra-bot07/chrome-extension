const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'ref', 'source'
]);

const text = value => String(value ?? '').trim();
const slug = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

export function isValidProjectUrl(value) {
  const raw = text(value).replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  if (!raw) return false;
  if (/^(javascript|data|file):/i.test(raw)) return false;
  if (raw === '#' || /^https?:\/\/#?$/i.test(raw)) return false;

  let urlStr = raw;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    const scheme = parsed.protocol.toLowerCase();
    if (scheme !== 'http:' && scheme !== 'https:') return false;

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === 'github' || !host.includes('.')) return false;

    const pathSegments = parsed.pathname.split('/').filter(Boolean);

    if (host === 'github.com') {
      // Repository subpaths (tree, issues, docs) retain repository ownership.
      if (pathSegments.length < 2 || pathSegments.some(part => part === '.' || part === '..')) return false;
    } else {
      const deploymentHost = ['vercel.app', 'netlify.app', 'github.io']
        .some(domain => host === domain || host.endsWith(`.${domain}`));
      if (pathSegments.length === 0 && !deploymentHost) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function normalizeResumeUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^(?:mailto|tel):/i.test(raw)) return raw.toLowerCase();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    const query = url.searchParams.toString();
    return `https://${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname === '/' ? '' : url.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

const parsedUrl = value => {
  try { return new URL(normalizeResumeUrl(value)); } catch { return null; }
};

export function githubUrlKind(value) {
  const url = parsedUrl(value);
  if (!url || url.hostname !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 1) return 'profile';
  if (parts.length >= 2) return 'repository';
  return 'unknown';
}

export function linkedinUrlKind(value) {
  const url = parsedUrl(value);
  if (!url || !url.hostname.endsWith('linkedin.com')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0]?.toLowerCase() === 'in' && parts[1]) return 'profile';
  if (parts[0]?.toLowerCase() === 'company' && parts[1]) return 'company';
  return 'unknown';
}

const platformFor = (key, value) => {
  const source = `${key} ${value}`.toLowerCase();
  const url = parsedUrl(value);
  const host = url?.hostname || '';
  if (host === 'github.com' || source.includes('github')) return 'github';
  if (host.endsWith('linkedin.com') || source.includes('linkedin')) return 'linkedin';
  if (host === 'x.com' || host.endsWith('twitter.com') || /\b(?:twitter|x_com)\b/.test(source)) return 'x';
  if (host.endsWith('leetcode.com') || source.includes('leetcode')) return 'leetcode';
  if (/email|mail/.test(key) || /^mailto:/i.test(value)) return 'email';
  if (/phone|tel/.test(key) || /^tel:/i.test(value)) return 'phone';
  if (/portfolio/.test(source)) return 'portfolio';
  return 'website';
};

const labelFor = (platform, linkType = 'profile') => ({
  github: 'GitHub',
  linkedin: 'LinkedIn',
  x: 'X',
  leetcode: 'LeetCode',
  email: 'Email',
  phone: 'Phone',
  portfolio: 'Portfolio',
  website: linkType === 'documentation' ? 'Documentation' : 'Website'
}[platform] || 'Link');

const makeLink = ({ ownerType, ownerId, linkType, platform, url, label }) => ({
  owner_type: ownerType,
  owner_id: ownerId,
  link_type: linkType,
  platform,
  url: platform === 'email'
    ? (/^mailto:/i.test(url) ? text(url).toLowerCase() : `mailto:${text(url).toLowerCase()}`)
    : platform === 'phone'
      ? (/^tel:/i.test(url) ? text(url) : `tel:${text(url).replace(/[^\d+]/g, '')}`)
      : normalizeResumeUrl(url),
  display_label: label || labelFor(platform, linkType)
});

const projectId = (project, index) => text(project?.id) || `project-${index}-${slug(project?.name || project?.title).slice(0, 40) || index}`;
const projectTitle = project => text(project?.title || project?.name);
const itemId = (type, item, index) => text(item?.id)
  || `${type}-${index}-${slug(item?.name || item?.title).slice(0, 40) || index}`;
const credentialHost = host => [
  'credentials.databricks.com', 'credly.com', 'coursera.org', 'verify.oracle.com'
].some(domain => host === domain || host.endsWith(`.${domain}`));

const ownedLink = (link, context = {}) => ({
  id: `link-${slug(`${link.owner_type}-${link.owner_id}-${link.url}-${link.link_type}`)}`,
  ...link,
  original_url: context.originalUrl || link.url,
  normalized_url: link.url,
  source_section: context.sourceSection || link.owner_type,
  source_provenance: context.sourceProvenance || context.sourceKey || 'resume_field',
  confidence: context.confidence ?? 1,
  validation_status: 'VALID'
});

/**
 * Migrates legacy flat links into ownership-aware collections. Ambiguous links
 * are preserved in link_review and are deliberately excluded from the header.
 */
export function repairResumeLinks(resume) {
  if (resume?.links_intelligence_version === 1) {
    return structuredClone(resume);
  }
  const output = structuredClone(resume || {});
  const candidateId = text(output.candidate_id || output.personal_info?.id || output.id) || 'candidate';
  output.projects = (Array.isArray(output.projects) ? output.projects : []).map((project, index) => ({
    ...project,
    id: projectId(project, index),
    links: []
  }));
  output.certifications = (Array.isArray(output.certifications) ? output.certifications : [])
    .map((item, index) => ({ ...item, id: itemId('certification', item, index), links: [] }));
  output.publications = (Array.isArray(output.publications) ? output.publications : [])
    .map((item, index) => ({ ...item, id: itemId('publication', item, index), links: [] }));

  const projectById = new Map(output.projects.map(project => [project.id, project]));
  const certificationById = new Map(output.certifications.map(item => [item.id, item]));
  const publicationById = new Map(output.publications.map(item => [item.id, item]));
  const seen = new Set();
  const add = link => {
    if (!link.url || !link.owner_id) return false;
    const identity = `${link.owner_type}|${link.owner_id}|${link.link_type}|${link.url}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (link.owner_type === 'project') {
      const project = projectById.get(link.owner_id);
      if (!project) return false;
      project.links.push(link);
    } else if (link.owner_type === 'certification') {
      const certification = certificationById.get(link.owner_id);
      if (!certification) return false;
      certification.links.push(link);
    } else if (link.owner_type === 'publication') {
      const publication = publicationById.get(link.owner_id);
      if (!publication) return false;
      publication.links.push(link);
    } else {
      output.profile_links.push(link);
    }
    return true;
  };

  output.profile_links = [];
  output.link_review = [];

  // Project context is authoritative, even when the URL itself is ambiguous.
  (Array.isArray(resume?.projects) ? resume.projects : []).forEach((sourceProject, index) => {
    const ownerId = output.projects[index].id;
    const rawLinks = [
      ...(Array.isArray(sourceProject?.links) ? sourceProject.links : []),
      ...['link', 'url', 'repository_url', 'github_url', 'demo_url', 'documentation_url']
        .filter(key => sourceProject?.[key]).map(key => ({ url: sourceProject[key], source_key: key }))
    ];
    rawLinks.forEach(rawLink => {
      const url = text(typeof rawLink === 'string' ? rawLink : rawLink?.url);
      if (!url || !isValidProjectUrl(url)) return;
      const key = text(rawLink?.link_type || rawLink?.type || rawLink?.source_key);
      const platform = rawLink?.platform || platformFor(key, url);
      const linkType = rawLink?.link_type || rawLink?.type
        || (githubUrlKind(url) === 'repository' ? 'repository'
          : /demo/.test(key) ? 'live_demo'
            : /doc/.test(key) ? 'documentation'
              : /case/.test(key) ? 'case_study' : 'project_website');
      add(ownedLink({
        ...makeLink({ ownerType: 'project', ownerId, linkType, platform, url, label: rawLink?.display_label || rawLink?.label }),
        is_valid: true
      }, { originalUrl: url, sourceSection: 'projects', sourceKey: key }));
    });
  });

  const attachItemLinks = (sourceItems, targetItems, ownerType) => {
    (Array.isArray(sourceItems) ? sourceItems : []).forEach((sourceItem, index) => {
      if (!sourceItem || typeof sourceItem !== 'object') return;
      const ownerId = targetItems[index].id;
      const values = [
        ...(Array.isArray(sourceItem.links) ? sourceItem.links : []),
        ...['credential_url', 'publication_url', 'url', 'link', 'doi']
          .filter(key => sourceItem[key]).map(key => ({ url: sourceItem[key], source_key: key }))
      ];
      values.forEach(rawLink => {
        const url = text(typeof rawLink === 'string' ? rawLink : rawLink?.url);
        const normalized = normalizeResumeUrl(url);
        const parsed = parsedUrl(normalized);
        if (!parsed || !parsed.hostname.includes('.')) return;
        const linkType = ownerType === 'certification' ? 'credential' : 'publication';
        const platform = credentialHost(parsed.hostname)
          ? parsed.hostname.includes('databricks') ? 'databricks'
            : parsed.hostname.includes('credly') ? 'credly' : 'website'
          : platformFor(rawLink?.source_key || linkType, url);
        add(ownedLink(makeLink({
          ownerType, ownerId, linkType, platform, url,
          label: rawLink?.display_label || (ownerType === 'certification' ? 'View Credential' : 'View Publication')
        }), { originalUrl: url, sourceSection: `${ownerType}s`, sourceKey: rawLink?.source_key }));
      });
    });
  };
  attachItemLinks(resume?.certifications, output.certifications, 'certification');
  attachItemLinks(resume?.publications, output.publications, 'publication');

  const globalCandidates = [
    ['email', output.personal_info?.email],
    ['phone', output.personal_info?.phone],
    ['linkedin', output.personal_info?.linkedin],
    ['github', output.personal_info?.github],
    ['portfolio', output.personal_info?.website || output.portfolio || output.portfolio_url],
    ...Object.entries(output.personal_info?.coding_profiles || {}),
    ...(Array.isArray(resume?.profile_links) ? resume.profile_links.map(item => [item.platform || item.type, item]) : []),
    ...Object.entries(resume?.links || {})
  ];
  const seenGlobalTypes = new Set();
  globalCandidates.forEach(([key, raw]) => {
    const item = raw && typeof raw === 'object' ? raw : {};
    const url = text(item.url || raw);
    if (!url) return;
    const platform = item.platform || platformFor(key, url);
    const githubKind = platform === 'github' ? githubUrlKind(url) : null;
    if (githubKind === 'repository') {
      // Flat candidate-level links have no reliable project ownership. Keep
      // them quarantined; never infer ownership from a title or repository slug.
      output.link_review.push({ url: normalizeResumeUrl(url), reason: 'unmatched_project_repository', source: key, validation_status: 'UNRESOLVED' });
      return;
    }
    const host = parsedUrl(url)?.hostname || '';
    if (credentialHost(host)) {
      output.link_review.push({ url: normalizeResumeUrl(url), reason: 'unmatched_credential', source: key, validation_status: 'OWNER_MISMATCH' });
      return;
    }
    if (platform === 'linkedin' && linkedinUrlKind(url) !== 'profile') {
      output.link_review.push({ url: normalizeResumeUrl(url), reason: 'non_candidate_linkedin', source: key, validation_status: 'OWNER_MISMATCH' });
      return;
    }
    const allowed = new Set(['email', 'phone', 'linkedin', 'github', 'portfolio', 'x', 'leetcode', 'website']);
    if (!allowed.has(platform) || (platform === 'github' && githubKind !== 'profile')) {
      output.link_review.push({ url: normalizeResumeUrl(url), reason: 'uncertain_ownership', source: key, validation_status: 'UNRESOLVED' });
      return;
    }
    if (seenGlobalTypes.has(platform)) return;
    seenGlobalTypes.add(platform);
    add(ownedLink(makeLink({
      ownerType: 'candidate', ownerId: candidateId, linkType: 'profile',
      platform, url, label: item.display_label || item.label
    }), { originalUrl: url, sourceSection: 'header', sourceKey: key }));
  });

  output.candidate_links = output.profile_links;
  output.unresolved_links = output.link_review;
  const byPlatform = new Map(output.candidate_links.map(link => [link.platform, link]));
  output.personal_info = { ...(output.personal_info || {}) };
  output.personal_info.linkedin = byPlatform.get('linkedin')?.url || '';
  output.personal_info.github = byPlatform.get('github')?.url || '';
  output.personal_info.website = (byPlatform.get('portfolio') || byPlatform.get('website'))?.url || '';
  output.personal_info.coding_profiles = Object.fromEntries(
    output.candidate_links
      .filter(link => ['leetcode', 'x'].includes(link.platform))
      .map(link => [link.platform, link.url])
  );
  output.links = {};
  output.links_intelligence_version = 1;
  return output;
}

export function validateResumeLinks(resume) {
  const issues = [];
  const globalTypes = new Set();
  for (const link of resume?.profile_links || []) {
    if (link.owner_type !== 'candidate') issues.push('Non-candidate link in profile_links');
    if (globalTypes.has(link.platform)) issues.push(`Duplicate global link type: ${link.platform}`);
    globalTypes.add(link.platform);
    if (link.platform === 'github' && githubUrlKind(link.url) !== 'profile') {
      issues.push('Header GitHub link is not a profile URL');
    }
  }
  const ids = new Set((resume?.projects || []).map(project => project.id));
  for (const project of resume?.projects || []) {
    const seenUrls = new Set();
    for (const link of project.links || []) {
      if (link.owner_type !== 'project' || link.owner_id !== project.id || !ids.has(link.owner_id)) {
        issues.push(`Invalid project link owner: ${link.owner_id || 'missing'}`);
      }
      if (!isValidProjectUrl(link.url)) issues.push(`Invalid project URL: ${link.url || 'missing'}`);
      const normalized = normalizeResumeUrl(link.url);
      if (seenUrls.has(normalized)) issues.push(`Duplicate project URL: ${normalized}`);
      seenUrls.add(normalized);
      if (link.platform === 'github' && githubUrlKind(link.url) !== 'repository') {
        issues.push('Project GitHub link is not a repository URL');
      }
    }
  }
  for (const link of resume?.unresolved_links || []) {
    if (link.validation_status === 'VALID') issues.push('Unresolved link marked valid');
  }
  return { valid: issues.length === 0, issues };
}
