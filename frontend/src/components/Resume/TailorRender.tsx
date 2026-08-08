import React, { useEffect, useState } from 'react';
import { 
  Mail, Phone, MapPin, Linkedin, Github, Globe, Code2, Folder, 
  ExternalLink, Award, Briefcase, GraduationCap, Star, BookOpen, Camera, User, Upload, Trash2 
} from 'lucide-react';
import ProfilePhotoCropModal from './ProfilePhotoCropModal';
import { categorizeSkills, categorizeSkillsWithAI } from '../../utils/skillCategorizer';
import { getApiUrl } from '../../config/apiConfig';
import {
  canonicalContactIdentity,
  normalizeDetailedRecords,
  normalizePersonName,
  professionalLink
} from '../../utils/resumePresentation';
import { TEMPLATE_CONFIGS, TemplateConfig } from '../../templates/templates_config';
import { createResumeLayoutModel } from '../../utils/resumeLayoutModel';
import { AcademicATSTemplate } from './templates/AcademicATSTemplate';
import { JohnsonsATSTemplate } from './templates/JohnsonsATSTemplate';
import { useOptionalApp } from '../../context/AppContextCore';
import { selectProfileImage } from '../../services/profilePolicy';

const sectionLabel = (value: string) => {
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

const ensureArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
};

const linkHref = (kind: string, value: string) => {
  const val = String(value || '').trim();
  if (!val) return '';
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

const linkDisplay = (kind: string, value: string) => {
  if (!value) return null;
  const info = professionalLink(kind, value);
  const href = info.href || linkHref(kind, value);
  const label = info.label || value;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
      {label}
    </a>
  );
};

const renderScalar = (value: any, key = ''): React.ReactNode => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const isLink = /(?:url|link|website|github|linkedin|portfolio)/i.test(key) || /^(?:https?:\/\/|www\.)/i.test(value);
    return isLink
      ? <a href={linkHref(key, value)} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
          {professionalLink(key, value).label}
        </a>
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => (
      <React.Fragment key={index}>
        {index > 0 ? ' · ' : ''}
        {renderScalar(item, key)}
      </React.Fragment>
    ));
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([nestedKey, nestedValue], index) => (
      <React.Fragment key={nestedKey}>
        {index > 0 ? ' · ' : ''}
        <span className="font-semibold">{sectionLabel(nestedKey)}: </span>
        {renderScalar(nestedValue, nestedKey)}
      </React.Fragment>
    ));
  }
  return String(value);
};

