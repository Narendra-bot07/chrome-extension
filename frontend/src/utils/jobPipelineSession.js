export const JD_PIPELINE_SESSION_KEY = 'tailorflow.jd_pipeline_session.v1';

const clone = value => value == null ? null : structuredClone(value);

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])])
    );
  }
  return value;
};

export const fingerprintJD = jd => {
  const input = JSON.stringify(stable(jd || {}));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `jd-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const createJDPipelineSession = (jd, context = {}) => {
  if (!jd || typeof jd !== 'object') return null;
  const canonicalJD = clone(jd);
  const canonicalResume = context.resume ? clone(context.resume) : null;
  return {
    version: 2,
    canonicalJD,
    canonicalResume,
    fingerprint: fingerprintJD(canonicalJD),
    resumeId: context.resumeId || canonicalResume?.id || '',
    jobText: context.jobText || '',
    companyName: context.companyName || '',
    jobTitle: context.jobTitle || '',
    lastAnalyzedUrl: context.lastAnalyzedUrl || '',
    jobDetectionMeta: clone(context.jobDetectionMeta),
    createdAt: context.createdAt || new Date().toISOString()
  };
};

export const readJDPipelineSession = storage => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(JD_PIPELINE_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.canonicalJD || parsed.fingerprint !== fingerprintJD(parsed.canonicalJD)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const writeJDPipelineSession = (storage, session) => {
  if (!storage) return;
  if (session?.canonicalJD) {
    storage.setItem(JD_PIPELINE_SESSION_KEY, JSON.stringify(session));
  } else {
    storage.removeItem(JD_PIPELINE_SESSION_KEY);
  }
};

