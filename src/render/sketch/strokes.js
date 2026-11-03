// src/render/sketch/strokes.js
// Parametric Mathematical Stroke Generators for ScriptForge Universal Sketch Engine

import { Vec2, generatePolygonHatchLines } from './vecmath.js';
import { rLine, rCircle } from '../diagrams/primitives.js';

export function drawPointChain(rc, ctx, points, opts = {}) {
  if (!points || points.length < 2) return;
  const seedBase = opts.seed || 101;
  const stroke = opts.stroke || opts.color || '#1e293b';
  const strokeWidth = opts.strokeWidth || 1.6;
  const dashed = opts.dashed || false;

  if (dashed) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(Array.isArray(dashed) ? dashed : [6, 5]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (rc && typeof rc.linearPath === 'function') {
    const pairs = points.map((p) => [p.x, p.y]);
    rc.linearPath(pairs, {
      seed: seedBase,
      roughness: opts.roughness ?? 0.85,
      bowing: opts.bowing ?? 0.6,
      stroke,
      strokeWidth,
    });
  } else {
    for (let i = 1; i < points.length; i++) {
      rLine(rc, ctx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, {
        seed: seedBase + i * 7,
        roughness: opts.roughness ?? 0.85,
        stroke,
        strokeWidth,
      });
    }
  }
}

export function buildSpringPoints(p1, p2, { coils = 7, amp = 7, lead = 0.12, loopFactor = 0.35 } = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return [p1, p2];
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);

  const pad = Math.min(L * lead, 18);
  const activeL = Math.max(4, L - 2 * pad);
  const start = Vec2.add(p1, Vec2.scale(u, pad));
  const end = Vec2.sub(p2, Vec2.scale(u, pad));

  const pts = [p1, start];
  const steps = Math.max(48, coils * 16);
  const loopShift = (activeL / Math.max(1, coils)) * loopFactor;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = t * coils * Math.PI * 2;
    const env = Math.sin(Math.min(1, t * 10) * (Math.PI / 2)) * Math.sin(Math.min(1, (1 - t) * 10) * (Math.PI / 2));
    const along = t * activeL - Math.sin(theta) * loopShift * env;
    const across = Math.sin(theta * 0.5) !== 0 ? Math.cos(theta - Math.PI * 0.5) * amp * env : 0;
    const pt = Vec2.add(start, Vec2.add(Vec2.scale(u, along), Vec2.scale(n, across)));
    pts.push(pt);
  }
  pts.push(end, p2);
  return pts;
}

export function buildWavePoints(p1, p2, { freq = 5, amp = 6, type = 'sine', lead = 0.1 } = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return [p1, p2];
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);

  const pad = type === 'resistor' ? Math.min(L * 0.22, 22) : Math.min(L * lead, 14);
  const activeL = Math.max(4, L - 2 * pad);
  const start = Vec2.add(p1, Vec2.scale(u, pad));
  const end = Vec2.sub(p2, Vec2.scale(u, pad));

  const pts = [p1, start];
  if (type === 'zigzag' || type === 'resistor') {
    const peaks = Math.max(4, Math.round(freq) * 2);
    for (let i = 1; i < peaks; i++) {
      const t = i / peaks;
      const sign = i % 2 === 1 ? 1 : -1;
      pts.push(Vec2.add(start, Vec2.add(Vec2.scale(u, t * activeL), Vec2.scale(n, sign * amp))));
    }
  } else {
    const steps = Math.max(40, Math.round(freq * 16));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = Math.sin(t * freq * Math.PI * 2) * amp;
      pts.push(Vec2.add(start, Vec2.add(Vec2.scale(u, t * activeL), Vec2.scale(n, y))));
    }
  }
  pts.push(end, p2);
  return pts;
}

export function buildCurlyBrace(p1, p2, { amp = 12, flip = false } = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  const u = Vec2.norm(d);
  const dirSign = flip ? 1 : -1;
  const n = Vec2.scale(Vec2.perp(u), dirSign);
  const A = Math.abs(amp);

  const q = Math.min(L * 0.18, A * 1.4, 18);
  const midBase = Vec2.mid(p1, p2);
  const cusp = Vec2.add(midBase, Vec2.scale(n, A));

  const p1Corner = Vec2.add(p1, Vec2.add(Vec2.scale(u, q), Vec2.scale(n, A * 0.5)));
  const midLeft = Vec2.add(midBase, Vec2.add(Vec2.scale(u, -q), Vec2.scale(n, A * 0.5)));
  const midRight = Vec2.add(midBase, Vec2.add(Vec2.scale(u, q), Vec2.scale(n, A * 0.5)));
  const p2Corner = Vec2.add(p2, Vec2.add(Vec2.scale(u, -q), Vec2.scale(n, A * 0.5)));

  const pts = [];
  const sampleQuad = (a, ctrl, b, steps = 8) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y,
      });
    }
  };

  sampleQuad(p1, Vec2.add(p1, Vec2.scale(n, A * 0.5)), p1Corner, 6);
  pts.push(midLeft);
  sampleQuad(midLeft, Vec2.add(midBase, Vec2.scale(n, A * 0.55)), cusp, 6);
  sampleQuad(cusp, Vec2.add(midBase, Vec2.scale(n, A * 0.55)), midRight, 6);
  pts.push(p2Corner);
  sampleQuad(p2Corner, Vec2.add(p2, Vec2.scale(n, A * 0.5)), p2, 6);

  return {
    points: pts,
    cusp,
    labelPos: Vec2.add(cusp, Vec2.scale(n, 14)),
    normal: n,
  };
}

