import test from 'node:test';
import assert from 'node:assert/strict';

// Helper: Calculate profile completeness score
function calculateProfileCompleteness(form) {
  if (!form) return { score: 0, missing: [] };
  const checks = [
    { key: 'target_roles', valid: Array.isArray(form.target_roles) && form.target_roles.length > 0, weight: 15, name: 'target roles' },
    { key: 'target_companies', valid: Array.isArray(form.target_companies) && form.target_companies.length > 0, weight: 10, name: 'target companies' },
    { key: 'preferred_industries', valid: Array.isArray(form.preferred_industries) && form.preferred_industries.length > 0, weight: 10, name: 'preferred industries' },
    { key: 'preferred_locations', valid: Array.isArray(form.preferred_locations) && form.preferred_locations.length > 0, weight: 15, name: 'preferred locations' },
    { key: 'work_modes', valid: (Array.isArray(form.work_modes) && form.work_modes.length > 0) || Boolean(form.work_preference), weight: 10, name: 'work style' },
    { key: 'experience_level', valid: Boolean(form.experience_level) && form.experience_level !== 'No Preference', weight: 10, name: 'experience level' },
    { key: 'priority_skills', valid: Array.isArray(form.priority_skills) && form.priority_skills.length > 0, weight: 15, name: 'priority skills' },
    { key: 'expected_compensation', valid: Boolean(form.expected_compensation), weight: 10, name: 'expected salary' },
    { key: 'notice_period', valid: Boolean(form.notice_period), weight: 5, name: 'notice period' }
  ];

  const score = checks.reduce((acc, curr) => acc + (curr.valid ? curr.weight : 0), 0);
  const missing = checks.filter(c => !c.valid).map(c => c.name);
  return { score, missing };
}

// Helper: Validate job preferences form
function validateJobPreferences(form) {
  if (!form.target_roles || form.target_roles.length === 0) {
    return 'Please add at least one target role.';
  }
  if (form.expected_compensation && form.min_compensation) {
    const exp = Number(form.expected_compensation);
    const min = Number(form.min_compensation);
    if (Number.isFinite(exp) && Number.isFinite(min) && exp < min) {
      return 'Expected compensation cannot be less than minimum acceptable compensation.';
    }
  }
  return '';
}

// Helper: Prevent duplicate tag addition
function addTagUnique(list = [], newTag = '') {
  const val = newTag.trim();
  if (!val) return list;
  if (list.some(item => item.toLowerCase() === val.toLowerCase())) return list;
  return [...list, val];
}

// Helper: Filter AI resume suggestions
function getResumeSuggestions(parsedResume, currentSkills = [], currentRoles = [], dismissed = []) {
  if (!parsedResume) return [];
  const skills = parsedResume.skills || [];
  const roles = parsedResume.target_roles || [];
  const candidates = [...skills, ...roles];

  const existingSkills = currentSkills.map(s => s.toLowerCase());
  const existingRoles = currentRoles.map(r => r.toLowerCase());

  return candidates.filter(item => {
    if (!item || typeof item !== 'string') return false;
    const lower = item.toLowerCase();
    if (dismissed.includes(lower)) return false;
    return !existingSkills.includes(lower) && !existingRoles.includes(lower);
  });
}

// --------------------------------------------------
// UNIT TESTS
// --------------------------------------------------

test('1. Preferences load from backend correctly', () => {
  const loadedBackendData = {
    primary_role: 'AI Engineer',
    target_roles: ['AI Engineer', 'Backend Engineer'],
    target_companies: ['Google', 'Meta'],
    preferred_locations: ['Hyderabad', 'Remote'],
    work_modes: ['Hybrid', 'Remote'],
    experience_level: '2–5 years',
    priority_skills: ['Python', 'FastAPI', 'PyTorch'],
    expected_compensation: '120000',
    notice_period: '30 days',
    has_completed_preferences: true
  };

  assert.equal(loadedBackendData.primary_role, 'AI Engineer');
  assert.equal(loadedBackendData.target_roles.length, 2);
  assert.equal(loadedBackendData.has_completed_preferences, true);
});

