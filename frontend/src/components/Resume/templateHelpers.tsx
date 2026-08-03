import React from 'react';

export interface LayoutParams {
  paddingX: number;
  paddingY: number;
  sectionGap: number;
  itemGap: number;
  bulletGap: number;
  lineHeight: number;
  fontSize: number;
  nameSize: number;
  sectionTitleSize: number;
}

export const sectionLabel = (value: string): string => {
  const overrides: Record<string, string> = {
    positions_of_responsibility: 'Position of Responsibility',
    position_of_responsibility: 'Position of Responsibility',
    leadership: 'Position of Responsibility',
    extracurricular_activities: 'Extra-Curricular',
    extracurricular: 'Extra-Curricular',
    research_publications: 'Research Publication',
    publications: 'Research Publication',
    internships: 'Internship / Trainings',
    trainings: 'Internship / Trainings',
    declaration: 'Declaration',
    personal_info: 'Personal Info'
  };
  if (overrides[value]) return overrides[value];
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

export const ensureArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined || val === '') return [];
  return [val];
};

export const linkHref = (kind: string, value: string): string => {
  const val = String(value || '').trim();
  if (!val) return '#';
  const lowerKind = String(kind || '').toLowerCase();
  const lowerVal = val.toLowerCase();

  if (lowerKind === 'email' || lowerVal.includes('@')) {
    return /^mailto:/i.test(val) ? val : `mailto:${val}`;
  }
  if (lowerKind === 'phone' || /^\+?[0-9()\s-]{7,}$/.test(val)) {
    return /^tel:/i.test(val) ? val : `tel:${val.replace(/\s+/g, '')}`;
  }

  const clean = val.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/^\/+/, '');

  if (lowerKind.includes('linkedin') || lowerVal.includes('linkedin.com')) {
    if (clean.toLowerCase().includes('linkedin.com')) return `https://${clean}`;
    return `https://linkedin.com/in/${clean}`;
  }
  if (lowerKind.includes('github') || lowerVal.includes('github.com')) {
    if (clean.toLowerCase().includes('github.com')) return `https://${clean}`;
    return `https://github.com/${clean}`;
  }
  if (lowerKind.includes('leetcode') || lowerVal.includes('leetcode.com')) {
    if (clean.toLowerCase().includes('leetcode.com')) return `https://${clean}`;
    return `https://leetcode.com/${clean}`;
  }
  if (lowerKind.includes('twitter') || lowerKind === 'x' || lowerVal.includes('twitter.com') || lowerVal.includes('x.com')) {
    if (clean.toLowerCase().includes('x.com') || clean.toLowerCase().includes('twitter.com')) return `https://${clean}`;
    return `https://x.com/${clean}`;
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(val)) return val;
  return `https://${clean}`;
};

export const professionalLink = (kind: string, value: string) => {
  const raw = String(value || '').trim();
  const cleanUrl = raw
    .replace(/^https?:\/\/(?:www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
  const lowerKey = String(kind || '').toLowerCase();
  const lowerVal = raw.toLowerCase();

  if (lowerKey.includes('github') || lowerVal.includes('github.com')) {
    let username = cleanUrl;
    if (cleanUrl.includes('github.com/')) {
      username = cleanUrl.split('github.com/')[1]?.split('/')[0] || cleanUrl;
    }
    return { type: 'github', label: username || 'GitHub', href: linkHref('github', raw) };
  }

  if (lowerKey.includes('linkedin') || lowerVal.includes('linkedin.com')) {
    let username = cleanUrl;
    if (cleanUrl.includes('linkedin.com/in/')) {
      username = cleanUrl.split('linkedin.com/in/')[1]?.split('/')[0] || cleanUrl;
    } else if (cleanUrl.includes('linkedin.com/pub/')) {
      username = cleanUrl.split('linkedin.com/pub/')[1]?.split('/')[0] || cleanUrl;
    }
    return { type: 'linkedin', label: username || 'LinkedIn', href: linkHref('linkedin', raw) };
  }

  if (lowerVal.includes('leetcode.com')) {
    let username = cleanUrl;
    if (cleanUrl.includes('leetcode.com/')) {
      username = cleanUrl.split('leetcode.com/')[1]?.split('/')[0] || cleanUrl;
    }
    return { type: 'code', label: username || cleanUrl, href: linkHref('link', raw) };
  }

  if (lowerVal.includes('drive.google') || lowerVal.includes('certificate')) {
    return { type: 'folder', label: 'Certificates', href: linkHref('link', raw) };
  }

  return { type: 'website', label: cleanUrl || raw, href: linkHref('link', raw) };
};

export const renderTextWithLinks = (value: any, textColorClass = 'text-black'): React.ReactNode => {
  const text = String(value ?? '');
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s<>\])},;]+)/gi);
  return parts.map((part, index) =>
    /^(?:https?:\/\/|www\.)/i.test(part)
      ? <a key={index} href={linkHref('link', part)} target="_blank" rel="noopener noreferrer" className={`underline ${textColorClass} hover:opacity-80`}>
          {professionalLink('link', part).label}
        </a>
      : part
  );
};

