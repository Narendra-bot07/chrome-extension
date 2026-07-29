import React, { useEffect } from 'react';
import { categorizeSkills } from '../utils/skillCategorizer';

export default function MinimalATS({ resume }) {
  useEffect(() => {
    if (resume) {
      console.log('--- Rendering MinimalATS Template ---');
    }
  }, [resume]);

  if (!resume || !resume.personal_info) return <div>No data</div>;
  const { 
    personal_info, summary, experience, education, skills, skills_categories,
    projects, certifications, achievements, languages, awards,
    volunteer_experience, publications
  } = resume;

  const categorizedSkills = categorizeSkills(skills, skills_categories);

  return (
    <div className="font-mono p-10 max-w-4xl mx-auto bg-white text-black" style={{ width: '8.5in', minHeight: '11in' }}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold uppercase">{personal_info.name}</h1>
        {(personal_info.job_title || personal_info.title) && (
          <div className="text-sm font-semibold uppercase mt-1 text-gray-700">
            {personal_info.job_title || personal_info.title}
          </div>
        )}
        <div className="text-xs mt-2 flex flex-col gap-1">
          {personal_info.phone && <span>P: {personal_info.phone}</span>}
          {personal_info.email && <span>E: {personal_info.email}</span>}
          {personal_info.linkedin && <span>In: {personal_info.linkedin}</span>}
          {personal_info.github && <span>Git: {personal_info.github}</span>}
          {personal_info.website && <span>W: {personal_info.website}</span>}
          {personal_info.location && <span>L: {personal_info.location}</span>}
        </div>
      </header>

      {summary && (
        <section className="mb-6" data-section="summary">
          <p className="text-sm">{summary}</p>
        </section>
      )}

      {education && education.length > 0 && (
        <section className="mb-6" data-section="education">
          <h2 className="text-sm font-bold uppercase mb-4">Education</h2>
          <div className="space-y-4">
            {education.map((edu, i) => (
              <div key={i} className="text-sm">
                <span className="font-bold">{edu.institution}</span>
                <div className="ml-2 mt-1">
                  {edu.degree} in {edu.field_of_study} ({edu.start_date} - {edu.end_date || 'Present'})
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="mb-6" data-section="experience">
          <h2 className="text-sm font-bold uppercase mb-4">Experience</h2>
          <div className="space-y-6">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="text-sm mb-2">
                  <span className="font-bold">{exp.role}</span> @ {exp.company} ({exp.start_date} - {exp.end_date || 'Present'})
                </div>
                {exp.bullet_points && exp.bullet_points.length > 0 ? (
                  <ul className="list-[square] list-inside text-sm space-y-1 ml-2">
                    {exp.bullet_points.map((bp, j) => (
                      <li key={j}>{bp}</li>
                    ))}
                  </ul>
                ) : exp.description && exp.description.length > 0 ? (
                   <ul className="list-[square] list-inside text-sm space-y-1 ml-2">
                    {exp.description.map((bp, j) => (
                      <li key={j}>{bp}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}
      
      {categorizedSkills && Object.keys(categorizedSkills).length > 0 && (
        <section className="mb-6" data-section="skills">
          <h2 className="text-sm font-bold uppercase mb-2">Skills</h2>
          <div className="text-sm space-y-1">
            {Object.entries(categorizedSkills)
              .filter(([_, items]: any) => {
                if (Array.isArray(items)) return items.filter(i => i && String(i).trim() !== '').length > 0;
                if (typeof items === 'string') return items.trim() !== '';
                return false;
              })
              .map(([cat, items]: any, i) => (
                <div key={i}>
                  <span className="font-bold">{cat}:</span> {Array.isArray(items) ? items.filter(i => i && String(i).trim() !== '').join(', ') : items}
                </div>
              ))}
          </div>
        </section>
      )}

      {projects && projects.length > 0 && (
        <section className="mb-6" data-section="projects">
          <h2 className="text-sm font-bold uppercase mb-4">Projects</h2>
          <div className="space-y-6">
            {projects.map((proj, i) => (
              <div key={i}>
                <div className="text-sm mb-2">
                  <span className="font-bold">{proj.name}</span> {proj.role && <span>- {proj.role}</span>}
                </div>
                {proj.description && proj.description.length > 0 && (
                  <ul className="list-[square] list-inside text-sm space-y-1 ml-2">
                    {proj.description.map((bp, j) => (
                      <li key={j}>{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {certifications && certifications.length > 0 && (
        <section className="mb-6" data-section="certifications">
          <h2 className="text-sm font-bold uppercase mb-4">Certifications</h2>
          <div className="space-y-2">
            {certifications.map((cert, i) => (
              <div key={i} className="text-sm">
                <span className="font-bold">{cert.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {achievements && achievements.length > 0 && (
        <section className="mb-6" data-section="achievements">
          <h2 className="text-sm font-bold uppercase mb-4">Achievements / Awards</h2>
          <ul className="list-[square] list-inside text-sm space-y-1 ml-2">
            {achievements.map((ach, i) => (
              <li key={i}>{ach}</li>
            ))}
          </ul>
          {awards && awards.length > 0 && (
            <div className="space-y-2 mt-2">
              {awards.map((award, i) => (
                <div key={i} className="text-sm ml-2">
                  <span className="font-bold">{award.title}</span> {award.issuer && <span>- {award.issuer}</span>} {award.date && <span>({award.date})</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {volunteer_experience && volunteer_experience.length > 0 && (
        <section className="mb-6" data-section="volunteer">
          <h2 className="text-sm font-bold uppercase mb-4">Leadership / Volunteering</h2>
          <div className="space-y-4">
            {volunteer_experience.map((vol, i) => (
              <div key={i} className="text-sm">
                <span className="font-bold">{vol.role}</span> @ {vol.organization}
                {vol.description && vol.description.length > 0 && (
                  <ul className="list-[square] list-inside text-sm space-y-1 ml-2 mt-1">
                    {vol.description.map((bp, j) => (
                      <li key={j}>{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {publications && publications.length > 0 && (
        <section className="mb-6" data-section="publications">
          <h2 className="text-sm font-bold uppercase mb-4">Publications / Research</h2>
          <div className="space-y-4">
            {publications.map((pub, i) => (
              <div key={i} className="text-sm ml-2">
                <span className="font-bold">{pub.title}</span> {pub.date && <span>({pub.date})</span>}
                {pub.publisher && <span className="text-gray-500 block">Published in {pub.publisher}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {languages && languages.length > 0 && (
        <section className="mb-6" data-section="languages">
          <h2 className="text-sm font-bold uppercase mb-4">Languages</h2>
          <div className="text-sm ml-2">
            {languages.map(l => `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}
          </div>
        </section>
      )}

    </div>
  );
}
