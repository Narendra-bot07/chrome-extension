const CATEGORY_ORDER = [
  'Languages',
  'Data Engineering',
  'Databases',
  'Cloud',
  'DevOps',
  'AI & GenAI',
  'Machine Learning',
  'Visualization',
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
  ['Data Engineering', /\b(pyspark|spark|kafka|databricks|delta lake|airflow|etl|data pipeline|medallion|unity catalog)\b/i],
  ['Databases', /\b(postgresql|mysql|mongodb|redis|oracle|cassandra|dynamodb|dbms|snowflake|bigquery)\b/i],
  ['Cloud', /\b(aws|amazon web services|microsoft azure|gcp|google cloud)\b/i],
  ['DevOps', /\b(docker|kubernetes|jenkins|github actions|terraform|ci\/cd|linux|git)\b/i],
  ['AI & GenAI', /\b(llms?|rag|langchain|langgraph|prompt engineering|vector search|embeddings?)\b/i],
  ['Machine Learning', /\b(machine learning|deep learning|tensorflow|pytorch|scikit-learn|regression|classification|clustering|model evaluation)\b/i],
  ['Visualization', /\b(power bi|tableau|matplotlib|seaborn|data visualization)\b/i],
  ['Computer Science Fundamentals', /\b(data structures?|algorithms?|object-oriented|oop|operating systems?|computer networks?)\b/i],
  ['Frameworks and Libraries', /\b(react|angular|vue|node|express|django|flask|fastapi|spring|next\.js|numpy|pandas)\b/i]
];

const inputItems = value => {
  if (Array.isArray(value)) return value.flatMap(inputItems);
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  if (value && typeof value === 'object') return inputItems(value.name || value.skill || '');
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
  const result = Object.fromEntries(CATEGORY_ORDER.map(category => [category, []]));
  const seen = new Set();
  const add = (value, preferredCategory = null) => {
    const skill = categorizeSkill(value);
    if (!skill.name || seen.has(skill.normalizedName)) return;
    seen.add(skill.normalizedName);
    const category = CATEGORY_ORDER.includes(preferredCategory)
      ? preferredCategory
      : skill.category;
    result[category].push(skill.name);
  };

  if (skillsCategories && typeof skillsCategories === 'object') {
    Object.entries(skillsCategories).forEach(([category, values]) => {
      inputItems(values).forEach(value => add(value, category));
    });
  }
  inputItems(skillsArray).forEach(value => add(value));

  return Object.fromEntries(
    CATEGORY_ORDER
      .filter(category => result[category].length)
      .map(category => [category, result[category]])
  );
}
