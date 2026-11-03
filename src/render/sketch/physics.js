// src/render/sketch/physics.js
// Mathematical Solvers for Mechanics, Pulley Tangents, Geometric Ray Optics,
// and Runge-Kutta (RK4) Electrostatic / Vector Field Streamlines.

import { Vec2, DEG2RAD, EPS, compileMathExpr } from './vecmath.js';

export function solveInclinedPlane({
  origin = { x: 0, y: 0 },
  baseWidth = 220,
  angleDeg = 30,
  blockPos = 0.52,
  blockW = 50,
  blockH = 34,
  side = 'left',
} = {}) {
  const theta = Math.max(8, Math.min(75, Number(angleDeg) || 30)) * DEG2RAD;
  const H = baseWidth * Math.tan(theta);

  const cx = origin.x;
  const cy = origin.y + H * 0.35;
  const A = side === 'right' ? { x: cx + baseWidth * 0.5, y: cy } : { x: cx - baseWidth * 0.5, y: cy };
  const B = side === 'right' ? { x: cx - baseWidth * 0.5, y: cy } : { x: cx + baseWidth * 0.5, y: cy };
  const C = { x: B.x, y: cy - H };

  const uUp = Vec2.norm(Vec2.sub(C, A));
  const uDown = Vec2.scale(uUp, -1);
  let nOut = Vec2.perp(uUp);
  if (nOut.y > 0) nOut = Vec2.scale(nOut, -1);

  const contactPt = Vec2.lerp(A, C, blockPos);
  const com = Vec2.add(contactPt, Vec2.scale(nOut, blockH * 0.5));

  const hw = blockW * 0.5;
  const hh = blockH * 0.5;
  const blockCorners = [
    Vec2.add(com, Vec2.add(Vec2.scale(uDown, hw), Vec2.scale(nOut, hh))),
    Vec2.add(com, Vec2.add(Vec2.scale(uUp, hw), Vec2.scale(nOut, hh))),
    Vec2.add(com, Vec2.add(Vec2.scale(uUp, hw), Vec2.scale(nOut, -hh))),
    Vec2.add(com, Vec2.add(Vec2.scale(uDown, hw), Vec2.scale(nOut, -hh))),
  ];

  // Generous vector lengths so arrowheads and tip labels sit well outside the block
  const vecLen = 78;
  const mgEnd = { x: com.x, y: com.y + vecLen };
  const normalEnd = Vec2.add(com, Vec2.scale(nOut, vecLen * Math.cos(theta)));
  const frictionEnd = Vec2.add(com, Vec2.scale(uUp, vecLen * 0.78));
  const pullEnd = Vec2.add(com, Vec2.scale(uUp, vecLen * 0.92));

  const mgCosEnd = Vec2.add(com, Vec2.scale(nOut, -vecLen * Math.cos(theta)));
  const mgSinEnd = Vec2.add(com, Vec2.scale(uDown, vecLen * Math.max(0.58, Math.sin(theta))));

  return {
    triangle: [A, B, C],
    A,
    B,
    C,
    theta,
    uUp,
    uDown,
    nOut,
    contactPt,
    com,
    blockCorners,
    forces: {
      mg: { from: com, to: mgEnd },
      normal: { from: com, to: normalEnd },
      friction: { from: com, to: frictionEnd },
      pull: { from: com, to: pullEnd },
      mgCos: { from: com, to: mgCosEnd },
      mgSin: { from: com, to: mgSinEnd },
    },
  };
}

