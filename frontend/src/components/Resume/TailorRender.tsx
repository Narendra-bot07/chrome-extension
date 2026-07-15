import React, { useEffect } from 'react';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { categorizeSkills } from '../../utils/skillCategorizer';
import { TEMPLATE_CONFIGS, TemplateConfig } from '../../templates/templates_config';

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

// Linear interpolation Spacing Solver mapping layoutLevel (0-10) to exact layout properties
export function getParamsForLevel(level: number): LayoutParams {
  const t = Math.max(0, Math.min(10, level)) / 10;
  return {
    paddingX: Math.round(36 + (64 - 36) * t),
    paddingY: Math.round(28 + (60 - 28) * t),
    sectionGap: Math.round(8 + (28 - 8) * t),
    itemGap: Math.round(5 + (18 - 5) * t),
    bulletGap: Math.round(1.5 + (6 - 1.5) * t),
    lineHeight: 1.25 + (1.6 - 1.25) * t,
    fontSize: 9.2 + (12 - 9.2) * t,
    nameSize: Math.round(18 + (30 - 18) * t),
    sectionTitleSize: Math.round(10.5 + (14 - 10.5) * t)
  };
}

interface TailorRenderProps {
  resume: any;
  templateName: string;
  sectionOrder?: string[];
  layoutLevel?: number;
}

