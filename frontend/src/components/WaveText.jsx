import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * WaveText Component
 * Interactive cursor-tracking wave animation for text characters.
 * 
 * Props:
 * - text (string): Text string to split and animate
 * - className (string): Optional custom class name
 * - amplitude (number): Peak height in pixels (clamped to max 12px)
 * - disabled (boolean): Disables wave animation if true
 */
export function WaveText({
  text = '',
  className = '',
  amplitude = 9,
  disabled = false,
}) {
  const shouldReduceMotion = useReducedMotion();
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const touchQuery = window.matchMedia('(pointer: coarse)');
      setIsTouchDevice(touchQuery.matches);
      const listener = (e) => setIsTouchDevice(e.matches);
      if (touchQuery.addEventListener) {
        touchQuery.addEventListener('change', listener);
        return () => touchQuery.removeEventListener('change', listener);
      }
    }
  }, []);

  if (!text) return null;

  const characters = Array.from(text);

  // Clamp vertical movement amplitude to max 12px
  const clampedAmplitude = Math.min(Math.abs(amplitude), 12);

  const getLetterStyle = (index) => {
    if (disabled || shouldReduceMotion || isTouchDevice || hoveredIndex === null) {
      return { y: 0, rotate: 0, scale: 1 };
    }
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) {
      return { y: -clampedAmplitude, rotate: -2.5, scale: 1.07 };
    } else if (distance === 1) {
      return { y: -clampedAmplitude * 0.58, rotate: -1.2, scale: 1.04 };
    } else if (distance === 2) {
      return { y: -clampedAmplitude * 0.24, rotate: -0.5, scale: 1.015 };
    }
    return { y: 0, rotate: 0, scale: 1 };
  };

  const springTransition = {
    type: 'spring',
    stiffness: 380,
    damping: 24,
    mass: 0.5,
  };

  return (
    <span
      className={`wave-text inline-flex select-none ${className}`.trim()}
      aria-label={text}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {characters.map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          aria-hidden="true"
          className="wave-character inline-block origin-bottom cursor-default"
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseMove={() => setHoveredIndex(index)}
          animate={getLetterStyle(index)}
          transition={springTransition}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}

export default WaveText;