export const hasData = (resume: any, sectionId: string): boolean => {
  if (!resume) return false;
  const {
    summary,
    experience,
    projects,
    education,
    skills,
    skills_categories,
    certifications,
    achievements,
    volunteer_experience,
    publications,
    languages,
    awards,
    interests
  } = resume;

  const categorizedSkills = (typeof skills === 'object' && !Array.isArray(skills)) ? skills : skills_categories || {};

  switch (sectionId) {
    case 'summary':
      return !!summary && typeof summary === 'string' && summary.trim() !== '';
    case 'experience':
      return Array.isArray(experience) && experience.filter(item => item && (item.role || item.company || item.description)).length > 0;
    case 'projects':
      return Array.isArray(projects) && projects.filter(item => item && (item.name || item.description)).length > 0;
    case 'education':
      return Array.isArray(education) && education.filter(item => item && (item.degree || item.institution)).length > 0;
    case 'skills':
      return (!!categorizedSkills && Object.keys(categorizedSkills).length > 0) || (Array.isArray(skills) && skills.length > 0);
    case 'certifications':
      return Array.isArray(certifications) && certifications.filter(item => item && (item.title || item.name)).length > 0;
    case 'achievements':
      return Array.isArray(achievements) && achievements.filter(item => item && (item.title || item.description)).length > 0;
    case 'volunteer':
    case 'volunteer_experience': {
      const vol = volunteer_experience || resume.volunteer;
      return Array.isArray(vol) && vol.filter((item: any) => item && (item.role || item.organization)).length > 0;
    }
    case 'publications':
    case 'research_publications': {
      const pub = publications || resume.research_publications || resume.publications;
      return Array.isArray(pub) && pub.filter((item: any) => item && (item.title || item.name || typeof item === 'string')).length > 0;
    }
    case 'languages':
      return Array.isArray(languages) && languages.filter((item: any) => item && (item.language || typeof item === 'string')).length > 0;
    case 'awards':
      return Array.isArray(awards) && awards.filter((item: any) => item && (item.title || typeof item === 'string')).length > 0;
    case 'interests':
      return Array.isArray(interests) && interests.filter((item: any) => item && String(item).trim() !== '').length > 0;
    case 'objective':
      return !!resume.objective && typeof resume.objective === 'string' && resume.objective.trim() !== '';
    case 'internships':
    case 'trainings': {
      const intern = resume.internships || resume.trainings;
      return Array.isArray(intern) && intern.filter((item: any) => item && (item.role || item.title || item.company || item.organization || typeof item === 'string')).length > 0;
    }
    case 'leadership':
    case 'positions_of_responsibility':
    case 'position_of_responsibility': {
      const lead = resume.leadership || resume.positions_of_responsibility || resume.position_of_responsibility;
      return Array.isArray(lead) && lead.filter((item: any) => item && (item.role || item.position || item.organization || typeof item === 'string')).length > 0;
    }
    case 'extracurricular_activities':
    case 'extracurricular': {
      const extra = resume.extracurricular_activities || resume.extracurricular;
      return Array.isArray(extra) && extra.filter((item: any) => item && (item.title || item.name || item.activity || typeof item === 'string')).length > 0;
    }
    case 'declaration': {
      const dec = resume.declaration || resume.declaration_text;
      return !!dec && typeof dec === 'string' && dec.trim() !== '';
    }
    default: {
      const val = resume[sectionId];
      if (Array.isArray(val)) return val.filter((item: any) => item && (typeof item === 'string' ? item.trim() !== '' : Object.keys(item).length > 0)).length > 0;
      if (typeof val === 'string') return val.trim() !== '';
      return !!val;
    }
  }
};