export function drawArrowEndpoint(rc, ctx, tip, tangent, {
  type = '->',
  size = 9,
  stroke = '#1e293b',
  strokeWidth = 1.6,
  seed = 101,
} = {}) {
  const u = Vec2.norm(tangent);
  const n = Vec2.perp(u);
  const back = Vec2.scale(u, -size);
  const wing = size * 0.44;

  if (type === 'none' || type === '-') return;

  if (type === '-|' || type === '|') {
    const a = Vec2.add(tip, Vec2.scale(n, wing * 1.2));
    const b = Vec2.add(tip, Vec2.scale(n, -wing * 1.2));
    rLine(rc, ctx, a.x, a.y, b.x, b.y, { seed, stroke, strokeWidth });
    return;
  }

  if (type === '-o' || type === 'o') {
    // Note: rCircle takes radius (4px)
    rCircle(rc, ctx, tip.x - u.x * 4, tip.y - u.y * 4, 4, {
      seed,
      stroke,
      strokeWidth,
      fill: '#ffffff',
      fillStyle: 'solid',
    });
    return;
  }

  if (type === '-*' || type === '*') {
    rCircle(rc, ctx, tip.x - u.x * 3.5, tip.y - u.y * 3.5, 3.5, {
      seed,
      stroke,
      strokeWidth,
      fill: stroke,
      fillStyle: 'solid',
    });
    return;
  }

  if (type === 'harpoon' || type === '⇀') {
    const w1 = Vec2.add(tip, Vec2.add(back, Vec2.scale(n, -wing * 1.1)));
    rLine(rc, ctx, tip.x, tip.y, w1.x, w1.y, { seed, stroke, strokeWidth });
    return;
  }

  const w1 = Vec2.add(tip, Vec2.add(back, Vec2.scale(n, wing)));
  const w2 = Vec2.add(tip, Vec2.add(back, Vec2.scale(n, -wing)));
  rLine(rc, ctx, tip.x, tip.y, w1.x, w1.y, { seed: seed + 1, stroke, strokeWidth });
  rLine(rc, ctx, tip.x, tip.y, w2.x, w2.y, { seed: seed + 2, stroke, strokeWidth });

  if (type === '->>' || type === '>>') {
    const tip2 = Vec2.add(tip, Vec2.scale(u, -size * 0.6));
    const b1 = Vec2.add(tip2, Vec2.add(back, Vec2.scale(n, wing)));
    const b2 = Vec2.add(tip2, Vec2.add(back, Vec2.scale(n, -wing)));
    rLine(rc, ctx, tip2.x, tip2.y, b1.x, b1.y, { seed: seed + 3, stroke, strokeWidth });
    rLine(rc, ctx, tip2.x, tip2.y, b2.x, b2.y, { seed: seed + 4, stroke, strokeWidth });
  }
}

export function drawMechanicalSupport(rc, ctx, p1, p2, {
  hatchSide = 'below',
  spacing = 9,
  depth = 10,
  stroke = '#1e293b',
  strokeWidth = 1.6,
  seed = 201,
} = {}) {
  rLine(rc, ctx, p1.x, p1.y, p2.x, p2.y, { seed, stroke, strokeWidth: strokeWidth * 1.15 });
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return;
  const u = Vec2.norm(d);
  const sign = hatchSide === 'above' || hatchSide === 'left' ? -1 : 1;
  const n = Vec2.scale(Vec2.perp(u), sign);

  const count = Math.max(3, Math.floor(L / spacing));
  for (let i = 0; i <= count; i++) {
    const base = Vec2.lerp(p1, p2, i / count);
    const tip = Vec2.add(base, Vec2.add(Vec2.scale(n, depth), Vec2.scale(u, -depth * 0.65)));
    rLine(rc, ctx, base.x, base.y, tip.x, tip.y, {
      seed: seed + i * 11,
      stroke,
      strokeWidth: strokeWidth * 0.8,
    });
  }
}

