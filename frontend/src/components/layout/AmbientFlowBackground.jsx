import React, { Component, useEffect, useRef } from 'react';

// Error Boundary Safeguard
class AmbientFlowErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("AmbientFlowBackground caught non-critical error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// Lightweight 2D Simplex Noise generator for smooth deterministic flow field
function createNoise2D(seed = 42) {
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = Math.floor((s / 2147483647) * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  const grad3 = new Float32Array([
    1, 1, -1, 1, 1, -1, -1, -1,
    1, 0, -1, 0, 1, 0, -1, 0,
    0, 1, 0, -1, 0, 1, 0, -1
  ]);

  return function noise2D(xin, yin) {
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      const gi0 = permMod12[ii + perm[jj]] * 2;
      n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 2;
      n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 2;
      n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  };
}

function AmbientFlowCanvasInner({ seed = 42, quality = 'high' }) {
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

    const noise2D = createNoise2D(seed);

    let animId = null;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let entranceAlpha = 0;
    const startTime = performance.now();

    // Pointer state tracking
    const pointer = { x: -1000, y: -1000, active: false };

    // Theme Color Palettes
    const getThemeConfig = (isDark) => {
      if (isDark) {
        return {
          nodes: ['#818CF8', '#38BDF8', '#2DD4BF', '#C084FC'], // indigo, cyan, teal, violet
          glows: [
            { x: 0.15, y: 0.15, color: '#1E1B4B', opacity: 0.14 }, // deep blue-violet
            { x: 0.82, y: 0.82, color: '#064E3B', opacity: 0.12 }, // deep teal
            { x: 0.18, y: 0.80, color: '#311B92', opacity: 0.08 }  // low-opacity indigo
          ],
          nodeOpacityMin: 0.10,
          nodeOpacityMax: 0.26
        };
      }
      return {
        nodes: ['#6366F1', '#8B5CF6', '#0D9488', '#64748B'], // muted blue, soft violet, pale teal, gray-blue
        glows: [
          { x: 0.15, y: 0.15, color: '#E0E7FF', opacity: 0.10 }, // lavender
          { x: 0.85, y: 0.12, color: '#CFFAFE', opacity: 0.08 }, // pale cyan
          { x: 0.80, y: 0.85, color: '#CCFBF1', opacity: 0.07 }  // soft teal
        ],
        nodeOpacityMin: 0.08,
        nodeOpacityMax: 0.22
      };
    };

    let isDarkTheme = document.documentElement.classList.contains('dark');
    let themeConfig = getThemeConfig(isDarkTheme);

    const updateTheme = () => {
      isDarkTheme = document.documentElement.classList.contains('dark');
      themeConfig = getThemeConfig(isDarkTheme);
    };

    const themeObserver = new MutationObserver(() => updateTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Determine particle count based on viewport width (Poisson-disc balanced distribution)
    const getNodeCount = (w) => {
      if (isReducedMotion || quality === 'low') return w > 768 ? 10 : 6;
      if (quality === 'medium') return w > 1024 ? 20 : 12;
      if (w > 1280) return 32;
      if (w > 768) return 22;
      return 12;
    };

    let nodes = [];

    // Poisson-disc / Minimum distance placement helper
    const createBalancedNode = (w, h, existingNodes, minDistance = 110) => {
      let candidateX = Math.random() * w;
      let candidateY = Math.random() * h;
      
      for (let attempt = 0; attempt < 80; attempt++) {
        const testX = Math.random() * w;
        const testY = Math.random() * h;
        let valid = true;
        for (const prev of existingNodes) {
          const dx = testX - prev.x;
          const dy = testY - prev.y;
          if (dx * dx + dy * dy < minDistance * minDistance) {
            valid = false;
            break;
          }
        }
        if (valid) {
          candidateX = testX;
          candidateY = testY;
          break;
        }
      }

      const sizeRoll = Math.random();
      let radius;
      let speed;
      let depthCategory;

      if (sizeRoll < 0.75) {
        // Small: 2px–4px diameter => 1.0px–2.0px radius
        radius = 1.0 + Math.random() * 1.0;
        speed = 0.06 + Math.random() * 0.08;
        depthCategory = 'background';
      } else if (sizeRoll < 0.95) {
        // Medium: 4px–5.5px diameter => 2.0px–2.75px radius
        radius = 2.0 + Math.random() * 0.75;
        speed = 0.10 + Math.random() * 0.08;
        depthCategory = 'midground';
      } else {
        // Large: 5.5px–7.0px max diameter => 2.75px–3.5px radius
        radius = 2.75 + Math.random() * 0.75;
        speed = 0.15 + Math.random() * 0.07;
        depthCategory = 'foreground';
      }

      const colorIndex = Math.floor(Math.random() * themeConfig.nodes.length);
      const angle = Math.random() * Math.PI * 2;

      return {
        x: candidateX,
        y: candidateY,
        radius,
        speed,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        colorIndex,
        depthCategory,
        proximityShiftX: 0,
        proximityShiftY: 0,
        proximityHighlight: 0
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

      const targetCount = getNodeCount(width);
      const minDistance = width > 1024 ? 120 : width > 640 ? 90 : 65;

      if (nodes.length === 0) {
        nodes = [];
        for (let i = 0; i < targetCount; i++) {
          nodes.push(createBalancedNode(width, height, nodes, minDistance));
        }
      } else if (nodes.length < targetCount) {
        while (nodes.length < targetCount) {
          nodes.push(createBalancedNode(width, height, nodes, minDistance));
        }
      } else if (nodes.length > targetCount) {
        nodes.length = targetCount;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Pointer Event Handlers
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

    const handleMotionChange = (e) => {
      isReducedMotion = e.matches;
      handleResize();
    };

    motionQuery.addEventListener?.('change', handleMotionChange);

    // Main Physics & Render Loop
    let time = 0;

    const renderLoop = (timestamp) => {
      time += 0.005;

      // Entrance fade-in multiplier (0 to 1 over 1000ms)
      if (entranceAlpha < 1.0) {
        const elapsed = timestamp - startTime;
        entranceAlpha = Math.min(1.0, elapsed / 1000);
      }

      ctx.clearRect(0, 0, width, height);

      // Layer 1: Ambient Radial Glows
      themeConfig.glows.forEach(glow => {
        const gx = glow.x * width;
        const gy = glow.y * height;
        const gRadius = Math.max(width, height) * 0.42;

        const radGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gRadius);
        radGrad.addColorStop(0, glow.color);
        radGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = radGrad;
        ctx.globalAlpha = glow.opacity * entranceAlpha;
        ctx.beginPath();
        ctx.arc(gx, gy, gRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Static rendering for prefers-reduced-motion
      if (isReducedMotion) {
        nodes.forEach(node => {
          const colorHex = themeConfig.nodes[node.colorIndex % themeConfig.nodes.length];
          ctx.fillStyle = colorHex;
          ctx.globalAlpha = 0.12 * entranceAlpha;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        animId = requestAnimationFrame(renderLoop);
        return;
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const maxCenterDist = Math.min(width, height) * 0.40;

      // Layer 2 & 3: Flowing Nodes and Occasional Connections
      const activeConnections = [];

      nodes.forEach((node, i) => {
        // 1. Simplex Noise Flow Field Steering
        const noiseVal = noise2D(node.x * 0.0012 + time * 0.03, node.y * 0.0012);
        const flowAngle = noiseVal * Math.PI * 2.5;

        const targetVx = Math.cos(flowAngle) * node.speed;
        const targetVy = Math.sin(flowAngle) * node.speed;

        node.vx = node.vx * 0.97 + targetVx * 0.03;
        node.vy = node.vy * 0.97 + targetVy * 0.03;

        // 2. Minimal Pointer Interaction (2px - 6px displacement)
        if (pointer.active && !isTouchDevice) {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const distSq = dx * dx + dy * dy;
          const INTERACTION_RADIUS = 140;

          if (distSq < INTERACTION_RADIUS * INTERACTION_RADIUS) {
            const dist = Math.sqrt(distSq);
            const influence = (1 - dist / INTERACTION_RADIUS);
            const shiftMag = influence * 4.0; // Max 4px soft shift

            node.proximityShiftX = (dx / (dist || 1)) * shiftMag;
            node.proximityShiftY = (dy / (dist || 1)) * shiftMag;
            node.proximityHighlight = influence * 0.03;
          }
        }

        node.proximityShiftX *= 0.92;
        node.proximityShiftY *= 0.92;
        node.proximityHighlight *= 0.92;

        // 3. Update Position
        node.x += node.vx;
        node.y += node.vy;

        // 4. Boundary Soft Wrapping
        const margin = 20;
        if (node.x < -margin) node.x = width + margin;
        if (node.x > width + margin) node.x = -margin;
        if (node.y < -margin) node.y = height + margin;
        if (node.y > height + margin) node.y = -margin;

        // Rendered position with pointer micro-shift
        const renderX = node.x + node.proximityShiftX;
        const renderY = node.y + node.proximityShiftY;

        // 5. Content-Aware Masking (Reduce opacity behind dense center)
        const dxCenter = renderX - centerX;
        const dyCenter = renderY - centerY;
        const distFromCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
        const centerFactor = Math.min(1.0, 0.40 + (distFromCenter / maxCenterDist) * 0.60);

        // 6. Calculate Node Opacity
        const baseOpacity = node.depthCategory === 'foreground' 
          ? themeConfig.nodeOpacityMax 
          : node.depthCategory === 'midground' 
          ? (themeConfig.nodeOpacityMin + themeConfig.nodeOpacityMax) / 2 
          : themeConfig.nodeOpacityMin;

        const finalOpacity = Math.min(
          themeConfig.nodeOpacityMax + 0.04,
          (baseOpacity + node.proximityHighlight) * centerFactor * entranceAlpha
        );

        // Render Soft Node
        const colorHex = themeConfig.nodes[node.colorIndex % themeConfig.nodes.length];
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = finalOpacity;
        ctx.beginPath();
        ctx.arc(renderX, renderY, node.radius, 0, Math.PI * 2);
        ctx.fill();

        // 7. Layer 3: Occasional Connections (Max 1 per node, threshold < 100px)
        if (quality === 'high') {
          for (let j = i + 1; j < nodes.length; j++) {
            const other = nodes[j];
            const dx = (other.x + other.proximityShiftX) - renderX;
            const dy = (other.y + other.proximityShiftY) - renderY;
            const distSq = dx * dx + dy * dy;
            const CONNECT_DIST = 100;

            if (distSq < CONNECT_DIST * CONNECT_DIST) {
              const dist = Math.sqrt(distSq);
              const connAlpha = (1 - dist / CONNECT_DIST) * 0.04 * entranceAlpha;
              
              if (connAlpha > 0.005) {
                activeConnections.push({
                  x1: renderX,
                  y1: renderY,
                  x2: other.x + other.proximityShiftX,
                  y2: other.y + other.proximityShiftY,
                  alpha: connAlpha,
                  color: colorHex
                });
              }
              break; // Max 1 connection per node
            }
          }
        }
      });

      // Render Layer 3 Connections
      activeConnections.forEach(conn => {
        ctx.strokeStyle = conn.color;
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = conn.alpha;
        ctx.beginPath();
        ctx.moveTo(conn.x1, conn.y1);
        ctx.lineTo(conn.x2, conn.y2);
        ctx.stroke();
      });

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    // Visibility API - Pause when tab is hidden
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
  }, [seed, quality]);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={-1}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden select-none"
    />
  );
}

export function AmbientFlowBackground(props) {
  return (
    <AmbientFlowErrorBoundary>
      <AmbientFlowCanvasInner {...props} />
    </AmbientFlowErrorBoundary>
  );
}

export default AmbientFlowBackground;
