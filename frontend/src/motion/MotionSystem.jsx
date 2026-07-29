import React, {
  createContext, useContext, useEffect, useId, useRef, useState
} from 'react';
import {
  AnimatePresence, MotionConfig, motion, useReducedMotion
} from 'framer-motion';
import {
  backdropVariants, buttonMotion, cardVariants, contentReveal,
  drawerVariants, fadeUp, listItemVariants, modalVariants, pageVariants,
  popoverVariants, reducedVariants, staggerContainer, toastVariants
} from '../utils/motion';

const ReducedMotionContext = createContext(false);
export const useTailr4uReducedMotion = () => useContext(ReducedMotionContext);

export function ReducedMotionProvider({ children }) {
  const reduced = useReducedMotion();
  return (
    <ReducedMotionContext.Provider value={Boolean(reduced)}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ReducedMotionContext.Provider>
  );
}

const resolved = (reduced, variants) => reduced ? reducedVariants : variants;

export function MotionPage({ children, className = '', ...props }) {
  const reduced = useTailr4uReducedMotion();
  return <motion.div variants={resolved(reduced, pageVariants)} initial="initial" animate="animate" exit="exit" className={`tf-motion-page ${className}`} {...props}>{children}</motion.div>;
}

export function MotionSection({ children, className = '', once = true, ...props }) {
  const reduced = useTailr4uReducedMotion();
  return <motion.section variants={resolved(reduced, fadeUp)} initial="initial" whileInView="animate" viewport={{ once, amount: 0.12 }} className={className} {...props}>{children}</motion.section>;
}

export function MotionCard({ children, interactive = false, className = '', ...props }) {
  const reduced = useTailr4uReducedMotion();
  return (
    <motion.div
      variants={resolved(reduced, cardVariants)}
      initial="initial" animate="animate" exit="exit"
      whileHover={!reduced && interactive ? { y: -2 } : undefined}
      className={`tf-motion-card ${interactive ? 'tf-motion-card--interactive' : ''} ${className}`}
      {...props}
    >{children}</motion.div>
  );
}

export function MotionList({ children, className = '', ...props }) {
  return <motion.div variants={staggerContainer} initial="initial" animate="animate" className={className} {...props}>{children}</motion.div>;
}

export function MotionListItem({ children, className = '', ...props }) {
  const reduced = useTailr4uReducedMotion();
  return <motion.div layout={!reduced} variants={resolved(reduced, listItemVariants)} exit="exit" className={className} {...props}>{children}</motion.div>;
}

export function MotionButton({ children, loading = false, disabled = false, className = '', ...props }) {
  const reduced = useTailr4uReducedMotion();
  return (
    <motion.button
      whileHover={!reduced && !loading && !disabled ? buttonMotion.whileHover : undefined}
      whileTap={!reduced && !loading && !disabled ? buttonMotion.whileTap : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`tf-motion-button ${className}`}
      {...props}
    >{children}</motion.button>
  );
}

function useDialogA11y(open, onClose) {
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const node = dialogRef.current;
    const focusable = () => [...(node?.querySelectorAll(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    ) || [])];
    (focusable()[0] || node)?.focus?.();
    const keydown = event => {
      if (event.key === 'Escape') onCloseRef.current?.();
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      restoreRef.current?.focus?.();
    };
  }, [open]);
  return dialogRef;
}

export function MotionModal({ open, onClose, title, children, className = '' }) {
  const reduced = useTailr4uReducedMotion();
  const titleId = useId();
  const dialogRef = useDialogA11y(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div variants={resolved(reduced, backdropVariants)} initial="initial" animate="animate" exit="exit" className="tf-motion-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
          <motion.div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} variants={resolved(reduced, modalVariants)} className={`tf-motion-modal ${className}`}>
            {title && <h2 id={titleId}>{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MotionDrawer({ open, onClose, side = 'right', title, children, className = '' }) {
  const reduced = useTailr4uReducedMotion();
  const titleId = useId();
  const dialogRef = useDialogA11y(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div variants={resolved(reduced, backdropVariants)} initial="initial" animate="animate" exit="exit" className="tf-motion-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
          <motion.aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} variants={resolved(reduced, drawerVariants[side] || drawerVariants.right)} className={`tf-motion-drawer tf-motion-drawer--${side} ${className}`}>
            {title && <h2 id={titleId}>{title}</h2>}
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MotionPopover({ open, children, className = '' }) {
  const reduced = useTailr4uReducedMotion();
  return <AnimatePresence>{open && <motion.div variants={resolved(reduced, popoverVariants)} initial="initial" animate="animate" exit="exit" className={className}>{children}</motion.div>}</AnimatePresence>;
}

export function MotionToast({ children, className = '', ...props }) {
  const reduced = useTailr4uReducedMotion();
  return <motion.div role="status" aria-live="polite" variants={resolved(reduced, toastVariants)} initial="initial" animate="animate" exit="exit" className={className} {...props}>{children}</motion.div>;
}

export function MotionSkeleton({ children, ready, className = '' }) {
  const reduced = useTailr4uReducedMotion();
  return <AnimatePresence mode="wait" initial={false}><motion.div key={ready ? 'content' : 'skeleton'} variants={resolved(reduced, contentReveal)} initial="initial" animate="animate" exit="exit" className={className}>{children}</motion.div></AnimatePresence>;
}

export function AnimatedPresenceRegion({ children, regionKey, className = '', mode = 'wait' }) {
  const reduced = useTailr4uReducedMotion();
  return <AnimatePresence mode={mode} initial={false}><motion.div key={regionKey} variants={resolved(reduced, contentReveal)} initial="initial" animate="animate" exit="exit" className={className}>{children}</motion.div></AnimatePresence>;
}

export function AnimatedNumber({ value = 0, duration = 420, format = value => Math.round(value).toLocaleString(), className = '' }) {
  const reduced = useTailr4uReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    if (reduced || previous.current === value) {
      setDisplay(value); previous.current = value; return undefined;
    }
    const start = previous.current;
    const started = performance.now();
    let frame;
    const tick = now => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + ((value - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduced, value]);
  return <span className={`tabular-nums ${className}`}>{format(display)}</span>;
}

export function AnimatedProgress({ value = 0, className = '', barClassName = '' }) {
  const reduced = useTailr4uReducedMotion();
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`tf-animated-progress ${className}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safe}><motion.div className={barClassName} initial={false} animate={{ width: `${safe}%` }} transition={reduced ? { duration: 0.08 } : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }} /></div>;
}
