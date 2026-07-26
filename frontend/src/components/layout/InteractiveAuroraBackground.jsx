import React, { Component, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// Safe Error Boundary for Decorative Background
class InteractiveAuroraErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("InteractiveAuroraBackground caught non-critical error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      // Fallback static ambient background
      return (
        <div 
          tabIndex={-1} 
          aria-hidden="true" 
          className="fixed inset-0 overflow-hidden pointer-events-none z-0"
        >
          <div className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] rounded-[40%_60%_70%_30%/50%_60%_30%_70%] bg-[var(--tf-accent-primary,#2E5BFF)] opacity-[0.05] blur-[110px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[650px] h-[650px] rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-[var(--tf-accent-secondary,#00BDA5)] opacity-[0.045] blur-[120px]" />
        </div>
      );
    }
    return this.props.children;
  }
}

function InteractiveAuroraBackgroundInner() {
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // High-frequency pointer tracking refs (no React state re-renders)
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });
  const targetInfluenceRef = useRef({ x: 0, y: 0 });
  const rafIdRef = useRef(null);

  // Framer Motion spring values
  const springConfig = { stiffness: 35, damping: 22, mass: 1.2 };
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);

  const smoothX = useSpring(cursorX, springConfig);
  const smoothY = useSpring(cursorY, springConfig);

  // Depth multipliers per blob
  const smoothXPrimary = useTransform(smoothX, (val) => val * 1.0);
  const smoothYPrimary = useTransform(smoothY, (val) => val * 1.0);

  const smoothXSecondary = useTransform(smoothX, (val) => val * 0.7);
  const smoothYSecondary = useTransform(smoothY, (val) => val * 0.7);

  const smoothXTertiary = useTransform(smoothX, (val) => val * 0.45);
  const smoothYTertiary = useTransform(smoothY, (val) => val * 0.45);

  useEffect(() => {
    // Check reduced motion & touch device preferences
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchQuery = window.matchMedia('(hover: none), (pointer: coarse)');

    setIsReducedMotion(motionQuery.matches);
    setIsTouchDevice(touchQuery.matches);

    const handleMotionChange = (e) => setIsReducedMotion(e.matches);
    const handleTouchChange = (e) => setIsTouchDevice(e.matches);

    motionQuery.addEventListener?.('change', handleMotionChange);
    touchQuery.addEventListener?.('change', handleTouchChange);

    return () => {
      motionQuery.removeEventListener?.('change', handleMotionChange);
      touchQuery.removeEventListener?.('change', handleTouchChange);
    };
  }, []);

  useEffect(() => {
    if (isReducedMotion || isTouchDevice) return;

    // Damping animation loop for velocity decay
    const updateDamping = () => {
      if (document.visibilityState === 'hidden') return;

      targetInfluenceRef.current.x *= 0.92;
      targetInfluenceRef.current.y *= 0.92;

      cursorX.set(targetInfluenceRef.current.x);
      cursorY.set(targetInfluenceRef.current.y);

      rafIdRef.current = requestAnimationFrame(updateDamping);
    };

    rafIdRef.current = requestAnimationFrame(updateDamping);

    // Pointermove handler
    const handlePointerMove = (e) => {
      if (document.visibilityState === 'hidden') return;

      const now = performance.now();
      const last = lastPointerRef.current;

      if (last.time === 0) {
        lastPointerRef.current = { x: e.clientX, y: e.clientY, time: now };
        return;
      }

      const dt = Math.max(16, now - last.time);
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;

      lastPointerRef.current = { x: e.clientX, y: e.clientY, time: now };

      const MAX_VELOCITY = 2.0; // px/ms
      const vx = Math.min(Math.max(dx / dt, -MAX_VELOCITY), MAX_VELOCITY);
      const vy = Math.min(Math.max(dy / dt, -MAX_VELOCITY), MAX_VELOCITY);

      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < 0.01) return;

      const intensity = Math.min(speed / MAX_VELOCITY, 1);
      const easedIntensity = intensity * intensity;

      const dirX = vx / speed;
      const dirY = vy / speed;

      targetInfluenceRef.current.x = dirX * easedIntensity * 65;
      targetInfluenceRef.current.y = dirY * easedIntensity * 65;
    };

    // Page Visibility API handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      } else {
        lastPointerRef.current = { x: 0, y: 0, time: 0 };
        rafIdRef.current = requestAnimationFrame(updateDamping);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isReducedMotion, isTouchDevice, cursorX, cursorY]);

  // Reduced motion static fallback
  if (isReducedMotion) {
    return (
      <div 
        tabIndex={-1} 
        aria-hidden="true" 
        className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none"
      >
        <div className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] rounded-[40%_60%_70%_30%/50%_60%_30%_70%] bg-[var(--tf-accent-primary,#2E5BFF)] opacity-[0.06] blur-[110px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[650px] h-[650px] rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-[var(--tf-accent-secondary,#00BDA5)] opacity-[0.05] blur-[120px]" />
        <div className="absolute top-[35%] right-[15%] w-[500px] h-[500px] rounded-[50%_50%_40%_60%/40%_60%_50%_50%] bg-[radial-gradient(circle,var(--tf-accent-primary,#2E5BFF)_0%,var(--tf-accent-secondary,#00BDA5)_100%)] opacity-[0.04] blur-[100px]" />
      </div>
    );
  }

  return (
    <div 
      tabIndex={-1} 
      aria-hidden="true" 
      className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none"
    >
      {/* 1. Primary Blob (Upper-left) */}
      <motion.div
        style={{
          x: smoothXPrimary,
          y: smoothYPrimary,
          willChange: 'transform'
        }}
        animate={{
          x: [0, 45, 0],
          y: [0, 35, 0],
          scale: [1, 1.03, 1]
        }}
        transition={{
          duration: 22,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "mirror"
        }}
        className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] rounded-[40%_60%_70%_30%/50%_60%_30%_70%] bg-[var(--tf-accent-primary,#2E5BFF)] opacity-[0.06] blur-[110px]"
      />

      {/* 2. Secondary Blob (Lower-right) */}
      <motion.div
        style={{
          x: smoothXSecondary,
          y: smoothYSecondary,
          willChange: 'transform'
        }}
        animate={{
          x: [0, -55, 0],
          y: [0, -40, 0],
          scale: [1, 1.025, 1]
        }}
        transition={{
          duration: 27,
          delay: 2,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "mirror"
        }}
        className="absolute bottom-[-10%] right-[-10%] w-[650px] h-[650px] rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-[var(--tf-accent-secondary,#00BDA5)] opacity-[0.05] blur-[120px]"
      />

      {/* 3. Tertiary Blob (Center-right) */}
      <motion.div
        style={{
          x: smoothXTertiary,
          y: smoothYTertiary,
          willChange: 'transform'
        }}
        animate={{
          x: [0, 35, 0],
          y: [0, -50, 0],
          scale: [1, 1.035, 1]
        }}
        transition={{
          duration: 19,
          delay: 4,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "mirror"
        }}
        className="absolute top-[35%] right-[15%] w-[500px] h-[500px] rounded-[50%_50%_40%_60%/40%_60%_50%_50%] bg-[radial-gradient(circle,var(--tf-accent-primary,#2E5BFF)_0%,var(--tf-accent-secondary,#00BDA5)_100%)] opacity-[0.04] blur-[100px]"
      />

      {/* Static Grain Texture Overlay (Non-animating 1.2% opacity) */}
      <div 
        className="absolute inset-0 opacity-[0.012] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  );
}

export function InteractiveAuroraBackground() {
  return (
    <InteractiveAuroraErrorBoundary>
      <InteractiveAuroraBackgroundInner />
    </InteractiveAuroraErrorBoundary>
  );
}

export default InteractiveAuroraBackground;
