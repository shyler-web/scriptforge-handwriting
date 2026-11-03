// src/render/sketch/router.js
// Smart Wire & Edge Routing Engine for ScriptForge

import { Vec2, bezierPointAt, solveSmoothSpline, intersectSegments } from './vecmath.js';

function getObstacleRect(node, margin = 10) {
  const hw = (node.w || 60) * 0.5 + margin;
  const hh = (node.h || 38) * 0.5 + margin;
  return {
    id: node.id,
    minX: node.x - hw,
    maxX: node.x + hw,
    minY: node.y - hh,
    maxY: node.y + hh,
    cx: node.x,
    cy: node.y,
  };
}

export function segmentHitsRect(p1, p2, rect) {
  if (
    Math.max(p1.x, p2.x) < rect.minX ||
    Math.min(p1.x, p2.x) > rect.maxX ||
    Math.max(p1.y, p2.y) < rect.minY ||
    Math.min(p1.y, p2.y) > rect.maxY
  ) {
    return false;
  }
  const c1 = { x: rect.minX, y: rect.minY };
  const c2 = { x: rect.maxX, y: rect.minY };
  const c3 = { x: rect.maxX, y: rect.maxY };
  const c4 = { x: rect.minX, y: rect.maxY };
  return Boolean(
    intersectSegments(p1, p2, c1, c2) ||
      intersectSegments(p1, p2, c2, c3) ||
      intersectSegments(p1, p2, c3, c4) ||
      intersectSegments(p1, p2, c4, c1)
  );
}

/**
 * Checks if a direct line between n1 and n2 hits any intermediate obstacle.
 */
export function isDirectLineBlocked(p1, p2, obstacles = [], sourceId = null, targetId = null) {
  const activeRects = obstacles
    .filter((n) => n && n.id !== sourceId && n.id !== targetId && n.shape !== 'point')
    .map((n) => getObstacleRect(n, 8));
  return activeRects.some((r) => segmentHitsRect(p1, p2, r));
}

