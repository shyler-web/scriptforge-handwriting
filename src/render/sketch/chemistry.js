// src/render/sketch/chemistry.js
// Mathematical Solvers for Organic Chemistry Skeletal Chains, Wedge/Dash Stereobonds,
// Cyclohexane Chair Conformations, and Newman Projections.

import { Vec2, DEG2RAD } from './vecmath.js';
import { drawPointChain, drawHatchedPolygon } from './strokes.js';
import { rLine, rCircle, drawDiagramText } from '../diagrams/primitives.js';

// ============================================================================
// 1. STEREOCENTER WEDGE & DASH BOND RENDERERS
// ============================================================================
export function drawWedgeBond(rc, ctx, p1, p2, {
  width = 9,
  stroke = '#1e293b',
  seed = 1301,
} = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return;
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);
  const halfW = width * 0.5;

  const c1 = Vec2.add(p2, Vec2.scale(n, halfW));
  const c2 = Vec2.add(p2, Vec2.scale(n, -halfW));
  const poly = [p1, c1, c2];

  drawHatchedPolygon(rc, ctx, poly, {
    fill: 'hatch',
    hatchAngle: (Math.atan2(u.y, u.x) * 180) / Math.PI + 90,
    hatchSpacing: 2.5,
    stroke,
    strokeWidth: 1.4,
    outline: true,
    seed,
  });
}

export function drawDashBond(rc, ctx, p1, p2, {
  width = 9,
  bars = 7,
  stroke = '#1e293b',
  strokeWidth = 1.4,
  seed = 1321,
} = {}) {
  const d = Vec2.sub(p2, p1);
  const L = Vec2.len(d);
  if (L < 4) return;
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);

  for (let i = 1; i <= bars; i++) {
    const t = i / bars;
    const center = Vec2.lerp(p1, p2, t);
    const halfSpan = (width * 0.5) * t;
    const a = Vec2.add(center, Vec2.scale(n, halfSpan));
    const b = Vec2.add(center, Vec2.scale(n, -halfSpan));
    rLine(rc, ctx, a.x, a.y, b.x, b.y, {
      seed: seed + i * 5,
      stroke,
      strokeWidth,
    });
  }
}

// ============================================================================
// 2. IUPAC 120-DEGREE SKELETAL CARBON CHAIN SOLVER
// ============================================================================
/**
 * Computes 120-degree zig-zag skeletal carbon chain coordinates C1..Cn,
 * multiple-bond orders (1, 2, 3), and substituent branches.
 * Example:
 *   carbons=6, bonds="2:=, 4:#", branches="3:OH, 5:Br, 2:^CH3, 4:_Cl"
 *   Prefix '^' on branch forces solid wedge; '_' forces dashed stereobond; '=' forces double bond (e.g. carbonyl =O).
 */
