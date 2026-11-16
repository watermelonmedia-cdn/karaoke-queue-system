/**
 * A short confetti burst, drawn on a throwaway canvas. No dependency.
 *
 * Skipped entirely for anyone whose device asks for reduced motion, and the
 * canvas removes itself when the burst ends, so it cannot linger or leak.
 */
export function confettiBurst(durationMs = 1600) {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "9999",
    } as CSSStyleDeclaration);
    ctx.scale(dpr, dpr);
    document.body.appendChild(canvas);

    // Logo colours: marquee yellow, teal, white, a deeper teal.
    const colours = ["#FACC15", "#2DD4BF", "#FFFFFF", "#14B8A6", "#FDE68A"];
    const count = Math.min(90, Math.round(w / 6));
    const parts = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 11,
      vy: -(Math.random() * 9 + 4),
      size: Math.random() * 6 + 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      colour: colours[Math.floor(Math.random() * colours.length)],
    }));

    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - t / durationMs);
      for (const p of parts) {
        p.vy += 0.28; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < durationMs) requestAnimationFrame(frame);
      else canvas.remove();
    };
    requestAnimationFrame(frame);
  } catch {
    // Decoration only: never let it interfere with a submission.
  }
}
