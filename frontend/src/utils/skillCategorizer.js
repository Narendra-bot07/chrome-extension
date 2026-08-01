const CATEGORY_ORDER = [
  'Languages',
  'Software Engineering',
  'Frontend & Backend',
  'AI & Generative AI',
  'Data Engineering',
  'Databases',
  'Cloud',
  'DevOps',
  'Machine Learning',
  'Visualization',
  'Observability',
  'Computer Science Fundamentals',
  'Frameworks and Libraries',
  'Other'
];

const ALIASES = new Map(Object.entries({
  'py spark': 'PySpark',
  pyspark: 'PySpark',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  'github actions': 'GitHub Actions',
  'scikit learn': 'scikit-learn',
  'scikit-learn': 'scikit-learn',
  'ms azure': 'Microsoft Azure',
  azure: 'Microsoft Azure',
  numpy: 'NumPy',
  pandas: 'Pandas',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  mlflow: 'MLflow',
  llm: 'LLMs',
  llms: 'LLMs',
  rag: 'RAG',
  'power bi': 'Power BI'
}));

const CATEGORY_RULES = [
  ['Languages', /\b(python|java|javascript|typescript|c\+\+|c#|sql|go|rust|ruby|php|swift|kotlin|html|css)\b/i],
  ['Data Engineering', /\b(pyspark|spark|kafka|databricks|delta lake|airflow|etl|data pipeline|medallion|unity catalog|adls gen2)\b/i],
  ['Databases', /\b(postgresql|mysql|mongodb|redis|oracle|cassandra|dynamodb|dbms|snowflake|bigquery)\b/i],
  ['Cloud', /\b(aws|amazon web services|microsoft azure|gcp|google cloud|azure)\b/i],
  ['DevOps', /\b(docker|kubernetes|jenkins|github actions|terraform|ci\/cd|linux|git)\b/i],
  ['AI & Generative AI', /\b(llms?|rag|langchain|langgraph|prompt engineering|vector search|embeddings?|hugging face|pytorch|tensorflow)\b/i],
  ['Machine Learning', /\b(machine learning|deep learning|tensorflow|pytorch|scikit-learn|regression|classification|clustering|model evaluation)\b/i],
  ['Visualization', /\b(power bi|tableau|matplotlib|seaborn|data visualization)\b/i],
  ['Observability', /\b(opentelemetry|prometheus|grafana|loki|tempo|monitoring|tracing)\b/i],
  ['Computer Science Fundamentals', /\b(data structures?|algorithms?|object-oriented|oop|operating systems?|computer networks?|system design|design patterns|rest apis)\b/i],
  ['Frameworks and Libraries', /\b(react|angular|vue|node|express|django|flask|fastapi|pydantic|vite|tailwind|spring|next\.js|numpy|pandas)\b/i]
];

const inputItems = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(inputItems);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  if (value && typeof value === 'object') return inputItems(value.name || value.skill || value.title || '');
  return [];
};

export function normalizeSkillName(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return ALIASES.get(clean.toLowerCase()) || clean;
}

export function skillSemanticKey(value) {
  return normalizeSkillName(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

export function categorizeSkill(value) {
  const name = normalizeSkillName(value);
  const category = CATEGORY_RULES.find(([, pattern]) => pattern.test(name))?.[0] || 'Other';
  return { name, normalizedName: skillSemanticKey(name), category };
}

export function categorizeSkills(skillsArray = [], skillsCategories = {}) {
  const result = {};
  const seen = new Set();

  const add = (value, preferredCategory = null) => {
    const cleanName = normalizeSkillName(value);
    if (!cleanName) return;
    const semKey = skillSemanticKey(cleanName);
    if (seen.has(semKey)) return;
    seen.add(semKey);

    const category = (preferredCategory && String(preferredCategory).trim())
      ? String(preferredCategory).trim()
      : categorizeSkill(cleanName).category;

    if (!result[category]) {
      result[category] = [];
    }
    result[category].push(cleanName);
  };

  // 1. Preserve explicit source categories from resume parser/user
  if (skillsCategories && typeof skillsCategories === 'object' && !Array.isArray(skillsCategories)) {
    Object.entries(skillsCategories).forEach(([category, values]) => {
      const items = inputItems(values);
      items.forEach(value => add(value, category));
    });
  } else if (Array.isArray(skillsCategories) && skillsCategories.length > 0) {
    skillsCategories.forEach(catObj => {
      if (typeof catObj === 'string') {
        add(catObj);
      } else if (catObj && typeof catObj === 'object') {
        const catName = catObj.name || catObj.category || catObj.title;
        const items = inputItems(catObj.skills || catObj.items || catObj.values || []);
        items.forEach(val => add(val, catName));
      }
    });
  }

  // 2. Add any uncategorized skills array entries
  const extraSkills = inputItems(skillsArray);
  extraSkills.forEach(val => add(val, null));

  return result;
}
