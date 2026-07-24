import test from 'node:test';
import assert from 'node:assert/strict';
import { compressResumeData } from './resumeCompression.js';

test('all layout compression levels preserve resume content', () => {
  const resume = {
    experience: [{ description: ['one', 'two', 'three', 'four', 'five', 'six'] }],
    projects: [{ description: ['one', 'two', 'three', 'four'] }],
    certifications: [{ name: 'Cloud' }],
    achievements: ['Winner'],
    publications: [{ title: 'Paper', url: 'https://example.com/paper' }],
    languages: [{ language: 'English' }],
    volunteer_experience: [{ role: 'Mentor' }],
    custom_section: [{ title: 'Patent' }]
  };

  for (let level = 0; level <= 5; level += 1) {
    const compressed = compressResumeData(resume, level);
    const { layout_compression_level, ...content } = compressed;
    assert.equal(layout_compression_level, level);
    assert.deepEqual(content, resume);
  }
});
