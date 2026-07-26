import test from 'node:test';
import assert from 'node:assert/strict';
import {
  githubUrlKind, isValidProjectUrl, normalizeResumeUrl,
  repairResumeLinks, validateResumeLinks
} from './resumeLinks.js';

const source = {
  personal_info: {
    email: 'ada@example.com',
    github: 'https://github.com/ada/',
    linkedin: 'https://www.linkedin.com/in/ada?utm_source=cv',
    coding_profiles: { duplicate_linkedin: 'https://linkedin.com/in/ada/' }
  },
  links: {
    repo: 'https://github.com/ada/header-leak',
    credential: 'https://credentials.databricks.com/abc'
  },
  projects: [
    {
      name: 'Engine',
      repository_url: 'https://github.com/ada/engine',
      links: [
        { url: 'https://github.com/ada/engine/' },
        { url: 'https://engine.vercel.app' }
      ]
    },
    { name: 'No Link' },
    { name: 'Other', github_url: 'https://github.com/ada/other/tree/main' }
  ],
  certifications: [{
    name: 'Databricks Engineer',
    credential_url: 'https://credentials.databricks.com/abc'
  }]
};

test('hard URL rules distinguish profiles, repositories, and invalid hosts', () => {
  assert.equal(githubUrlKind('github.com/ada'), 'profile');
  assert.equal(githubUrlKind('github.com/ada/engine'), 'repository');
  assert.equal(isValidProjectUrl('https://github.com/ada/engine/issues/1'), true);
  assert.equal(isValidProjectUrl('https://github/'), false);
  assert.equal(normalizeResumeUrl('HTTP://WWW.GITHUB.COM/ada/?utm_source=cv'), 'https://github.com/ada');
});

test('ownership repair keeps only unique candidate profiles in the header', () => {
  const repaired = repairResumeLinks(source);
  assert.deepEqual(repaired.candidate_links.map(link => link.platform), [
    'email', 'linkedin', 'github'
  ]);
  assert.equal(repaired.candidate_links.filter(link => link.platform === 'github').length, 1);
  assert.equal(repaired.candidate_links.filter(link => link.platform === 'linkedin').length, 1);
  assert.ok(repaired.candidate_links.every(link => link.owner_type === 'candidate'));
  assert.equal(validateResumeLinks(repaired).valid, true);
});

test('project and credential links stay with their exact owners', () => {
  const repaired = repairResumeLinks(source);
  assert.equal(repaired.projects[0].links.length, 2);
  assert.equal(repaired.projects[1].links.length, 0);
  assert.equal(repaired.projects[2].links.length, 1);
  assert.ok(repaired.projects[0].links.every(link =>
    link.owner_id === repaired.projects[0].id && link.owner_type === 'project'
  ));
  assert.equal(repaired.certifications[0].links[0].link_type, 'credential');
  assert.equal(repaired.certifications[0].links[0].owner_id, repaired.certifications[0].id);
  assert.equal(repaired.certifications[0].links[0].display_label, 'View Credential');
});

test('ambiguous flat repositories and credentials are quarantined without loss', () => {
  const repaired = repairResumeLinks(source);
  assert.deepEqual(
    new Set(repaired.unresolved_links.map(link => link.reason)),
    new Set(['unmatched_project_repository', 'unmatched_credential'])
  );
  assert.ok(repaired.unresolved_links.every(link => link.validation_status !== 'VALID'));
});

test('repair is deterministic and idempotent', () => {
  const once = repairResumeLinks(source);
  assert.deepEqual(repairResumeLinks(once), once);
});
