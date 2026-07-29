import React, { useEffect, useState } from 'react';

/** Surface 0: quiet ambient depth with no interactive or semantic content. */
export function InteractiveAuroraBackground() {
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return (
    <div className={`adaptive-ambient ${paused ? 'adaptive-ambient--paused' : ''}`} aria-hidden="true">
      <span className="adaptive-ambient__light adaptive-ambient__light--primary" />
      <span className="adaptive-ambient__light adaptive-ambient__light--accent" />
      <span className="adaptive-ambient__noise" />
    </div>
  );
}

export default InteractiveAuroraBackground;
