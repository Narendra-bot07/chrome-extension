import React, { useEffect } from 'react';
import { categorizeSkills } from '../utils/skillCategorizer';

export default function ModernATS({ resume }) {
  useEffect(() => {
    if (resume) {
      console.log('--- Rendering ModernATS Template ---');
      console.log('Summary exists?', !!resume.summary);
      console.log('Experience exists?', resume.experience && resume.experience.length > 0);
      console.log('Projects exists?', resume.projects && resume.projects.length > 0);
      console.log('Education exists?', resume.education && resume.education.length > 0);
      console.log('Skills exists?', resume.skills && resume.skills.length > 0);
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
    <div className="font-sans p-10 max-w-4xl mx-auto bg-white text-gray-800" style={{ width: '8.5in', minHeight: '11in' }}>
      <header className="mb-8 border-l-4 border-indigo-600 pl-4">
        <h1 className="text-4xl font-light text-indigo-900 tracking-tight">{personal_info.name}</h1>
        {(personal_info.job_title || personal_info.title) && (
          <div className="text-lg font-medium text-indigo-700 mt-1">
            {personal_info.job_title || personal_info.title}
          </div>
        )}
        <div className="text-sm mt-3 flex flex-wrap gap-4 text-gray-600 font-medium">
          {personal_info.phone && <span>{personal_info.phone}</span>}
          {personal_info.email && <a href={`mailto:${personal_info.email}`} className="hover:underline text-indigo-700">{personal_info.email}</a>}
          {personal_info.linkedin && <a href={personal_info.linkedin.startsWith('http') ? personal_info.linkedin : `https://${personal_info.linkedin}`} target="_blank" rel="noreferrer" className="hover:underline text-indigo-700">{personal_info.linkedin.replace(/^(https?:\\/\\/)?(www\.)?/, '')}</a>}
          {personal_info.github && <a href={personal_info.github.startsWith('http') ? personal_info.github : `https://${personal_info.github}`} target="_blank" rel="noreferrer" className="hover:underline text-indigo-700">{personal_info.github.replace(/^(https?:\\/\\/)?(www\.)?/, '')}</a>}
          {personal_info.website && <a href={personal_info.website.startsWith('http') ? personal_info.website : `https://${personal_info.website}`} target="_blank" rel="noreferrer" className="hover:underline text-indigo-700">{personal_info.website.replace(/^(https?:\\/\\/)?(www\.)?/, '')}</a>}
          {personal_info.location && <span>{personal_info.location}</span>}
        </div>
      </header>

      {summary && (
        <section className="mb-8" data-section="summary">
          <h2 className="text-xl font-semibold text-indigo-900 mb-3">Summary</h2>
          <p className="text-sm leading-relaxed text-gray-700">{summary}</p>
        </section>
      )}

      {education && education.length > 0 && (
        <section className="mb-8" data-section="education">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Education</h2>
          <div className="space-y-4">
            {education.map((edu, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-gray-900">{edu.institution}</h3>
                  <span className="text-sm text-indigo-600 font-semibold">{edu.start_date} - {edu.end_date || 'Present'}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-gray-700">{edu.degree} in {edu.field_of_study}</span>
                  <span className="text-sm text-gray-500">{edu.location}</span>
                </div>
                {edu.gpa && <p className="text-sm text-gray-600 mt-1">GPA: {edu.gpa}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="mb-8" data-section="experience">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Experience</h2>
          <div className="space-y-6">
            {experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-gray-900">{exp.role}</h3>
                  <span className="text-sm text-indigo-600 font-semibold">{exp.start_date} - {exp.end_date || 'Present'}</span>
                </div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-medium text-gray-600">{exp.company}</span>
                  <span className="text-sm text-gray-500">{exp.location}</span>
                </div>
                {exp.bullet_points && exp.bullet_points.length > 0 ? (
                  <ul className="list-disc list-inside text-sm space-y-1.5 text-gray-700">
                    {exp.bullet_points.map((bp, j) => (
                      <li key={j} className="leading-relaxed">{bp}</li>
                    ))}
                  </ul>
                ) : exp.description && exp.description.length > 0 ? (
                  <ul className="list-disc list-inside text-sm space-y-1.5 text-gray-700">
                    {exp.description.map((bp, j) => (
                      <li key={j} className="leading-relaxed">{bp}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {categorizedSkills && Object.keys(categorizedSkills).length > 0 && (
        <section className="mb-8" data-section="skills">
          <h2 className="text-xl font-semibold text-indigo-900 mb-3">Core Competencies</h2>
          <div className="space-y-2">
            {Object.entries(categorizedSkills)
              .filter(([_, items]: any) => {
                if (Array.isArray(items)) return items.filter(i => i && String(i).trim() !== '').length > 0;
                if (typeof items === 'string') return items.trim() !== '';
                return false;
              })
              .map(([cat, items]: any, i) => (
                <div key={i} className="text-sm">
                  <span className="font-bold text-indigo-800">{cat}: </span>
                  <span className="text-gray-700">{Array.isArray(items) ? items.filter(i => i && String(i).trim() !== '').join(', ') : items}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {projects && projects.length > 0 && (
        <section className="mb-8" data-section="projects">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Projects</h2>
          <div className="space-y-6">
            {projects.map((proj, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-gray-900">
                    {proj.name} {proj.link && <span className="font-normal text-xs text-indigo-500 ml-2">({proj.link})</span>}
                  </h3>
                  <span className="text-sm text-indigo-600">{proj.role}</span>
                </div>
                {proj.technology_stack && proj.technology_stack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {proj.technology_stack.map((t, idx) => (
                      <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
                {proj.description && proj.description.length > 0 && (
                  <ul className="list-disc list-inside text-sm space-y-1.5 text-gray-700 mt-2">
                    {proj.description.map((bp, j) => (
                      <li key={j} className="leading-relaxed">{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {certifications && certifications.length > 0 && (
        <section className="mb-8" data-section="certifications">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Certifications</h2>
          <div className="space-y-3">
            {certifications.map((cert, i) => (
              <div key={i} className="text-sm text-gray-800">
                <span className="font-bold">{cert.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {achievements && achievements.length > 0 && (
        <section className="mb-8" data-section="achievements">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Achievements / Awards</h2>
          <ul className="list-disc list-inside text-sm space-y-1.5 text-gray-700 mb-4">
            {achievements.map((ach, i) => (
              <li key={i} className="leading-relaxed">{ach}</li>
            ))}
          </ul>
          {awards && awards.length > 0 && (
            <div className="space-y-3">
              {awards.map((award, i) => (
                <div key={i} className="text-sm">
                  <span className="font-bold text-gray-800">{award.title}</span> {award.date && <span className="text-gray-500">({award.date})</span>}
                  {award.issuer && <span className="text-gray-600 block">Issued by {award.issuer}</span>}
                  {award.description && <p className="mt-1 text-gray-700">{award.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {volunteer_experience && volunteer_experience.length > 0 && (
        <section className="mb-8" data-section="volunteer">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Leadership / Volunteering</h2>
          <div className="space-y-6">
            {volunteer_experience.map((vol, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-gray-900">{vol.role}</h3>
                  <span className="text-sm text-indigo-600 font-semibold">{vol.start_date} - {vol.end_date || 'Present'}</span>
                </div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-medium text-gray-600">{vol.organization}</span>
                </div>
                {vol.description && vol.description.length > 0 && (
                  <ul className="list-disc list-inside text-sm space-y-1.5 text-gray-700">
                    {vol.description.map((bp, j) => (
                      <li key={j} className="leading-relaxed">{bp}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {publications && publications.length > 0 && (
        <section className="mb-8" data-section="publications">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Publications / Research</h2>
          <div className="space-y-6">
            {publications.map((pub, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-gray-900">
                    {pub.title} {pub.link && <span className="font-normal text-xs text-indigo-500 ml-2">({pub.link})</span>}
                  </h3>
                  <span className="text-sm text-indigo-600 font-semibold">{pub.date}</span>
                </div>
                {pub.publisher && <div className="text-sm text-gray-600 mb-1">{pub.publisher}</div>}
                {pub.description && <p className="text-sm text-gray-700">{pub.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {languages && languages.length > 0 && (
        <section className="mb-8" data-section="languages">
          <h2 className="text-xl font-semibold text-indigo-900 mb-4 border-b-2 border-indigo-100 pb-2">Languages</h2>
          <div className="text-sm flex flex-wrap gap-4 text-gray-700">
            {languages.map((lang, i) => (
              <span key={i}>
                <span className="font-bold">{lang.name}</span>
                {lang.proficiency && <span className="text-gray-500"> ({lang.proficiency})</span>}
              </span>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
