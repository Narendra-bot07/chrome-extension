const CATEGORY_ORDER = [
  'Languages',
  'Software Engineering',
  'Frontend & Backend',
  'AI & GenAI',
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
  // c++/c# end in a symbol, so a trailing \b never matches (no word-boundary
  // transition from "+"/"#" into a following space or end-of-string) -- kept
  // as separate leading-\b-only alternatives instead of inside the trailing
  // \b(...)\b group below, which silently swallowed them into "Other".
  ['Languages', /(\bc\+\+)|(\bc#)|\b(python|java|javascript|typescript|sql|go|rust|ruby|php|swift|kotlin|html|css|bash|shell|c)\b/i],
  ['Software Engineering', /\b(microservices|distributed systems|backend development|api design|rest api design|software architecture|system architecture)\b/i],
  ['Data Engineering', /\b(pyspark|spark|kafka|databricks|delta lake|airflow|etl|data pipeline|medallion|unity catalog|adls gen2)\b/i],
  ['Databases', /\b(postgresql|mysql|mongodb|redis|oracle|cassandra|dynamodb|dbms|snowflake|bigquery)\b/i],
  ['Cloud', /\b(aws|amazon web services|microsoft azure|gcp|google cloud|azure|cloud computing|cloud-native|cloud native)\b/i],
  ['DevOps', /\b(docker|kubernetes|jenkins|github actions|terraform|ci\/cd|linux|git)\b/i],
  ['AI & GenAI', /\b(llms?|rag|langchain|langgraph|prompt engineering|vector search|embeddings?|hugging face|pytorch|tensorflow|copilot|generative ai)\b/i],
  ['Machine Learning', /\b(machine learning|deep learning|tensorflow|pytorch|scikit-learn|regression|classification|clustering|model evaluation)\b/i],
  ['Visualization', /\b(power bi|tableau|matplotlib|seaborn|data visualization)\b/i],
  ['Observability', /\b(opentelemetry|prometheus|grafana|loki|tempo|monitoring|tracing|observability|site reliability engineering|sre)\b/i],
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

// AI enrichment: the rule-based categorizeSkills() above is instant but
// bounded by CATEGORY_RULES -- a brand-new tool/framework name it has never
// seen falls into "Other" no matter how comprehensive the regex list gets.
// This layer asks the backend to classify only those leftover "Other"
// skills, so the vast majority of skills (already matched by rules) never
// pay a network round trip at all. Cached both in-memory (this tab) and in
// localStorage (across sessions) since skill categories are effectively
// global constants ("Python" is always "Languages" for every user), so a
// skill only ever needs to be AI-classified once, ever, per browser.
const AI_CACHE_STORAGE_KEY = 'tailr4u_ai_skill_categories_v1';
const AI_CACHE_MAX_ENTRIES = 2000;
const aiSkillCategoryCache = new Map();
let aiCacheLoadedFromStorage = false;

const loadAiCacheFromStorage = () => {
  if (aiCacheLoadedFromStorage) return;
  aiCacheLoadedFromStorage = true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AI_CACHE_STORAGE_KEY) : null;
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([key, category]) => aiSkillCategoryCache.set(key, category));
    }
  } catch {
    // Corrupt/unavailable storage is not fatal -- just skip the persisted cache.
  }
};

const persistAiCacheToStorage = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const entries = [...aiSkillCategoryCache.entries()].slice(-AI_CACHE_MAX_ENTRIES);
    localStorage.setItem(AI_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage can be unavailable (quota, private browsing, extension context) -- non-fatal.
  }
};

/**
 * Upgrades a rule-based categorizeSkills() result by asking the backend to
 * AI-classify whatever landed in "Other". Never throws -- on any network or
 * server failure, the rule-based "Other" bucket is left exactly as-is, so
 * this is a pure enhancement with no correctness risk if it fails.
 *
 * apiUrl === '' is a deliberate, valid value meaning "same-origin relative
 * request" (used by the headless PDF renderer, which is served by the same
 * backend process it needs to call -- see TailorRender.tsx). Only
 * null/undefined means "no API available, skip entirely".
 */
export async function categorizeSkillsWithAI(skillsArray, skillsCategories, apiUrl) {
  const localResult = categorizeSkills(skillsArray, skillsCategories);
  const uncertain = localResult.Other || [];
  if (!uncertain.length || apiUrl == null) return localResult;

  loadAiCacheFromStorage();

  const toQuery = [];
  const seenQueryKeys = new Set();
  uncertain.forEach(name => {
    const key = skillSemanticKey(name);
    if (!aiSkillCategoryCache.has(key) && !seenQueryKeys.has(key)) {
      seenQueryKeys.add(key);
      toQuery.push(name);
    }
  });

  if (toQuery.length) {
    try {
      // A cold/uncached classification is a real LLM call, not a lookup --
      // it must never be allowed to stall the PDF export pipeline (which
      // gates its own readiness marker on this resolving, see
      // TailorRender.tsx/PrintLayout.tsx). Bounded at 4s: comfortably more
      // than a cached or warm LLM response needs, but short enough that a
      // slow/cold call just means this render keeps the rule-based "Other"
      // bucket instead of hanging the whole render.
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
      const res = await fetch(`${apiUrl}/api/v1/skills/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: toQuery }),
        signal: controller?.signal
      });
      if (timeoutId) clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        Object.entries(data?.categories || {}).forEach(([name, category]) => {
          if (typeof category === 'string' && category) {
            aiSkillCategoryCache.set(skillSemanticKey(name), category);
          }
        });
        persistAiCacheToStorage();
      }
    } catch {
      // Network failure -- fall through and keep whatever the local cache already had.
    }
  }

  const upgraded = { ...localResult };
  const stillOther = [];
  uncertain.forEach(name => {
    const aiCategory = aiSkillCategoryCache.get(skillSemanticKey(name));
    if (aiCategory && aiCategory !== 'Other') {
      upgraded[aiCategory] = [...(upgraded[aiCategory] || []), name];
    } else {
      stillOther.push(name);
    }
  });
  if (stillOther.length) upgraded.Other = stillOther;
  else delete upgraded.Other;

  return upgraded;
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

    const trimmedPreferred = preferredCategory ? String(preferredCategory).trim() : '';
    // A source-provided "Other" carries no real signal -- it's the exact
    // same catch-all our own rules fall back to. When the skill also has a
    // confident rule match (e.g. "Bash"/"C++" -> Languages, "Cloud
    // computing" -> Cloud), prefer that over leaving it in an
    // undifferentiated dumping ground. Any other source-provided category
    // (e.g. "Big Data") is still trusted as-is.
    const category = (trimmedPreferred && !/^other$/i.test(trimmedPreferred))
      ? trimmedPreferred
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
