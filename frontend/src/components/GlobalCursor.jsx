import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function GlobalCursor() {
  const cursorRef = useRef(null);
  const isInteractiveRef = useRef(false);

  useEffect(() => {
    // Only disable custom cursor on touch/mobile devices
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return undefined;

    document.body.classList.add('tf-global-cursor-active');

    // pointermove is a superset of mousemove (also covers pen/stylus) -- a
    // single mouse movement was firing this handler twice (once per event
    // type registered below), doubling the per-frame work for zero benefit.
    const handlePointerMove = (event) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
        cursorRef.current.style.opacity = '1';
      }
    };

    const handlePointerOver = (event) => {
      if (!cursorRef.current || !event.target) return;
      const interactive = Boolean(event.target.closest(
        'button, a, input, textarea, select, [role="button"], [role="tab"], [data-cursor="interactive"], .cursor-pointer'
      ));
      // pointerover fires for every DOM element boundary the pointer
      // crosses, not just genuine enter/leave of an interactive element --
      // writing classList unconditionally forced a style recalculation on
      // every single crossing even when the interactive state hadn't
      // changed. Only touch the DOM when the state actually flips.
      if (interactive !== isInteractiveRef.current) {
        isInteractiveRef.current = interactive;
        cursorRef.current.classList.toggle('interactive', interactive);
      }
    };

    const handleMouseLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0';
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.body.classList.remove('tf-global-cursor-active');
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerover', handlePointerOver);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  if (typeof document === 'undefined') return null;

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
