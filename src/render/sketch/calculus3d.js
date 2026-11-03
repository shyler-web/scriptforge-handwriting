// src/render/sketch/calculus3d.js
// Mathematical Solvers for:
// 1. 3D Surfaces z = f(x, y) with Painter's Depth Sort & Hidden-Line Occlusion
// 2. Calculus Riemann Sums & Trapezoidal Rule Partitions
// 3. Linear Algebra 2x2 Matrix Transformation Grids & Basis Vectors
// 4. Differential Equation (ODE) Slope Fields & RK4 Integral Curves

import { Vec2, EPS, compileMathExpr, Projector3D } from './vecmath.js';
import { drawPointChain, drawArrowEndpoint, drawHatchedPolygon } from './strokes.js';
import { rLine, rCircle, rRect, drawDiagramText } from '../diagrams/primitives.js';

// ============================================================================
// 1. 3D SURFACE MESH SOLVER WITH PAINTER'S DEPTH SORTING
// ============================================================================
export function solveSurface3D({
  origin = { x: 0, y: 0 },
  fnStr = '0.35*(x^2 - y^2)',
  xMin = -2.5,
  xMax = 2.5,
  yMin = -2.5,
  yMax = 2.5,
  steps = 12,
  azimuth = 38,
  elevation = 26,
  scaleXY = 26,
  scaleZ = 22,
} = {}) {
  const fn = compileMathExpr(fnStr);
  const N = Math.max(4, Math.min(22, Number(steps) || 12));
  const proj = new Projector3D({ azimuth, elevation, scale: 1, origin });

  const grid = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i <= N; i++) {
    const row = [];
    const x = xMin + ((xMax - xMin) * i) / N;
    for (let j = 0; j <= N; j++) {
      const y = yMin + ((yMax - yMin) * j) / N;
      const rawZ = fn({ x, y });
      const z = Number.isFinite(rawZ) ? Math.max(-6, Math.min(6, rawZ)) : 0;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
      const p2d = proj.project(x * scaleXY, y * scaleXY, z * scaleZ);
      row.push({ x, y, z, screenX: p2d.x, screenY: p2d.y, depth: p2d.depth });
    }
    grid.push(row);
  }

  // Build quads and sort back-to-front by average camera depth (Painter's Algorithm)
  const quads = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p11 = grid[i + 1][j + 1];
      const p01 = grid[i][j + 1];
      const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25;
      quads.push({
        pts: [
          { x: p00.screenX, y: p00.screenY },
          { x: p10.screenX, y: p10.screenY },
          { x: p11.screenX, y: p11.screenY },
          { x: p01.screenX, y: p01.screenY },
        ],
        avgDepth,
      });
    }
  }
  quads.sort((a, b) => a.avgDepth - b.avgDepth);

  // Reference 3D axes from origin
  const axLen = Math.max(Math.abs(xMax), Math.abs(yMax)) * scaleXY * 1.18;
  const zAxLen = Math.max(55, Math.max(Math.abs(zMin), Math.abs(zMax), 1.5) * scaleZ * 1.25);
  const axes = {
    O: proj.project(0, 0, 0),
    X: proj.project(axLen, 0, 0),
    Y: proj.project(0, axLen, 0),
    Z: proj.project(0, 0, zAxLen),
  };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of quads) {
    for (const p of q.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  for (const p of [axes.O, axes.X, axes.Y, axes.Z]) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    origin,
    quads,
    axes,
    bounds: { minX, minY, maxX, maxY },
  };
}

