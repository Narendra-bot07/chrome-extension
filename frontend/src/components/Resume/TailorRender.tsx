import React, { useEffect } from 'react';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { categorizeSkills } from '../../utils/skillCategorizer';
import { TEMPLATE_CONFIGS, TemplateConfig } from '../../templates/templates_config';

interface TailorRenderProps {
  resume: any;
  templateName: string;
  sectionOrder?: string[];
}

export default function TailorRender({ resume, templateName, sectionOrder }: TailorRenderProps) {
  const config: TemplateConfig = TEMPLATE_CONFIGS[templateName] || TEMPLATE_CONFIGS['ProfessionalATS'];

  useEffect(() => {
    console.log(`--- TailorRender Engine: Compiling template "${config.name}" ---`);
  }, [config]);

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

  const activeOrder = sectionOrder || [
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
  ];

  // Helper to check if a section contains renderable data
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

  // Contacts rendering helper
  const renderContactInfo = (inline = false) => {
    const items = [
      { key: 'phone', val: personal_info.phone, icon: <Phone size={12} /> },
      { key: 'email', val: personal_info.email, icon: <Mail size={12} /> },
      { key: 'linkedin', val: personal_info.linkedin, icon: <Linkedin size={12} /> },
      { key: 'github', val: personal_info.github, icon: <Github size={12} /> },
      { key: 'website', val: personal_info.website || resume.portfolio || resume.portfolio_url, icon: <Globe size={12} /> },
      { key: 'location', val: personal_info.location, icon: <MapPin size={12} /> }
    ].filter(item => !!item.val);

    if (inline) {
      const isCentered = config.headerStyle === 'centered';
      return (
        <div className={`text-xs mt-3 flex flex-wrap gap-4 text-zinc-600 font-medium ${isCentered ? 'justify-center' : 'justify-start'}`}>
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {config.icons && <span className={config.secondaryColor}>{item.icon}</span>}
              <span>{item.val.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col space-y-3 mb-8 text-xs font-medium text-zinc-700">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            {config.icons && <span className={config.secondaryColor}>{item.icon}</span>}
            <span className="truncate">{item.val.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
          </div>
        ))}
      </div>
    );
  };

  // Sections rendering switch
  const renderSection = (sectionId: string) => {
    if (!hasData(sectionId)) return null;

    const sectionTitleStyle = `text-sm font-bold uppercase tracking-wider mb-3 ${config.secondaryColor} ${
      config.borders.sectionDivider ? 'border-b pb-1.5' : ''
    } ${config.borderColor}`;

    switch (sectionId) {
      case 'summary':
        return (
          <section key={sectionId} data-section="summary">
            <h2 className={sectionTitleStyle}>Professional Summary</h2>
            <p className="text-xs leading-relaxed text-zinc-800">{summary}</p>
          </section>
        );

      case 'education':
        return (
          <section key={sectionId} data-section="education">
            <h2 className={sectionTitleStyle}>Education</h2>
            <div className={config.spacing.itemGap}>
              {education.map((edu: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-xs text-zinc-900">
                      {edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}
                    </h3>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">{edu.start_date} - {edu.end_date || 'Present'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-zinc-700 font-medium mt-0.5">
                    <span>{edu.institution}</span>
                    {edu.location && <span className="text-zinc-500">{edu.location}</span>}
                  </div>
                  {edu.gpa && <div className="text-[10px] text-zinc-600 mt-0.5">GPA: {edu.gpa}</div>}
                </div>
              ))}
            </div>
          </section>
        );

      case 'experience':
        return (
          <section key={sectionId} data-section="experience">
            <h2 className={sectionTitleStyle}>Work Experience</h2>
            <div className={config.spacing.itemGap}>
              {experience.map((exp: any, i: number) => (
                <div key={i} className="group">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-xs text-zinc-900">{exp.role}</h3>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">{exp.start_date} - {exp.end_date || 'Present'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-zinc-700 font-semibold mt-0.5">
                    <span>{exp.company}</span>
                    {exp.location && <span className="text-zinc-500 font-normal">{exp.location}</span>}
                  </div>
                  {exp.description && exp.description.length > 0 && (
                    <ul className={`list-disc pl-4 text-xs text-zinc-800 leading-relaxed mt-2 ${config.spacing.bulletGap}`}>
                      {exp.description.map((bullet: string, j: number) => (
                        <li key={j} className="pl-0.5">{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        );

      case 'projects':
        return (
          <section key={sectionId} data-section="projects">
            <h2 className={sectionTitleStyle}>Projects</h2>
            <div className={config.spacing.itemGap}>
              {projects.map((proj: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-xs text-zinc-900">{proj.name}</h3>
                    {proj.role && <span className="text-[10px] text-zinc-500 font-semibold uppercase">{proj.role}</span>}
                  </div>
                  {proj.technology_stack && proj.technology_stack.length > 0 && (
                    <div className="text-[10px] text-zinc-600 font-semibold mt-0.5 italic">
                      Tech Stack: {proj.technology_stack.join(', ')}
                    </div>
                  )}
                  {proj.description && proj.description.length > 0 && (
                    <ul className={`list-disc pl-4 text-xs text-zinc-800 leading-relaxed mt-2 ${config.spacing.bulletGap}`}>
                      {proj.description.map((bullet: string, j: number) => (
                        <li key={j} className="pl-0.5">{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        );

      case 'skills':
        return (
          <section key={sectionId} data-section="skills">
            <h2 className={sectionTitleStyle}>Skills</h2>
            {config.layout === 'sidebar' ? (
              // Sidebar dense categories list
              <div className="space-y-4 text-xs">
                {Object.entries(categorizedSkills).map(([cat, list]: any) => (
                  <div key={cat}>
                    <h4 className="font-bold text-zinc-700 uppercase text-[10px] tracking-wide mb-1.5">{cat}</h4>
                    <div className="flex flex-wrap gap-1">
                      {list.map((skill: string, i: number) => (
                        <span key={i} className="bg-zinc-100 text-zinc-800 text-[10px] px-2 py-0.5 rounded font-medium border border-zinc-200">{skill}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Classic wide layout table
              <div className="space-y-2">
                {Object.entries(categorizedSkills).map(([cat, list]: any) => (
                  <div key={cat} className="grid grid-cols-4 gap-2 text-xs">
                    <span className="font-bold text-zinc-800 capitalize col-span-1">{cat}:</span>
                    <span className="text-zinc-700 col-span-3 font-medium">{list.join(', ')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );

      case 'certifications':
        return (
          <section key={sectionId} data-section="certifications">
            <h2 className={sectionTitleStyle}>Certifications</h2>
            <div className="space-y-3">
              {certifications.map((cert: any, i: number) => (
                <div key={i} className="text-xs">
                  <div className="font-semibold text-zinc-900">{cert.name}</div>
                  <div className="text-[10px] text-zinc-500 font-medium">
                    {cert.issuing_organization} {cert.issue_date && `| ${cert.issue_date}`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );

      case 'achievements':
        return (
          <section key={sectionId} data-section="achievements">
            <h2 className={sectionTitleStyle}>Achievements & Awards</h2>
            <ul className="list-disc pl-4 text-xs space-y-1 text-zinc-800">
              {(achievements || []).map((ach: string, i: number) => (
                <li key={i}>{ach}</li>
              ))}
              {(awards || []).map((award: any, i: number) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-semibold">{award.title}</span>
                  {award.issuer && ` (Issued by ${award.issuer})`}
                  {award.date && ` - ${award.date}`}
                </li>
              ))}
            </ul>
          </section>
        );

      case 'volunteer':
        return (
          <section key={sectionId} data-section="volunteer">
            <h2 className={sectionTitleStyle}>Leadership & Volunteering</h2>
            <div className="space-y-4">
              {volunteer_experience.map((vol: any, i: number) => (
                <div key={i} className="text-xs">
                  <div className="flex justify-between items-baseline font-bold text-zinc-900">
                    <span>{vol.role}</span>
                    <span className="text-[10px] text-zinc-500 uppercase">{vol.start_date} - {vol.end_date || 'Present'}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-indigo-700 mt-0.5">{vol.organization}</div>
                  {vol.description && vol.description.length > 0 && (
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-700">
                      {vol.description.map((b: string, j: number) => <li key={j}>{b}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        );

      case 'publications':
        return (
          <section key={sectionId} data-section="publications">
            <h2 className={sectionTitleStyle}>Publications & Research</h2>
            <div className="space-y-3">
              {publications.map((pub: any, i: number) => (
                <div key={i} className="text-xs text-zinc-800">
                  <span className="font-bold text-zinc-900">{pub.title}</span>
                  {pub.publisher && <span className="italic">, Published by {pub.publisher}</span>}
                  {pub.date && <span className="text-zinc-500"> ({pub.date})</span>}
                  {pub.url && <a href={pub.url} target="_blank" rel="noreferrer" className="text-indigo-600 ml-2 hover:underline">Link</a>}
                </div>
              ))}
            </div>
          </section>
        );

      case 'languages':
        return (
          <section key={sectionId} data-section="languages">
            <h2 className={sectionTitleStyle}>Languages</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {languages.map((lang: any, i: number) => (
                <span key={i} className="bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded text-[10px] font-semibold text-zinc-700">
                  {lang.language} {lang.proficiency ? `(${lang.proficiency})` : ''}
                </span>
              ))}
            </div>
          </section>
        );

      case 'interests':
        return (
          <section key={sectionId} data-section="interests">
            <h2 className={sectionTitleStyle}>Interests</h2>
            <div className="text-xs text-zinc-800 font-medium capitalize">
              {interests.join(', ')}
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  // Header layout picker
  const renderHeader = () => {
    const isCentered = config.headerStyle === 'centered';
    return (
      <header className={`border-b pb-6 ${config.borderColor} ${isCentered ? 'text-center' : 'text-left'}`}>
        <h1 className={`text-3.5xl font-extrabold uppercase tracking-tight ${config.primaryColor}`}>
          {personal_info.name}
        </h1>
        {(personal_info.job_title || personal_info.title) && (
          <div className={`text-xs font-bold uppercase tracking-widest mt-1.5 ${config.secondaryColor}`}>
            {personal_info.job_title || personal_info.title}
          </div>
        )}
        {renderContactInfo(true)}
      </header>
    );
  };

  // Single-column layout render
  const renderSingleColumnLayout = () => {
    return (
      <div className={`w-full ${config.spacing.paddingX} ${config.spacing.paddingY} ${config.fontFamily} bg-white text-zinc-800`}>
        {renderHeader()}
        <div className="mt-6 space-y-6">
          {activeOrder.map(sectionId => renderSection(sectionId))}
        </div>
      </div>
    );
  };

  // Two-column sidebar layout render
  const renderSidebarLayout = () => {
    const sidebarSections = ['skills', 'education', 'certifications', 'languages', 'interests'];
    const mainSections = ['summary', 'experience', 'projects', 'achievements', 'volunteer', 'publications'];

    return (
      <div className={`w-full flex ${config.fontFamily} bg-white text-zinc-800`}>
        
        {/* LEFT COLUMN (SIDEBAR) */}
        <div className={`${config.sidebarWidth} ${config.sidebarBackground} ${config.sidebarBorderRight} p-6 space-y-6`}>
          {/* Header block for sidebar */}
          <div className="border-b pb-4 mb-4 border-zinc-200">
            <h1 className={`text-2xl font-black uppercase leading-none ${config.primaryColor}`}>
              {personal_info.name}
            </h1>
            {(personal_info.job_title || personal_info.title) && (
              <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mt-2 leading-tight">
                {personal_info.job_title || personal_info.title}
              </div>
            )}
          </div>
          {renderContactInfo(false)}
          {activeOrder.filter(id => sidebarSections.includes(id)).map(sectionId => renderSection(sectionId))}
        </div>

        {/* RIGHT COLUMN (MAIN) */}
        <div className="flex-1 p-8 space-y-6">
          {activeOrder.filter(id => mainSections.includes(id)).map(sectionId => renderSection(sectionId))}
        </div>

      </div>
    );
  };

  // Execute Layout Selection
  return config.layout === 'sidebar' ? renderSidebarLayout() : renderSingleColumnLayout();
}
