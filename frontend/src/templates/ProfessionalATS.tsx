import React, { useEffect } from 'react';
import { categorizeSkills } from '../utils/skillCategorizer';
import { ensureArray, ensureStringArray } from '../utils/arrayUtils';

export default function ProfessionalATS({ resume }) {
  useEffect(() => {
    if (resume) {
      console.log('--- Rendering ProfessionalATS Template ---');
    }
  }, [resume]);

  if (!resume || !resume.personal_info) return <div>No data</div>;
  
  const { 
    personal_info, 
    summary, 
    education, 
    experience, 
    skills,
    skills_categories,
    projects,
    certifications,
    achievements,
    languages,
    awards,
    volunteer_experience,
    publications
  } = resume;

  const categorizedSkills = categorizeSkills(skills, skills_categories);

  return (
    <div className="font-serif px-10 py-8 max-w-4xl mx-auto bg-white text-black" style={{ width: '8.5in', minHeight: '11in' }}>
      <header className="text-center mb-3 border-b-[1.5px] border-black pb-2">
        <h1 className="text-[1.625rem] font-bold uppercase tracking-[0.15em] mb-1">{personal_info.name}</h1>
        {(personal_info.job_title || personal_info.title) && (
          <div className="text-xs font-semibold uppercase tracking-[0.1em] mb-2 text-gray-700">
            {personal_info.job_title || personal_info.title}
          </div>
        )}
        <div className="text-xs flex flex-wrap justify-center items-center gap-2">
          {personal_info.phone && <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            {personal_info.phone}
          </span>}
          {personal_info.email && <a href={`mailto:${personal_info.email}`} className="flex items-center gap-1 ml-2 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            {personal_info.email}
          </a>}
          {personal_info.linkedin && <a href={personal_info.linkedin.includes('linkedin.com') ? (personal_info.linkedin.startsWith('http') ? personal_info.linkedin : `https://${personal_info.linkedin}`) : `https://linkedin.com/in/${personal_info.linkedin}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 ml-2 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
            {personal_info.linkedin.replace(/^(https?:\\/\\/)?(www\.)?/, '')}
          </a>}
          {personal_info.github && <a href={personal_info.github.includes('github.com') ? (personal_info.github.startsWith('http') ? personal_info.github : `https://${personal_info.github}`) : `https://github.com/${personal_info.github}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 ml-2 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            {personal_info.github.replace(/^(https?:\\/\\/)?(www\.)?/, '')}
          </a>}
          {personal_info.website && <a href={personal_info.website.startsWith('http') ? personal_info.website : `https://${personal_info.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 ml-2 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            {personal_info.website.replace(/^(https?:\\/\\/)?(www\.)?/, '')}
          </a>}
          {personal_info.location && <span className="flex items-center gap-1 ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            {personal_info.location}
          </span>}
        </div>
      </header>

      {summary && (
        <section className="mb-2.5" data-section="summary">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Professional Summary</h2>
          <p className="text-[0.6875rem] leading-snug">{summary}</p>
        </section>
      )}

      {education && education.length > 0 && (
        <section className="mb-2.5" data-section="education">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Education</h2>
          <div className="space-y-2">
            {education.map((edu, i) => (
              <div key={i} className="text-[0.6875rem]">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{edu.institution}</span>
                  <span>{edu.location}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span>{edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}</span>
                  <span>{edu.start_date} - {edu.end_date || 'Present'}</span>
                </div>
                {edu.gpa && <span>GPA: {edu.gpa}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="mb-2.5" data-section="experience">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Experience</h2>
          <div className="space-y-3">
            {experience.map((exp, i) => (
              <div key={i} className="text-[0.6875rem]">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{exp.company}</span>
                  <span>{exp.location}</span>
                </div>
                <div className="flex justify-between items-baseline italic mb-1">
                  <span>{exp.role}</span>
                  <span>{exp.start_date} - {exp.end_date || 'Present'}</span>
                </div>
                {ensureStringArray(exp.bullet_points || exp.description).length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {ensureStringArray(exp.bullet_points || exp.description).map((bp, j) => (
                      <li key={j} className="leading-snug">{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {categorizedSkills && Object.keys(categorizedSkills).length > 0 && (
        <section className="mb-2.5" data-section="skills">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Technical Skills</h2>
          <div className="text-[0.6875rem] leading-snug">
            {Object.entries(categorizedSkills)
              .filter(([_, items]: any) => {
                if (Array.isArray(items)) return items.filter(i => i && String(i).trim() !== '').length > 0;
                if (typeof items === 'string') return items.trim() !== '';
                return false;
              })
              .map(([category, items]: any, i) => (
                <div key={i} className="mb-0.5 flex">
                  <span className="font-bold w-[160px] shrink-0">{category}: </span>
                  <span>{Array.isArray(items) ? items.filter(i => i && String(i).trim() !== '').join(', ') : items}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {projects && projects.length > 0 && (
        <section className="mb-2.5" data-section="projects">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Projects</h2>
          <div className="space-y-3">
            {projects.map((proj, i) => (
              <div key={i} className="text-[0.6875rem]">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="font-bold">
                    {proj.name} {proj.link && <span className="font-normal mx-1">({proj.link})</span>}
                  </span>
                  <span>{proj.start_date ? `${proj.start_date} - ${proj.end_date || 'Present'}` : proj.date || ''}</span>
                </div>
                {proj.role && (
                  <div className="italic mb-1">{proj.role}</div>
                )}
                {ensureStringArray(proj.technology_stack).length > 0 && (
                  <div className="italic mb-1">{ensureStringArray(proj.technology_stack).join(', ')}</div>
                )}
                {ensureStringArray(proj.description).length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {ensureStringArray(proj.description).map((bp, j) => (
                      <li key={j} className="leading-snug">{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {certifications && certifications.length > 0 && (
        <section className="mb-2.5" data-section="certifications">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Certifications</h2>
          <div className="space-y-1">
            {certifications.map((cert, i) => (
              <div key={i} className="text-[0.6875rem]">
                <span className="font-bold">{cert.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {achievements && achievements.length > 0 && (
        <section className="mb-2.5" data-section="achievements">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Achievements / Awards</h2>
          <ul className="list-disc pl-4 text-[0.6875rem] space-y-0.5 mb-2">
            {achievements.map((ach, i) => (
              <li key={i} className="leading-snug">{ach}</li>
            ))}
          </ul>
          {awards && awards.length > 0 && (
            <div className="space-y-1">
              {awards.map((award, i) => (
                <div key={i} className="text-[0.6875rem] flex justify-between items-baseline">
                  <span className="font-bold">{award.title} <span className="font-normal italic">({award.issuer})</span></span>
                  <span>{award.date}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {volunteer_experience && volunteer_experience.length > 0 && (
        <section className="mb-2.5" data-section="volunteer">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Leadership / Volunteering</h2>
          <div className="space-y-3">
            {volunteer_experience.map((vol, i) => (
              <div key={i} className="text-[0.6875rem]">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">{vol.organization}</span>
                  <span>{vol.start_date} - {vol.end_date || 'Present'}</span>
                </div>
                <div className="italic mb-1">{vol.role}</div>
                {vol.description && vol.description.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {vol.description.map((bp, j) => (
                      <li key={j} className="leading-snug">{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {publications && publications.length > 0 && (
        <section className="mb-2.5" data-section="publications">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Publications / Research</h2>
          <div className="space-y-2">
            {publications.map((pub, i) => (
              <div key={i} className="text-[0.6875rem]">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold">
                    {pub.title} {pub.link && <span className="font-normal mx-1">({pub.link})</span>}
                  </span>
                  <span>{pub.date}</span>
                </div>
                {pub.publisher && <div className="italic">{pub.publisher}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {languages && languages.length > 0 && (
        <section className="mb-2.5" data-section="languages">
          <h2 className="text-sm font-bold border-b border-black mb-1.5 uppercase">Languages</h2>
          <div className="text-[0.6875rem] flex flex-wrap gap-4">
            {languages.map((lang, i) => (
              <span key={i}>
                <span className="font-bold">{lang.name}</span>
                {lang.proficiency && <span> ({lang.proficiency})</span>}
              </span>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
