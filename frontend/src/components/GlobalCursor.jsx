import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function GlobalCursor() {
  const cursorRef = useRef(null);

  useEffect(() => {
    // Only disable custom cursor on touch/mobile devices
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (isTouchDevice) return undefined;

    document.body.classList.add('tf-global-cursor-active');

    const updateCursorPosition = (clientX, clientY) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${clientX}px,${clientY}px,0)`;
        cursorRef.current.style.opacity = '1';
      }
    };

    const handlePointerMove = (event) => {
      updateCursorPosition(event.clientX, event.clientY);
    };

    const handlePointerOver = (event) => {
      if (!cursorRef.current || !event.target) return;
      const interactive = event.target.closest(
        'button, a, input, textarea, select, [role="button"], [role="tab"], [data-cursor="interactive"], .cursor-pointer'
      );
      cursorRef.current.classList.toggle('interactive', Boolean(interactive));
    };

    const handleMouseLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0';
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.body.classList.remove('tf-global-cursor-active');
      window.removeEventListener('mousemove', handlePointerMove);
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
