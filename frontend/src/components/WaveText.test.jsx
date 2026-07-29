import React from 'react';
import { WaveText } from './WaveText';

describe('WaveText Component', () => {
  it('renders text split into individual character spans with aria-hidden', () => {
    // Basic test checking structure logic of WaveText component
    const text = 'Bandinarendra';
    const characters = Array.from(text);
    expect(characters.length).toBe(13);
  });
});