export function drawAngleMarker(rc, ctx, vertex, p1, p2, {
  radius = 26,
  rightAngle = false,
  ticks = 0,
  stroke = '#1e293b',
  strokeWidth = 1.4,
  seed = 301,
} = {}) {
  const u1 = Vec2.norm(Vec2.sub(p1, vertex));
  const u2 = Vec2.norm(Vec2.sub(p2, vertex));
  let a1 = Math.atan2(u1.y, u1.x);
  let a2 = Math.atan2(u2.y, u2.x);

  let diff = a2 - a1;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;

  const isRight = rightAngle || Math.abs(Math.abs(diff) - Math.PI / 2) < 0.06;

  if (isRight) {
    const r = Math.min(radius, 18);
    const c1 = Vec2.add(vertex, Vec2.scale(u1, r));
    const c2 = Vec2.add(vertex, Vec2.scale(u2, r));
    const corner = Vec2.add(c1, Vec2.scale(u2, r));
    rLine(rc, ctx, c1.x, c1.y, corner.x, corner.y, { seed: seed + 1, stroke, strokeWidth });
    rLine(rc, ctx, corner.x, corner.y, c2.x, c2.y, { seed: seed + 2, stroke, strokeWidth });
    const bisector = Vec2.norm(Vec2.add(u1, u2));
    return { labelPos: Vec2.add(vertex, Vec2.scale(bisector, r * 1.85)) };
  }

  const steps = 20;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const ang = a1 + (diff * i) / steps;
    pts.push({
      x: vertex.x + Math.cos(ang) * radius,
      y: vertex.y + Math.sin(ang) * radius,
    });
  }
  drawPointChain(rc, ctx, pts, { seed, stroke, strokeWidth });

  const midAng = a1 + diff * 0.5;
  const bisector = { x: Math.cos(midAng), y: Math.sin(midAng) };

  if (ticks > 0) {
    for (let t = 0; t < ticks; t++) {
      const ang = midAng + (t - (ticks - 1) * 0.5) * 0.12;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const inner = Vec2.add(vertex, Vec2.scale(dir, radius - 4));
      const outer = Vec2.add(vertex, Vec2.scale(dir, radius + 4));
      rLine(rc, ctx, inner.x, inner.y, outer.x, outer.y, { seed: seed + 10 + t, stroke, strokeWidth });
    }
  }

  return {
    labelPos: Vec2.add(vertex, Vec2.scale(bisector, radius + 15)),
  };
}

export function drawDimensionCallout(rc, ctx, p1, p2, {
  offset = 24,
  stroke = '#1e293b',
  strokeWidth = 1.3,
  seed = 401,
} = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return { labelPos: Vec2.mid(p1, p2) };
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);
  const sign = offset >= 0 ? 1 : -1;
  const offVec = Vec2.scale(n, offset);
  const extOver = Vec2.scale(n, offset + sign * 6);

  const d1 = Vec2.add(p1, offVec);
  const d2 = Vec2.add(p2, offVec);

  rLine(rc, ctx, p1.x + n.x * sign * 3, p1.y + n.y * sign * 3, p1.x + extOver.x, p1.y + extOver.y, {
    seed: seed + 1,
    stroke,
    strokeWidth: strokeWidth * 0.85,
  });
  rLine(rc, ctx, p2.x + n.x * sign * 3, p2.y + n.y * sign * 3, p2.x + extOver.x, p2.y + extOver.y, {
    seed: seed + 2,
    stroke,
    strokeWidth: strokeWidth * 0.85,
  });

  rLine(rc, ctx, d1.x, d1.y, d2.x, d2.y, { seed: seed + 3, stroke, strokeWidth });
  drawArrowEndpoint(rc, ctx, d1, Vec2.scale(u, -1), { size: 8, stroke, strokeWidth, seed: seed + 4 });
  drawArrowEndpoint(rc, ctx, d2, u, { size: 8, stroke, strokeWidth, seed: seed + 6 });

  const mid = Vec2.mid(d1, d2);
  return {
    labelPos: Vec2.add(mid, Vec2.scale(n, sign * 12)),
  };
}

export function drawHatchedPolygon(rc, ctx, polygonPts, {
  fill = 'hatch',
  hatchAngle = 45,
  hatchSpacing = 7,
  stroke = '#1e293b',
  hatchColor = null,
  strokeWidth = 1.5,
  outline = true,
  seed = 501,
} = {}) {
  if (!polygonPts || polygonPts.length < 3) return;
  const hStroke = hatchColor || stroke;

  if (fill === 'hatch' || fill === 'crosshatch') {
    const lines1 = generatePolygonHatchLines(polygonPts, hatchAngle, hatchSpacing);
    lines1.forEach(([a, b], idx) => {
      rLine(rc, ctx, a.x, a.y, b.x, b.y, {
        seed: seed + idx * 3,
        stroke: hStroke,
        strokeWidth: Math.max(0.8, strokeWidth * 0.6),
        roughness: 0.65,
      });
    });
    if (fill === 'crosshatch') {
      const lines2 = generatePolygonHatchLines(polygonPts, hatchAngle + 90, hatchSpacing);
      lines2.forEach(([a, b], idx) => {
        rLine(rc, ctx, a.x, a.y, b.x, b.y, {
          seed: seed + 500 + idx * 3,
          stroke: hStroke,
          strokeWidth: Math.max(0.8, strokeWidth * 0.6),
          roughness: 0.65,
        });
      });
    }
  }

  if (outline) {
    const closedPts = [...polygonPts, polygonPts[0]];
    drawPointChain(rc, ctx, closedPts, { seed: seed + 999, stroke, strokeWidth });
  }
}