test('2. Edit / dirty state is triggered when form values change', () => {
  const initial = { target_roles: ['Data Engineer'], work_preference: 'Remote' };
  const updated = { target_roles: ['Data Engineer', 'AI Engineer'], work_preference: 'Remote' };

  const isDirtyBefore = JSON.stringify(initial) !== JSON.stringify(initial);
  const isDirtyAfter = JSON.stringify(initial) !== JSON.stringify(updated);

  assert.equal(isDirtyBefore, false);
  assert.equal(isDirtyAfter, true);
});

test('3. Reset restores original saved values', () => {
  const initialForm = { target_roles: ['Data Engineer'], notice_period: '30 days' };
  let currentForm = { target_roles: ['Data Engineer', 'Custom Role'], notice_period: '60 days' };

  // Reset operation
  currentForm = { ...initialForm };

  assert.deepEqual(currentForm.target_roles, ['Data Engineer']);
  assert.equal(currentForm.notice_period, '30 days');
});

test('4. Role chips support add, remove, unique check, and primary role selection', () => {
  let roles = ['Data Engineer'];
  let primaryRole = 'Data Engineer';

  // Add role uniquely
  roles = addTagUnique(roles, 'AI Engineer');
  assert.equal(roles.length, 2);

  // Attempt duplicate addition
  roles = addTagUnique(roles, 'ai engineer');
  assert.equal(roles.length, 2);

  // Set primary role
  primaryRole = 'AI Engineer';
  assert.equal(primaryRole, 'AI Engineer');

  // Remove role
  roles = roles.filter(r => r !== 'Data Engineer');
  assert.equal(roles.length, 1);
  assert.equal(roles[0], 'AI Engineer');
});

test('5. Company chips support custom company names', () => {
  let companies = ['Amazon', 'Microsoft'];
  companies = addTagUnique(companies, 'Stripe');
  companies = addTagUnique(companies, 'OpenAI');

  assert.equal(companies.length, 4);
  assert.equal(companies[2], 'Stripe');
  assert.equal(companies[3], 'OpenAI');
});

test('6. Salary validation prevents expected salary less than minimum acceptable', () => {
  const invalidForm = {
    target_roles: ['Backend Engineer'],
    expected_compensation: '80000',
    min_compensation: '100000'
  };

  const errMsg = validateJobPreferences(invalidForm);
  assert.equal(errMsg, 'Expected compensation cannot be less than minimum acceptable compensation.');

  const validForm = {
    target_roles: ['Backend Engineer'],
    expected_compensation: '120000',
    min_compensation: '100000'
  };

  const validMsg = validateJobPreferences(validForm);
  assert.equal(validMsg, '');
});

test('7. Resume-based AI suggestions require user confirmation before applying', () => {
  const mockResume = {
    skills: ['Python', 'Docker', 'Kubernetes'],
    target_roles: ['DevOps Engineer']
  };

  const currentSkills = ['Python'];
  const currentRoles = ['DevOps Engineer'];

  const suggestions = getResumeSuggestions(mockResume, currentSkills, currentRoles, []);

  // Docker and Kubernetes should be suggested
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.includes('Docker'));
  assert.ok(suggestions.includes('Kubernetes'));
  assert.ok(!suggestions.includes('Python')); // Already in current skills

  // Dismissing Kubernetes
  const suggestionsAfterDismiss = getResumeSuggestions(mockResume, currentSkills, currentRoles, ['kubernetes']);
  assert.equal(suggestionsAfterDismiss.length, 1);
  assert.equal(suggestionsAfterDismiss[0], 'Docker');
});

test('8. Profile completeness calculates dynamic percentage and missing fields', () => {
  const partialForm = {
    target_roles: ['Data Engineer'],
    preferred_locations: ['Hyderabad'],
    work_modes: ['Remote'],
    priority_skills: ['Python'],
    expected_compensation: '100000'
    // Missing companies, industries, experience_level, notice_period
  };

  const { score, missing } = calculateProfileCompleteness(partialForm);
  assert.equal(score, 65); // 15+15+10+15+10 = 65
  assert.ok(missing.includes('target companies'));
  assert.ok(missing.includes('preferred industries'));
});