export function solvePulleySystem({
  c1 = { x: 0, y: 0 },
  r1 = 28,
  c2 = null,
  r2 = 28,
  crossed = false,
  hangLeft = 66,
  hangRight = 92,
  blockW = 38,
  blockH = 30,
} = {}) {
  const ropes = [];
  const blocks = [];

  if (!c2) {
    const pLeft = { x: c1.x - r1, y: c1.y };
    const pRight = { x: c1.x + r1, y: c1.y };
    const b1Center = { x: pLeft.x, y: pLeft.y + hangLeft + blockH * 0.5 };
    const b2Center = { x: pRight.x, y: pRight.y + hangRight + blockH * 0.5 };

    ropes.push(
      { from: pLeft, to: { x: pLeft.x, y: pLeft.y + hangLeft } },
      { from: pRight, to: { x: pRight.x, y: pRight.y + hangRight } }
    );
    blocks.push(
      { center: b1Center, w: blockW, h: blockH, side: 'left', ropeTop: { x: pLeft.x, y: pLeft.y + hangLeft } },
      { center: b2Center, w: blockW, h: blockH, side: 'right', ropeTop: { x: pRight.x, y: pRight.y + hangRight } }
    );
    return { ropes, blocks };
  }

  const dVec = Vec2.sub(c2, c1);
  const d = Vec2.len(dVec);
  if (d < EPS) return { ropes, blocks };

  const baseAng = Math.atan2(dVec.y, dVec.x);
  const ratio = crossed ? (r1 + r2) / d : (r1 - r2) / d;
  const clamped = Math.max(-0.999, Math.min(0.999, ratio));
  const offsetAng = Math.acos(clamped);

  for (const sign of [1, -1]) {
    const a1 = baseAng + sign * offsetAng;
    const a2 = crossed ? baseAng + sign * (Math.PI - offsetAng) : a1;
    ropes.push({
      from: { x: c1.x + Math.cos(a1) * r1, y: c1.y + Math.sin(a1) * r1 },
      to: { x: c2.x + Math.cos(a2) * r2, y: c2.y + Math.sin(a2) * r2 },
    });
  }

  return { ropes, blocks };
}

export function solveOpticsRayTrace({
  origin = { x: 0, y: 0 },
  kind = 'convex',
  f = 65,
  u = 125,
  h = 42,
  axisHalfW = 190,
  lensHalfH = 70,
} = {}) {
  const isConverging = kind !== 'concave' && kind !== 'diverging' && f > 0;
  const fSigned = isConverging ? Math.abs(f) : -Math.abs(f);
  const uDist = Math.max(20, Math.abs(u));

  const invV = 1 / fSigned - 1 / uDist;
  const vSigned = Math.abs(invV) < 1e-4 ? 9999 : 1 / invV;
  const imgH = -h * (vSigned / uDist);
  const isVirtual = vSigned < 0;

  const O = { x: origin.x, y: origin.y };
  const objBase = { x: O.x - uDist, y: O.y };
  const objTip = { x: O.x - uDist, y: O.y - h };

  const clampedV = Math.max(-axisHalfW * 0.92, Math.min(axisHalfW * 0.92, vSigned));
  const imgBase = { x: O.x + clampedV, y: O.y };
  const imgTip = { x: O.x + clampedV, y: O.y - imgH };

  const F1 = { x: O.x - Math.abs(f), y: O.y };
  const F2 = { x: O.x + Math.abs(f), y: O.y };
  const twoF1 = { x: O.x - Math.abs(f) * 2, y: O.y };
  const twoF2 = { x: O.x + Math.abs(f) * 2, y: O.y };

  const lensHit1 = { x: O.x, y: objTip.y };
  const ray1Dir = isConverging
    ? Vec2.norm(Vec2.sub(imgTip, lensHit1))
    : Vec2.norm(Vec2.sub(lensHit1, F1));
  const ray1Far = Vec2.add(lensHit1, Vec2.scale(ray1Dir, axisHalfW * 0.9));

  const ray2Dir = Vec2.norm(Vec2.sub(O, objTip));
  const ray2Far = isVirtual ? Vec2.add(O, Vec2.scale(ray2Dir, axisHalfW * 0.75)) : imgTip;

  const solidRays = [
    [objTip, lensHit1],
    [lensHit1, isVirtual ? ray1Far : imgTip],
    [objTip, O],
    [O, ray2Far],
  ];

  const dashedRays = [];
  if (isVirtual) {
    dashedRays.push([lensHit1, F1], [O, imgTip]);
  }

  return {
    O,
    axisLeft: { x: O.x - axisHalfW, y: O.y },
    axisRight: { x: O.x + axisHalfW, y: O.y },
    lensTop: { x: O.x, y: O.y - lensHalfH },
    lensBottom: { x: O.x, y: O.y + lensHalfH },
    isConverging,
    isVirtual,
    F1,
    F2,
    twoF1,
    twoF2,
    objBase,
    objTip,
    imgBase,
    imgTip,
    solidRays,
    dashedRays,
  };
}

/**
 * Integrates continuous electric field lines for ALL point charges (both +q and -q)
 * using 4th-order Runge-Kutta (RK4), deduplicating rays that already connect +q to -q.
 */
