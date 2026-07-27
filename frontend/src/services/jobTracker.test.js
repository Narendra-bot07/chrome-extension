import test from 'node:test';
import assert from 'node:assert/strict';

// Helper function to test job filtering logic
function filterApplications(apps, search, stageFilter, extraFilter) {
  return apps.filter(app => {
    if (!app) return false;
    const matchesSearch = 
      (app.job_title || '').toLowerCase().includes(search.toLowerCase()) ||
      (app.company_name || '').toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const stage = app.current_stage || 'Ready To Apply';
    if (stageFilter === 'Active' && (stage === 'Rejected' || stage === 'Archived')) return false;
    if (stageFilter === 'Applied' && stage !== 'Applied') return false;
    if (stageFilter === 'Interviewing' && stage !== 'Interview' && stage !== 'Assessment' && stage !== 'Recruiter') return false;

    if (extraFilter === 'resume_pending' && app.resume_status === 'ready') return false;
    if (extraFilter === 'cover_letter_pending' && app.cover_letter_status === 'ready') return false;

    return true;
  });
}

// Helper function to test reminder overdue calculation
function isReminderOverdue(dueAt, isCompleted) {
  if (isCompleted || !dueAt) return false;
  return new Date(dueAt) < new Date();
}

test('1. Job search filters applications by role title and company', () => {
  const sampleApps = [
    { id: '1', job_title: 'Senior Consultant', company_name: 'Microsoft', current_stage: 'Applied' },
    { id: '2', job_title: 'DevOps Intern', company_name: 'Astravision', current_stage: 'Interview' },
    { id: '3', job_title: 'Data Analyst', company_name: 'Google', current_stage: 'Rejected' }
  ];

  const resSearch = filterApplications(sampleApps, 'Microsoft', 'All', '');
  assert.equal(resSearch.length, 1);
  assert.equal(resSearch[0].company_name, 'Microsoft');
});

test('2. Stage filtering separates Active, Applied, Interviewing, and Closed jobs', () => {
  const sampleApps = [
    { id: '1', job_title: 'Role 1', company_name: 'Co 1', current_stage: 'Applied' },
    { id: '2', job_title: 'Role 2', company_name: 'Co 2', current_stage: 'Interview' },
    { id: '3', job_title: 'Role 3', company_name: 'Co 3', current_stage: 'Rejected' }
  ];

  const activeApps = filterApplications(sampleApps, '', 'Active', '');
  assert.equal(activeApps.length, 2);

  const interviewingApps = filterApplications(sampleApps, '', 'Interviewing', '');
  assert.equal(interviewingApps.length, 1);
  assert.equal(interviewingApps[0].id, '2');
});

test('3. Document readiness status detection works for resumes and cover letters', () => {
  const app1 = { resume_status: 'ready', cover_letter_status: 'pending' };
  const app2 = { resume_status: 'pending', cover_letter_status: 'ready' };

  const pendingResume = filterApplications([app1, app2], '', 'All', 'resume_pending');
  assert.equal(pendingResume.length, 1);
  assert.equal(pendingResume[0].resume_status, 'pending');

  const pendingCover = filterApplications([app1, app2], '', 'All', 'cover_letter_pending');
  assert.equal(pendingCover.length, 1);
  assert.equal(pendingCover[0].cover_letter_status, 'pending');
});

test('4. Reminders detect overdue dates correctly', () => {
  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const futureDate = new Date(Date.now() + 86400000).toISOString();

  assert.equal(isReminderOverdue(pastDate, false), true);
  assert.equal(isReminderOverdue(pastDate, true), false);
  assert.equal(isReminderOverdue(futureDate, false), false);
});
