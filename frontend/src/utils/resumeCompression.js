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
  // Layout compression must never be content compression.  The old
  // implementation sliced bullets and deleted secondary sections at levels
  // 3-5, which made the downloaded PDF a lossy reconstruction of the resume.
  // Keep this function for API compatibility, but only attach presentation
  // metadata to a deep clone. PrintLayout applies font/spacing density.
  const resume = JSON.parse(JSON.stringify(originalResume));
  resume.layout_compression_level = Math.max(0, Number(compressionLevel) || 0);
  return resume;
}
