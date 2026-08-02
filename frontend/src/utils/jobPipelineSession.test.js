import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createJDPipelineSession,
  fingerprintJD,
  readJDPipelineSession,
  writeJDPipelineSession
} from './jobPipelineSession.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
};

test('canonical JD survives the complete browser session without mutation', () => {
  const jd = {
    id: 'jd-1',
    title: 'Backend Engineer',
    required_skills: ['Python', 'SQL'],
    responsibilities: ['Build APIs']
  };
  const session = createJDPipelineSession(jd, { companyName: 'Example' });
  jd.required_skills.push('Hallucinated mutation');

  assert.deepEqual(session.canonicalJD.required_skills, ['Python', 'SQL']);
  assert.equal(session.fingerprint, fingerprintJD(session.canonicalJD));

  const storage = memoryStorage();
  writeJDPipelineSession(storage, session);
  assert.deepEqual(readJDPipelineSession(storage), session);
});

test('tampered JD session is rejected by its fingerprint', () => {
  const storage = memoryStorage();
  const session = createJDPipelineSession({ title: 'Engineer' });
  writeJDPipelineSession(storage, session);
  const raw = JSON.parse(storage.getItem('tailr4u.jd_pipeline_session.v1'));
  raw.canonicalJD.title = 'Different job';
  storage.setItem('tailr4u.jd_pipeline_session.v1', JSON.stringify(raw));

  assert.equal(readJDPipelineSession(storage), null);
});
