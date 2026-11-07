import { useEffect, useRef } from "react";

function colorToRgb(color) {
  const value = color.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? [...hex[1]].map((digit) => digit + digit).join("")
      : hex[1];
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ];
  }

  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? rgb.slice(1, 4).map(Number) : [58, 52, 70];
}

export default function DotGrid({
  baseColor = "#3a3446",
  activeColor = "#ffffff",
  shape = "circle",
  dotSize = 5,
  gap = 18,
  proximity = 140,
  strength = 1,
  bounce = 0.6,
  tension = 0.4,
  returnDuration = 0.8,
  shockRadius = 320,
  shockStrength = 5,
  swell = 0.8,
  stretch = 0.5,
  glow = 0.5,
  fade = 0,
  intro = true,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !("CanvasRenderingContext2D" in window)) return undefined;
    const context = canvas?.getContext("2d");
    if (!context) return undefined;

    const baseRgb = colorToRgb(baseColor);
    const activeRgb = colorToRgb(activeColor);
    const pointer = { x: -1000, y: -1000, startedAt: 0 };
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrame = 0;
    let startTime = performance.now();

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const movePointer = (event) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(render);
    };
    const triggerShock = (event) => {
      movePointer(event);
      pointer.startedAt = performance.now();
      if (!animationFrame) animationFrame = window.requestAnimationFrame(render);
    };

    const render = (now) => {
      animationFrame = 0;
      context.clearRect(0, 0, width, height);
      const introProgress = intro ? Math.min(1, (now - startTime) / 1100) : 1;
      const introOpacity = intro ? introProgress * introProgress * (3 - 2 * introProgress) : 1;
      const columns = Math.ceil(width / gap) + 1;
      const rows = Math.ceil(height / gap) + 1;
      const shockAge = pointer.startedAt ? (now - pointer.startedAt) / 1000 : Infinity;
      const shockEnvelope = shockAge < returnDuration
        ? Math.sin(Math.PI * shockAge / returnDuration) * (1 - shockAge / returnDuration)
        : 0;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * gap + gap / 2;
          const y = row * gap + gap / 2;
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          const influence = Math.max(0, 1 - distance / proximity);
          const force = influence * influence * strength;
          const shockDistance = Math.abs(distance - shockAge * shockRadius);
          const shock = shockAge < returnDuration
            ? Math.max(0, 1 - shockDistance / Math.max(shockRadius * 0.12, 1)) * shockEnvelope * shockStrength
            : 0;
          const direction = distance > 0 ? 1 / distance : 0;
          const offsetX = distance > 0 ? dx * direction * (force * 7 + shock * bounce * 2) : 0;
          const offsetY = distance > 0 ? dy * direction * (force * 7 + shock * bounce * 2) : 0;
          const radius = Math.max(0.5, dotSize / 2 + force * swell + shock * swell * 0.18);
          const colorMix = Math.min(1, force + shock * 0.12);
          const red = Math.round(baseRgb[0] + (activeRgb[0] - baseRgb[0]) * colorMix);
          const green = Math.round(baseRgb[1] + (activeRgb[1] - baseRgb[1]) * colorMix);
          const blue = Math.round(baseRgb[2] + (activeRgb[2] - baseRgb[2]) * colorMix);
          let opacity = introOpacity * (0.5 + Math.min(0.5, force * tension + shock * 0.08));
          if (fade > 0) {
            const centerDistance = Math.hypot(x - width / 2, y - height / 2);
            opacity *= Math.max(0, 1 - centerDistance / (Math.max(width, height) * fade));
          }

          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
          if (glow > 0 && colorMix > 0.08) {
            context.shadowColor = `rgba(${red}, ${green}, ${blue}, ${glow * colorMix})`;
            context.shadowBlur = glow * 10 * colorMix;
          } else {
            context.shadowBlur = 0;
          }

          if (shape === "square") {
            const widthScale = 1 + force * stretch;
            context.fillRect(x + offsetX - radius * widthScale, y + offsetY - radius, radius * 2 * widthScale, radius * 2);
          } else {
            context.beginPath();
            context.ellipse(x + offsetX, y + offsetY, radius * (1 + force * stretch), radius, 0, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      context.shadowBlur = 0;
      if (introProgress < 1 || shockAge < returnDuration) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    resize();
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    canvas.addEventListener("pointermove", movePointer);
    canvas.addEventListener("pointerdown", triggerShock);
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointermove", movePointer);
      canvas.removeEventListener("pointerdown", triggerShock);
      window.removeEventListener("resize", resize);
    };
  }, [
    activeColor,
    baseColor,
    bounce,
    dotSize,
    fade,
    gap,
    glow,
    intro,
    proximity,
    returnDuration,
    shape,
    shockRadius,
    shockStrength,
    stretch,
    strength,
    swell,
    tension,
  ]);

  return <canvas aria-hidden="true" className="hero-dot-grid" ref={canvasRef} />;
}
