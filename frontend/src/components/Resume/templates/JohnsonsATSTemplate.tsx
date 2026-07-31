import React from 'react';
import { 
  sectionLabel, 
  ensureArray, 
  renderTextWithLinks, 
  linkHref, 
  professionalLink,
  hasData,
  LayoutParams 
} from '../templateHelpers';

interface JohnsonsATSTemplateProps {
  resume: any;
  params: LayoutParams;
  candidateName: string;
  activeOrder: string[];
}

export const JohnsonsATSTemplate: React.FC<JohnsonsATSTemplateProps> = ({
  resume,
  params,
  candidateName,
  activeOrder
}) => {
  const {
    personal_info,
    education = [],
    experience = [],
    projects = [],
    skills = {},
    skills_categories = {},
    certifications = [],
    achievements = [],
    languages = []
  } = resume;

  const categorizedSkills = (typeof skills === 'object' && !Array.isArray(skills)) ? skills : skills_categories || {};

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

  const renderJohnsonsSectionContent = (sectionId: string) => {
    if (sectionId === 'experience') {
      return (
        <div className="space-y-3 font-serif">
          {(experience || []).map((exp: any, idx: number) => (
            <div key={idx} className="space-y-1 text-[11.5px] break-inside-avoid">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{exp.company}</span>
                <span className="italic text-zinc-800 text-[11px]">{exp.start_date} – {exp.end_date || 'Present'}</span>
              </div>
              <div className="flex justify-between items-baseline font-serif italic text-zinc-800 text-[11.5px]">
                <span>{exp.role || exp.title}</span>
                <span className="not-italic text-zinc-700 text-[10.5px]">{exp.location}</span>
              </div>
              {exp.description && (
                <ul className="list-disc pl-5 space-y-0.5 text-zinc-900 text-[11px] leading-relaxed">
                  {ensureArray(exp.description).map((bullet: string, bIdx: number) => (
                    <li key={bIdx}>{renderTextWithLinks(bullet)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'education') {
      return (
        <div className="space-y-2 font-serif">
          {(education || []).map((edu: any, idx: number) => (
            <div key={idx} className="space-y-0.5 text-[11.5px] break-inside-avoid">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{edu.institution || edu.school}</span>
                <span className="italic text-zinc-800 text-[11px]">{edu.start_date} – {edu.end_date || 'Present'}</span>
              </div>
              <div className="flex justify-between items-baseline font-serif italic text-zinc-800 text-[11.5px]">
                <span>{edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}</span>
                <span className="not-italic text-zinc-700 text-[10.5px]">{edu.location}</span>
              </div>
              {edu.gpa && <div className="text-[10.5px] text-zinc-700 font-serif">GPA: {edu.gpa}</div>}
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
        <div className="space-y-2 font-serif">
          {(projects || []).map((proj: any, idx: number) => (
            <div key={idx} className="space-y-0.5 text-[11.5px] break-inside-avoid">
              <div className="flex justify-between items-baseline font-serif">
                <span className="font-bold text-zinc-950 text-[12px]">{proj.name || proj.title}</span>
                <span className="italic text-zinc-800 text-[11px]">{proj.date || proj.dates || ''}</span>
              </div>
              {(proj.technologies || proj.technology_stack) && (
                <div className="italic text-zinc-700 text-[10.5px]">
                  Technologies: {ensureArray(proj.technologies || proj.technology_stack).join(', ')}
                </div>
              )}
              {proj.description && ensureArray(proj.description).length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5 mt-1 text-zinc-800 text-[11px]">
                  {ensureArray(proj.description).map((bullet: string, bIdx: number) => (
                    <li key={bIdx}>{renderTextWithLinks(bullet)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'certifications') {
      return (
        <div className="space-y-1.5 font-serif text-[11.5px]">
          {(certifications || []).map((cert: any, idx: number) => (
            <div key={idx} className="flex flex-row items-baseline gap-4">
              <div className="w-48 shrink-0 font-bold text-zinc-950 text-[11.5px]">
                {cert.title || cert.name}
              </div>
              <div className="flex-1 text-zinc-800 text-[11.5px]">
                {cert.issuer || cert.authority ? `${cert.issuer || cert.authority} (${cert.date || ''})` : cert.date}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (sectionId === 'achievements') {
      return (
        <div className="space-y-1.5 font-serif text-[11.5px]">
          {(achievements || []).map((ach: any, idx: number) => (
            <div key={idx} className="flex flex-row items-baseline gap-4">
              <div className="w-48 shrink-0 font-bold text-zinc-950 text-[11.5px]">
                {ach.title || ach.name}
              </div>
              <div className="flex-1 text-zinc-800 text-[11.5px]">
                {ach.description || ach.summary || ach.date}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div 
      data-resume-layout="single-column"
      className="resume-document-light font-serif bg-white text-zinc-900"
      style={{ 
        width: '816px', 
        minHeight: '1056px', 
        padding: `${params.paddingY + 4}px ${params.paddingX + 4}px`, 
        fontSize: `${params.fontSize}px`, 
        lineHeight: params.lineHeight 
      }}
    >
      {/* Header - Centered Italic Steel Blue Title & Subtitle Info */}
      <header className="text-center mb-4">
        <h1 
          className="font-serif italic text-[#1d5288] tracking-normal leading-tight font-medium"
          style={{ fontSize: `${params.nameSize + 4}px` }}
        >
          {candidateName}
        </h1>
        
        <div className="font-serif italic text-zinc-700 text-[11px] mt-1 space-y-0.5">
          {personal_info?.location && (
            <div>Residence/domicile: {personal_info.location}</div>
          )}
          <div className="flex flex-wrap justify-center items-center gap-x-2">
            {personal_info?.email && <span>E-mail: {personal_info.email}</span>}
            {personal_info?.email && personal_info?.phone && <span className="text-[#1d5288] select-none">✻</span>}
            {personal_info?.phone && <span>Telephone number: {personal_info.phone}</span>}
          </div>
          {(personal_info?.linkedin || personal_info?.github || personal_info?.website) && (
            <div data-contact-links="true" className="flex flex-wrap justify-center items-center gap-x-2">
              {personal_info?.linkedin && <span>LinkedIn: {linkDisplay('linkedin', personal_info.linkedin)}</span>}
              {personal_info?.linkedin && (personal_info?.github || personal_info?.website) && <span className="text-[#1d5288] select-none">✻</span>}
              {personal_info?.github && <span>GitHub: {linkDisplay('github', personal_info.github)}</span>}
              {personal_info?.github && personal_info?.website && <span className="text-[#1d5288] select-none">✻</span>}
              {personal_info?.website && <span>Portfolio: {linkDisplay('website', personal_info.website)}</span>}
            </div>
          )}
        </div>
      </header>

      {/* Sections list with Steel Blue Italic headers and bottom divider */}
      <div className="flex flex-col">
        {activeOrder.map(sectionId => {
          if (!hasData(resume, sectionId)) return null;
          
          let customLabel = sectionLabel(sectionId);
          if (sectionId === 'experience') customLabel = 'Work experience';
          if (sectionId === 'education') customLabel = 'Education';
          if (sectionId === 'skills') customLabel = 'Technical skills';
          if (sectionId === 'projects') customLabel = 'Portfolio of most relevant projects';
          if (sectionId === 'languages') customLabel = 'Language proficiencies';
          if (sectionId === 'volunteer') customLabel = 'Extracurricular activities';
          if (sectionId === 'achievements') customLabel = 'Memberships & Achievements';

          return (
            <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
              <h2 
                className="font-serif italic font-bold text-[#1d5288] border-b border-[#7b9ebc] pb-0.5 mb-2 text-left"
                style={{ fontSize: `${params.sectionTitleSize + 1}px`, breakAfter: 'avoid-page' }}
              >
                {customLabel}
              </h2>
              <div className="font-serif text-zinc-900">
                {renderJohnsonsSectionContent(sectionId)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
