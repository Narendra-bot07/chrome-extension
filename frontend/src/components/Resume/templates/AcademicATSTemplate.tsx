import React from 'react';
import { 
  sectionLabel, 
  ensureArray, 
  renderTextWithLinks, 
  linkHref, 
  hasData,
  LayoutParams 
} from '../templateHelpers';

interface AcademicATSTemplateProps {
  resume: any;
  params: LayoutParams;
  contacts: any[];
  candidateName: string;
  activeOrder: string[];
}

export const AcademicATSTemplate: React.FC<AcademicATSTemplateProps> = ({
  resume,
  params,
  contacts,
  candidateName,
  activeOrder
}) => {
  const {
    personal_info,
    summary,
    education = [],
    experience = [],
    projects = [],
    skills = {},
    skills_categories = {},
    certifications = [],
    achievements = [],
    languages = [],
    awards = [],
    volunteer_experience = [],
    publications = []
  } = resume;

  const portfolioContact = contacts.find(c => ['portfolio', 'website'].includes(c.key));
  const githubContact = contacts.find(c => c.key === 'github');
  const linkedinContact = contacts.find(c => c.key === 'linkedin');
  const emailContact = contacts.find(c => c.key === 'email');
  const phoneContact = contacts.find(c => c.key === 'phone');

  const renderAcademicSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'summary':
      case 'objective': {
        const text = summary || resume.objective || '';
        if (!text || String(text).trim() === '') return null;
        return (
          <p className="text-zinc-900 font-serif leading-relaxed text-[10.5px]">
            {renderTextWithLinks(text)}
          </p>
        );
      }

      case 'education':
        return (
          <ul className="list-none p-0 m-0 space-y-2">
            {education.map((edu: any, i: number) => (
              <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                <div className="flex justify-between items-baseline font-serif">
                  <span className="font-bold text-zinc-950 text-[10.5px]">
                    {edu.institution || edu.school}
                  </span>
                  <span className="text-zinc-700 font-normal text-[9.5px]">
                    {[edu.location, edu.city].filter(Boolean).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between items-baseline font-serif italic text-[10px] text-zinc-800">
                  <span>
                    {edu.degree} {edu.field_of_study ? `- ${edu.field_of_study}` : ''}
                    {edu.gpa ? `; GPA: ${edu.gpa}` : ''}
                  </span>
                  <span className="text-zinc-700 font-normal text-[9.5px]">
                    {edu.start_date} {edu.end_date ? `- ${edu.end_date}` : ''}
                  </span>
                </div>
                {(edu.courses || edu.coursework) && (
                  <div className="text-[9.5px] font-serif text-zinc-900 mt-0.5">
                    <span className="italic font-semibold">Courses: </span>
                    {Array.isArray(edu.courses || edu.coursework) ? (edu.courses || edu.coursework).join(', ') : (edu.courses || edu.coursework)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        );

      case 'skills': {
        const catSkills = typeof skills === 'object' && !Array.isArray(skills) ? skills : skills_categories || {};
        const validSkillEntries = Object.entries(catSkills).filter(([cat, list]: any) => {
          if (!cat) return false;
          if (Array.isArray(list)) return list.filter(item => item && String(item).trim() !== '').length > 0;
          if (typeof list === 'string') return list.trim() !== '';
          return false;
        });

        if (validSkillEntries.length === 0 && Array.isArray(skills) && skills.length > 0) {
          return (
            <div className="pl-4 font-serif text-[10px] text-zinc-950 relative">
              <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
              <span className="font-bold mr-1.5">Skills:</span>
              <span>{skills.join(', ')}</span>
            </div>
          );
        }

        return (
          <ul className="list-none p-0 m-0 space-y-1">
            {validSkillEntries.map(([cat, list]: any) => {
              const items = Array.isArray(list) 
                ? list.filter(item => item && String(item).trim() !== '')
                : String(list).split(',').map(s => s.trim()).filter(Boolean);
              return (
                <li key={cat} className="break-inside-avoid relative pl-4 font-serif text-[10px] text-zinc-950">
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <span className="font-bold mr-1.5">{cat}:</span>
                  <span className="font-normal">{items.join(', ')}</span>
                </li>
              );
            })}
          </ul>
        );
      }

      case 'certifications': {
        const certs = ensureArray(certifications || resume.certifications);
        if (certs.length === 0) return null;
        return (
          <ul className="list-none p-0 m-0 space-y-1 font-serif text-[10px]">
            {certs.map((cert: any, i: number) => {
              const title = typeof cert === 'string' ? cert : cert.name || cert.title;
              const issuer = typeof cert === 'object' ? cert.issuer || cert.authority || cert.organization : '';
              const date = typeof cert === 'object' ? cert.date || cert.issue_date || cert.year : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <span className="font-bold text-zinc-950">{title}</span>
                  {issuer && <span className="italic text-zinc-800"> — {issuer}</span>}
                  {date && <span className="text-zinc-600 font-semibold float-right text-[9.5px]"> {date}</span>}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'experience':
        return (
          <ul className="list-none p-0 m-0 space-y-2.5">
            {experience.map((exp: any, i: number) => (
              <li key={i} className="break-inside-avoid relative pl-4 font-serif" style={{ breakInside: 'avoid-page' }}>
                <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-zinc-950 text-[10.5px]">
                    {exp.company} {exp.title ? `- ${exp.title}` : ''}
                  </span>
                  <span className="text-zinc-700 font-normal text-[9.5px]">
                    {exp.location || 'Remote'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline italic text-[10px] text-zinc-800">
                  <span>{exp.role || exp.title}</span>
                  <span className="text-zinc-700 font-normal text-[9.5px]">
                    {exp.start_date} - {exp.end_date || 'Present'}
                  </span>
                </div>
                {ensureArray(exp.description).length > 0 && (
                  <ul className="list-none p-0 m-0 pl-3 mt-1 space-y-0.5 text-[9.5px] text-zinc-900">
                    {ensureArray(exp.description).map((bullet: string, j: number) => (
                      <li key={j} className="relative pl-3">
                        <span className="absolute left-0 top-0 font-bold text-zinc-700">o</span>
                        {renderTextWithLinks(bullet)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        );

      case 'projects':
        return (
          <ul className="list-none p-0 m-0 space-y-2">
            {projects.map((proj: any, i: number) => (
              <li key={i} className="break-inside-avoid relative pl-4 font-serif" style={{ breakInside: 'avoid-page' }}>
                <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-zinc-950 text-[10.5px]">
                    {proj.name}
                  </span>
                  {proj.date && (
                    <span className="text-zinc-700 font-normal text-[9.5px]">
                      {proj.date}
                    </span>
                  )}
                </div>
                {proj.role && (
                  <div className="italic text-[10px] text-zinc-800">
                    {proj.role}
                  </div>
                )}
                {ensureArray(proj.description).length > 0 && (
                  <div className="text-[9.5px] text-zinc-900 mt-0.5 leading-relaxed">
                    {ensureArray(proj.description).map((bullet: string, j: number) => (
                      <div key={j}>{renderTextWithLinks(bullet)}</div>
                    ))}
                  </div>
                )}
                {ensureArray(proj.technology_stack || proj.technologies).length > 0 && (
                  <div className="text-[9px] text-zinc-800 mt-0.5 font-sans">
                    <span className="font-semibold text-zinc-900">Tech: </span>
                    {ensureArray(proj.technology_stack || proj.technologies).join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        );

      case 'publications':
      case 'research_publications': {
        const pubs = ensureArray(publications || resume.research_publications || resume.publications);
        return (
          <ul className="list-none p-0 m-0 space-y-1.5 font-serif text-[10px]">
            {pubs.map((pub: any, i: number) => {
              const title = typeof pub === 'string' ? pub : pub.title || pub.name;
              const journal = typeof pub === 'object' ? pub.journal || pub.publisher : '';
              const issn = typeof pub === 'object' ? pub.issn : '';
              const date = typeof pub === 'object' ? pub.date || pub.month_year || pub.year : '';
              const url = typeof pub === 'object' ? pub.url || pub.link : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <span className="font-bold text-zinc-950">{title}</span>
                  {journal && <span className="italic">, {journal}</span>}
                  {issn && <span className="text-zinc-700"> (ISSN: {issn})</span>}
                  {date && <span className="text-zinc-600 font-semibold float-right text-[9.5px]"> {date}</span>}
                  {url && <div className="text-[9.5px] font-sans">{renderTextWithLinks(url)}</div>}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'awards':
      case 'achievements': {
        const items = ensureArray(achievements.length > 0 ? achievements : awards || resume.awards);
        return (
          <ul className="list-none p-0 m-0 space-y-1 font-serif text-[10px]">
            {items.map((item: any, i: number) => {
              const title = typeof item === 'string' ? item : item.title || item.name || item.description;
              const date = typeof item === 'object' ? item.date || item.year : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <span className="font-semibold text-zinc-950">{renderTextWithLinks(title)}</span>
                  {date && <span className="text-zinc-600 font-semibold float-right text-[9.5px]"> {date}</span>}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'volunteer':
      case 'volunteer_experience': {
        const vols = ensureArray(volunteer_experience || resume.volunteer);
        return (
          <ul className="list-none p-0 m-0 space-y-2 font-serif">
            {vols.map((vol: any, i: number) => (
              <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-zinc-950 text-[10.5px]">
                    {vol.role} {vol.organization ? `at ${vol.organization}` : ''}
                  </span>
                  <span className="text-zinc-700 font-normal text-[9.5px]">
                    {[vol.location, vol.city].filter(Boolean).join(', ')}
                  </span>
                </div>
                {(vol.description || vol.summary) && (
                  <div className="italic text-[10px] text-zinc-800 flex justify-between items-baseline mt-0.5">
                    <span>{renderTextWithLinks(typeof vol.description === 'string' ? vol.description : vol.summary || ensureArray(vol.description).join(' '))}</span>
                    <span className="text-zinc-700 not-italic font-normal text-[9.5px]">
                      {vol.start_date} - {vol.end_date || 'Present'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        );
      }

      case 'internships':
      case 'trainings': {
        const items = ensureArray(resume.internships || resume.trainings);
        if (items.length === 0) return null;
        return (
          <ul className="list-none p-0 m-0 space-y-2 font-serif">
            {items.map((item: any, i: number) => {
              const title = typeof item === 'string' ? item : item.role || item.title || item.name;
              const org = typeof item === 'object' ? item.company || item.organization || item.institution : '';
              const date = typeof item === 'object' ? (item.start_date ? `${item.start_date} - ${item.end_date || 'Present'}` : item.date || item.duration) : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <div className="flex justify-between items-baseline font-serif">
                    <span className="font-bold text-zinc-950 text-[10.5px]">{title}</span>
                    {date && <span className="text-zinc-700 font-normal text-[9.5px]">{date}</span>}
                  </div>
                  {org && <div className="italic text-zinc-800 text-[10px]">{org}</div>}
                  {typeof item === 'object' && ensureArray(item.description).length > 0 && (
                    <ul className="list-none p-0 m-0 pl-3 mt-1 space-y-0.5 text-[9.5px] text-zinc-900">
                      {ensureArray(item.description).map((bullet: string, j: number) => (
                        <li key={j} className="relative pl-3">
                          <span className="absolute left-0 top-0 font-bold text-zinc-700">o</span>
                          {renderTextWithLinks(bullet)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'leadership':
      case 'positions_of_responsibility':
      case 'position_of_responsibility': {
        const items = ensureArray(resume.leadership || resume.positions_of_responsibility || resume.position_of_responsibility);
        if (items.length === 0) return null;
        return (
          <ul className="list-none p-0 m-0 space-y-2 font-serif">
            {items.map((item: any, i: number) => {
              const title = typeof item === 'string' ? item : item.role || item.position || item.title;
              const org = typeof item === 'object' ? item.organization || item.company || item.institution : '';
              const date = typeof item === 'object' ? (item.start_date ? `${item.start_date} - ${item.end_date || 'Present'}` : item.date || item.duration) : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <div className="flex justify-between items-baseline font-serif">
                    <span className="font-bold text-zinc-950 text-[10.5px]">{title}</span>
                    {date && <span className="text-zinc-700 font-normal text-[9.5px]">{date}</span>}
                  </div>
                  {org && <div className="italic text-zinc-800 text-[10px]">{org}</div>}
                  {typeof item === 'object' && ensureArray(item.description).length > 0 && (
                    <ul className="list-none p-0 m-0 pl-3 mt-1 space-y-0.5 text-[9.5px] text-zinc-900">
                      {ensureArray(item.description).map((bullet: string, j: number) => (
                        <li key={j} className="relative pl-3">
                          <span className="absolute left-0 top-0 font-bold text-zinc-700">o</span>
                          {renderTextWithLinks(bullet)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        );
      }

      case 'extracurricular_activities':
      case 'extracurricular': {
        const items = ensureArray(resume.extracurricular_activities || resume.extracurricular);
        if (items.length === 0) return null;
        return (
          <ul className="list-none p-0 m-0 space-y-1 font-serif text-[10px]">
            {items.map((item: any, i: number) => {
              const text = typeof item === 'string' ? item : item.title || item.name || item.activity || item.description;
              const date = typeof item === 'object' ? item.date || item.year : '';
              return (
                <li key={i} className="break-inside-avoid relative pl-4" style={{ breakInside: 'avoid-page' }}>
                  <span className="absolute left-0 top-0 text-zinc-950 font-bold">•</span>
                  <span className="font-semibold text-zinc-950">{renderTextWithLinks(text)}</span>
                  {date && <span className="text-zinc-600 font-semibold float-right text-[9.5px]"> {date}</span>}
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
          <p className="text-zinc-900 font-serif leading-relaxed text-[10.5px]">
            {renderTextWithLinks(text)}
          </p>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div 
      data-resume-layout="single-column"
      className="resume-document-light font-serif bg-white text-zinc-950"
      style={{ 
        width: '816px', 
        minHeight: '1056px', 
        padding: `${params.paddingY}px ${params.paddingX}px`, 
        fontSize: `${params.fontSize}px`, 
        lineHeight: params.lineHeight 
      }}
    >
      {/* Split Deedy/Academic Header */}
      <header className="mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="font-extrabold text-zinc-950 tracking-tight leading-none" style={{ fontSize: `${params.nameSize + 2}px` }}>
              {candidateName}
            </h1>
            <div className="text-[10px] text-zinc-800 mt-1 space-y-0.5 font-sans">
              {portfolioContact && (
                <div>Portfolio: <a href={linkHref('portfolio', portfolioContact.val)} target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline font-medium">{portfolioContact.display}</a></div>
              )}
              {githubContact && (
                <div>Github: <a href={linkHref('github', githubContact.val)} target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline font-medium">{githubContact.display}</a></div>
              )}
              {linkedinContact && (
                <div>LinkedIn: <a href={linkHref('linkedin', linkedinContact.val)} target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline font-medium">{linkedinContact.display}</a></div>
              )}
            </div>
          </div>

          <div className="text-right text-[10px] text-zinc-800 space-y-0.5 font-sans">
            {emailContact && (
              <div>Email: <a href={linkHref('email', emailContact.val)} className="text-zinc-900 font-medium">{emailContact.display}</a></div>
            )}
            {phoneContact && (
              <div>Mobile: <span className="text-zinc-900 font-medium">{phoneContact.display}</span></div>
            )}
            {personal_info?.location && (
              <div>Location: <span className="text-zinc-900 font-medium">{personal_info.location}</span></div>
            )}
          </div>
        </div>
      </header>

      {/* Academic Sections */}
      <div className="flex flex-col">
        {activeOrder.map(sectionId => {
          if (!hasData(resume, sectionId)) return null;

          const content = renderAcademicSectionContent(sectionId);
          if (!content) return null;

          let label = sectionLabel(sectionId);
          if (sectionId === 'summary') label = 'SUMMARY';
          if (sectionId === 'skills') label = 'SKILLS SUMMARY';
          if (sectionId === 'achievements' || sectionId === 'awards') label = 'HONORS AND AWARDS';
          if (sectionId === 'volunteer' || sectionId === 'volunteer_experience') label = 'VOLUNTEER EXPERIENCE';
          if (sectionId === 'publications' || sectionId === 'research_publications') label = 'PUBLICATIONS';
          if (sectionId === 'positions_of_responsibility' || sectionId === 'leadership') label = 'POSITIONS OF RESPONSIBILITY';
          if (sectionId === 'internships' || sectionId === 'trainings') label = 'INTERNSHIPS AND TRAININGS';
          if (sectionId === 'extracurricular_activities') label = 'EXTRA-CURRICULAR';

          return (
            <section key={sectionId} data-section={sectionId} style={{ marginBottom: `${params.sectionGap}px` }}>
              <h2 
                className="font-extrabold uppercase tracking-wider text-zinc-950 border-b border-zinc-400 pb-0.5 mb-1.5 font-serif text-[11px]"
                style={{ fontSize: `${params.sectionTitleSize}px`, breakAfter: 'avoid-page' }}
              >
                {label}
              </h2>
              <div className="font-serif text-zinc-950">
                {content}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