export function solveSkeletalChain({
  origin = { x: 0, y: 0 },
  carbons = 6,
  bondLen = 38,
  bondsStr = '',
  branchesStr = '',
} = {}) {
  const N = Math.max(2, Number(carbons) || 6);
  const stepX = bondLen * Math.cos(30 * DEG2RAD);
  const stepY = bondLen * Math.sin(30 * DEG2RAD);
  const totalW = (N - 1) * stepX;
  const startX = origin.x - totalW * 0.5;

  const vertices = [];
  for (let i = 0; i < N; i++) {
    const isPeak = i % 2 === 1;
    vertices.push({
      idx: i + 1,
      id: `C${i + 1}`,
      x: startX + i * stepX,
      y: origin.y + (isPeak ? -stepY * 0.5 : stepY * 0.5),
      isPeak,
    });
  }

  // Parse multiple bonds: e.g. "1:=, 3:#"
  const bondOrders = new Map();
  for (const part of String(bondsStr || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [idxStr, sym = '='] = part.split(':').map((s) => s.trim());
    const idx = Number(idxStr);
    const order = sym === '#' || sym === '3' ? 3 : sym === '=' || sym === '2' ? 2 : 1;
    if (idx >= 1 && idx < N) bondOrders.set(idx, order);
  }

  // Parse substituent branches: e.g. "2:OH, 3:=O, 4:^Me, 4:_H"
  const branches = [];
  const branchCountAt = new Map();
  for (const part of String(branchesStr || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const cIdx = Number(part.slice(0, colonIdx).trim());
    let rawGroup = part.slice(colonIdx + 1).trim();
    if (cIdx < 1 || cIdx > N || !rawGroup) continue;

    let style = 'single';
    if (rawGroup.startsWith('=')) {
      style = 'double';
      rawGroup = rawGroup.slice(1).trim();
    } else if (rawGroup.startsWith('^')) {
      style = 'wedge';
      rawGroup = rawGroup.slice(1).trim();
    } else if (rawGroup.startsWith('_')) {
      style = 'dash';
      rawGroup = rawGroup.slice(1).trim();
    }

    const v = vertices[cIdx - 1];
    const k = branchCountAt.get(cIdx) || 0;
    branchCountAt.set(cIdx, k + 1);

    // Exterior bisector direction: peaks point UP (-90 deg), valleys point DOWN (+90 deg)
    let angleDeg = v.isPeak ? 90 : -90;
    if (k === 1) angleDeg += v.isPeak ? 32 : -32;
    if (cIdx === 1) angleDeg = 150;
    else if (cIdx === N) angleDeg = v.isPeak ? 30 : -30;

    const dir = Vec2.polar(1, angleDeg, true);
    const endPt = Vec2.add(v, Vec2.scale(dir, bondLen * 0.86));
    const labelPt = Vec2.add(v, Vec2.scale(dir, bondLen * 1.14));

    branches.push({
      from: { x: v.x, y: v.y },
      to: endPt,
      labelPt,
      label: rawGroup,
      style,
    });
  }

  return {
    origin,
    vertices,
    bondOrders,
    branches,
    bondLen,
    width: totalW + bondLen * 2,
    height: bondLen * 2.4,
  };
}

export function renderSkeletalChainItem(rc, ctx, chain, font, baseSize, stroke, seed = 1351) {
  const { vertices, bondOrders, branches } = chain;
  let sSeed = seed;

  // Draw backbone C-C bonds
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const order = bondOrders.get(i + 1) || 1;
    const d = Vec2.sub(b, a);
    const u = Vec2.norm(d);
    const n = Vec2.perp(u);

    rLine(rc, ctx, a.x, a.y, b.x, b.y, { seed: sSeed++, stroke, strokeWidth: 1.7 });

    if (order === 2) {
      const insetA = Vec2.add(a, Vec2.scale(u, 3));
      const insetB = Vec2.sub(b, Vec2.scale(u, 3));
      const off = Vec2.scale(n, 4.2);
      rLine(rc, ctx, insetA.x + off.x, insetA.y + off.y, insetB.x + off.x, insetB.y + off.y, {
        seed: sSeed++,
        stroke,
        strokeWidth: 1.5,
      });
    } else if (order === 3) {
      const insetA = Vec2.add(a, Vec2.scale(u, 3.5));
      const insetB = Vec2.sub(b, Vec2.scale(u, 3.5));
      for (const s of [-4.2, 4.2]) {
        const off = Vec2.scale(n, s);
        rLine(rc, ctx, insetA.x + off.x, insetA.y + off.y, insetB.x + off.x, insetB.y + off.y, {
          seed: sSeed++,
          stroke,
          strokeWidth: 1.4,
        });
      }
    }
  }

  // Draw substituent branches
  for (const br of branches) {
    if (br.style === 'wedge') {
      drawWedgeBond(rc, ctx, br.from, br.to, { stroke, seed: sSeed++ });
    } else if (br.style === 'dash') {
      drawDashBond(rc, ctx, br.from, br.to, { stroke, seed: sSeed++ });
    } else if (br.style === 'double') {
      const d = Vec2.sub(br.to, br.from);
      const n = Vec2.perp(Vec2.norm(d));
      for (const s of [-2.4, 2.4]) {
        const off = Vec2.scale(n, s);
        rLine(rc, ctx, br.from.x + off.x, br.from.y + off.y, br.to.x + off.x, br.to.y + off.y, {
          seed: sSeed++,
          stroke,
          strokeWidth: 1.5,
        });
      }
    } else {
      rLine(rc, ctx, br.from.x, br.from.y, br.to.x, br.to.y, { seed: sSeed++, stroke, strokeWidth: 1.6 });
    }

    drawDiagramText(ctx, br.label, br.labelPt.x, br.labelPt.y, {
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
// 3. CYCLOHEXANE CHAIR CONFORMATION SOLVER
// ============================================================================
/**
 * Computes exact parallel-edge cyclohexane chair vertices C1..C6 and optional
 * axial / equatorial substituent bonds.
 */
export function solveChairConformation({
  origin = { x: 0, y: 0 },
  scale = 1,
  flip = false,
  axialStr = '',
  equatorialStr = '',
} = {}) {
  const s = scale * (flip ? -1 : 1);
  // Canonical 6-carbon chair coordinates centered around origin
  const rawCoords = [
    { x: -64 * s, y: -18 }, // C1 (leftmost peak)
    { x: -20 * s, y: 16 },  // C2 (front-left valley)
    { x: 38 * s, y: 6 },    // C3 (front-right peak)
    { x: 64 * s, y: 18 },   // C4 (rightmost valley)
    { x: 20 * s, y: -16 },  // C5 (back-right peak)
    { x: -38 * s, y: -6 },  // C6 (back-left valley)
  ];

  const carbons = rawCoords.map((p, i) => ({
    idx: i + 1,
    id: `C${i + 1}`,
    x: origin.x + p.x,
    y: origin.y + p.y,
    // C1, C3, C5 point axial UP (-1 in screen Y); C2, C4, C6 point axial DOWN (+1 in screen Y)
    axialSign: i % 2 === 0 ? -1 : 1,
  }));

  const substituents = [];
  const bondLen = 32 * scale;

  const parseSubList = (str, kind) => {
    for (const part of String(str || '').split(',').map((t) => t.trim()).filter(Boolean)) {
      const [idxStr, lbl] = part.split(':').map((t) => t.trim());
      const cIdx = Number(idxStr);
      if (cIdx < 1 || cIdx > 6 || !lbl) continue;
      const c = carbons[cIdx - 1];

      let dir;
      if (kind === 'axial') {
        dir = { x: 0, y: c.axialSign };
      } else {
        // Equatorial vector points outward along the C(i-1)-C(i+1) parallel ring bond
        const prev = carbons[(cIdx + 4) % 6];
        const next = carbons[cIdx % 6];
        const outX = c.x >= origin.x ? 1 : -1;
        dir = Vec2.norm({ x: outX * 0.86, y: -c.axialSign * 0.5 });
        void prev;
        void next;
      }

      const to = Vec2.add(c, Vec2.scale(dir, bondLen));
      const labelPt = Vec2.add(c, Vec2.scale(dir, bondLen + 12));
      substituents.push({ from: { x: c.x, y: c.y }, to, labelPt, label: lbl });
    }
  };

  parseSubList(axialStr, 'axial');
  parseSubList(equatorialStr, 'equatorial');

  return {
    origin,
    carbons,
    substituents,
    width: 170 * scale,
    height: 115 * scale,
  };
}

export function renderChairItem(rc, ctx, chair, font, baseSize, stroke, seed = 1401) {
  const { carbons, substituents } = chair;
  let sSeed = seed;

  const ringPts = [...carbons, carbons[0]];
  drawPointChain(rc, ctx, ringPts, { seed: sSeed++, stroke, strokeWidth: 1.75 });

  for (const sub of substituents) {
    rLine(rc, ctx, sub.from.x, sub.from.y, sub.to.x, sub.to.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.5,
    });
    drawDiagramText(ctx, sub.label, sub.labelPt.x, sub.labelPt.y, {
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
// 4. NEWMAN PROJECTION SOLVER
// ============================================================================
export function solveNewmanProjection({
  origin = { x: 0, y: 0 },
  radius = 30,
  spokeLen = 50,
  dihedralDeg = 60,
  frontStr = 'CH3,H,H',
  backStr = 'Br,H,CH3',
} = {}) {
  const frontLabels = String(frontStr).split(',').map((s) => s.trim());
  const backLabels = String(backStr).split(',').map((s) => s.trim());

  const frontSpokes = [0, 1, 2].map((i) => {
    const deg = 90 - i * 120;
    const dir = Vec2.polar(1, deg, true);
    return {
      from: { x: origin.x, y: origin.y },
      to: Vec2.add(origin, Vec2.scale(dir, spokeLen)),
      labelPt: Vec2.add(origin, Vec2.scale(dir, spokeLen + 14)),
      label: frontLabels[i] ?? 'H',
    };
  });

  const backSpokes = [0, 1, 2].map((i) => {
    const deg = 90 - i * 120 - Number(dihedralDeg || 60);
    const dir = Vec2.polar(1, deg, true);
    return {
      from: Vec2.add(origin, Vec2.scale(dir, radius)),
      to: Vec2.add(origin, Vec2.scale(dir, spokeLen)),
      labelPt: Vec2.add(origin, Vec2.scale(dir, spokeLen + 14)),
      label: backLabels[i] ?? 'H',
    };
  });

  return {
    origin,
    radius,
    spokeLen,
    frontSpokes,
    backSpokes,
  };
}

export function renderNewmanItem(rc, ctx, nm, font, baseSize, stroke, seed = 1451) {
  const { origin, radius, frontSpokes, backSpokes } = nm;
  let sSeed = seed;

  // Rear carbon circle (rCircle takes radius!)
  rCircle(rc, ctx, origin.x, origin.y, radius, {
    seed: sSeed++,
    stroke,
    strokeWidth: 1.7,
    fill: '#ffffff',
    fillStyle: 'solid',
  });

  // Rear carbon bonds (clipped to circle boundary)
  for (const sp of backSpokes) {
    rLine(rc, ctx, sp.from.x, sp.from.y, sp.to.x, sp.to.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.6,
    });
    drawDiagramText(ctx, sp.label, sp.labelPt.x, sp.labelPt.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  // Front carbon Y-bonds meeting at center
  for (const sp of frontSpokes) {
    rLine(rc, ctx, sp.from.x, sp.from.y, sp.to.x, sp.to.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.75,
    });
    drawDiagramText(ctx, sp.label, sp.labelPt.x, sp.labelPt.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }
}
