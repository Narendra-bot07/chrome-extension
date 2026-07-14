export function isSeniorProfile(resume) {
  if (!resume || !resume.experience || resume.experience.length === 0) return false;
  
  // Try to parse years of experience
  try {
    const startYears = resume.experience
      .map(exp => {
        if (!exp.start_date) return null;
        const match = exp.start_date.match(/\b(19|20)\d{2}\b/);
        return match ? parseInt(match[0]) : null;
      })
      .filter(year => year !== null);
      
    if (startYears.length === 0) return false;
    
    const earliestYear = Math.min(...startYears);
    const currentYear = new Date().getFullYear();
    const yearsOfExp = currentYear - earliestYear;
    
    if (yearsOfExp >= 10) return true;
    
    // Also consider senior if they have many publications or patents + some experience
    if (resume.publications && resume.publications.length >= 3 && yearsOfExp >= 5) return true;
    
    return false;
  } catch (e) {
    return false;
  }
}

export function compressResumeData(originalResume, compressionLevel) {
  // Deep clone to avoid mutating the original
  const resume = JSON.parse(JSON.stringify(originalResume));
  
  if (compressionLevel < 3) {
    return resume; // Levels 0, 1, 2 only apply CSS changes, no data changes
  }
  
  // Level 3: Soft Truncation
  if (compressionLevel >= 3) {
    // Limit experience bullets to 5
    if (resume.experience) {
      resume.experience.forEach(exp => {
        if (exp.description && exp.description.length > 5) {
          exp.description = exp.description.slice(0, 5);
        }
      });
    }
    
    // Limit project bullets to 3
    if (resume.projects) {
      resume.projects.forEach(proj => {
        if (proj.description && proj.description.length > 3) {
          proj.description = proj.description.slice(0, 3);
        }
      });
    }
  }
  
  // Level 4: Aggressive Truncation
  if (compressionLevel >= 4) {
    // Limit experience bullets to 3
    if (resume.experience) {
      resume.experience.forEach(exp => {
        if (exp.description && exp.description.length > 3) {
          exp.description = exp.description.slice(0, 3);
        }
      });
    }
    
    // Limit project bullets to 2
    if (resume.projects) {
      resume.projects.forEach(proj => {
        if (proj.description && proj.description.length > 2) {
          proj.description = proj.description.slice(0, 2);
        }
      });
    }
    
    // Remove Volunteer and Languages to save space
    delete resume.volunteer_experience;
    delete resume.languages;
  }
  
  // Level 5: Prune entire secondary sections
  if (compressionLevel >= 5) {
    delete resume.awards;
    delete resume.achievements;
    delete resume.certifications;
    delete resume.publications;
  }
  
  return resume;
}
