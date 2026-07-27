import React from 'react';

/** Surface 0: quiet ambient depth with no interactive or semantic content. */
export function InteractiveAuroraBackground() {
  return (
    <div className="adaptive-ambient" aria-hidden="true">
      <span className="adaptive-ambient__light adaptive-ambient__light--primary" />
      <span className="adaptive-ambient__light adaptive-ambient__light--accent" />
      <span className="adaptive-ambient__noise" />
    </div>
  );
}

export default InteractiveAuroraBackground;
