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
          {personal_info.email && <a href={`mailto:${personal_info.email}`} className="hover:underline">E: {personal_info.email}</a>}
          {personal_info.linkedin && <a href={personal_info.linkedin.includes('linkedin.com') ? (personal_info.linkedin.startsWith('http') ? personal_info.linkedin : `https://${personal_info.linkedin}`) : `https://linkedin.com/in/${personal_info.linkedin}`} target="_blank" rel="noreferrer" className="hover:underline">In: {personal_info.linkedin.replace(/^(https?:\/\/)?(www\.)?/, '')}</a>}
          {personal_info.github && <a href={personal_info.github.includes('github.com') ? (personal_info.github.startsWith('http') ? personal_info.github : `https://${personal_info.github}`) : `https://github.com/${personal_info.github}`} target="_blank" rel="noreferrer" className="hover:underline">Git: {personal_info.github.replace(/^(https?:\/\/)?(www\.)?/, '')}</a>}
          {personal_info.website && <a href={personal_info.website.startsWith('http') ? personal_info.website : `https://${personal_info.website}`} target="_blank" rel="noreferrer" className="hover:underline">W: {personal_info.website.replace(/^(https?:\/\/)?(www\.)?/, '')}</a>}
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

      {projects && projects.length > 0 && (
        <section className="mb-6" data-section="projects">
          <h2 className="text-sm font-bold uppercase mb-4">Projects</h2>
          <div className="space-y-4">
            {projects.map((proj, i) => (
              <div key={i}>
                <div className="text-sm font-bold flex items-center justify-between">
                  <span>{proj.title}</span>
                  {proj.link && (
                    <a href={proj.link.startsWith('http') ? proj.link : `https://${proj.link}`} target="_blank" rel="noreferrer" className="text-xs font-normal underline">
                      {proj.link}
                    </a>
                  )}
                </div>
                {proj.description && <p className="text-xs mt-1 text-gray-700">{proj.description}</p>}
                {proj.bullet_points && proj.bullet_points.length > 0 && (
                  <ul className="list-[square] list-inside text-xs space-y-1 mt-1 ml-2 text-gray-800">
                    {proj.bullet_points.map((bp, j) => (
                      <li key={j}>{bp}</li>
                    ))}
                  </ul>
                )}
                {proj.technologies && proj.technologies.length > 0 && (
                  <div className="text-xs text-gray-600 mt-1">
                    Tech: {proj.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(categorizedSkills).length > 0 && (
        <section className="mb-6" data-section="skills">
          <h2 className="text-sm font-bold uppercase mb-4">Skills</h2>
          <div className="space-y-2 text-sm">
            {Object.entries(categorizedSkills).map(([cat, skillList]) => (
              <div key={cat} className="flex gap-2">
                <span className="font-bold min-w-[140px]">{cat}:</span>
                <span>{skillList.join(', ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {certifications && certifications.length > 0 && (
        <section className="mb-6" data-section="certifications">
          <h2 className="text-sm font-bold uppercase mb-4">Certifications</h2>
          <ul className="list-[square] list-inside text-sm space-y-1">
            {certifications.map((cert, i) => (
              <li key={i}>
                <span className="font-bold">{cert.name}</span>
                {cert.issuer && ` - ${cert.issuer}`}
                {cert.date && ` (${cert.date})`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {achievements && achievements.length > 0 && (
        <section className="mb-6" data-section="achievements">
          <h2 className="text-sm font-bold uppercase mb-4">Achievements</h2>
          <ul className="list-[square] list-inside text-sm space-y-1">
            {achievements.map((ach, i) => (
              <li key={i}>{typeof ach === 'string' ? ach : ach.description || ach.title}</li>
            ))}
          </ul>
        </section>
      )}

      {languages && languages.length > 0 && (
        <section className="mb-6" data-section="languages">
          <h2 className="text-sm font-bold uppercase mb-4">Languages</h2>
          <div className="text-sm">
            {languages.map(l => typeof l === 'string' ? l : `${l.language}${l.proficiency ? ` (${l.proficiency})` : ''}`).join(', ')}
          </div>
        </section>
      )}

      {awards && awards.length > 0 && (
        <section className="mb-6" data-section="awards">
          <h2 className="text-sm font-bold uppercase mb-4">Awards</h2>
          <ul className="list-[square] list-inside text-sm space-y-1">
            {awards.map((awd, i) => (
              <li key={i}>{typeof awd === 'string' ? awd : awd.title}</li>
            ))}
          </ul>
        </section>
      )}

      {volunteer_experience && volunteer_experience.length > 0 && (
        <section className="mb-6" data-section="volunteer">
          <h2 className="text-sm font-bold uppercase mb-4">Volunteer Experience</h2>
          <div className="space-y-4">
            {volunteer_experience.map((vol, i) => (
              <div key={i} className="text-sm">
                <div className="font-bold">{vol.role} - {vol.organization}</div>
                {vol.description && <p className="mt-1 text-gray-700">{vol.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {publications && publications.length > 0 && (
        <section className="mb-6" data-section="publications">
          <h2 className="text-sm font-bold uppercase mb-4">Publications</h2>
          <ul className="list-[square] list-inside text-sm space-y-1">
            {publications.map((pub, i) => (
              <li key={i}>
                <span className="font-bold">{pub.title}</span>
                {pub.publisher && ` - ${pub.publisher}`}
                {pub.date && ` (${pub.date})`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
