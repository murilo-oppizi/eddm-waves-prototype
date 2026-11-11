

import { useEffect, useRef } from "react";

// Our own dot-matrix orb (an "AI is thinking" loader): points spread evenly over a
// sphere, slowly rotating, with a bloom wave rippling through them. Drawn on a canvas
// in brand pink → AI indigo (the same orb as on the eddm.com hero). Decorative only.

const POINTS = 260;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Evenly spread points on a unit sphere (Fibonacci lattice). */
const sphere = Array.from({ length: POINTS }, (_, i) => {
  const y = 1 - (i / (POINTS - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = GOLDEN_ANGLE * i;
  return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, phase: (i * 0.618) % 1 };
});

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function DotOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const css = getComputedStyle(document.documentElement);
    const from = hexToRgb(css.getPropertyValue("--ai-from") || "#ef2b55");
    const to = hexToRgb(css.getPropertyValue("--ai-to") || "#4f39f6");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let size = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = canvas.clientWidth * dpr;
      canvas.width = size;
      canvas.height = size;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const spin = t * 0.9;
      const tilt = 0.45;
      const cos = Math.cos(spin), sin = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
      const radius = size * 0.4;
      const dot = size * 0.022;

      ctx.clearRect(0, 0, size, size);
      for (const p of sphere) {
        // Rotate around Y, then tilt around X.
        const x = p.x * cos + p.z * sin;
        const z1 = -p.x * sin + p.z * cos;
        const y = p.y * ct - z1 * st;
        const z = p.y * st + z1 * ct;
        const depth = (z + 1) / 2; // 0 = back, 1 = front
        // Bloom: a wave travelling from top to bottom through the sphere.
        const bloom = 0.5 + 0.5 * Math.sin(t * 3.2 - p.y * 3 + p.phase * 1.5);
        const mix = (p.y + 1) / 2;
        const [r, g, b] = [0, 1, 2].map((k) => Math.round(from[k] + (to[k] - from[k]) * mix));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.15 + 0.85 * depth * (0.45 + 0.55 * bloom)})`;
        ctx.beginPath();
        ctx.arc(size / 2 + x * radius, size / 2 + y * radius, dot * (0.45 + 0.55 * depth) * (0.8 + 0.5 * bloom), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