export function renderSurface3DItem(rc, ctx, surf, font, baseSize, stroke, seed = 1701) {
  const { quads, axes } = surf;
  let sSeed = seed;

  // Draw back-to-front surface quads with opaque paper occlusion mask so hidden lines vanish
  for (const q of quads) {
    ctx.save();
    ctx.fillStyle = '#faf8f3';
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    ctx.lineTo(q.pts[1].x, q.pts[1].y);
    ctx.lineTo(q.pts[2].x, q.pts[2].y);
    ctx.lineTo(q.pts[3].x, q.pts[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    for (let k = 0; k < 4; k++) {
      const a = q.pts[k];
      const b = q.pts[(k + 1) % 4];
      rLine(rc, ctx, a.x, a.y, b.x, b.y, {
        seed: sSeed++,
        stroke,
        strokeWidth: 1.05,
        roughness: 0.55,
      });
    }
  }

  // Draw 3D coordinate axes on top for orientation
  for (const [tip, lbl] of [
    [axes.X, '$x$'],
    [axes.Y, '$y$'],
    [axes.Z, '$z$'],
  ]) {
    rLine(rc, ctx, axes.O.x, axes.O.y, tip.x, tip.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.5,
    });
    const dir = Vec2.norm(Vec2.sub(tip, axes.O));
    drawArrowEndpoint(rc, ctx, tip, dir, { size: 7.5, stroke, seed: sSeed++ });
    const lblPt = Vec2.add(tip, Vec2.scale(dir, 13));
    drawDiagramText(ctx, lbl, lblPt.x, lblPt.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }
}

// ============================================================================
// 2. RIEMANN SUM & DEFINITE INTEGRAL PARTITION SOLVER
// ============================================================================
export function solveRiemannSum({
  origin = { x: 0, y: 0 },
  fnStr = '0.18*x^2 + 0.6',
  a = 0,
  b = 4,
  n = 6,
  method = 'left', // 'left' | 'right' | 'mid' | 'trap'
  w = 240,
  h = 150,
} = {}) {
  const fn = compileMathExpr(fnStr);
  const N = Math.max(1, Math.min(24, Number(n) || 6));
  const xPad = Math.max(0.5, (b - a) * 0.15);
  const xMin = Math.min(0, a - xPad);
  const xMax = b + xPad;

  let yMaxVal = 1;
  let yMinVal = 0;
  for (let i = 0; i <= 80; i++) {
    const x = xMin + ((xMax - xMin) * i) / 80;
    const y = fn({ x });
    if (Number.isFinite(y)) {
      if (y > yMaxVal) yMaxVal = y;
      if (y < yMinVal) yMinVal = y;
    }
  }
  const yMin = Math.min(0, yMinVal * 1.15);
  const yMax = Math.max(1, yMaxVal * 1.2);

  const toCanvas = (mx, my) => {
    const tx = (mx - xMin) / Math.max(EPS, xMax - xMin);
    const ty = (my - yMin) / Math.max(EPS, yMax - yMin);
    return {
      x: origin.x - w * 0.5 + tx * w,
      y: origin.y + h * 0.5 - ty * h,
    };
  };

  const curvePts = [];
  for (let i = 0; i <= 80; i++) {
    const x = xMin + ((xMax - xMin) * i) / 80;
    curvePts.push(toCanvas(x, fn({ x })));
  }

  const dx = (b - a) / N;
  const partitions = [];
  const sampleDots = [];

  for (let k = 0; k < N; k++) {
    const x0 = a + k * dx;
    const x1 = x0 + dx;
    if (method === 'trap' || method === 'trapezoid') {
      const y0 = fn({ x: x0 });
      const y1 = fn({ x: x1 });
      partitions.push([toCanvas(x0, 0), toCanvas(x0, y0), toCanvas(x1, y1), toCanvas(x1, 0)]);
      sampleDots.push(toCanvas(x0, y0), toCanvas(x1, y1));
    } else {
      const sampleX = method === 'right' ? x1 : method === 'mid' || method === 'midpoint' ? (x0 + x1) * 0.5 : x0;
      const sampleY = fn({ x: sampleX });
      partitions.push([
        toCanvas(x0, 0),
        toCanvas(x0, sampleY),
        toCanvas(x1, sampleY),
        toCanvas(x1, 0),
      ]);
      sampleDots.push(toCanvas(sampleX, sampleY));
    }
  }

  return {
    origin,
    w,
    h,
    aPt: toCanvas(a, 0),
    bPt: toCanvas(b, 0),
    zeroPt: toCanvas(0, 0),
    leftEdge: origin.x - w * 0.5,
    rightEdge: origin.x + w * 0.5,
    topEdge: origin.y - h * 0.5,
    bottomEdge: origin.y + h * 0.5,
    curvePts,
    partitions,
    sampleDots,
  };
}

export function renderRiemannItem(rc, ctx, rm, font, baseSize, stroke, seed = 1801) {
  let sSeed = seed;

  // Draw hatched Riemann partition bars
  for (const poly of rm.partitions) {
    drawHatchedPolygon(rc, ctx, poly, {
      fill: 'hatch',
      hatchAngle: 45,
      hatchSpacing: 6.5,
      stroke,
      strokeWidth: 1.3,
      outline: true,
      seed: sSeed++,
    });
  }

  // Draw axes
  rLine(rc, ctx, rm.leftEdge, rm.zeroPt.y, rm.rightEdge, rm.zeroPt.y, {
    seed: sSeed++,
    stroke,
    strokeWidth: 1.5,
  });
  drawArrowEndpoint(rc, ctx, { x: rm.rightEdge, y: rm.zeroPt.y }, { x: 1, y: 0 }, { stroke, seed: sSeed++ });
  rLine(rc, ctx, rm.zeroPt.x, rm.bottomEdge, rm.zeroPt.x, rm.topEdge, {
    seed: sSeed++,
    stroke,
    strokeWidth: 1.5,
  });
  drawArrowEndpoint(rc, ctx, { x: rm.zeroPt.x, y: rm.topEdge }, { x: 0, y: -1 }, { stroke, seed: sSeed++ });

  // Draw function curve on top
  drawPointChain(rc, ctx, rm.curvePts, { seed: sSeed++, stroke, strokeWidth: 1.9 });

  // Sample points on the curve
  for (const d of rm.sampleDots) {
    rCircle(rc, ctx, d.x, d.y, 2.2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });
  }

  drawDiagramText(ctx, '$a$', rm.aPt.x, rm.zeroPt.y + 13, {
    font,
    size: baseSize - 2,
    color: stroke,
    align: 'center',
    baseline: 'top',
    seed: sSeed++,
  });
  drawDiagramText(ctx, '$b$', rm.bPt.x, rm.zeroPt.y + 13, {
    font,
    size: baseSize - 2,
    color: stroke,
    align: 'center',
    baseline: 'top',
    seed: sSeed++,
  });
}

// ============================================================================
// 3. LINEAR ALGEBRA 2x2 MATRIX TRANSFORMATION GRID SOLVER
// ============================================================================
export function solveMatrixGrid({
  origin = { x: 0, y: 0 },
  matrixStr = '1.3, 0.5, 0.3, 1.1',
  range = 2,
  stepPx = 32,
  showDet = true,
} = {}) {
  const nums = String(matrixStr || '1,0,0,1')
    .split(',')
    .map((s) => parseFloat(s.trim()));
  const a = Number.isFinite(nums[0]) ? nums[0] : 1;
  const b = Number.isFinite(nums[1]) ? nums[1] : 0;
  const c = Number.isFinite(nums[2]) ? nums[2] : 0;
  const d = Number.isFinite(nums[3]) ? nums[3] : 1;

  const toScreen = (vx, vy) => ({
    x: origin.x + vx * stepPx,
    y: origin.y - vy * stepPx,
  });

  const applyMat = (vx, vy) => toScreen(a * vx + b * vy, c * vx + d * vy);

  const R = Math.max(1, Math.min(4, Number(range) || 2));
  const baseGridLines = [];
  const transGridLines = [];

  for (let k = -R; k <= R; k++) {
    baseGridLines.push([toScreen(-R, k), toScreen(R, k)]);
    baseGridLines.push([toScreen(k, -R), toScreen(k, R)]);
    transGridLines.push([applyMat(-R, k), applyMat(R, k)]);
    transGridLines.push([applyMat(k, -R), applyMat(k, R)]);
  }

  const unitParallelogram = [
    applyMat(0, 0),
    applyMat(1, 0),
    applyMat(1, 1),
    applyMat(0, 1),
  ];

  return {
    origin,
    baseGridLines,
    transGridLines,
    unitParallelogram,
    showDet,
    O: toScreen(0, 0),
    iHat: applyMat(1, 0),
    jHat: applyMat(0, 1),
    span: R * stepPx * Math.max(1.5, Math.hypot(a, c) + Math.hypot(b, d)),
  };
}

export function renderMatrixGridItem(rc, ctx, mg, font, baseSize, stroke, seed = 1901) {
  let sSeed = seed;

  // Faint dashed reference grid
  for (const [p1, p2] of mg.baseGridLines) {
    drawPointChain(rc, ctx, [p1, p2], {
      seed: sSeed++,
      stroke: stroke + '35',
      strokeWidth: 0.85,
      dashed: [4, 4],
    });
  }

  // Hatched determinant parallelogram (image of unit square)
  if (mg.showDet) {
    drawHatchedPolygon(rc, ctx, mg.unitParallelogram, {
      fill: 'hatch',
      hatchAngle: 35,
      hatchSpacing: 6,
      stroke,
      strokeWidth: 1.3,
      outline: true,
      seed: sSeed++,
    });
  }

  // Transformed grid lines
  for (const [p1, p2] of mg.transGridLines) {
    rLine(rc, ctx, p1.x, p1.y, p2.x, p2.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.15,
    });
  }

  // Transformed basis vectors i' and j'
  for (const [tip, lbl] of [
    [mg.iHat, "$\\hat{i}'$"],
    [mg.jHat, "$\\hat{j}'$"],
  ]) {
    rLine(rc, ctx, mg.O.x, mg.O.y, tip.x, tip.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 2.1,
    });
    const dir = Vec2.norm(Vec2.sub(tip, mg.O));
    drawArrowEndpoint(rc, ctx, tip, dir, { size: 8.5, stroke, seed: sSeed++ });
    const lblPt = Vec2.add(tip, Vec2.scale(dir, 14));
    drawDiagramText(ctx, lbl, lblPt.x, lblPt.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }
}

