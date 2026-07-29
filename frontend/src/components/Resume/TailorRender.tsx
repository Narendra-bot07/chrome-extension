import React, { useEffect } from 'react';
import { 
  Mail, Phone, MapPin, Linkedin, Github, Globe, Code2, Folder, 
  ExternalLink, Award, Briefcase, GraduationCap, Star, BookOpen 
} from 'lucide-react';
import { categorizeSkills } from '../../utils/skillCategorizer';
import {
  canonicalContactIdentity,
  normalizeDetailedRecords,
  normalizePersonName,
  professionalLink
} from '../../utils/resumePresentation';
import { TEMPLATE_CONFIGS, TemplateConfig } from '../../templates/templates_config';
import { createResumeLayoutModel } from '../../utils/resumeLayoutModel';

const sectionLabel = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

const linkHref = (kind: string, value: string) => {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (kind === 'email') return clean.startsWith('mailto:') ? clean : `mailto:${clean}`;
  if (kind === 'phone') return clean.startsWith('tel:') ? clean : `tel:${clean.replace(/[^\d+]/g, '')}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(clean)) return clean;
  return `https://${clean.replace(/^\/+/, '')}`;
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
  const t = Math.max(0, Math.min(10, level)) / 10;
  return {
    paddingX: Math.round(32 + (56 - 32) * t),
    paddingY: Math.round(20 + (50 - 20) * t),
    // Keep exactly one compact visual line between major sections. Fields and
    // records inside each section remain tightly packed.
    sectionGap: Math.round(8 + (10 - 8) * t),
    itemGap: Math.round(0 + (2 - 0) * t),
    bulletGap: 0,
    lineHeight: 1.15 + (1.32 - 1.15) * t,
    fontSize: 9.0 + (11.5 - 9.0) * t,
    nameSize: Math.round(20 + (32 - 20) * t),
    sectionTitleSize: Math.round(11 + (15 - 11) * t)
  };
}

interface TailorRenderProps {
  resume: any;
  templateName: string;
  sectionOrder?: string[];
  layoutLevel?: number;
}

