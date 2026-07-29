import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTailr4uReducedMotion } from '../motion/MotionSystem';

export default function GlobalCursor() {
  const reduced = useTailr4uReducedMotion();
  const cursorRef = useRef(null);

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (reduced || coarsePointer) return undefined;

    document.body.classList.add('tf-global-cursor-active');
    const move = event => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
        cursorRef.current.style.opacity = '1';
      }
    };
    const hover = event => {
      const interactive = event.target.closest(
        'button,a,input,textarea,select,[role="button"],[role="tab"],[data-cursor="interactive"]'
      );
      cursorRef.current?.classList.toggle('interactive', Boolean(interactive));
    };
    const leave = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = '0';
    };

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', hover);
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      document.body.classList.remove('tf-global-cursor-active');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', hover);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, [reduced]);

  if (reduced || typeof document === 'undefined') return null;
  return createPortal(
    <div className="lp-custom-cursor" aria-hidden="true">
      <i ref={cursorRef} style={{ opacity: 0 }}>
        <svg viewBox="0 0 24 30">
          <path d="M2.4 1.8 21 18.2l-8.1 1.2-4.4 7.9z" />
        </svg>
      </i>
    </div>,
    document.body
  );
}