// ============================================================================
// 4. ODE SLOPE FIELD & RK4 SOLUTION CURVE SOLVER
// ============================================================================
export function solveSlopeField({
  origin = { x: 0, y: 0 },
  dyStr = 'x - y',
  xMin = -3,
  xMax = 3,
  yMin = -2.2,
  yMax = 2.2,
  cols = 9,
  rows = 7,
  w = 240,
  h = 160,
  solutionsStr = '',
} = {}) {
  const f = compileMathExpr(dyStr);
  const toCanvas = (mx, my) => ({
    x: origin.x - w * 0.5 + ((mx - xMin) / Math.max(EPS, xMax - xMin)) * w,
    y: origin.y + h * 0.5 - ((my - yMin) / Math.max(EPS, yMax - yMin)) * h,
  });

  const segments = [];
  const segLen = 14;
  const scaleRatio = (h / Math.max(EPS, yMax - yMin)) / (w / Math.max(EPS, xMax - xMin));

  for (let r = 0; r < rows; r++) {
    const my = yMin + ((yMax - yMin) * r) / Math.max(1, rows - 1);
    for (let c = 0; c < cols; c++) {
      const mx = xMin + ((xMax - xMin) * c) / Math.max(1, cols - 1);
      const slope = f({ x: mx, y: my });
      if (!Number.isFinite(slope)) continue;
      const center = toCanvas(mx, my);
      const dir = Vec2.norm({ x: 1, y: -slope * scaleRatio });
      segments.push({
        from: Vec2.sub(center, Vec2.scale(dir, segLen * 0.5)),
        to: Vec2.add(center, Vec2.scale(dir, segLen * 0.5)),
      });
    }
  }

  // Parse seed points "(x0, y0), (x1, y1)" and trace RK4 curves
  const trajectories = [];
  const tupleMatches = String(solutionsStr || '').match(/\([^)]+\)/g) || [];
  for (const tStr of tupleMatches) {
    const [sx, sy] = tStr
      .replace(/[()]/g, '')
      .split(',')
      .map((s) => parseFloat(s.trim()));
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

    const traceDir = (dirSign) => {
      const pts = [];
      let cx = sx;
      let cy = sy;
      const dt = 0.08 * dirSign;
      for (let step = 0; step < 65; step++) {
        if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) break;
        pts.push(toCanvas(cx, cy));
        const k1 = f({ x: cx, y: cy });
        const k2 = f({ x: cx + dt * 0.5, y: cy + dt * 0.5 * k1 });
        const k3 = f({ x: cx + dt * 0.5, y: cy + dt * 0.5 * k2 });
        const k4 = f({ x: cx + dt, y: cy + dt * k3 });
        const nextY = cy + (dt * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
        if (!Number.isFinite(nextY)) break;
        cx += dt;
        cy = nextY;
      }
      return pts;
    };

    const backPts = traceDir(-1).reverse();
    const fwdPts = traceDir(1).slice(1);
    const full = [...backPts, ...fwdPts];
    if (full.length >= 2) {
      trajectories.push({ points: full, seedPt: toCanvas(sx, sy) });
    }
  }

  return {
    origin,
    w,
    h,
    zeroPt: toCanvas(0, 0),
    leftEdge: origin.x - w * 0.5,
    rightEdge: origin.x + w * 0.5,
    topEdge: origin.y - h * 0.5,
    bottomEdge: origin.y + h * 0.5,
    segments,
    trajectories,
  };
}

export function renderSlopeFieldItem(rc, ctx, sf, font, baseSize, stroke, seed = 2001) {
  let sSeed = seed;

  // Axes
  rLine(rc, ctx, sf.leftEdge, sf.zeroPt.y, sf.rightEdge, sf.zeroPt.y, {
    seed: sSeed++,
    stroke: stroke + '66',
    strokeWidth: 1.2,
  });
  rLine(rc, ctx, sf.zeroPt.x, sf.bottomEdge, sf.zeroPt.x, sf.topEdge, {
    seed: sSeed++,
    stroke: stroke + '66',
    strokeWidth: 1.2,
  });

  // Slope tangent ticks
  for (const seg of sf.segments) {
    rLine(rc, ctx, seg.from.x, seg.from.y, seg.to.x, seg.to.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.15,
    });
  }

  // RK4 solution curves
  for (const tr of sf.trajectories) {
    drawPointChain(rc, ctx, tr.points, { seed: sSeed++, stroke, strokeWidth: 1.95 });
    rCircle(rc, ctx, tr.seedPt.x, tr.seedPt.y, 2.5, {
      seed: sSeed++,
      stroke,
      fill: stroke,
      fillStyle: 'solid',
    });
  }
}
