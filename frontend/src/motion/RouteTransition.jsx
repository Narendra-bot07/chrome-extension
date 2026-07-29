import React from 'react';
import { AnimatePresence, useIsPresent } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { MotionPage } from './MotionSystem';

function TransitioningPage({ children }) {
  const isPresent = useIsPresent();
  return (
    <MotionPage
      className="flex min-h-0 flex-1 flex-col"
      style={isPresent ? undefined : {
        position: 'absolute',
        inset: 0,
        width: '100%',
        pointerEvents: 'none'
      }}
      aria-hidden={isPresent ? undefined : true}
    >
      {children}
    </MotionPage>
  );
}

export default function RouteTransition({ children }) {
  const location = useLocation();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="sync" initial={false}>
        <TransitioningPage key={location.pathname}>
          {children}
        </TransitioningPage>
      </AnimatePresence>
    </div>
  );
}