const renderTextWithLinks = (value: any, textColorClass = 'text-black'): React.ReactNode => {
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

export function getParamsForLevel(level: number): LayoutParams {
  // Levels 0-10 cover normal compact-to-comfortable resumes. Levels 11-20
  // are reserved for measured sparse-page expansion in the print renderer.
  // This changes presentation only; content and page width remain immutable.
  const safeLevel = Math.max(0, Math.min(20, level));
  const t = Math.min(1, safeLevel / 10);
  const sparseT = Math.max(0, safeLevel - 10) / 10;
  return {
    paddingX: Math.round(32 + (60 - 32) * t + 12 * sparseT),
    paddingY: Math.round(20 + (58 - 20) * t + 20 * sparseT),
    // Density level expands sparse documents and compacts dense documents.
    // These bounds remain ATS-safe and never alter or remove resume content.
    sectionGap: Math.round(7 + (18 - 7) * t + 14 * sparseT),
    itemGap: Math.round(0 + (5 - 0) * t + 4 * sparseT),
    bulletGap: Math.round(0 + (3 - 0) * t + 2 * sparseT),
    lineHeight: 1.12 + (1.42 - 1.12) * t + 0.13 * sparseT,
    fontSize: 9.0 + (12.5 - 9.0) * t + 0.7 * sparseT,
    nameSize: Math.round(20 + (34 - 20) * t + 6 * sparseT),
    sectionTitleSize: Math.round(11 + (16 - 11) * t + 2 * sparseT)
  };
}

interface TailorRenderProps {
  resume: any;
  templateName: string;
  sectionOrder?: string[];
  layoutLevel?: number;
  isExporting?: boolean;
  disablePhotoModal?: boolean;
}

export default function TailorRender({ resume, templateName, sectionOrder, layoutLevel = 5, isExporting = false, disablePhotoModal = false }: TailorRenderProps) {
  // The headless PDF entry deliberately excludes the heavyweight AppProvider.
  // Its payload already contains personal_info.photo_url; context values are
  // only an optional interactive-app fallback.
  const appContext = useOptionalApp();
  const user = appContext?.user ?? null;
  const profile = appContext?.profile ?? null;
  const resolvedTemplateKey = TEMPLATE_CONFIGS[templateName] ? templateName : 'ExecutiveATS';
  const config: TemplateConfig = TEMPLATE_CONFIGS[resolvedTemplateKey];
  const params = getParamsForLevel(layoutLevel);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug(`--- TailorRender Engine: Compiling ${resolvedTemplateKey} at layout level ${layoutLevel} ---`);
    }
  }, [layoutLevel, resolvedTemplateKey]);

  const targetResume = React.useMemo(() => {
    if (!resume) return {};
    let base = resume;
    if (resume.parsed_content && typeof resume.parsed_content === 'object') {
      base = { ...resume.parsed_content, ...resume };
    } else if (resume.parsed_data && typeof resume.parsed_data === 'object') {
      base = { ...resume.parsed_data, ...resume };
    }

    const info = base.personal_info || base.header || {};
    const personal_info = {
      name: info.name || info.full_name || info.candidate_name || base.name || base.full_name || '',
      job_title: info.job_title || info.headline || info.title || base.job_title || '',
      email: info.email || base.email || '',
      phone: info.phone || base.phone || '',
      location: info.location || base.location || '',
      linkedin: info.linkedin || info.links?.find((l: any) => l.platform === 'linkedin')?.url || base.linkedin || '',
      github: info.github || info.links?.find((l: any) => l.platform === 'github')?.url || base.github || '',
      website: info.website || info.portfolio || info.links?.find((l: any) => l.platform === 'website' || l.platform === 'portfolio')?.url || base.website || '',
      photo_url: info.photo_url || base.photo_url || ''
    };

    const secMap: Record<string, any> = {};
    if (Array.isArray(base.sections) && base.sections.length > 0) {
      base.sections.forEach((sec: any) => {
        if (sec.id === 'summary') {
          secMap.summary = sec.custom_content || sec.items?.[0]?.description || '';
        } else if (sec.id === 'experience') {
          secMap.experience = (sec.items || []).map((item: any) => ({
            role: item.title,
            company: item.subtitle,
            location: item.location,
            start_date: item.start_date,
            end_date: item.end_date,
            description: item.bullets?.length ? item.bullets : [item.description].filter(Boolean)
          }));
        } else if (sec.id === 'projects') {
          secMap.projects = (sec.items || []).map((item: any) => ({
            name: item.title,
            role: item.subtitle,
            technology_stack: item.skills,
            link: item.links?.find((l: any) => l.url)?.url || '',
            description: item.bullets?.length ? item.bullets : [item.description].filter(Boolean)
          }));
        } else if (sec.id === 'education') {
          secMap.education = (sec.items || []).map((item: any) => ({
            degree: item.title,
            institution: item.subtitle,
            location: item.location,
            start_date: item.start_date,
            end_date: item.end_date,
            gpa: item.description?.replace("GPA: ", "") || ""
          }));
        } else if (sec.id === 'skills') {
          secMap.skills_categories = sec.custom_content;
          secMap.skills = sec.items?.[0]?.skills || [];
        } else if (sec.id === 'certifications') {
          secMap.certifications = (sec.items || []).map((item: any) => ({
            title: item.title,
            name: item.title,
            issuing_organization: item.subtitle,
            issuer: item.subtitle,
            issue_date: item.date_display,
            date: item.date_display
          }));
        } else if (sec.id === 'achievements') {
          secMap.achievements = (sec.items || []).map((item: any) => ({
            title: item.title,
            name: item.title,
            description: item.description,
            date: item.date_display
          }));
        }
      });
    }

    return {
      ...base,
      personal_info,
      section_order: base.section_order || resume.section_order || [],
      ...secMap
    };
  }, [resume]);

  if (!targetResume || !targetResume.personal_info) {
    return <div className="p-5 text-zinc-500 font-sans">Waiting for resume content data...</div>;
  }

  const [cropModalImage, setCropModalImage] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Restored after a prior refactor (commit 1c14df9) deleted these definitions
  // but left the onClick/onChangePhoto call sites below intact -- clicking
  // "Add Photo" or an existing photo threw ReferenceError: openCropModalForFile
  // (or openCropModalForExisting) is not defined, so the crop modal never opened.
  const openCropModalForFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropModalImage(reader.result);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const openCropModalForExisting = (existingUrl: string) => {
    if (!existingUrl) return;
    setCropModalImage(existingUrl);
    setIsCropModalOpen(true);
  };

  const {
    personal_info,
    summary,
    experience,
    education,
    skills,
    skills_categories,
    projects,
    certifications,
    achievements,
    languages,
    awards,
    volunteer_experience,
    publications,
    interests
  } = targetResume;

  const rawSkills = skills || resume.parsed_data?.skills || resume.technical_skills || [];
  const rawSkillCategories = skills_categories || resume.parsed_data?.skills_categories || resume.technical_skills_by_category || {};
  const hasFinalizedSkillCategories = Boolean(
    rawSkillCategories
    && !Array.isArray(rawSkillCategories)
    && Object.keys(rawSkillCategories).length
  );
  const localCategorizedSkills = categorizeSkills(rawSkills, rawSkillCategories);
  // The rule-based categorizer above is instant but bounded by its regex
  // list -- a skill it has never seen (a brand-new tool/framework name)
  // lands in "Other" no matter how comprehensive the rules get. Upgrade just
  // that leftover bucket via AI, keyed by its own contents (a stable string,
  // unlike rawSkills/rawSkillCategories which are new references most
  // renders) so this only re-fires when the actual set of unclassified
  // skills changes, not on every unrelated render.
  const otherSkillsKey = (localCategorizedSkills.Other || []).join('|');
  const [aiCategorizedSkills, setAiCategorizedSkills] = useState<Record<string, string[]> | null>(null);
  const [aiUpgradeKey, setAiUpgradeKey] = useState<string | null>(null);
  useEffect(() => {
    // The print pipeline's readiness gate (see PrintLayout.tsx's Auto-Fit
    // effect) waits on this flag + event before capturing the PDF, so the
    // export never freezes a frame with stale "Other"-bucketed skills that
    // the live preview would later show AI-recategorized.
    const markSettled = () => {
      if (typeof window === 'undefined') return;
      (window as any).__SKILLS_CATEGORIZATION_SETTLED__ = true;
      window.dispatchEvent(new Event('skillsCategorizationSettled'));
    };
    // PDF generation must be deterministic and self-contained. Waiting for a
    // second AI request here added the full /skills/categorize latency before
    // Auto-Fit could even begin (and made rendering depend on network/CORS).
    // The finalized resume already carries accepted skill categories; any
    // remaining unknown labels safely stay in the local "Other" group.
    const isPdfRendererContext = typeof window !== 'undefined'
      && Boolean((window as any).__INJECTED_RESUME_DATA__);
    if (isPdfRendererContext || hasFinalizedSkillCategories) {
      setAiCategorizedSkills(null);
      setAiUpgradeKey(null);
      markSettled();
      return undefined;
    }
    if (!otherSkillsKey) {
      markSettled();
      return undefined;
    }
    let cancelled = false;
    // window.__INJECTED_RESUME_DATA__ is only ever set by the headless
    // Playwright PDF renderer (see playwright_pdf.py's add_init_script).
    // That page is served by the SAME backend process at
    // http://127.0.0.1:$PORT/__pdf_renderer/... -- calling the public HTTPS
    // API origin from there is a needless cross-origin request that was
    // never added to CORS (confirmed in production: preflight OPTIONS
    // rejected, every AI classification silently failed). A relative path
    // resolves against that same origin instead, which the backend already
    // serves both the static renderer and /api/... from -- genuinely
    // same-origin, no CORS involved at all.
    const skillsApiUrl = getApiUrl();
    categorizeSkillsWithAI(rawSkills, rawSkillCategories, skillsApiUrl)
      .then(upgraded => {
        if (cancelled) return;
        setAiCategorizedSkills(upgraded);
        setAiUpgradeKey(otherSkillsKey);
      })
      .finally(() => {
        if (!cancelled) markSettled();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherSkillsKey, hasFinalizedSkillCategories]);
  const categorizedSkills = (aiUpgradeKey === otherSkillsKey && aiCategorizedSkills) ? aiCategorizedSkills : localCategorizedSkills;
  const rawCandidateName = personal_info?.name || personal_info?.full_name || personal_info?.candidate_name || resume?.name || resume?.full_name || (personal_info?.email ? personal_info.email.split('@')[0].replace(/[0-9_.]+/g, ' ') : '');
  const candidateName = normalizePersonName(rawCandidateName);
  const achievementRecords = normalizeDetailedRecords(achievements, 'achievement');
  const certificationRecords = normalizeDetailedRecords(certifications, 'certification');

  // Priority sequencing: Experience -> Projects -> Skills -> Education -> Achievements -> Certifications
  const defaultOrder = [
    'summary',
    'objective',
    'experience',
    'projects',
    'skills',
    'education',
    'achievements',
    'certifications',
    'volunteer',
    'publications',
    'languages',
    'awards',
    'interests',
    'open_source',
    'leadership',
    'extracurricular_activities',
    'custom_sections'
  ];
  const rawOrder = resume.section_order || resume.parsed_data?.section_order || sectionOrder;
  const requestedOrder = rawOrder && Array.isArray(rawOrder) && rawOrder.length > 0
    ? [...new Set([...rawOrder, ...defaultOrder])]
    : defaultOrder;
  const layoutModel = createResumeLayoutModel(
    { ...targetResume, section_order: requestedOrder },
    resolvedTemplateKey,
    config
  );
  const activeOrder = [...layoutModel.main_column, ...layoutModel.sidebar];

  const hasData = (sectionId: string): boolean => {
    switch (sectionId) {
      case 'summary':
        return !!summary && typeof summary === 'string' && summary.trim() !== '';
      case 'experience':
        return Array.isArray(experience) && experience.filter(item => item && (item.role || item.title || item.company || item.description || typeof item === 'string')).length > 0;
      case 'projects':
        return Array.isArray(projects) && projects.filter(item => item && (item.name || item.title || item.description || typeof item === 'string')).length > 0;
      case 'education':
        return Array.isArray(education) && education.filter(item => item && (item.degree || item.institution || item.school || typeof item === 'string')).length > 0;
      case 'skills':
        return (!!categorizedSkills && Object.keys(categorizedSkills).length > 0) || (Array.isArray(rawSkills) && rawSkills.length > 0);
      case 'certifications':
        // Was also OR'd with a raw-array truthy/typeof check on `certifications`
        // -- a whitespace-only string item (e.g. "   ") is a non-empty,
        // truthy JS string, so `typeof item === 'string'` alone let it count
        // as "has data" here even though normalizeDetailedRecords trims it
        // to an empty title+description and drops it entirely. That made
        // this check say "yes, render certifications" while the actual
        // render loop below (which maps over certificationRecords) had
        // nothing to render, producing a heading-less/marker-less section
        // that then failed the backend PDF renderer's DOM validation as a
        // "missing section". certificationRecords is normalized with the
        // exact same rules used to render it, so checking only that can
        // never diverge from what actually appears in the DOM.
        return Array.isArray(certificationRecords) && certificationRecords.length > 0;
      case 'achievements':
        // Same class of bug as certifications above, confirmed live
        // (2026-08-08): PDF rendering failed with "Missing sections in
        // rendered HTML DOM: achievements" because this check could pass on
        // achievement data normalizeDetailedRecords considered empty.
        return Array.isArray(achievementRecords) && achievementRecords.length > 0;
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

  // Helper to extract clean contact list with SVG icons & professional display labels
  const getContactItems = () => {
    const iconFor = (type: string) => ({
      linkedin: <Linkedin size={11} className="shrink-0" />,
      github: <Github size={11} className="shrink-0" />,
      code: <Code2 size={11} className="shrink-0" />,
      folder: <Folder size={11} className="shrink-0" />,
      website: <Globe size={11} className="shrink-0" />
    }[type] || <Globe size={11} className="shrink-0" />);

    const linkedItem = (key: string, val: any) => {
      const presentation = professionalLink(key, String(val || ''));
      return { key, val: String(val || ''), display: presentation.label, icon: iconFor(presentation.type) };
    };

    const seenContactValues = new Set<string>();
    const candidates = [
      { key: 'phone', val: personal_info.phone, display: personal_info.phone, icon: <Phone size={11} className="shrink-0" /> },
      { key: 'email', val: personal_info.email, display: personal_info.email, icon: <Mail size={11} className="shrink-0" /> },
      { key: 'location', val: personal_info.location, display: personal_info.location, icon: <MapPin size={11} className="shrink-0" /> },
      ...(personal_info.github ? [linkedItem('github', personal_info.github)] : []),
      ...(personal_info.linkedin ? [linkedItem('linkedin', personal_info.linkedin)] : []),
      ...(personal_info.website || personal_info.portfolio ? [linkedItem('website', personal_info.website || personal_info.portfolio)] : []),
      ...(resume.candidate_links || resume.profile_links || [])
        .filter((link: any) => link.owner_type === 'candidate' && link.validation_status === 'VALID')
        .map((link: any) => linkedItem(link.platform, link.normalized_url || link.url))
    ].filter(item => {
      if (!item.val) return false;
      const identity = canonicalContactIdentity(item.key, item.val);
      if (seenContactValues.has(identity)) return false;
      seenContactValues.add(identity);
      return true;
    });
    const hidden = new Set(layoutModel.hidden_components || []);
    const headerOrder = layoutModel.layout_tree?.header?.components || [];
    const componentFor = (key: string) => {
      if (['phone', 'email', 'location', 'linkedin', 'github', 'portfolio', 'x'].includes(key)) return key;
      return 'other_links';
    };
    const orderIndex = (key: string) => {
      const index = headerOrder.indexOf(componentFor(key));
      return index < 0 ? headerOrder.length : index;
    };
    return candidates
      .filter(item => !hidden.has(componentFor(item.key)))
      .sort((left, right) => orderIndex(left.key) - orderIndex(right.key));
  };

  // Helper to render optional photo for photo-enabled templates (or Interactive Upload Frame if photo is empty)
  const renderProfilePhoto = (sizeClass = 'w-20 h-20', extraClass = '') => {
    const isPhotoSupported = Boolean(config.profilePhoto) || /photo/i.test(resolvedTemplateKey);
    if (!isPhotoSupported || layoutModel.hidden_components?.includes('photo')) return null;

    const photoUrl = personal_info?.photo_url
      || resume?.photo_url
      || resume?.parsed_data?.personal_info?.photo_url
      || selectProfileImage(profile, user);
    const photoPositionY = personal_info?.photo_position_y ?? resume?.photo_position_y ?? 50;

    const circleSizeClass = sizeClass.includes('24')
      ? 'w-24 h-24 min-w-[96px] min-h-[96px] max-w-[96px] max-h-[96px] aspect-square rounded-full shrink-0 overflow-hidden'
      : sizeClass.includes('22')
      ? 'w-22 h-22 min-w-[88px] min-h-[88px] max-w-[88px] max-h-[88px] aspect-square rounded-full shrink-0 overflow-hidden'
      : 'w-20 h-20 min-w-[80px] min-h-[80px] max-w-[80px] max-h-[80px] aspect-square rounded-full shrink-0 overflow-hidden';

    if (photoUrl) {
      return (
        <div 
          className={`relative group ${circleSizeClass} cursor-pointer`}
          title="Click to reposition or adjust photo"
          onClick={() => openCropModalForExisting(photoUrl)}
        >
          <img 
            src={photoUrl} 
            alt={candidateName} 
            className={`w-full h-full rounded-full object-cover border-2 shadow-sm ${config.borderColor} ${extraClass}`} 
            style={{ objectPosition: `center ${photoPositionY}%` }}
          />
          {/* Hover Overlay Badge for Adjusting Photo */}
          {!isExporting && (
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white z-20">
              <Camera size={18} />
              <span className="text-[7.5px] font-black uppercase mt-0.5 tracking-tight">Adjust</span>
            </div>
          )}
        </div>
      );
    }

    if (!isExporting) {
      return (
        <div
          className={`relative group ${circleSizeClass} cursor-pointer border-2 border-dashed border-[#00bda5]/40 bg-[#00bda5]/5 hover:border-[#00bda5] hover:bg-[#00bda5]/15 transition-all flex flex-col items-center justify-center text-[#00bda5] ${extraClass}`}
          title="Click to upload profile photo"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e: any) => {
              const file = e.target?.files?.[0];
              if (file) openCropModalForFile(file);
            };
            input.click();
          }}
        >
          <Camera size={18} />
          <span className="text-[7.5px] font-extrabold uppercase mt-0.5 tracking-tight">Add Photo</span>
        </div>
      );
    }

    return null;
  };

  // Generic section renderer for common section structures across templates
  const renderSectionContent = (sectionId: string, isSidebar = false) => {
    switch (sectionId) {
      case 'summary':
        return (
          <p className="text-zinc-900 leading-relaxed" style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}>
            {renderTextWithLinks(summary)}
          </p>
        );

      case 'education':
        return (
          <div className="flex flex-col" style={{ gap: 0, lineHeight: 1.05 }}>
            {education.map((edu: any, i: number) => (
              <div key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page', lineHeight: 1.05, margin: 0, padding: 0 }}>
                <div className="flex justify-between items-baseline flex-wrap gap-x-2" style={{ fontSize: `${params.fontSize}px` }}>
                  <h3
                    className="font-bold text-zinc-950"
                    style={{ fontSize: `${params.fontSize}px`, lineHeight: 1.1 }}
                  >
                    {edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}
                  </h3>
                  <span className="text-[9.5px] font-bold uppercase shrink-0 text-zinc-700">{edu.start_date} - {edu.end_date || 'Present'}</span>
                </div>
                <div className="flex justify-between items-center text-zinc-800 font-semibold" style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: 1.05 }}>
                  <span>{edu.institution}</span>
                  {edu.location && <span className="text-zinc-600 font-normal">{edu.location}</span>}
                </div>
                {edu.gpa && <div className="text-[9.5px] text-zinc-600 leading-none">GPA: {edu.gpa}</div>}
              </div>
            ))}
          </div>
        );

      case 'experience':
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
            {experience.map((exp: any, i: number) => (
              <div key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page' }}>
                <div className="flex justify-between items-baseline flex-wrap gap-x-2" style={{ fontSize: `${params.fontSize}px` }}>
                  <h3
                    className="font-bold text-zinc-950"
                    style={{ fontSize: `${params.fontSize}px`, lineHeight: 1.1 }}
                  >
                    {exp.role}
                  </h3>
                  <span className="text-[9.5px] font-bold uppercase shrink-0 text-zinc-700">{exp.start_date} - {exp.end_date || 'Present'}</span>
                </div>
                <div className="flex justify-between items-center text-zinc-800 font-semibold mt-0.5" style={{ fontSize: `${params.fontSize - 0.5}px` }}>
                  <span>{exp.company}</span>
                  {exp.location && <span className="text-zinc-600 font-normal">{exp.location}</span>}
                </div>
                {ensureArray(exp.description).length > 0 && (
                  <ul 
                    className="list-disc pl-4 text-zinc-900 leading-relaxed"
                    style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                  >
                    {ensureArray(exp.description).map((bullet: string, j: number) => (
                      <li key={j} className="pl-0.5" style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(bullet)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );

      case 'projects':
        const isPortfolioPro = config.id === 'PortfolioPro';
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
            {projects.map((proj: any, i: number) => (
              <div 
                key={i} 
                className={`break-inside-avoid ${isPortfolioPro ? 'border-l-3 border-indigo-500 pl-3 py-1 bg-indigo-50/20 rounded-r-md' : ''}`}
                style={{ breakInside: 'avoid-page' }}
              >
                <div className="flex justify-between items-baseline flex-wrap gap-x-2" style={{ fontSize: `${params.fontSize}px` }}>
                  <h3
                    className="font-bold text-zinc-950 flex items-center gap-1.5"
                    style={{ fontSize: `${params.fontSize}px`, lineHeight: 1.1 }}
                  >
                    {proj.name}
                    {(proj.links || []).filter((link: any) =>
                      link.owner_type === 'project' && link.owner_id === proj.id
                      && link.validation_status === 'VALID'
                    ).map((link: any) => (
                      <a key={link.id || link.url} href={link.normalized_url || link.url}
                        target="_blank" rel="noopener noreferrer"
                        className="font-normal underline hover:text-indigo-600 flex items-center gap-0.5">
                        {link.display_label}<ExternalLink size={9} className="inline opacity-75" />
                      </a>
                    ))}
                  </h3>
                  {proj.role && <span className="text-[9.5px] font-bold uppercase shrink-0 text-zinc-700">{proj.role}</span>}
                </div>
                {ensureArray(proj.technology_stack).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">
                    <span className="text-[9.5px] font-semibold text-zinc-600 mr-1 self-center">Tech:</span>
                    {ensureArray(proj.technology_stack).map((tech: string, tIdx: number) => (
                      <span 
                        key={tIdx} 
                        className={isPortfolioPro 
                          ? "font-mono text-[9px] bg-indigo-100/70 text-indigo-900 px-1.5 py-0.5 rounded font-medium" 
                          : "text-[9.5px] italic text-zinc-700"
                        }
                      >
                        {tech}{!isPortfolioPro && tIdx < ensureArray(proj.technology_stack).length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                )}
                {ensureArray(proj.description).length > 0 && (
                  <ul 
                    className="list-disc pl-4 text-zinc-900 leading-relaxed"
                    style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                  >
                    {ensureArray(proj.description).map((bullet: string, j: number) => (
                      <li key={j} className="pl-0.5" style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(bullet)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );

      case 'skills': {
        const validSkillEntries = Object.entries(categorizedSkills || {}).filter(([cat, list]: any) => {
          if (!cat) return false;
          if (Array.isArray(list)) return list.filter(item => item && String(item).trim() !== '').length > 0;
          if (typeof list === 'string') return list.trim() !== '';
          return false;
        });

        if (validSkillEntries.length === 0) return null;

        if (isSidebar) {
          return (
            <div className="flex flex-col gap-1">
              {validSkillEntries.map(([cat, list]: any) => {
                const items = Array.isArray(list) 
                  ? list.filter(item => item && String(item).trim() !== '')
                  : String(list).split(',').map(s => s.trim()).filter(Boolean);
                return (
                  <div key={cat} style={{ fontSize: `${params.fontSize - 0.5}px` }}>
                    <h4 className="font-bold text-zinc-900 uppercase tracking-wider mb-1 text-[9.5px]">{cat}</h4>
                    <div className="flex flex-wrap gap-1">
                      {items.map((skill: string, idx: number) => (
                        <span 
                          key={idx} 
                          className="bg-white text-zinc-800 px-2 py-0.5 rounded text-[9.5px] font-medium border border-zinc-300 shadow-2xs"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div
            className="flex flex-col"
            style={{ gap: 0, lineHeight: 1.05, margin: 0, padding: 0 }}
          >
            {validSkillEntries.map(([cat, list]: any) => {
              const items = Array.isArray(list) 
                ? list.filter(item => item && String(item).trim() !== '')
                : String(list).split(',').map(s => s.trim()).filter(Boolean);
              return (
                <div
                  key={cat}
                  className="grid text-zinc-900"
                  style={{
                    gridTemplateColumns: '100px minmax(0, 1fr)',
                    columnGap: '8px',
                    rowGap: 0,
                    fontSize: `${params.fontSize}px`,
                    lineHeight: 1.05,
                    margin: 0,
                    padding: '1px 0'
                  }}
                >
                  <span className="font-bold capitalize">{cat}:</span>
                  <span className="font-semibold">{items.join(', ')}</span>
                </div>
              );
            })}
          </div>
        );
      }

      case 'certifications':
        return (
          <div className="flex flex-col" style={{ gap: 0, lineHeight: 1.05 }}>
            {certificationRecords.map((cert: any) => (
              <div key={cert.id} className="break-inside-avoid" style={{ breakInside: 'avoid-page', fontSize: `${params.fontSize}px`, lineHeight: 1.05, margin: 0, padding: '1px 0' }}>
                {cert.title && <div className="font-bold text-zinc-950">{cert.title}</div>}
                {(cert.organization || cert.date) && (
                  <div className="font-medium text-zinc-700 flex justify-between gap-2">
                    <span>{cert.organization}</span>
                    {cert.date && <span className="shrink-0 whitespace-nowrap">{cert.date}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case 'achievements':
        return (
          <ul className="list-disc pl-4 text-zinc-900 font-medium" style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}>
            {achievementRecords.map((ach: any) => (
              <li key={ach.id} className="break-inside-avoid" style={{ breakInside: 'avoid-page', marginBottom: `${params.bulletGap}px` }}>
                {ach.title && <span className="font-bold">{ach.title}: </span>}
                {renderTextWithLinks(ach.description)}
                {ach.url && <> <a href={linkHref('link', ach.url)} target="_blank" rel="noopener noreferrer" className="underline">Evidence</a></>}
              </li>
            ))}
            {(awards || []).map((award: any, i: number) => (
              <li key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page', marginBottom: `${params.bulletGap}px` }}>
                <span className="font-bold">{award.title}</span>
                {award.issuer && ` (Issued by ${award.issuer})`}
                {award.date && ` - ${award.date}`}
              </li>
            ))}
          </ul>
        );

      case 'volunteer':
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
            {volunteer_experience.map((vol: any, i: number) => (
              <div key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page', fontSize: `${params.fontSize}px` }}>
                <div className="flex justify-between items-baseline font-bold text-zinc-950">
                  <span>{vol.role}</span>
                  <span className="text-[9.5px] text-zinc-600 font-bold uppercase">{vol.start_date} - {vol.end_date || 'Present'}</span>
                </div>
                <div className="font-semibold text-zinc-800 mt-0.5" style={{ fontSize: `${params.fontSize - 1}px` }}>{vol.organization}</div>
                {ensureArray(vol.description).length > 0 && (
                  <ul className="list-disc pl-4 text-zinc-900 font-medium mt-1" style={{ lineHeight: params.lineHeight }}>
                    {ensureArray(vol.description).map((b: string, j: number) => (
                      <li key={j} style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(b)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );

      case 'publications':
      case 'research_publications': {
        const pubs = ensureArray(publications || resume.research_publications || resume.publications);
        if (pubs.length === 0) return null;
        return (
          <div className="flex flex-col gap-1.5">
            {pubs.map((pub: any, i: number) => {
              const title = typeof pub === 'string' ? pub : pub.title || pub.name;
              const journal = typeof pub === 'object' ? pub.journal || pub.publisher : '';
              const issn = typeof pub === 'object' ? pub.issn : '';
              const date = typeof pub === 'object' ? pub.date || pub.month_year || pub.year : '';
              const url = typeof pub === 'object' ? pub.url || pub.link : '';
              return (
                <div key={i} className="break-inside-avoid text-zinc-900 font-medium" style={{ breakInside: 'avoid-page', fontSize: `${params.fontSize}px` }}>
                  <span className="font-bold text-zinc-950">{title}</span>
                  {journal && <span className="italic">, {journal}</span>}
                  {issn && <span className="text-zinc-700"> (ISSN: {issn})</span>}
                  {date && <span className="text-zinc-600 font-semibold float-right uppercase text-[9.5px]"> {date}</span>}
                  {url && <div className="text-[9.5px]">{renderTextWithLinks(url)}</div>}
                </div>
              );
            })}
          </div>
        );
      }

      case 'internships':
      case 'trainings': {
        const items = ensureArray(resume.internships || resume.trainings);
        if (items.length === 0) return null;
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
            {items.map((item: any, i: number) => {
              const title = typeof item === 'string' ? item : item.role || item.title || item.name;
              const org = typeof item === 'object' ? item.company || item.organization || item.institution || item.industry : '';
              const date = typeof item === 'object' ? (item.start_date ? `${item.start_date} - ${item.end_date || 'Present'}` : item.date || item.duration) : '';
              return (
                <div key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page' }}>
                  <div className="flex justify-between items-baseline flex-wrap gap-x-2" style={{ fontSize: `${params.fontSize}px` }}>
                    <h3 className="font-bold text-zinc-950" style={{ fontSize: `${params.fontSize}px`, lineHeight: 1.1 }}>
                      {title}
                    </h3>
                    {date && (
                      <span className="text-[9.5px] font-bold uppercase shrink-0 text-zinc-700">{date}</span>
                    )}
                  </div>
                  {org && (
                    <div className="font-semibold text-zinc-800 italic mt-0.5" style={{ fontSize: `${params.fontSize - 0.5}px` }}>
                      {org}
                    </div>
                  )}
                  {typeof item === 'object' && ensureArray(item.description).length > 0 && (
                    <ul className="list-disc pl-4 text-zinc-900 leading-relaxed" style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}>
                      {ensureArray(item.description).map((bullet: string, j: number) => (
                        <li key={j} style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(bullet)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'leadership':
      case 'positions_of_responsibility':
      case 'position_of_responsibility': {
        const items = ensureArray(resume.leadership || resume.positions_of_responsibility || resume.position_of_responsibility);
        if (items.length === 0) return null;
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
            {items.map((item: any, i: number) => {
              const title = typeof item === 'string' ? item : item.role || item.position || item.title;
              const org = typeof item === 'object' ? item.organization || item.company || item.institution || item.club : '';
              const date = typeof item === 'object' ? (item.start_date ? `${item.start_date} - ${item.end_date || 'Present'}` : item.date || item.duration) : '';
              return (
                <div key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page' }}>
                  <div className="flex justify-between items-baseline flex-wrap gap-x-2" style={{ fontSize: `${params.fontSize}px` }}>
                    <h3 className="font-bold text-zinc-950" style={{ fontSize: `${params.fontSize}px`, lineHeight: 1.1 }}>
                      {title}
                    </h3>
                    {date && (
                      <span className="text-[9.5px] font-bold uppercase shrink-0 text-zinc-700">{date}</span>
                    )}
                  </div>
                  {org && (
                    <div className="font-semibold text-zinc-800 italic mt-0.5" style={{ fontSize: `${params.fontSize - 0.5}px` }}>
                      {org}
                    </div>
                  )}
                  {typeof item === 'object' && ensureArray(item.description).length > 0 && (
                    <ul className="list-disc pl-4 text-zinc-900 leading-relaxed" style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}>
                      {ensureArray(item.description).map((bullet: string, j: number) => (
                        <li key={j} style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(bullet)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'extracurricular_activities':
      case 'extracurricular': {
        const items = ensureArray(resume.extracurricular_activities || resume.extracurricular);
        if (items.length === 0) return null;
        return (
          <ul className="list-disc pl-4 text-zinc-900 font-medium" style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}>
            {items.map((item: any, i: number) => {
              const text = typeof item === 'string' ? item : item.title || item.name || item.activity || item.description;
              const date = typeof item === 'object' ? item.date || item.year : null;
              return (
                <li key={i} className="break-inside-avoid" style={{ breakInside: 'avoid-page', marginBottom: `${params.bulletGap}px` }}>
                  <span className="font-semibold">{renderTextWithLinks(text)}</span>
                  {date && <span className="text-zinc-600 text-[9.5px] float-right uppercase font-bold">{date}</span>}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'declaration': {
        const text = String(resume.declaration || resume.declaration_text || '').trim();
        if (!text) return null;
        return (
          <p className="text-zinc-900 font-normal leading-relaxed pt-0.5" style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}>
            {renderTextWithLinks(text)}
          </p>
        );
      }

      case 'languages':
        return (
          <div className="flex flex-wrap gap-1.5">
            {languages.map((lang: any, i: number) => (
              <span key={i} className="bg-zinc-100 border border-zinc-300 px-2 py-0.5 rounded font-semibold text-zinc-800 text-[9.5px]">
                {lang.language} {lang.proficiency ? `(${lang.proficiency})` : ''}
              </span>
            ))}
          </div>
        );

      case 'interests':
        return (
          <div className="text-zinc-900 font-medium capitalize" style={{ fontSize: `${params.fontSize}px` }}>
            {interests.join(', ')}
          </div>
        );

      default:
        const content = resume[sectionId];
        const items = Array.isArray(content) ? content : [content];
        return (
          <div className="flex flex-col" style={{ gap: `${params.itemGap}px`, fontSize: `${params.fontSize}px` }}>
            {items.map((item: any, index: number) => (
              <div key={index} className="break-inside-avoid" style={{ breakInside: 'avoid-page' }}>
                {renderScalar(item, sectionId)}
              </div>
            ))}
          </div>
        );
    }
  };

  // =========================================================================
  // RENDERER 1: CLASSIC ATS (NO PHOTO)
  // =========================================================================
  const renderClassicATSLayout = () => {
    const contacts = getContactItems();
    return (
      <div 
        data-resume-layout="single-column"
        className="resume-document-light font-sans bg-white text-zinc-900"
        style={{ width: '816px', minHeight: '1056px', padding: `${params.paddingY}px ${params.paddingX}px`, fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}
      >
        {/* Centered Header for Classic ATS */}
        <header className="border-b border-zinc-400 pb-2 mb-1 text-center">
          <h1 className="font-extrabold uppercase text-zinc-950 tracking-tight leading-none" style={{ fontSize: `${params.nameSize}px` }}>
            {candidateName}
          </h1>
          {(personal_info.job_title || personal_info.title) && (
            <div className="font-bold text-zinc-700 uppercase tracking-wider mt-1" style={{ fontSize: `${params.fontSize + 1}px` }}>
              {personal_info.job_title || personal_info.title}
            </div>
          )}
          {/* Contact Strip */}
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-zinc-800 font-semibold mt-2 text-[10px]">
            {contacts.map((item, i) => (
              <a key={i} href={item.key === 'location' ? undefined : linkHref(item.key, item.val)} className="flex items-center gap-1 hover:underline">
                <span className="text-zinc-700">{item.icon}</span>
                <span>{item.display}</span>
              </a>
            ))}
          </div>
        </header>

        {/* Single Column Sections */}
        <div className="flex flex-col">
          {activeOrder.map(sectionId => {
            if (!hasData(sectionId)) return null;
            return (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
                <h2 
                  className="font-bold uppercase tracking-wider text-zinc-900 border-b border-zinc-400 pb-0.5 mb-1"
                  style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, false)}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 2: EXECUTIVE ATS (NO PHOTO)
  // =========================================================================
  const renderExecutiveATSLayout = () => {
    const contacts = getContactItems();
    return (
      <div 
        data-resume-layout="single-column"
        className="resume-document-light font-serif bg-white text-zinc-900"
        style={{ width: '816px', minHeight: '1056px', padding: `${params.paddingY + 8}px ${params.paddingX + 8}px`, fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}
      >
        {/* Centered Executive Header */}
        <header className="text-center mb-1">
          <h1 className="font-extrabold text-zinc-950 uppercase tracking-wider leading-tight" style={{ fontSize: `${params.nameSize + 2}px` }}>
            {candidateName}
          </h1>
          {(personal_info.job_title || personal_info.title) && (
            <div className="font-semibold text-zinc-800 uppercase tracking-widest mt-1 text-[11px]">
              {personal_info.job_title || personal_info.title}
            </div>
          )}
          {/* Double Horizontal Accent Border */}
          <div className="border-y-2 border-zinc-800 py-2.5 my-3 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 font-sans font-semibold text-zinc-800 text-[9.5px]">
            {contacts.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-zinc-400 select-none">·</span>}
                <a href={item.key === 'location' ? undefined : linkHref(item.key, item.val)} className="flex items-center gap-1 hover:underline">
                  <span className="text-zinc-700">{item.icon}</span>
                  <span>{item.display}</span>
                </a>
              </React.Fragment>
            ))}
          </div>
        </header>

        {/* Single Column Executive Sections */}
        <div className="flex flex-col">
          {activeOrder.map(sectionId => {
            if (!hasData(sectionId)) return null;
            return (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap + 2}px` }}>
                <h2 
                  className="font-extrabold uppercase tracking-wider text-zinc-950 border-b-2 border-zinc-800 pb-1 mb-1 font-serif"
                  style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                <div className="font-sans">
                  {renderSectionContent(sectionId, false)}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 3: MODERN SIDEBAR (PHOTO OPTIONAL)
  // =========================================================================
  const renderModernSidebarLayout = () => {
    const contacts = getContactItems();
    const sidebarList = layoutModel.sidebar.filter(s => hasData(s));
    const mainList = layoutModel.main_column.filter(s => hasData(s));

    return (
      <div 
        data-resume-layout="sidebar"
        className="resume-document-light font-sans bg-white text-zinc-900 flex flex-row items-stretch min-h-[1056px] box-border"
        style={{ width: '816px', height: '1056px', minHeight: '1056px', lineHeight: params.lineHeight }}
      >
        {/* Left Sidebar */}
        <div className="w-[32%] bg-slate-50 border-r border-slate-200 p-6 flex flex-col shrink-0 self-stretch">
          {/* Optional Photo */}
          {config.profilePhoto && (
            <div className="flex justify-center mb-2">
              {renderProfilePhoto('w-24 h-24', 'shadow-md')}
            </div>
          )}

          {/* Header Info in Sidebar */}
          <div className="mb-1 pb-2 border-b border-slate-200">
            <h1 className="font-extrabold text-slate-950 uppercase leading-tight tracking-tight text-xl">
              {candidateName}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div className="font-bold text-slate-700 uppercase tracking-wider mt-1 text-[10px]">
                {personal_info.job_title || personal_info.title}
              </div>
            )}
          </div>

          {/* Contact Details Vertical */}
          <div
            className="flex flex-col mb-1 font-semibold text-slate-800 text-[9.5px]"
            style={{ gap: '3px', lineHeight: 1.05 }}
          >
            {contacts.map((item, i) => (
              <a key={i} href={item.key === 'location' ? undefined : linkHref(item.key, item.val)} className="flex items-center gap-2 hover:underline truncate">
                <span className="text-slate-600">{item.icon}</span>
                <span className="truncate">{item.display}</span>
              </a>
            ))}
          </div>

          {/* Sidebar Sections */}
          <div className="flex flex-col" style={{ gap: `${params.sectionGap}px` }}>
            {sidebarList.map(sectionId => (
              <section key={sectionId} data-section={sectionId}>
                <h2 
                  className="font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-1 text-[11px]"
                  style={{ breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, true)}
              </section>
            ))}
          </div>
        </div>

        {/* Main Column */}
        <div className="flex-1 p-8 flex flex-col">
          {mainList.map(sectionId => (
            <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
              <h2 
                className="font-extrabold uppercase tracking-wider text-slate-900 border-l-4 border-slate-800 pl-2 mb-1 text-xs"
                style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
              >
                {sectionLabel(sectionId)}
              </h2>
              {renderSectionContent(sectionId, false)}
            </section>
          ))}
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 4: PORTFOLIO PRO (PHOTO OPTIONAL)
  // =========================================================================
  const renderPortfolioProLayout = () => {
    const contacts = getContactItems();
    return (
      <div 
        data-resume-layout="single-column"
        className="resume-document-light font-sans bg-white text-zinc-900"
        style={{ width: '816px', minHeight: '1056px', padding: `${params.paddingY}px ${params.paddingX}px`, fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}
      >
        {/* Tech Hero Header */}
        <header className="border-b-2 border-indigo-500 pb-2 mb-1 flex justify-between items-center gap-4">
          <div className="flex-1">
            <h1 className="font-extrabold text-indigo-950 uppercase tracking-tight leading-none" style={{ fontSize: `${params.nameSize + 2}px` }}>
              {candidateName}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div className="font-bold text-indigo-600 uppercase tracking-widest mt-1.5" style={{ fontSize: `${params.fontSize + 1}px` }}>
                {personal_info.job_title || personal_info.title}
              </div>
            )}
            {/* Highlighted Social & Link Badges */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {contacts.map((item, i) => (
                <a 
                  key={i} 
                  href={item.key === 'location' ? undefined : linkHref(item.key, item.val)}
                  className="bg-indigo-50 border border-indigo-200/80 text-indigo-950 px-2.5 py-1 rounded-md font-semibold text-[9.5px] flex items-center gap-1.5 hover:bg-indigo-100 transition-colors shadow-2xs"
                >
                  <span className="text-indigo-600">{item.icon}</span>
                  <span>{item.display}</span>
                </a>
              ))}
            </div>
          </div>
          {/* Optional Photo in Hero */}
          {config.profilePhoto && renderProfilePhoto('w-22 h-22', 'border-indigo-400')}
        </header>

        {/* Portfolio Pro Sections */}
        <div className="flex flex-col">
          {activeOrder.map(sectionId => {
            if (!hasData(sectionId)) return null;
            return (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
                <h2 
                  className="font-black uppercase tracking-wide text-indigo-950 border-b border-zinc-200 pb-1 mb-1"
                  style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, false)}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 5: EUROPEAN MODERN (PHOTO OPTIONAL)
  // =========================================================================
  const renderEuropeanModernLayout = () => {
    const contacts = getContactItems();
    return (
      <div 
        data-resume-layout="sidebar"
        className="resume-document-light font-sans bg-white text-zinc-900 min-h-[1056px]"
        style={{ width: '816px', lineHeight: params.lineHeight }}
      >
        {/* Left Accent Banner Header */}
        <header className="bg-zinc-900 text-white p-4 mb-1 flex justify-between items-center gap-2">
          <div className="flex-1">
            <h1 className="font-extrabold text-white uppercase tracking-tight text-2xl leading-tight">
              {candidateName}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div className="font-bold text-zinc-300 uppercase tracking-widest mt-1 text-[11px]">
                {personal_info.job_title || personal_info.title}
              </div>
            )}
            {/* Contact Strip */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-zinc-300 font-medium text-[9.5px]">
              {contacts.map((item, i) => (
                <a key={i} href={item.key === 'location' ? undefined : linkHref(item.key, item.val)} className="flex items-center gap-1 hover:text-white">
                  <span className="text-zinc-400">{item.icon}</span>
                  <span>{item.display}</span>
                </a>
              ))}
            </div>
          </div>
          {/* Optional Photo in Banner */}
          {config.profilePhoto && renderProfilePhoto('w-20 h-20', 'border-white/80')}
        </header>

        {/* Content Body */}
        <div className="px-8 pb-8 flex flex-col">
          {activeOrder.map(sectionId => {
            if (!hasData(sectionId)) return null;
            return (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
                <h2 
                  className="font-bold uppercase tracking-wider text-zinc-900 border-b border-zinc-300 pb-0.5 mb-1"
                  style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, false)}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 6: PREMIUM EXECUTIVE (PHOTO OPTIONAL)
  // =========================================================================
  const renderPremiumExecutiveLayout = () => {
    const contacts = getContactItems();
    const sidebarList = layoutModel.sidebar.filter(s => hasData(s));
    const mainList = layoutModel.main_column.filter(s => hasData(s));

    return (
      <div 
        data-resume-layout="two-column"
        className="resume-document-light font-serif bg-white text-zinc-900 p-8 min-h-[1056px] flex flex-col justify-between box-border"
        style={{ width: '816px', height: '1056px', minHeight: '1056px', lineHeight: params.lineHeight }}
      >
        {/* Executive Header */}
        <header className="border-b-2 border-amber-900/30 pb-2 mb-1 flex justify-between items-center gap-4">
          <div className="flex-1">
            <h1 className="font-black uppercase tracking-tight text-zinc-950 leading-tight" style={{ fontSize: `${params.nameSize + 2}px` }}>
              {candidateName}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div className="font-bold text-amber-900 uppercase tracking-widest mt-1 text-[11px]">
                {personal_info.job_title || personal_info.title}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 font-sans font-semibold text-zinc-800 text-[9.5px]">
              {contacts.map((item, i) => (
                <a key={i} href={item.key === 'location' ? undefined : linkHref(item.key, item.val)} className="flex items-center gap-1 hover:underline">
                  <span className="text-amber-900">{item.icon}</span>
                  <span>{item.display}</span>
                </a>
              ))}
            </div>
          </div>
          {/* Optional Photo */}
          {config.profilePhoto && renderProfilePhoto('w-22 h-22', 'border-amber-900/40')}
        </header>

        {/* Executive 2-Column Split */}
        <div className="flex gap-7 font-sans flex-1 items-stretch mt-2">
          {/* Main Column */}
          <div className="flex-1 flex flex-col">
            {mainList.map(sectionId => (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
                <h2 
                  className="font-serif font-extrabold uppercase tracking-wider text-amber-950 border-b border-amber-900/30 pb-0.5 mb-1"
                  style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, false)}
              </section>
            ))}
          </div>

          {/* Divider */}
          <div className="border-r border-zinc-200 shrink-0 self-stretch"></div>

          {/* Executive Sidebar Column */}
          <div className="w-[33%] flex flex-col shrink-0 self-stretch">
            {sidebarList.map(sectionId => (
              <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
                <h2 
                  className="font-serif font-extrabold uppercase tracking-wider text-amber-950 border-b border-amber-900/30 pb-0.5 mb-1 text-[11px]"
                  style={{ breakAfter: 'avoid-page' }}
                >
                  {sectionLabel(sectionId)}
                </h2>
                {renderSectionContent(sectionId, true)}
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDERER 7: JOHNSON'S RESUME (ELEGANT SERIF & STEEL BLUE HEADER)
  // =========================================================================
  const renderJohnsonsSectionContent = (sectionId: string) => {
    if (sectionId === 'summary') {
      return (
        <p className="font-serif text-zinc-900 text-[11.5px] leading-relaxed italic">
          {summary}
        </p>
      );
    }

    if (sectionId === 'education') {
      return (
        <div className="space-y-2.5">
          {(education || []).map((edu: any, idx: number) => (
            <div key={idx} className="space-y-0.5 font-serif text-[11.5px]">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{edu.degree || edu.institution || edu.school}</span>
                <span className="italic text-zinc-800 text-[11px]">{edu.institution || edu.school}</span>
              </div>
              <div className="flex justify-between items-baseline font-serif italic text-zinc-700 text-[11px]">
                <span>{edu.field_of_study || edu.degree_type || edu.area || ''}</span>
                <span>{edu.start_date && edu.end_date ? `${edu.start_date} - ${edu.end_date}` : (edu.dates || edu.year || '')}</span>
              </div>
              {edu.honors && <div className="italic text-zinc-700 text-[10.5px]">Graduated with honors: {edu.honors}</div>}
              {edu.gpa && <div className="italic text-zinc-700 text-[10.5px]">Final grade: {edu.gpa}</div>}
              {edu.thesis && <div className="italic text-zinc-700 text-[10.5px]">Thesis title: {edu.thesis}</div>}
              {edu.description && Array.isArray(edu.description) && edu.description.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 mt-1 text-zinc-800 text-[11px]">
                  {edu.description.map((bullet: string, bIdx: number) => <li key={bIdx}>{bullet}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'experience') {
      return (
        <div className="space-y-3">
          {(experience || []).map((exp: any, idx: number) => (
            <div key={idx} className="space-y-0.5 font-serif text-[11.5px]">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{exp.company || exp.organization}</span>
                <span className="italic text-zinc-800 text-[11px]">{exp.start_date} - {exp.end_date || 'Present'}</span>
              </div>
              <div className="flex justify-between items-baseline font-serif italic text-zinc-700 text-[11px]">
                <span>{exp.role || exp.title}</span>
                <span>{exp.location}</span>
              </div>
              {exp.description && Array.isArray(exp.description) && exp.description.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 mt-1 text-zinc-800 text-[11px]">
                  {exp.description.map((bullet: string, bIdx: number) => (
                    <li key={bIdx} className="leading-normal">{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'volunteer') {
      return (
        <div className="space-y-2.5">
          {(volunteer_experience || []).map((vol: any, idx: number) => (
            <div key={idx} className="space-y-0.5 font-serif text-[11.5px]">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{vol.organization || vol.role}</span>
                <span className="italic text-zinc-800 text-[11px]">{vol.start_date} - {vol.end_date || 'Present'}</span>
              </div>
              <div className="flex justify-between items-baseline font-serif italic text-zinc-700 text-[11px]">
                <span>{vol.role || vol.title}</span>
                <span>{vol.location}</span>
              </div>
              {vol.description && Array.isArray(vol.description) && vol.description.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 mt-1 text-zinc-800 text-[11px]">
                  {vol.description.map((bullet: string, bIdx: number) => <li key={bIdx}>{bullet}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'skills') {
      const skillEntries = Array.isArray(categorizedSkills)
        ? categorizedSkills
        : Object.entries(categorizedSkills || {}).map(([title, skillsList]) => ({
            title,
            skills: Array.isArray(skillsList) ? skillsList : [skillsList]
          }));

      if (skillEntries.length === 0 && skills) {
        const rawList = Array.isArray(skills) ? skills : [skills];
        skillEntries.push({ title: 'Skills', skills: rawList });
      }

      return (
        <div className="space-y-1.5 font-serif text-[11.5px]">
          {skillEntries.map((cat: any, idx: number) => (
            <div key={idx} className="flex flex-row items-baseline gap-4">
              <div className="w-48 shrink-0 font-bold text-zinc-950 text-[11.5px]">
                {cat.title || cat.category || cat.name || 'Skills'}
              </div>
              <div className="flex-1 text-zinc-800 text-[11.5px]">
                {Array.isArray(cat.skills)
                  ? cat.skills.join(', ')
                  : String(cat.skills || cat.name || '')}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'languages') {
      return (
        <div className="space-y-1.5 font-serif text-[11.5px]">
          {(languages || []).map((lang: any, idx: number) => (
            <div key={idx} className="flex flex-row items-baseline gap-4">
              <div className="w-48 shrink-0 font-bold text-zinc-950 text-[11.5px]">
                {typeof lang === 'string' ? lang : (lang.language || lang.name)}
              </div>
              <div className="flex-1 italic text-zinc-800 text-[11.5px]">
                {typeof lang === 'object' ? (lang.proficiency || lang.level || '') : ''}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'projects') {
      return (
        <div className="space-y-2">
          {(projects || []).map((proj: any, idx: number) => (
            <div key={idx} className="space-y-0.5 font-serif text-[11.5px]">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{proj.name || proj.title}</span>
                <span className="italic text-zinc-800 text-[11px]">{proj.date || proj.dates || ''}</span>
              </div>
              {proj.technologies && (
                <div className="italic text-zinc-700 text-[10.5px]">
                  Technologies: {Array.isArray(proj.technologies) ? proj.technologies.join(', ') : proj.technologies}
                </div>
              )}
              {proj.description && Array.isArray(proj.description) && proj.description.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 mt-1 text-zinc-800 text-[11px]">
                  {proj.description.map((bullet: string, bIdx: number) => <li key={bIdx}>{bullet}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'certifications') {
      return (
        <div className="space-y-2 font-serif text-[11.5px]">
          {(certificationRecords || []).map((cert: any, idx: number) => {
            const isStr = typeof cert === 'string';
            const name = isStr ? cert : (cert.title || cert.name || '');
            const issuer = isStr ? '' : (cert.issuer || cert.authority || cert.organization || cert.issuing_organization || cert.publisher || '');
            const date = isStr ? '' : (cert.date || cert.year || cert.issued_date || cert.issue_date || cert.dates || cert.start_date || cert.end_date || cert.period || '');
            const meta = [issuer, date].filter(Boolean).join(' · ');
            return (
              <div key={idx} className="flex justify-between items-baseline gap-2 break-inside-avoid">
                <span className="font-bold text-zinc-950 flex-1">{name}</span>
                {meta && (
                  <span className="italic text-zinc-700 text-[10.5px] text-right shrink-0 whitespace-nowrap ml-2">{meta}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (sectionId === 'achievements') {
      return (
        <div className="space-y-2 font-serif text-[11.5px]">
          {(achievementRecords || []).map((ach: any, idx: number) => {
            const isStr = typeof ach === 'string';
            const name = isStr ? ach : (ach.title || ach.name || '');
            const detail = isStr ? '' : (ach.description || ach.summary || ach.detail || '');
            const date = isStr ? '' : (ach.date || ach.year || ach.issued_date || ach.dates || '');
            const meta = [detail, date].filter(Boolean).join(' · ');
            return (
              <div key={idx} className="flex justify-between items-baseline gap-2 break-inside-avoid">
                <span className="font-bold text-zinc-950 flex-1">{name}</span>
                {meta && (
                  <span className="italic text-zinc-700 text-[10.5px] text-right shrink-0 whitespace-nowrap ml-2">{meta}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return renderSectionContent(sectionId, false);
  };

  let renderedLayoutContent: React.ReactElement;
  if (resolvedTemplateKey === 'AcademicATS' || resolvedTemplateKey === 'academic_ats' || resolvedTemplateKey === 'DeedyAcademic') {
    renderedLayoutContent = (
      <AcademicATSTemplate
        resume={targetResume}
        params={params}
        contacts={getContactItems()}
        candidateName={candidateName}
        activeOrder={activeOrder}
      />
    );
  } else if (resolvedTemplateKey === 'JohnsonsResume' || resolvedTemplateKey === 'johnsons_resume' || resolvedTemplateKey === 'Johnsons') {
    renderedLayoutContent = (
      <JohnsonsATSTemplate
        resume={targetResume}
        params={params}
        candidateName={candidateName}
        activeOrder={activeOrder}
      />
    );
  } else if (resolvedTemplateKey === 'ClassicATS' || resolvedTemplateKey === 'MinimalATS' || resolvedTemplateKey === 'ProfessionalATS' || resolvedTemplateKey === 'ExecutiveATS') {
    renderedLayoutContent = renderClassicATSLayout();
  } else if (resolvedTemplateKey === 'ModernSidebar') {
    renderedLayoutContent = renderModernSidebarLayout();
  } else if (resolvedTemplateKey === 'PortfolioPro' || resolvedTemplateKey === 'PortfolioPhotoATS' || resolvedTemplateKey === 'ModernProATS') {
    renderedLayoutContent = renderPortfolioProLayout();
  } else if (resolvedTemplateKey === 'EuropeanModern') {
    renderedLayoutContent = renderEuropeanModernLayout();
  } else if (resolvedTemplateKey === 'PremiumExecutive' || resolvedTemplateKey === 'MarissaATS' || resolvedTemplateKey === 'TwoColumnATS' || resolvedTemplateKey === 'ModernATS' || resolvedTemplateKey === 'EuropeanPhotoATS' || resolvedTemplateKey === 'AltaATS') {
    renderedLayoutContent = renderPremiumExecutiveLayout();
  } else {
    renderedLayoutContent = renderClassicATSLayout();
  }

  return (
    <>
      {renderedLayoutContent}
      {!disablePhotoModal && (
        <ProfilePhotoCropModal
          isOpen={isCropModalOpen}
          imageSrc={cropModalImage}
          onClose={() => setIsCropModalOpen(false)}
          onApply={(croppedUrl) => {
            if (personal_info) personal_info.photo_url = croppedUrl;
            resume.photo_url = croppedUrl;
            window.dispatchEvent(new CustomEvent('resume_photo_updated', { 
              detail: { photo_url: croppedUrl, photo_position_y: 50 } 
            }));
            setIsCropModalOpen(false);
          }}
          onDelete={() => {
            if (personal_info) personal_info.photo_url = '';
            resume.photo_url = '';
            window.dispatchEvent(new CustomEvent('resume_photo_updated', { detail: { photo_url: '' } }));
            setIsCropModalOpen(false);
          }}
          onChangePhoto={(file) => openCropModalForFile(file)}
        />
      )}
    </>
  );
}