export default function TailorRender({ resume, templateName, sectionOrder, layoutLevel = 5 }: TailorRenderProps) {
  const resolvedTemplateKey = TEMPLATE_CONFIGS[templateName] ? templateName : 'ExecutiveATS';
  const config: TemplateConfig = TEMPLATE_CONFIGS[resolvedTemplateKey];
  const params = getParamsForLevel(layoutLevel);

  useEffect(() => {
    console.log(`--- TailorRender Engine: Compiling ${resolvedTemplateKey} at layout level ${layoutLevel} ---`);
  }, [layoutLevel, resolvedTemplateKey]);

  if (!resume || !resume.personal_info) {
    return <div className="p-5 text-zinc-500 font-sans">Waiting for resume content data...</div>;
  }

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
  } = resume;

  const categorizedSkills = categorizeSkills(skills, skills_categories);
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

  const requestedOrder = resume.section_order || sectionOrder || defaultOrder;
  const layoutModel = createResumeLayoutModel(
    { ...resume, section_order: requestedOrder },
    resolvedTemplateKey,
    config
  );
  const activeOrder = [...layoutModel.main_column, ...layoutModel.sidebar];

  const hasData = (sectionId: string): boolean => {
    switch (sectionId) {
      case 'summary':
        return !!summary && summary.trim() !== '';
      case 'experience':
        return experience && experience.length > 0;
      case 'projects':
        return projects && projects.length > 0;
      case 'education':
        return education && education.length > 0;
      case 'skills':
        return !!categorizedSkills && Object.keys(categorizedSkills).length > 0;
      case 'certifications':
        return certifications && certifications.length > 0;
      case 'achievements':
        return achievements && achievements.length > 0;
      case 'volunteer':
        return volunteer_experience && volunteer_experience.length > 0;
      case 'publications':
        return publications && publications.length > 0;
      case 'languages':
        return languages && languages.length > 0;
      case 'awards':
        return awards && awards.length > 0;
      case 'interests':
        return interests && interests.length > 0;
      case 'objective':
        return !!resume.objective && resume.objective.trim() !== '';
      default:
        return Array.isArray(resume[sectionId]) && resume[sectionId].length > 0;
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
      ...(resume.candidate_links || resume.profile_links || [])
        .filter((link: any) => link.owner_type === 'candidate' && link.validation_status === 'VALID')
        .map((link: any) => ({
          key: link.platform,
          val: link.normalized_url || link.url,
          display: link.display_label,
          icon: iconFor(link.platform)
        }))
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

  // Helper to render optional photo for Templates 3–6 (strictly disabled for Templates 1 & 2)
  const renderProfilePhoto = (sizeClass = 'w-20 h-20', extraClass = '') => {
    if (
      !config.profilePhoto ||
      !personal_info.photo_url ||
      layoutModel.hidden_components?.includes('photo')
    ) return null;
    return (
      <img 
        src={personal_info.photo_url} 
        alt={candidateName} 
        className={`${sizeClass} rounded-full object-cover border-2 shadow-sm shrink-0 ${config.borderColor} ${extraClass}`} 
      />
    );
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
                {exp.description && exp.description.length > 0 && (
                  <ul 
                    className="list-disc pl-4 text-zinc-900 leading-relaxed"
                    style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                  >
                    {exp.description.map((bullet: string, j: number) => (
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
                {proj.technology_stack && proj.technology_stack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">
                    <span className="text-[9.5px] font-semibold text-zinc-600 mr-1 self-center">Tech:</span>
                    {proj.technology_stack.map((tech: string, tIdx: number) => (
                      <span 
                        key={tIdx} 
                        className={isPortfolioPro 
                          ? "font-mono text-[9px] bg-indigo-100/70 text-indigo-900 px-1.5 py-0.5 rounded font-medium" 
                          : "text-[9.5px] italic text-zinc-700"
                        }
                      >
                        {tech}{!isPortfolioPro && tIdx < proj.technology_stack.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </div>
                )}
                {proj.description && proj.description.length > 0 && (
                  <ul 
                    className="list-disc pl-4 text-zinc-900 leading-relaxed"
                    style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                  >
                    {proj.description.map((bullet: string, j: number) => (
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
                    gridTemplateColumns: '135px minmax(0, 1fr)',
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
                {vol.description && vol.description.length > 0 && (
                  <ul className="list-disc pl-4 text-zinc-900 font-medium mt-1" style={{ lineHeight: params.lineHeight }}>
                    {vol.description.map((b: string, j: number) => (
                      <li key={j} style={{ marginBottom: `${params.bulletGap}px` }}>{renderTextWithLinks(b)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );

      case 'publications':
        return (
          <div className="flex flex-col gap-1.5">
            {publications.map((pub: any, i: number) => (
              <div key={i} className="break-inside-avoid text-zinc-900 font-medium" style={{ breakInside: 'avoid-page', fontSize: `${params.fontSize}px` }}>
                <span className="font-bold text-zinc-950">{pub.title}</span>
                {pub.publisher && <span className="italic">, {pub.publisher}</span>}
                {pub.date && <span className="text-zinc-600"> ({pub.date})</span>}
                {pub.url && <a href={linkHref('link', pub.url)} target="_blank" rel="noopener noreferrer" className="underline ml-2">Link</a>}
              </div>
            ))}
          </div>
        );

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
        className="resume-document-light font-sans bg-white text-zinc-900 flex flex-row min-h-[1056px]"
        style={{ width: '816px', lineHeight: params.lineHeight }}
      >
        {/* Left Sidebar */}
        <div className="w-[32%] bg-slate-50 border-r border-slate-200 p-6 flex flex-col shrink-0">
          {/* Optional Photo */}
          {config.profilePhoto && personal_info.photo_url && (
            <div className="flex justify-center mb-1">
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
        <header className="border-b-2 border-indigo-500 pb-2 mb-1 flex justify-between items-start gap-2">
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
          {config.profilePhoto && personal_info.photo_url && renderProfilePhoto('w-22 h-22', 'border-indigo-400')}
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
          {config.profilePhoto && personal_info.photo_url && renderProfilePhoto('w-20 h-20', 'border-white/80')}
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
        className="resume-document-light font-serif bg-white text-zinc-900 p-8 min-h-[1056px]"
        style={{ width: '816px', lineHeight: params.lineHeight }}
      >
        {/* Executive Header */}
        <header className="border-b-2 border-amber-900/30 pb-2 mb-1 flex justify-between items-end gap-2">
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
          {config.profilePhoto && personal_info.photo_url && renderProfilePhoto('w-22 h-22', 'border-amber-900/40')}
        </header>

        {/* Executive 2-Column Split */}
        <div className="flex gap-7 font-sans">
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
          <div className="border-r border-zinc-200 shrink-0"></div>

          {/* Executive Column */}
          <div className="w-[33%] flex flex-col shrink-0">
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

  // Route layout rendering based on canonical template ID or resolved config layout
  if (resolvedTemplateKey === 'ClassicATS' || resolvedTemplateKey === 'MinimalATS' || resolvedTemplateKey === 'ProfessionalATS') {
    return renderClassicATSLayout();
  }
  if (resolvedTemplateKey === 'ExecutiveATS') {
    return renderExecutiveATSLayout();
  }
  if (resolvedTemplateKey === 'ModernSidebar' || resolvedTemplateKey === 'TwoColumnATS' || resolvedTemplateKey === 'ModernATS') {
    return renderModernSidebarLayout();
  }
  if (resolvedTemplateKey === 'PortfolioPro' || resolvedTemplateKey === 'PortfolioPhotoATS' || resolvedTemplateKey === 'ModernProATS') {
    return renderPortfolioProLayout();
  }
  if (resolvedTemplateKey === 'EuropeanModern' || resolvedTemplateKey === 'EuropeanPhotoATS' || resolvedTemplateKey === 'AltaATS') {
    return renderEuropeanModernLayout();
  }
  if (resolvedTemplateKey === 'PremiumExecutive' || resolvedTemplateKey === 'MarissaATS') {
    return renderPremiumExecutiveLayout();
  }

  // Fallback default layout
  return renderClassicATSLayout();
}