export function routeOrthogonal(p1, p2, obstacles = [], {
  sourceId = null,
  targetId = null,
  exitDir = null,
  entryDir = null,
  stubLen = 20,
} = {}) {
  const activeRects = obstacles
    .filter((n) => n && n.id !== sourceId && n.id !== targetId && n.shape !== 'point')
    .map((n) => getObstacleRect(n, 10));

  const dirVec = (d) => {
    switch (String(d || '').toLowerCase()) {
      case 'n':
      case 'up':
        return { x: 0, y: -1 };
      case 's':
      case 'down':
        return { x: 0, y: 1 };
      case 'e':
      case 'right':
        return { x: 1, y: 0 };
      case 'w':
      case 'left':
        return { x: -1, y: 0 };
      default:
        return null;
    }
  };

  const vOut = dirVec(exitDir);
  const vIn = dirVec(entryDir);

  const sPt = vOut ? Vec2.add(p1, Vec2.scale(vOut, stubLen)) : { ...p1 };
  const ePt = vIn ? Vec2.add(p2, Vec2.scale(vIn, stubLen)) : { ...p2 };

  const isFree = (a, b) => !activeRects.some((r) => segmentHitsRect(a, b, r));

  // If exit and entry are both vertical (e.g. top-arch bypass over an obstacle), test direct bridge first
  if (vOut && vIn && vOut.y !== 0 && vIn.y !== 0) {
    const bridgeY = vOut.y < 0 ? Math.min(sPt.y, ePt.y) : Math.max(sPt.y, ePt.y);
    const b1 = { x: p1.x, y: bridgeY };
    const b2 = { x: p2.x, y: bridgeY };
    if (isFree(p1, b1) && isFree(b1, b2) && isFree(b2, p2)) {
      return simplifyOrthogonalPath([p1, b1, b2, p2]);
    }
  }

  const midX = (sPt.x + ePt.x) * 0.5;
  const midY = (sPt.y + ePt.y) * 0.5;
  const candidates = [
    [sPt, { x: ePt.x, y: sPt.y }, ePt],
    [sPt, { x: sPt.x, y: ePt.y }, ePt],
    [sPt, { x: midX, y: sPt.y }, { x: midX, y: ePt.y }, ePt],
    [sPt, { x: sPt.x, y: midY }, { x: ePt.x, y: midY }, ePt],
  ];

  for (const cand of candidates) {
    let ok = true;
    for (let i = 1; i < cand.length; i++) {
      if (!isFree(cand[i - 1], cand[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return simplifyOrthogonalPath([p1, ...cand, p2]);
  }

  // Hanan grid A* search
  const xs = new Set([sPt.x, ePt.x, midX]);
  const ys = new Set([sPt.y, ePt.y, midY]);
  for (const r of activeRects) {
    xs.add(r.minX - 10);
    xs.add(r.maxX + 10);
    ys.add(r.minY - 12);
    ys.add(r.maxY + 12);
  }

  const xArr = [...xs].sort((a, b) => a - b);
  const yArr = [...ys].sort((a, b) => a - b);

  const startIx = xArr.indexOf(sPt.x);
  const startIy = yArr.indexOf(sPt.y);
  const goalIx = xArr.indexOf(ePt.x);
  const goalIy = yArr.indexOf(ePt.y);

  const open = [{ ix: startIx, iy: startIy, dir: 0, g: 0, f: 0, parent: null }];
  const bestG = new Map();

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (cur.ix === goalIx && cur.iy === goalIy) {
      const gridPts = [];
      let ptr = cur;
      while (ptr) {
        gridPts.unshift({ x: xArr[ptr.ix], y: yArr[ptr.iy] });
        ptr = ptr.parent;
      }
      return simplifyOrthogonalPath([p1, ...gridPts, p2]);
    }

    const stateKey = `${cur.ix},${cur.iy},${cur.dir}`;
    if ((bestG.get(stateKey) ?? Infinity) < cur.g) continue;

    const dirs = [
      { dx: 1, dy: 0, dCode: 1 },
      { dx: -1, dy: 0, dCode: 2 },
      { dx: 0, dy: 1, dCode: 3 },
      { dx: 0, dy: -1, dCode: 4 },
    ];

    for (const { dx, dy, dCode } of dirs) {
      const nix = cur.ix + dx;
      const niy = cur.iy + dy;
      if (nix < 0 || nix >= xArr.length || niy < 0 || niy >= yArr.length) continue;

      const ptA = { x: xArr[cur.ix], y: yArr[cur.iy] };
      const ptB = { x: xArr[nix], y: yArr[niy] };
      if (!isFree(ptA, ptB)) continue;

      const stepDist = Vec2.dist(ptA, ptB);
      const bendPenalty = cur.dir !== 0 && cur.dir !== dCode ? 35 : 0;
      const ng = cur.g + stepDist + bendPenalty;
      const nKey = `${nix},${niy},${dCode}`;

      if (ng < (bestG.get(nKey) ?? Infinity)) {
        bestG.set(nKey, ng);
        const h = Math.abs(ptB.x - ePt.x) + Math.abs(ptB.y - ePt.y);
        open.push({ ix: nix, iy: niy, dir: dCode, g: ng, f: ng + h, parent: cur });
      }
    }
  }

  const topBypassY = Math.min(sPt.y, ePt.y, ...activeRects.map((r) => r.minY)) - 18;
  return simplifyOrthogonalPath([
    p1,
    { x: p1.x, y: topBypassY },
    { x: p2.x, y: topBypassY },
    p2,
  ]);
}

function simplifyOrthogonalPath(pts) {
  if (!pts || pts.length <= 2) return pts;
  const dedup = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (Vec2.dist(pts[i], dedup[dedup.length - 1]) > 0.5) {
      dedup.push(pts[i]);
    }
  }
  const out = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1];
    const b = dedup[i];
    const c = dedup[i + 1];
    const collinearX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
    const collinearY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
    if (!collinearX && !collinearY) out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

export function routeCurvedAroundObstacles(p1, p2, obstacles = [], {
  sourceId = null,
  targetId = null,
} = {}) {
  const activeRects = obstacles
    .filter((n) => n && n.id !== sourceId && n.id !== targetId && n.shape !== 'point')
    .map((n) => getObstacleRect(n, 10));

  const blocking = activeRects.filter((r) => segmentHitsRect(p1, p2, r));
  if (blocking.length === 0) return [p1, p2];

  const d = Vec2.sub(p2, p1);
  const u = Vec2.norm(d);
  const n = Vec2.perp(u);
  const mid = Vec2.mid(p1, p2);

  let sideSum = 0;
  let maxHalfSpan = 36;
  for (const r of blocking) {
    const rel = Vec2.sub({ x: r.cx, y: r.cy }, mid);
    sideSum += Vec2.dot(rel, n);
    maxHalfSpan = Math.max(maxHalfSpan, Math.hypot(r.maxX - r.minX, r.maxY - r.minY) * 0.55);
  }
  const sign = sideSum > 0 ? -1 : 1;
  const ctrl = Vec2.add(mid, Vec2.scale(n, sign * (maxHalfSpan + 16)));
  return solveSmoothSpline([p1, ctrl, p2], 0.55, false, 16);
}

export function buildSelfLoop(node, { dir = 'n', radius = 26, steps = 24 } = {}) {
  const angles = { n: 90, up: 90, s: 270, down: 270, e: 0, right: 0, w: 180, left: 180 };
  const deg = angles[String(dir || 'n').toLowerCase()] ?? 90;
  const spread = 26;

  const uMid = Vec2.polar(1, deg, true);
  const uStart = Vec2.polar(1, deg + spread, true);
  const uEnd = Vec2.polar(1, deg - spread, true);

  const rx = (node.w || 46) * 0.5;
  const ry = (node.h || 46) * 0.5;

  const p0 = { x: node.x + uStart.x * rx, y: node.y + uStart.y * ry };
  const p3 = { x: node.x + uEnd.x * rx, y: node.y + uEnd.y * ry };
  const cp1 = Vec2.add(p0, Vec2.scale(uStart, radius * 1.4));
  const cp2 = Vec2.add(p3, Vec2.scale(uEnd, radius * 1.4));

  const points = [];
  for (let i = 0; i <= steps; i++) {
    points.push(bezierPointAt(p0, cp1, cp2, p3, i / steps));
  }

  const apex = bezierPointAt(p0, cp1, cp2, p3, 0.5);
  return {
    points,
    labelPos: Vec2.add(apex, Vec2.scale(uMid, 12)),
    endTangent: Vec2.norm(Vec2.sub(p3, cp2)),
  };
}

export function assignParallelEdgeBends(connectorItems) {
  const pairGroups = new Map();
  for (const item of connectorItems) {
    if (!item.fromId || !item.toId || item.fromId === item.toId) continue;
    if (item.bendExplicit) continue;
    const key = [item.fromId, item.toId].sort().join('::');
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(item);
  }

  for (const group of pairGroups.values()) {
    if (group.length <= 1) continue;
    const spacing = 26;
    group.forEach((item, idx) => {
      const offsetIdx = idx - (group.length - 1) * 0.5;
      const canonicalSign = item.fromId < item.toId ? 1 : -1;
      item.bend = offsetIdx * spacing * canonicalSign;
    });
  }
}
