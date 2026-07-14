import React, { useEffect } from 'react';
import { Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { categorizeSkills } from '../utils/skillCategorizer';

export default function ModernProATS({ resume }) {
  useEffect(() => {
    if (resume) {
      console.log('--- Rendering ModernProATS Template ---');
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
    <div className="font-sans bg-white text-zinc-900" style={{ width: '8.5in' }}>
      <div className="flex h-full">
        
        {/* LEFT COLUMN */}
        <div className="w-[32%] bg-zinc-50/60 p-8 border-r border-zinc-200">
          
          <div className="flex flex-col space-y-3 mb-10 text-xs font-medium text-zinc-700">
            {personal_info.email && (
              <div className="flex items-center gap-3">
                <span className="text-indigo-900"><Mail size={14} /></span>
                <span>{personal_info.email}</span>
              </div>
            )}
            {personal_info.phone && (
              <div className="flex items-center gap-3">
                <span className="text-indigo-900"><Phone size={14} /></span>
                <span>{personal_info.phone}</span>
              </div>
            )}
            {personal_info.location && (
              <div className="flex items-center gap-3">
                <span className="text-indigo-900"><MapPin size={14} /></span>
                <span>{personal_info.location}</span>
              </div>
            )}
            {personal_info.linkedin && (
              <div className="flex items-center gap-3">
                <span className="text-indigo-900"><Linkedin size={14} /></span>
                <span>{personal_info.linkedin.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
              </div>
            )}
            {personal_info.website && (
              <div className="flex items-center gap-3">
                <span className="text-indigo-900"><Globe size={14} /></span>
                <span>{personal_info.website.replace(/^(https?:\/\/)?(www\.)?/, '')}</span>
              </div>
            )}
          </div>

          {categorizedSkills && Object.keys(categorizedSkills).length > 0 && (
            <div className="mb-10" data-section="skills">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4 border-b border-indigo-100 pb-2">Skills</h2>
              <div className="space-y-4">
                {Object.entries(categorizedSkills).map(([category, skillList]) => (
                  <div key={category}>
                    <h3 className="text-[0.625rem] font-bold text-zinc-500 uppercase mb-2">{category}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {skillList.map((skill, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-indigo-100 text-indigo-900 text-[0.625rem] rounded shadow-sm font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {education && education.length > 0 && (
            <div className="mb-10" data-section="education">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4 border-b border-indigo-100 pb-2">Education</h2>
              <div className="space-y-5">
                {education.map((edu, i) => (
                  <div key={i}>
                    <h3 className="font-bold text-sm text-zinc-900">{edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}</h3>
                    <div className="text-xs text-zinc-700 font-medium mt-1">{edu.institution}</div>
                    <div className="text-xs text-zinc-500 mt-1">{edu.start_date} - {edu.end_date || 'Present'}</div>
                    {edu.location && <div className="text-xs text-zinc-500 mt-0.5">{edu.location}</div>}
                    {edu.gpa && <div className="text-xs text-zinc-700 mt-1 font-medium">GPA: {edu.gpa}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {certifications && certifications.length > 0 && (
            <div className="mb-10" data-section="certifications">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4 border-b border-indigo-100 pb-2">Certifications</h2>
              <div className="space-y-4">
                {certifications.map((cert, i) => (
                  <div key={i}>
                    <h3 className="font-bold text-xs text-zinc-900">{cert.name}</h3>
                    <div className="text-xs text-zinc-700 mt-0.5">{cert.issuing_organization}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{cert.issue_date}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {languages && languages.length > 0 && (
            <div className="mb-10" data-section="languages">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4 border-b border-indigo-100 pb-2">Languages</h2>
              <div className="space-y-2 text-xs">
                {languages.map((lang, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-zinc-100 pb-1">
                    <span className="font-medium text-zinc-800">{lang.name}</span>
                    {lang.proficiency && <span className="text-zinc-500">{lang.proficiency}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN */}
        <div className="w-[68%] p-8 pl-10">
          
          <header className="mb-8 border-b-2 border-indigo-900 pb-6">
            <h1 className="text-4xl font-extrabold text-zinc-900 tracking-tight uppercase" style={{fontFamily: 'Georgia, serif'}}>{personal_info.name}</h1>
          </header>

          {summary && (
            <section className="mb-8" data-section="summary">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-3">Professional Summary</h2>
              <p className="text-xs leading-relaxed text-zinc-800">{summary}</p>
            </section>
          )}

          {experience && experience.length > 0 && (
            <section className="mb-8" data-section="experience">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Experience</h2>
              <div className="space-y-6">
                {experience.map((exp, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-sm text-zinc-900"><span className="text-zinc-900">{exp.role}</span> <span className="font-normal text-zinc-400 mx-1">@</span> <span className="font-medium">{exp.company}</span></h3>
                      <span className="text-xs text-zinc-600 font-medium">{exp.start_date} - {exp.end_date || 'Present'}</span>
                    </div>
                    {exp.location && <div className="text-[0.6875rem] text-zinc-500 italic text-right mb-2">{exp.location}</div>}
                    
                    {exp.bullet_points && exp.bullet_points.length > 0 ? (
                      <ul className="list-disc list-inside text-xs space-y-1.5 text-zinc-800 mt-2">
                        {exp.bullet_points.map((bp, j) => (
                          <li key={j} className="leading-relaxed pl-1"><span className="relative -left-1">{bp}</span></li>
                        ))}
                      </ul>
                    ) : exp.description && exp.description.length > 0 ? (
                      <ul className="list-disc list-inside text-xs space-y-1.5 text-zinc-800 mt-2">
                        {exp.description.map((bp, j) => (
                          <li key={j} className="leading-relaxed pl-1"><span className="relative -left-1">{bp}</span></li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {projects && projects.length > 0 && (
            <section className="mb-8" data-section="projects">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Projects</h2>
              <div className="space-y-6">
                {projects.map((proj, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-sm text-zinc-900">
                        {proj.name} {proj.link && <span className="font-normal text-[0.6875rem] text-indigo-500 ml-2">({proj.link})</span>}
                      </h3>
                      {proj.role && <span className="text-xs text-zinc-600 font-medium">{proj.role}</span>}
                    </div>
                    {proj.technology_stack && proj.technology_stack.length > 0 && (
                      <div className="text-[0.6875rem] text-indigo-700 font-medium mb-2 italic">
                        {proj.technology_stack.join(' • ')}
                      </div>
                    )}
                    {proj.description && proj.description.length > 0 && (
                      <ul className="list-disc list-inside text-xs space-y-1.5 text-zinc-800">
                        {proj.description.map((bp, j) => (
                          <li key={j} className="leading-relaxed pl-1"><span className="relative -left-1">{bp}</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          
          {achievements && achievements.length > 0 && (
            <section className="mb-8" data-section="achievements">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Achievements</h2>
              <ul className="list-disc list-inside text-xs space-y-1.5 text-zinc-800">
                {achievements.map((ach, i) => (
                  <li key={i} className="leading-relaxed pl-1"><span className="relative -left-1">{ach}</span></li>
                ))}
              </ul>
            </section>
          )}

          {awards && awards.length > 0 && (
            <section className="mb-8" data-section="awards">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Awards</h2>
              <div className="space-y-3">
                {awards.map((award, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-bold text-zinc-900">{award.title}</span> {award.date && <span className="text-zinc-500 ml-2">{award.date}</span>}
                    {award.issuer && <span className="text-zinc-700 block mt-0.5">Issued by {award.issuer}</span>}
                    {award.description && <p className="mt-1 text-zinc-600">{award.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {volunteer_experience && volunteer_experience.length > 0 && (
            <section className="mb-8" data-section="volunteer">
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Volunteer Experience</h2>
              <div className="space-y-6">
                {volunteer_experience.map((vol, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-sm text-zinc-900"><span className="text-zinc-900">{vol.role}</span> <span className="font-normal text-zinc-400 mx-1">@</span> <span className="font-medium">{vol.organization}</span></h3>
                      <span className="text-xs text-zinc-600 font-medium">{vol.start_date} - {vol.end_date || 'Present'}</span>
                    </div>
                    {vol.description && vol.description.length > 0 && (
                      <ul className="list-disc list-inside text-xs space-y-1.5 text-zinc-800 mt-2">
                        {vol.description.map((bp, j) => (
                          <li key={j} className="leading-relaxed pl-1"><span className="relative -left-1">{bp}</span></li>
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
              <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-4">Publications</h2>
              <div className="space-y-4">
                {publications.map((pub, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-sm text-zinc-900">
                        {pub.title} {pub.link && <span className="font-normal text-[0.6875rem] text-indigo-500 ml-2">({pub.link})</span>}
                      </h3>
                      <span className="text-xs text-zinc-600 font-medium">{pub.date}</span>
                    </div>
                    {pub.publisher && <div className="text-[0.6875rem] text-zinc-600 mb-1">{pub.publisher}</div>}
                    {pub.description && <p className="text-xs text-zinc-700">{pub.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
