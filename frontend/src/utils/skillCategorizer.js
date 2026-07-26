export function categorizeSkills(skillsArray, skillsCategories) {
  const getNonEmptyItems = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(item => String(item ?? '').trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  // If the backend already provided categories, use them after filtering out empty categories
  if (skillsCategories && typeof skillsCategories === 'object' && Object.keys(skillsCategories).length > 0) {
    const cleaned = {};
    for (const [cat, list] of Object.entries(skillsCategories)) {
      const items = getNonEmptyItems(list);
      if (items.length > 0) {
        cleaned[cat] = items;
      }
    }
    if (Object.keys(cleaned).length > 0) {
      return cleaned;
    }
  }

  // If we only have a flat array, we do best-effort categorization
  if (!skillsArray || !Array.isArray(skillsArray) || skillsArray.length === 0) {
    return {};
  }

  const categories = {
    'Languages': [],
    'Frameworks & Libraries': [],
    'Databases & Storage': [],
    'Cloud & DevOps': [],
    'AI & Machine Learning': [],
    'Tools & Platforms': [],
    'Core Fundamentals': []
  };

  const map = {
    'python': 'Languages', 'java': 'Languages', 'c++': 'Languages', 'c#': 'Languages', 'javascript': 'Languages', 'typescript': 'Languages', 'sql': 'Languages', 'go': 'Languages', 'rust': 'Languages', 'html': 'Languages', 'css': 'Languages', 'ruby': 'Languages', 'php': 'Languages', 'swift': 'Languages', 'kotlin': 'Languages',
    
    'react': 'Frameworks & Libraries', 'angular': 'Frameworks & Libraries', 'vue': 'Frameworks & Libraries', 'node': 'Frameworks & Libraries', 'express': 'Frameworks & Libraries', 'django': 'Frameworks & Libraries', 'flask': 'Frameworks & Libraries', 'fastapi': 'Frameworks & Libraries', 'spring': 'Frameworks & Libraries', 'next.js': 'Frameworks & Libraries', 'pytorch': 'Frameworks & Libraries', 'tensorflow': 'Frameworks & Libraries', 'keras': 'Frameworks & Libraries',
    
    'mysql': 'Databases & Storage', 'postgresql': 'Databases & Storage', 'mongodb': 'Databases & Storage', 'redis': 'Databases & Storage', 'elasticsearch': 'Databases & Storage', 'cassandra': 'Databases & Storage', 'dynamodb': 'Databases & Storage', 'dbms': 'Databases & Storage', 'oracle': 'Databases & Storage',
    
    'aws': 'Cloud & DevOps', 'azure': 'Cloud & DevOps', 'gcp': 'Cloud & DevOps', 'docker': 'Cloud & DevOps', 'kubernetes': 'Cloud & DevOps', 'ci/cd': 'Cloud & DevOps', 'jenkins': 'Cloud & DevOps', 'github actions': 'Cloud & DevOps', 'terraform': 'Cloud & DevOps', 'linux': 'Cloud & DevOps',
    
    'llm': 'AI & Machine Learning', 'rag': 'AI & Machine Learning', 'machine learning': 'AI & Machine Learning', 'deep learning': 'AI & Machine Learning', 'nlp': 'AI & Machine Learning', 'prompt': 'AI & Machine Learning', 'embedding': 'AI & Machine Learning', 'langchain': 'AI & Machine Learning', 'langgraph': 'AI & Machine Learning', 'hugging face': 'AI & Machine Learning', 'faiss': 'AI & Machine Learning', 'chroma': 'AI & Machine Learning', 'pinecone': 'AI & Machine Learning', 'mosaic': 'AI & Machine Learning', 'spacy': 'AI & Machine Learning', 'nltk': 'AI & Machine Learning',
    
    'git': 'Tools & Platforms', 'github': 'Tools & Platforms', 'bitbucket': 'Tools & Platforms', 'jira': 'Tools & Platforms', 'postman': 'Tools & Platforms', 'databricks': 'Tools & Platforms', 'spark': 'Tools & Platforms', 'mlflow': 'Tools & Platforms', 'kafka': 'Tools & Platforms', 'prometheus': 'Tools & Platforms', 'grafana': 'Tools & Platforms', 'delta lake': 'Tools & Platforms', 'api': 'Tools & Platforms',
    
    'data structure': 'Core Fundamentals', 'algorithm': 'Core Fundamentals', 'oop': 'Core Fundamentals', 'operating system': 'Core Fundamentals', 'network': 'Core Fundamentals'
  };

  skillsArray.forEach(skill => {
    if (!skill || String(skill).trim() === '') return;
    const key = String(skill).toLowerCase().trim();
    let placed = false;
    
    for (const [mappedKey, category] of Object.entries(map)) {
      if (key === mappedKey || key.includes(mappedKey)) {
        categories[category].push(skill);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      categories['Core Fundamentals'].push(skill);
    }
  });

  const result = {};
  for (const [cat, items] of Object.entries(categories)) {
    const validItems = [...new Set(items.map(s => String(s).trim()).filter(Boolean))];
    if (validItems.length > 0) {
      result[cat] = validItems;
    }
  }

  return result;
}