export function solveElectrostaticField({
  charges = [
    { x: -65, y: 0, q: 1, label: '$+q$' },
    { x: 65, y: 0, q: -1, label: '$-q$' },
  ],
  raysPerCharge = 10,
  stepSize = 5,
  maxSteps = 85,
  boundsRadius = 165,
} = {}) {
  const chargeRadius = 16;
  const fieldAt = (pt) => {
    let ex = 0;
    let ey = 0;
    for (const c of charges) {
      const dx = pt.x - c.x;
      const dy = pt.y - c.y;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < chargeRadius * 0.75) return null;
      const mag = c.q / (r2 * r);
      ex += dx * mag;
      ey += dy * mag;
    }
    const len = Math.hypot(ex, ey);
    return len > EPS ? { x: ex / len, y: ey / len } : null;
  };

  const streamlines = [];
  const fieldCx = charges.length ? charges.reduce((a, c) => a + c.x, 0) / charges.length : 0;
  const fieldCy = charges.length ? charges.reduce((a, c) => a + c.y, 0) / charges.length : 0;
  const hasPositive = charges.some((c) => c.q > 0);

  for (const src of charges) {
    const sign = src.q >= 0 ? 1 : -1;
    const count = Math.max(4, Math.round(raysPerCharge * Math.abs(src.q)));
    for (let k = 0; k < count; k++) {
      const ang = (k * Math.PI * 2) / count + 0.22;
      let cur = {
        x: src.x + Math.cos(ang) * (chargeRadius + 1),
        y: src.y + Math.sin(ang) * (chargeRadius + 1),
      };
      const pts = [cur];
      let hitOtherCharge = false;

      for (let s = 0; s < maxSteps; s++) {
        const k1 = fieldAt(cur);
        if (!k1) break;
        const p2 = { x: cur.x + sign * k1.x * stepSize * 0.5, y: cur.y + sign * k1.y * stepSize * 0.5 };
        const k2 = fieldAt(p2);
        if (!k2) break;
        const p3 = { x: cur.x + sign * k2.x * stepSize * 0.5, y: cur.y + sign * k2.y * stepSize * 0.5 };
        const k3 = fieldAt(p3);
        if (!k3) break;
        const p4 = { x: cur.x + sign * k3.x * stepSize, y: cur.y + sign * k3.y * stepSize };
        const k4 = fieldAt(p4);
        if (!k4) break;

        const next = {
          x: cur.x + (sign * stepSize * (k1.x + 2 * k2.x + 2 * k3.x + k4.x)) / 6,
          y: cur.y + (sign * stepSize * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)) / 6,
        };

        if (Math.hypot(next.x - fieldCx, next.y - fieldCy) > boundsRadius) break;
        const hitSink = charges.find((c) => c !== src && Vec2.dist(next, c) <= chargeRadius + 1);
        pts.push(next);
        cur = next;
        if (hitSink) {
          hitOtherCharge = true;
          break;
        }
      }

      // If this ray was seeded from a negative charge and hit a positive charge, skip it
      // because the positive charge already traced that connecting field line!
      if (sign < 0 && hasPositive && hitOtherCharge) continue;

      if (pts.length >= 4) {
        streamlines.push({
          points: sign > 0 ? pts : [...pts].reverse(),
        });
      }
    }
  }

  return { charges, streamlines, chargeRadius };
}

export function solveVectorFieldGrid({
  origin = { x: 0, y: 0 },
  fnXStr = '-y',
  fnYStr = 'x',
  cols = 7,
  rows = 5,
  spanW = 210,
  spanH = 140,
} = {}) {
  const fx = compileMathExpr(fnXStr);
  const fy = compileMathExpr(fnYStr);
  const vectors = [];

  for (let r = 0; r < rows; r++) {
    const ny = rows > 1 ? (r / (rows - 1)) * 2 - 1 : 0;
    for (let c = 0; c < cols; c++) {
      const nx = cols > 1 ? (c / (cols - 1)) * 2 - 1 : 0;
      const x = nx * 2;
      const y = -ny * 2;
      const vx = fx({ x, y });
      const vy = -fy({ x, y });
      const mag = Math.hypot(vx, vy);
      if (mag < 1e-4) continue;
      const len = Math.min(22, Math.max(10, 11 + Math.tanh(mag * 0.4) * 9));
      const u = { x: vx / mag, y: vy / mag };
      const center = {
        x: origin.x + nx * (spanW * 0.5),
        y: origin.y + ny * (spanH * 0.5),
      };
      vectors.push({
        from: Vec2.sub(center, Vec2.scale(u, len * 0.5)),
        to: Vec2.add(center, Vec2.scale(u, len * 0.5)),
      });
    }
  }
  return vectors;
}