export default function TailorRender({ resume, templateName, sectionOrder, layoutLevel = 5 }: TailorRenderProps) {
  const config: TemplateConfig = TEMPLATE_CONFIGS[templateName] || TEMPLATE_CONFIGS['ExecutiveATS'];
  const params = getParamsForLevel(layoutLevel);

  useEffect(() => {
    console.log(`--- TailorRender Engine: Compiling layout level ${layoutLevel} ---`);
  }, [layoutLevel, config]);

  if (!resume || !resume.personal_info) {
    return <div className="p-5 text-zinc-500">Waiting for resume content data...</div>;
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

  const activeOrder = (resume.section_order || sectionOrder || [
    'summary',
    'education',
    'experience',
    'skills',
    'projects',
    'certifications',
    'achievements',
    'volunteer',
    'publications',
    'languages',
    'awards',
    'interests'
  ]).filter((s: string) => s !== 'personal_info');

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
        return skills && skills.length > 0;
      case 'certifications':
        return certifications && certifications.length > 0;
      case 'achievements':
        return (achievements && achievements.length > 0) || (awards && awards.length > 0);
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
      default:
        return false;
    }
  };

  const renderContactInfo = (inline = false) => {
    const items = [
      { key: 'phone', val: personal_info.phone, icon: <Phone size={11} /> },
      { key: 'email', val: personal_info.email, icon: <Mail size={11} /> },
      { key: 'linkedin', val: personal_info.linkedin, icon: <Linkedin size={11} /> },
      { key: 'github', val: personal_info.github, icon: <Github size={11} /> },
      { key: 'website', val: personal_info.website || resume.portfolio || resume.portfolio_url, icon: <Globe size={11} /> },
      { key: 'location', val: personal_info.location, icon: <MapPin size={11} /> }
    ].filter(item => !!item.val);

    if (inline) {
      const isCentered = config.headerStyle === 'centered';
      return (
        <div 
          className={`flex flex-wrap gap-x-4 gap-y-1.5 text-black font-semibold mt-2.5 ${isCentered ? 'justify-center' : 'justify-start'}`}
          style={{ fontSize: `${params.fontSize - 0.5}px` }}
        >
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {config.icons && <span className={config.secondaryColor}>{item.icon}</span>}
              <span>{item.val.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
            </span>
          ))}
        </div>
      );
    }

    return (
      <div 
        className="flex flex-col mb-6 text-black font-semibold"
        style={{ gap: `${params.bulletGap}px`, fontSize: `${params.fontSize - 0.5}px` }}
      >
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            {config.icons && <span className={config.secondaryColor}>{item.icon}</span>}
            <span className="truncate">{item.val.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderSection = (sectionId: string) => {
    if (!hasData(sectionId)) return null;

    const sectionTitleStyle = `font-bold uppercase tracking-wider ${config.secondaryColor} ${
      config.borders.sectionDivider ? 'border-b pb-1' : ''
    } ${config.borderColor}`;

    return (
      <section 
        key={sectionId} 
        data-section={sectionId} 
        style={{ marginBottom: `${params.sectionGap}px` }}
      >
        <h2 
          className={sectionTitleStyle}
          style={{ 
            fontSize: `${params.sectionTitleSize}px`,
            marginBottom: `${params.itemGap / 2}px`
          }}
        >
          {sectionId === 'volunteer' ? 'Leadership & Volunteering' : 
           sectionId === 'publications' ? 'Publications & Research' : 
           sectionId === 'achievements' ? 'Achievements & Awards' : 
           sectionId.replace('_', ' ')}
        </h2>

        {/* Section Content mapping dynamic spacing variables */}
        {(() => {
          switch (sectionId) {
            case 'summary':
              return (
                <p 
                  className="text-black" 
                  style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}
                >
                  {summary}
                </p>
              );

            case 'education':
              const isNarrow = config.layout === 'sidebar' || config.layout === 'two-column' || config.layout === 'marissa';
              return (
                <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
                  {education.map((edu: any, i: number) => {
                    if (isNarrow) {
                      return (
                        <div key={i} className="space-y-0.5" style={{ fontSize: `${params.fontSize}px` }}>
                          <h3 className="font-bold text-black leading-snug">
                            {edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}
                          </h3>
                          <div className="font-semibold text-black">{edu.institution}</div>
                          {edu.location && <div className="text-black text-[9.5px]">{edu.location}</div>}
                          <div className="text-[9px] text-black font-bold uppercase mt-0.5">
                            {edu.start_date} - {edu.end_date || 'Present'}
                          </div>
                          {edu.gpa && <div className="text-[9.5px] text-black">GPA: {edu.gpa}</div>}
                        </div>
                      );
                    }
                    return (
                      <div key={i} style={{ fontSize: `${params.fontSize}px` }}>
                        <div className="flex justify-between items-baseline">
                          <h3 className="font-bold text-black">
                            {edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}
                          </h3>
                          <span className="text-[9.5px] text-black font-bold uppercase shrink-0 ml-4">{edu.start_date} - {edu.end_date || 'Present'}</span>
                        </div>
                        <div className="flex justify-between items-center text-black font-semibold mt-0.5">
                          <span>{edu.institution}</span>
                          {edu.location && <span className="text-black font-medium">{edu.location}</span>}
                        </div>
                        {edu.gpa && <div className="text-[9.5px] text-black">GPA: {edu.gpa}</div>}
                      </div>
                    );
                  })}
                </div>
              );

            case 'experience':
              return (
                <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
                  {experience.map((exp: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between items-baseline" style={{ fontSize: `${params.fontSize}px` }}>
                        <h3 className="font-bold text-black">{exp.role}</h3>
                        <span className="text-[9.5px] text-black font-bold uppercase shrink-0 ml-4">{exp.start_date} - {exp.end_date || 'Present'}</span>
                      </div>
                      <div className="flex justify-between items-center text-black font-semibold mt-0.5" style={{ fontSize: `${params.fontSize}px` }}>
                        <span>{exp.company}</span>
                        {exp.location && <span className="text-black font-medium">{exp.location}</span>}
                      </div>
                      {exp.description && exp.description.length > 0 && (
                        <ul 
                          className="list-disc pl-4 text-black leading-relaxed"
                          style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                        >
                          {exp.description.map((bullet: string, j: number) => (
                            <li key={j} className="pl-0.5" style={{ marginBottom: `${params.bulletGap}px` }}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              );

            case 'projects':
              return (
                <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
                  {projects.map((proj: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between items-baseline" style={{ fontSize: `${params.fontSize}px` }}>
                        <h3 className="font-bold text-black">{proj.name}</h3>
                        {proj.role && <span className="text-[9.5px] text-black font-bold uppercase shrink-0 ml-4">{proj.role}</span>}
                      </div>
                      {proj.technology_stack && proj.technology_stack.length > 0 && (
                        <div className="text-black font-semibold mt-0.5 italic" style={{ fontSize: `${params.fontSize - 1.5}px` }}>
                          Tech Stack: {proj.technology_stack.join(', ')}
                        </div>
                      )}
                      {proj.description && proj.description.length > 0 && (
                        <ul 
                          className="list-disc pl-4 text-black leading-relaxed"
                          style={{ fontSize: `${params.fontSize - 0.5}px`, lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                        >
                          {proj.description.map((bullet: string, j: number) => (
                            <li key={j} className="pl-0.5" style={{ marginBottom: `${params.bulletGap}px` }}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              );

            case 'skills':
              return (
                <div>
                  {config.layout === 'sidebar' || config.layout === 'two-column' || config.layout === 'marissa' ? (
                    <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
                      {Object.entries(categorizedSkills).map(([cat, list]: any) => (
                        <div key={cat} style={{ fontSize: `${params.fontSize}px` }}>
                          <h4 className="font-bold text-black uppercase tracking-wide mb-1" style={{ fontSize: `${params.fontSize - 1.5}px` }}>{cat}</h4>
                          <div className="flex flex-wrap gap-1">
                            {list.map((skill: string, idx: number) => (
                              <span 
                                key={idx} 
                                className="bg-zinc-50 text-black px-1.5 py-0.5 rounded font-semibold border border-zinc-350"
                                style={{ fontSize: `${params.fontSize - 1.5}px` }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col" style={{ gap: `${params.bulletGap}px` }}>
                      {Object.entries(categorizedSkills).map(([cat, list]: any) => (
                        <div key={cat} className="grid grid-cols-4 gap-2 text-black font-medium" style={{ fontSize: `${params.fontSize}px` }}>
                          <span className="font-bold col-span-1 capitalize">{cat}:</span>
                          <span className="col-span-3 font-semibold">{list.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );

            case 'certifications':
              return (
                <div className="flex flex-col" style={{ gap: `${params.itemGap}px` }}>
                  {certifications.map((cert: any, i: number) => (
                    <div key={i} style={{ fontSize: `${params.fontSize}px` }}>
                      <div className="font-semibold text-black">{cert.name}</div>
                      <div className="text-black font-semibold mt-0.5" style={{ fontSize: `${params.fontSize - 1.5}px` }}>
                        {cert.issuing_organization} {cert.issue_date && `| ${cert.issue_date}`}
                      </div>
                    </div>
                  ))}
                </div>
              );

            case 'achievements':
              return (
                <ul 
                  className="list-disc pl-4 text-black font-medium"
                  style={{ fontSize: `${params.fontSize}px`, lineHeight: params.lineHeight }}
                >
                  {(achievements || []).map((ach: string, i: number) => (
                    <li key={i} style={{ marginBottom: `${params.bulletGap}px` }}>{ach}</li>
                  ))}
                  {(awards || []).map((award: any, i: number) => (
                    <li key={i} className="leading-relaxed" style={{ marginBottom: `${params.bulletGap}px` }}>
                      <span className="font-semibold">{award.title}</span>
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
                    <div key={i} style={{ fontSize: `${params.fontSize}px` }}>
                      <div className="flex justify-between items-baseline font-bold text-black">
                        <span>{vol.role}</span>
                        <span className="text-[9.5px] text-black font-bold uppercase">{vol.start_date} - {vol.end_date || 'Present'}</span>
                      </div>
                      <div className="font-semibold text-black mt-0.5" style={{ fontSize: `${params.fontSize - 1.5}px` }}>{vol.organization}</div>
                      {vol.description && vol.description.length > 0 && (
                        <ul 
                          className="list-disc pl-4 text-black font-medium"
                          style={{ lineHeight: params.lineHeight, marginTop: `${params.bulletGap / 2}px` }}
                        >
                          {vol.description.map((b: string, j: number) => (
                            <li key={j} style={{ marginBottom: `${params.bulletGap}px` }}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              );

            case 'publications':
              return (
                <div className="flex flex-col" style={{ gap: `${params.itemGap / 2}px` }}>
                  {publications.map((pub: any, i: number) => (
                    <div key={i} className="text-black font-medium" style={{ fontSize: `${params.fontSize}px` }}>
                      <span className="font-bold text-black">{pub.title}</span>
                      {pub.publisher && <span className="italic">, Published by {pub.publisher}</span>}
                      {pub.date && <span className="text-black"> ({pub.date})</span>}
                      {pub.url && <a href={pub.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline ml-2 hover:underline">Link</a>}
                    </div>
                  ))}
                </div>
              );

            case 'languages':
              return (
                <div className="flex flex-wrap gap-2">
                  {languages.map((lang: any, i: number) => (
                    <span 
                      key={i} 
                      className="bg-zinc-50 border border-zinc-350 px-2 py-0.5 rounded font-semibold text-black"
                      style={{ fontSize: `${params.fontSize - 1.5}px` }}
                    >
                      {lang.language} {lang.proficiency ? `(${lang.proficiency})` : ''}
                    </span>
                  ))}
                </div>
              );

            case 'interests':
              return (
                <div className="text-black font-semibold capitalize" style={{ fontSize: `${params.fontSize}px` }}>
                  {interests.join(', ')}
                </div>
              );

            default:
              return null;
          }
        })()}
      </section>
    );
  };

  const renderProfilePhoto = (size = 'w-20 h-20') => {
    const initials = (personal_info.name || '')
      .split(' ')
      .map((n: any) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    if (personal_info.photo_url) {
      return (
        <img 
          src={personal_info.photo_url} 
          alt={personal_info.name} 
          className={`${size} rounded-full object-cover border shadow-sm ${config.borderColor}`} 
        />
      );
    }

    return (
      <div className={`${size} rounded-full flex items-center justify-center text-black font-extrabold tracking-wider bg-white border flex-shrink-0 shadow-sm ${config.borderColor} text-lg shrink-0`}>
        {initials}
      </div>
    );
  };

  const renderHeader = () => {
    const isCentered = config.headerStyle === 'centered';
    const isSplitPhoto = config.headerStyle === 'split-photo';
    const isBanner = config.headerStyle === 'banner';

    if (isBanner) {
      return (
        <header 
          className={`border-b flex items-center justify-between gap-6 w-full shrink-0 ${config.borderColor}`}
          style={{ paddingLeft: `${params.paddingX}px`, paddingRight: `${params.paddingX}px`, paddingTop: `${params.paddingY}px`, paddingBottom: `${params.paddingY}px` }}
        >
          <div className="flex-1 space-y-1.5 text-left">
            <h1 
              className={`font-black uppercase tracking-tight ${config.primaryColor} leading-none`}
              style={{ fontSize: `${params.nameSize}px` }}
            >
              {personal_info.name}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div 
                className={`font-bold uppercase tracking-widest ${config.secondaryColor}`}
                style={{ fontSize: `${params.fontSize}px` }}
              >
                {personal_info.job_title || personal_info.title}
              </div>
            )}
            {summary && (
              <p 
                className="text-black leading-relaxed mt-2 max-w-2xl"
                style={{ fontSize: `${params.fontSize}px` }}
              >
                {summary}
              </p>
            )}
          </div>
          {config.profilePhoto && renderProfilePhoto('w-24 h-24')}
        </header>
      );
    }

    if (isSplitPhoto) {
      return (
        <header className={`border-b flex items-center justify-between gap-6 ${config.borderColor}`} style={{ paddingBottom: `${params.sectionGap}px` }}>
          <div className="flex-1 space-y-1.5 text-left">
            <h1 
              className={`font-extrabold uppercase tracking-tight ${config.primaryColor}`}
              style={{ fontSize: `${params.nameSize}px` }}
            >
              {personal_info.name}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div 
                className={`font-bold uppercase tracking-widest ${config.secondaryColor}`}
                style={{ fontSize: `${params.fontSize}px` }}
              >
                {personal_info.job_title || personal_info.title}
              </div>
            )}
            {renderContactInfo(true)}
          </div>
          {config.profilePhoto && renderProfilePhoto('w-20 h-20')}
        </header>
      );
    }

    return (
      <header className={`border-b ${config.borderColor} ${isCentered ? 'text-center' : 'text-left'}`} style={{ paddingBottom: `${params.sectionGap}px` }}>
        <h1 
          className={`font-extrabold uppercase tracking-tight ${config.primaryColor}`}
          style={{ fontSize: `${params.nameSize}px` }}
        >
          {personal_info.name}
        </h1>
        {(personal_info.job_title || personal_info.title) && (
          <div 
            className={`font-bold uppercase tracking-widest mt-1.5 ${config.secondaryColor}`}
            style={{ fontSize: `${params.fontSize}px` }}
          >
            {personal_info.job_title || personal_info.title}
          </div>
        )}
        {renderContactInfo(true)}
      </header>
    );
  };

  const renderSingleColumnLayout = () => {
    return (
      <div 
        className={`${config.fontFamily} bg-white text-black`}
        style={{ 
          width: '816px', 
          minHeight: '1056px',
          paddingLeft: `${params.paddingX}px`, 
          paddingRight: `${params.paddingX}px`, 
          paddingTop: `${params.paddingY}px`, 
          paddingBottom: `${params.paddingY}px`,
          fontSize: `${params.fontSize}px`
        }}
      >
        {renderHeader()}
        <div className="mt-6 flex flex-col">
          {activeOrder.map(sectionId => renderSection(sectionId))}
        </div>
      </div>
    );
  };

  const renderTwoColumnLayout = () => {
    const leftSections = ['skills', 'education', 'certifications', 'languages', 'interests'];
    const rightSections = ['summary', 'experience', 'projects', 'achievements', 'volunteer', 'publications'];

    return (
      <div 
        className={`${config.fontFamily} bg-white text-black`}
        style={{ 
          width: '816px', 
          minHeight: '1056px',
          paddingLeft: `${params.paddingX}px`, 
          paddingRight: `${params.paddingX}px`, 
          paddingTop: `${params.paddingY}px`, 
          paddingBottom: `${params.paddingY}px`,
          fontSize: `${params.fontSize}px`
        }}
      >
        {renderHeader()}
        <div className="mt-6 flex gap-8">
          <div className="w-[35%] flex flex-col shrink-0">
            {activeOrder.filter(id => leftSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>
          <div className={`border-l ${config.borderColor} shrink-0`}></div>
          <div className="flex-1 flex flex-col">
            {activeOrder.filter(id => rightSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>
        </div>
      </div>
    );
  };

  const renderSidebarLayout = () => {
    const isAlta = config.id === 'AltaATS';
    const sidebarSections = isAlta 
      ? ['skills', 'certifications', 'languages', 'interests']
      : ['skills', 'education', 'certifications', 'languages', 'interests'];
    const mainSections = isAlta
      ? ['experience', 'projects', 'education', 'achievements', 'volunteer', 'publications']
      : ['summary', 'experience', 'projects', 'achievements', 'volunteer', 'publications'];

    const hasTopHeader = config.headerStyle === 'banner';

    return (
      <div 
        className={`${config.fontFamily} bg-white text-black flex flex-col`}
        style={{ 
          width: '816px', 
          minHeight: '1056px',
          fontSize: `${params.fontSize}px`
        }}
      >
        {hasTopHeader && renderHeader()}

        <div className="flex-1 flex w-full">
          <div 
            className={`${config.sidebarWidth} ${config.sidebarBackground} ${config.sidebarBorderRight} shrink-0`}
            style={{ 
              paddingLeft: `${params.paddingX * 0.6}px`, 
              paddingRight: `${params.paddingX * 0.6}px`, 
              paddingTop: `${params.paddingY}px`, 
              paddingBottom: `${params.paddingY}px` 
            }}
          >
            {!hasTopHeader && (
              <div className="border-b pb-4 mb-4 border-zinc-200 flex flex-col gap-4">
                {config.profilePhoto && renderProfilePhoto('w-24 h-24')}
                <div>
                  <h1 
                    className={`font-black uppercase leading-tight ${config.primaryColor}`}
                    style={{ fontSize: `${params.nameSize * 0.9}px` }}
                  >
                    {personal_info.name}
                  </h1>
                  {(personal_info.job_title || personal_info.title) && (
                    <div 
                      className="font-bold text-black uppercase tracking-wider mt-2 leading-tight"
                      style={{ fontSize: `${params.fontSize - 1}px` }}
                    >
                      {personal_info.job_title || personal_info.title}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!hasTopHeader && renderContactInfo(false)}
            {activeOrder.filter(id => sidebarSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>

          <div 
            className="flex-1 flex flex-col"
            style={{ 
              paddingLeft: `${params.paddingX}px`, 
              paddingRight: `${params.paddingX}px`, 
              paddingTop: `${params.paddingY}px`, 
              paddingBottom: `${params.paddingY}px` 
            }}
          >
            {activeOrder.filter(id => mainSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>
        </div>
      </div>
    );
  };

  const renderMarissaLayout = () => {
    const mainSections = ['summary', 'experience', 'projects', 'achievements', 'volunteer', 'publications'];
    const sidebarSections = ['skills', 'education', 'certifications', 'languages', 'interests'];

    return (
      <div 
        className={`${config.fontFamily} bg-white text-black`}
        style={{ 
          width: '816px', 
          minHeight: '1056px',
          paddingLeft: `${params.paddingX}px`, 
          paddingRight: `${params.paddingX}px`, 
          paddingTop: `${params.paddingY}px`, 
          paddingBottom: `${params.paddingY}px`,
          fontSize: `${params.fontSize}px`
        }}
      >
        {renderHeader()}
        <div className="mt-6 flex gap-8">
          <div className="flex-1 flex flex-col">
            {activeOrder.filter(id => mainSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>
          <div className={`border-l ${config.borderColor} shrink-0`}></div>
          <div className="w-[35%] flex flex-col shrink-0">
            {activeOrder.filter(id => sidebarSections.includes(id)).map(sectionId => renderSection(sectionId))}
          </div>
        </div>
      </div>
    );
  };

  if (config.layout === 'sidebar') return renderSidebarLayout();
  if (config.layout === 'two-column') return renderTwoColumnLayout();
  if (config.layout === 'marissa') return renderMarissaLayout();
  return renderSingleColumnLayout();
}
