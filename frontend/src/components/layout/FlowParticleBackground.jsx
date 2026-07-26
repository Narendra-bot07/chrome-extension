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
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;

    let animId = null;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Pointer state tracking in refs (no React state re-renders)
    const pointer = {
      x: -1000,
      y: -1000,
      lastX: -1000,
      lastY: -1000,
      vx: 0,
      vy: 0,
      lastTime: 0,
      active: false
    };

    // Color Theme Extractor
    const themeColors = {
      primary: '#2E5BFF',
      secondary: '#00BDA5',
      isDark: false
    };

    const updateThemeColors = () => {
      const computed = getComputedStyle(document.documentElement);
      const pri = computed.getPropertyValue('--tf-accent-primary').trim();
      const sec = computed.getPropertyValue('--tf-accent-secondary').trim();
      
      if (pri) themeColors.primary = pri;
      if (sec) themeColors.secondary = sec;
      themeColors.isDark = document.documentElement.classList.contains('dark');
    };

    updateThemeColors();

    // Theme MutationObserver
    const themeObserver = new MutationObserver(() => updateThemeColors());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Determine particle count based on screen size
    const getParticleCount = (w) => {
      if (isTouchDevice) return 22;
      if (w > 1280) return 50;
      if (w > 768) return 38;
      return 24;
    };

    let particles = [];

    // Helper to create particle
    const createParticle = (w, h) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.6; // 8 - 20 px/sec at 60fps
      const size = 1.5 + Math.random() * 1.5;
      const baseTail = 8 + Math.random() * 8;
      const colorType = Math.random() > 0.4 ? 'primary' : 'secondary';
      const opacityMultiplier = 0.8 + Math.random() * 0.4;

      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseVx: Math.cos(angle) * speed,
        baseVy: Math.sin(angle) * speed,
        speed,
        baseSpeed: speed,
        tailLength: baseTail,
        baseTailLength: baseTail,
        cursorInfluence: 0,
        noisePhase: Math.random() * 100,
        colorType,
        opacityMultiplier,
        size
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
        particles = Array.from({ length: targetCount }, () => createParticle(width, height));
      } else if (particles.length < targetCount) {
        while (particles.length < targetCount) {
          particles.push(createParticle(width, height));
        }
      } else if (particles.length > targetCount) {
        particles.length = targetCount;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Static rendering for prefers-reduced-motion
    if (isReducedMotion) {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => {
        const colorHex = p.colorType === 'primary' ? themeColors.primary : themeColors.secondary;
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      return () => {
        window.removeEventListener('resize', handleResize);
        themeObserver.disconnect();
      };
    }

    // Pointer Event Listener
    const handlePointerMove = (e) => {
      if (isTouchDevice || document.visibilityState === 'hidden') return;
      const now = performance.now();
      
      if (!pointer.active || pointer.lastTime === 0) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
        pointer.lastTime = now;
        pointer.active = true;
        return;
      }

      const dt = Math.max(16, now - pointer.lastTime);
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;

      pointer.vx = dx / dt;
      pointer.vy = dy / dt;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      pointer.lastTime = now;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.vx = 0;
      pointer.vy = 0;
    };

    if (!isTouchDevice) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerleave', handlePointerLeave);
    }

    // Main Physics & Render Loop
    let lastFrameTime = performance.now();

    const renderLoop = (time) => {
      const deltaTime = Math.min((time - lastFrameTime) / 1000, 0.1);
      lastFrameTime = time;

      ctx.clearRect(0, 0, width, height);

      // Pointer velocity calculations
      const pSpeed = Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy);
      const MAX_P_SPEED = 2.0;
      const normPSpeed = Math.min(pSpeed / MAX_P_SPEED, 1);
      const normPVx = pSpeed > 0.01 ? pointer.vx / pSpeed : 0;
      const normPVy = pSpeed > 0.01 ? pointer.vy / pSpeed : 0;
      const RADIUS = 220;

      // Update & Draw Particles
      particles.forEach((p) => {
        // 1. Steering Noise for Gentle Natural Curve
        p.noisePhase += 0.008;
        const steerAngle = Math.sin(p.noisePhase) * 0.15;
        const currentAngle = Math.atan2(p.baseVy, p.baseVx) + steerAngle;
        p.baseVx = Math.cos(currentAngle) * p.baseSpeed;
        p.baseVy = Math.sin(currentAngle) * p.baseSpeed;

        // 2. Cursor Force Field Interaction
        if (pointer.active && !isTouchDevice) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < RADIUS * RADIUS) {
            const dist = Math.sqrt(distSq);
            const rawInf = 1 - dist / RADIUS;
            const influence = rawInf * rawInf; // Non-linear falloff

            p.cursorInfluence = Math.min(p.cursorInfluence + influence * 0.1, 1);

            // Apply direction push
            const pushForce = normPSpeed * influence * 1.4;
            p.vx += normPVx * pushForce;
            p.vy += normPVy * pushForce;
          }
        }

        // 3. Momentum Damping & Base Velocity Steering
        p.cursorInfluence *= 0.95;
        p.vx = p.vx * 0.97 + p.baseVx * 0.03;
        p.vy = p.vy * 0.97 + p.baseVy * 0.03;

        // 4. Update Position
        p.x += p.vx;
        p.y += p.vy;

        // 5. Smooth Viewport Wrapping
        const margin = 30;
        if (p.x < -margin) p.x = width + margin;
        if (p.x > width + margin) p.x = -margin;
        if (p.y < -margin) p.y = height + margin;
        if (p.y > height + margin) p.y = -margin;

        // 6. Calculate Tail & Speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const speedBoost = Math.min(speed * 3.5, 14);
        p.tailLength = p.baseTailLength + speedBoost;

        // 7. Render Particle & Tapered Tail
        const colorHex = p.colorType === 'primary' ? themeColors.primary : themeColors.secondary;
        const baseOpacity = themeColors.isDark ? 0.28 : 0.14;
        const alpha = Math.min(baseOpacity * p.opacityMultiplier + p.cursorInfluence * 0.15, 0.4);

        // Direction vector opposite to velocity
        const vLen = speed || 1;
        const dirX = -(p.vx / vLen);
        const dirY = -(p.vy / vLen);

        const tailX = p.x + dirX * p.tailLength;
        const tailY = p.y + dirY * p.tailLength;

        // Draw Tapered Gradient Tail
        const grad = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
        grad.addColorStop(0, colorHex);
        grad.addColorStop(1, 'transparent');

        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Draw Head Glowing Dot
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = Math.min(alpha * 1.3, 0.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    // Page Visibility API
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animId) cancelAnimationFrame(animId);
      } else {
        pointer.lastTime = 0;
        pointer.vx = 0;
        pointer.vy = 0;
        lastFrameTime = performance.now();
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
