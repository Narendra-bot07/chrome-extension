import React, { Component, useEffect, useRef } from 'react';

// Error Boundary Safeguard
class FlowParticleErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("FlowParticleBackground caught non-critical error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function FlowParticleCanvasInner() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Check media queries
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    let isReducedMotion = motionQuery.matches;
    let isTouchDevice = touchQuery.matches;

    let animId = null;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Pointer state tracking
    const pointer = {
      x: -1000,
      y: -1000,
      active: false
    };

    // Color Palette Definitions for Light and Dark Modes
    const getPalette = (isDark) => {
      if (isDark) {
        return {
          blue: '#60A5FA',    // soft blue
          purple: '#A78BFA',  // muted purple
          teal: '#2DD4BF',    // light teal
          cyan: '#38BDF8'     // pale cyan
        };
      }
      return {
        blue: '#4F46E5',    // soft blue/indigo
        purple: '#7C3AED',  // muted purple
        teal: '#00BDA5',    // light teal
        cyan: '#06B6D4'     // pale cyan
      };
    };

    let isDarkTheme = document.documentElement.classList.contains('dark');
    let palette = getPalette(isDarkTheme);

    const updateTheme = () => {
      isDarkTheme = document.documentElement.classList.contains('dark');
      palette = getPalette(isDarkTheme);
    };

    // Theme MutationObserver
    const themeObserver = new MutationObserver(() => updateTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Higher particle count for cursor swarm effect
    const getParticleCount = (w) => {
      if (isReducedMotion) {
        return w > 768 ? 14 : 8;
      }
      if (w > 1440) return 85;
      if (w > 1024) return 70;
      if (w > 640) return 42;
      return 22;
    };

    let particles = [];

    // Helper to create a single floating head particle
    const createParticle = (w, h, index) => {
      const angle = Math.random() * Math.PI * 2;
      const categoryRoll = Math.random();
      
      let radius;
      let speed;
      let category;

      if (categoryRoll < 0.60) {
        // Small: 4px–6px diameter => 2px–3px radius
        radius = 2.0 + Math.random() * 1.0;
        speed = 0.20 + Math.random() * 0.15;
        category = 'small';
      } else if (categoryRoll < 0.88) {
        // Medium: 7px–9px diameter => 3.5px–4.5px radius
        radius = 3.5 + Math.random() * 1.0;
        speed = 0.30 + Math.random() * 0.15;
        category = 'medium';
      } else {
        // Large: 10px–12px diameter => 5px–6px radius
        radius = 5.0 + Math.random() * 1.2;
        speed = 0.40 + Math.random() * 0.20;
        category = 'large';
      }

      // Pick color from palette
      const colorRoll = Math.random();
      let colorKey = 'teal';
      if (colorRoll < 0.35) colorKey = 'teal';
      else if (colorRoll < 0.65) colorKey = 'blue';
      else if (colorRoll < 0.88) colorKey = 'purple';
      else colorKey = 'cyan';

      const baseVx = Math.cos(angle) * speed;
      const baseVy = Math.sin(angle) * speed;
      // 60% of particles are cursor swarm followers
      const isSwarmFollower = index % 10 < 6;

      return {
        x: Math.random() * w,
        y: Math.random() * h,
        radius,
        speed,
        baseSpeed: speed,
        vx: baseVx,
        vy: baseVy,
        baseVx,
        baseVy,
        noisePhase: Math.random() * 100,
        swirlPhase: Math.random() * Math.PI * 2,
        colorKey,
        proximityHighlight: 0,
        category,
        isSwarmFollower
      };
    };

    // Resize Handler
    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);

      const targetCount = getParticleCount(width);
      if (particles.length === 0) {
        particles = Array.from({ length: targetCount }, (_, i) => createParticle(width, height, i));
      } else if (particles.length < targetCount) {
        while (particles.length < targetCount) {
          particles.push(createParticle(width, height, particles.length));
        }
      } else if (particles.length > targetCount) {
        particles.length = targetCount;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Pointer Event Listeners
    const handlePointerMove = (e) => {
      if (isTouchDevice || document.visibilityState === 'hidden') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.x = -1000;
      pointer.y = -1000;
    };

    if (!isTouchDevice) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerleave', handlePointerLeave);
    }

    // Media query listener
    const handleMotionChange = (e) => {
      isReducedMotion = e.matches;
      handleResize();
    };

    motionQuery.addEventListener?.('change', handleMotionChange);

    // Main Physics & Render Loop
    const renderLoop = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        // 1. Natural Direction Steering
        p.noisePhase += 0.005;
        p.swirlPhase += 0.02;
        const steerAngle = Math.sin(p.noisePhase) * 0.09;
        const currentAngle = Math.atan2(p.baseVy, p.baseVx) + steerAngle;
        const currentSpeed = isReducedMotion ? p.baseSpeed * 0.15 : p.baseSpeed;
        p.baseVx = Math.cos(currentAngle) * currentSpeed;
        p.baseVy = Math.sin(currentAngle) * currentSpeed;

        // 2. Cursor Swarm Attraction & Flow Physics
        if (pointer.active && !isTouchDevice && !isReducedMotion) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);

          const radiusLimit = p.isSwarmFollower ? 450 : 250;

          if (dist < radiusLimit && dist > 1) {
            const normX = dx / dist;
            const normY = dy / dist;
            
            // Tangential force for smooth orbital swirl around cursor
            const tangX = -normY;
            const tangY = normX;

            const pullStrength = p.isSwarmFollower ? 0.09 : 0.03;
            const falloff = Math.pow(1 - dist / radiusLimit, 1.4);

            const attractX = normX * pullStrength * falloff * (1 + Math.sin(p.swirlPhase) * 0.25);
            const attractY = normY * pullStrength * falloff * (1 + Math.cos(p.swirlPhase) * 0.25);
            const swirlForce = 0.025 * falloff * Math.sin(p.swirlPhase);

            p.vx += attractX + tangX * swirlForce;
            p.vy += attractY + tangY * swirlForce;

            // Highlight brightness when following/near cursor
            p.proximityHighlight = Math.min(p.proximityHighlight + falloff * 0.15, 0.20);
          }
        }

        // 3. Smooth Velocity Damping
        p.proximityHighlight *= 0.94;
        p.vx = p.vx * 0.95 + p.baseVx * 0.05;
        p.vy = p.vy * 0.95 + p.baseVy * 0.05;

        // 4. Update Position
        p.x += p.vx;
        p.y += p.vy;

        // 5. Smooth Viewport Boundary Wrapping
        const margin = 24;
        if (p.x < -margin) p.x = width + margin;
        if (p.x > width + margin) p.x = -margin;
        if (p.y < -margin) p.y = height + margin;
        if (p.y > height + margin) p.y = -margin;

        // 6. Calculate Opacity (Strictly bounded 0.15 - 0.45)
        const hexColor = palette[p.colorKey] || palette.teal;
        const targetOpacityBase = isDarkTheme 
          ? (p.category === 'large' ? 0.38 : p.category === 'medium' ? 0.30 : 0.22) 
          : (p.category === 'large' ? 0.28 : p.category === 'medium' ? 0.22 : 0.16);
        const finalAlpha = Math.min(Math.max(targetOpacityBase + p.proximityHighlight, 0.15), 0.45);

        // 7. Render Floating Head Only (NO TAILS)
        ctx.fillStyle = hexColor;
        ctx.globalAlpha = finalAlpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    // Page Visibility API - Pause loop when tab hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animId) cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(renderLoop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (!isTouchDevice) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerleave', handlePointerLeave);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionQuery.removeEventListener?.('change', handleMotionChange);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={-1}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden select-none"
    />
  );
}

export function FlowParticleBackground() {
  return (
    <FlowParticleErrorBoundary>
      <FlowParticleCanvasInner />
    </FlowParticleErrorBoundary>
  );
}

export default FlowParticleBackground;
