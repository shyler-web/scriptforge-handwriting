// src/render/sketch/discrete.js
// Mathematical Solvers for Discrete Mathematics:
// 1. 2-Set & 3-Set Venn Diagrams with Boolean Expression Scanline Hatching
// 2. Bipartite Function / Relation Domain-Codomain Ovals
// 3. Bottom-Up Hasse Poset Lattice Diagrams

import { Vec2 } from './vecmath.js';
import { normalizeArrowText, layoutLayeredDAG } from './layout.js';
import { drawArrowEndpoint } from './strokes.js';
import { rLine, rCircle, rEllipse, rRect, drawDiagramText } from '../diagrams/primitives.js';

// ============================================================================
// 1. BOOLEAN SET EXPRESSION COMPILER & VENN SCANLINE HATCHER
// ============================================================================
/**
 * Compiles a set theory expression like:
 *   "A&B", "A|B", "A-B", "A^B", "(A|B)-C", "A&B&C", "!A&B"
 * into a boolean predicate function (inA, inB, inC) => boolean.
 */
export function compileSetBooleanExpr(exprStr) {
  const s = String(exprStr || '')
    .trim()
    .replace(/\bAND\b|\bcap\b|∩/gi, '&')
    .replace(/\bOR\b|\bcup\b|∪/gi, '|')
    .replace(/\bXOR\b|⊕/gi, '^')
    .replace(/\\|∖/g, '-');

  if (!s) return () => false;

  const tokens = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    if (/[ABCabc123]/.test(ch)) {
      const norm = ch === '1' ? 'A' : ch === '2' ? 'B' : ch === '3' ? 'C' : ch.toUpperCase();
      tokens.push({ type: 'var', value: norm });
    } else if ('&|-^!()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
    }
  }

  const prec = { '!': 3, '&': 2, '-': 2, '^': 1, '|': 1 };
  const out = [];
  const ops = [];

  for (const t of tokens) {
    if (t.type === 'var') {
      out.push(t);
    } else if (t.value === '(') {
      ops.push(t);
    } else if (t.value === ')') {
      while (ops.length && ops[ops.length - 1].value !== '(') out.push(ops.pop());
      if (ops.length && ops[ops.length - 1].value === '(') ops.pop();
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.value === '(') break;
        if ((prec[top.value] || 0) >= (prec[t.value] || 0) && t.value !== '!') {
          out.push(ops.pop());
        } else {
          break;
        }
      }
      ops.push(t);
    }
  }
  while (ops.length) out.push(ops.pop());

  return function evalSet(A, B, C) {
    const st = [];
    for (const item of out) {
      if (item.type === 'var') {
        st.push(item.value === 'A' ? A : item.value === 'B' ? B : C);
      } else if (item.value === '!') {
        st.push(!st.pop());
      } else {
        const rhs = Boolean(st.pop());
        const lhs = Boolean(st.pop());
        switch (item.value) {
          case '&': st.push(lhs && rhs); break;
          case '|': st.push(lhs || rhs); break;
          case '-': st.push(lhs && !rhs); break;
          case '^': st.push(lhs !== rhs); break;
          default: st.push(false);
        }
      }
    }
    return Boolean(st.pop());
  };
}

export function solveVennDiagram({
  origin = { x: 0, y: 0 },
  setsStr = 'A,B',
  shadeStr = 'A&B',
  radius = 52,
  universal = true,
} = {}) {
  const labels = String(setsStr || 'A,B')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const count = Math.min(3, Math.max(2, labels.length));

  const circles = [];
  if (count === 2) {
    const sep = radius * 0.62;
    circles.push(
      { id: 'A', label: labels[0] || 'A', x: origin.x - sep, y: origin.y, r: radius, labelPos: { x: origin.x - sep - radius * 0.65, y: origin.y - radius * 0.78 } },
      { id: 'B', label: labels[1] || 'B', x: origin.x + sep, y: origin.y, r: radius, labelPos: { x: origin.x + sep + radius * 0.65, y: origin.y - radius * 0.78 } }
    );
  } else {
    const d = radius * 0.58;
    circles.push(
      { id: 'A', label: labels[0] || 'A', x: origin.x - d, y: origin.y - d * 0.55, r: radius, labelPos: { x: origin.x - d - radius * 0.7, y: origin.y - d * 0.55 - radius * 0.7 } },
      { id: 'B', label: labels[1] || 'B', x: origin.x + d, y: origin.y - d * 0.55, r: radius, labelPos: { x: origin.x + d + radius * 0.7, y: origin.y - d * 0.55 - radius * 0.7 } },
      { id: 'C', label: labels[2] || 'C', x: origin.x, y: origin.y + d * 0.85, r: radius, labelPos: { x: origin.x, y: origin.y + d * 0.85 + radius + 14 } }
    );
  }

  const boxW = count === 3 ? radius * 3.8 : radius * 3.6;
  const boxH = count === 3 ? radius * 3.5 : radius * 2.6;
  const uBox = {
    x: origin.x - boxW * 0.5,
    y: origin.y - boxH * 0.5,
    w: boxW,
    h: boxH,
  };

  // Generate 45-degree scanline hatch segments across the universal box clipped to the boolean predicate
  const predicates = String(shadeStr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => compileSetBooleanExpr(s));

  const hatchSegments = [];
  if (predicates.length > 0) {
    const spacing = 6.5;
    const rad = (-45 * Math.PI) / 180;
    const diag = Math.hypot(boxW, boxH) * 0.55;

    const testPt = (px, py) => {
      if (px < uBox.x + 3 || px > uBox.x + uBox.w - 3 || py < uBox.y + 3 || py > uBox.y + uBox.h - 3) {
        return false;
      }
      const inA = Math.hypot(px - circles[0].x, py - circles[0].y) <= circles[0].r;
      const inB = Math.hypot(px - circles[1].x, py - circles[1].y) <= circles[1].r;
      const inC = circles[2] ? Math.hypot(px - circles[2].x, py - circles[2].y) <= circles[2].r : false;
      return predicates.some((fn) => fn(inA, inB, inC));
    };

    for (let v = -diag; v <= diag; v += spacing) {
      let runStart = null;
      const step = 2.0;
      for (let u = -diag; u <= diag; u += step) {
        const local = Vec2.rot({ x: u, y: v }, -rad);
        const px = origin.x + local.x;
        const py = origin.y + local.y;
        const inside = testPt(px, py);
        if (inside && !runStart) {
          runStart = { x: px, y: py };
        } else if (!inside && runStart) {
          const prevLocal = Vec2.rot({ x: u - step, y: v }, -rad);
          const runEnd = { x: origin.x + prevLocal.x, y: origin.y + prevLocal.y };
          if (Vec2.dist(runStart, runEnd) > 3) {
            hatchSegments.push([runStart, runEnd]);
          }
          runStart = null;
        }
      }
    }
  }

  return {
    origin,
    circles,
    uBox,
    universal,
    hatchSegments,
  };
}

export function renderVennItem(rc, ctx, venn, font, baseSize, stroke, seed = 1501) {
  const { circles, uBox, universal, hatchSegments } = venn;
  let sSeed = seed;

  if (universal) {
    rRect(rc, ctx, uBox.x, uBox.y, uBox.w, uBox.h, { seed: sSeed++, stroke, strokeWidth: 1.5 });
    drawDiagramText(ctx, '$U$', uBox.x + uBox.w - 12, uBox.y + 14, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  // Draw shaded boolean region hatch lines first
  for (const [a, b] of hatchSegments) {
    rLine(rc, ctx, a.x, a.y, b.x, b.y, {
      seed: sSeed++,
      stroke,
      strokeWidth: 0.95,
      roughness: 0.65,
    });
  }

  // Draw set circles on top (rCircle takes radius!)
  for (const c of circles) {
    rCircle(rc, ctx, c.x, c.y, c.r, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.75,
    });
    drawDiagramText(ctx, c.label, c.labelPos.x, c.labelPos.y, {
      font,
      size: baseSize,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }
}

// ============================================================================
// 2. BIPARTITE FUNCTION / RELATION MAPPING OVALS
// ============================================================================
export function solveBipartiteMapping({
  origin = { x: 0, y: 0 },
  domainStr = '1,2,3,4',
  codomainStr = 'a,b,c',
  pairsStr = '1->a, 2->b, 3->b, 4->c',
  domainLabel = '$A$',
  codomainLabel = '$B$',
  fnLabel = '$f$',
  sepX = 150,
} = {}) {
  const domItems = String(domainStr).split(',').map((s) => s.trim()).filter(Boolean);
  const codItems = String(codomainStr).split(',').map((s) => s.trim()).filter(Boolean);
  const maxCount = Math.max(domItems.length, codItems.length, 2);

  const itemGapY = 30;
  const ovalH = Math.max(115, maxCount * itemGapY + 34);
  const ovalW = 68;

  const leftCx = origin.x - sepX * 0.5;
  const rightCx = origin.x + sepX * 0.5;

  const domMap = new Map();
  const domNodes = domItems.map((val, i) => {
    const y = origin.y + (i - (domItems.length - 1) * 0.5) * itemGapY;
    const pt = { val, x: leftCx, y };
    domMap.set(val, pt);
    return pt;
  });

  const codMap = new Map();
  const codNodes = codItems.map((val, i) => {
    const y = origin.y + (i - (codItems.length - 1) * 0.5) * itemGapY;
    const pt = { val, x: rightCx, y };
    codMap.set(val, pt);
    return pt;
  });

  const arrows = [];
  for (const part of normalizeArrowText(pairsStr).split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
    if (!part.includes('->')) continue;
    const [uRaw, vRaw] = part.split('->').map((s) => s.trim());
    const u = domMap.get(uRaw);
    const v = codMap.get(vRaw);
    if (u && v) {
      arrows.push({
        from: { x: u.x + 14, y: u.y },
        to: { x: v.x - 14, y: v.y },
      });
    }
  }

  return {
    origin,
    leftCx,
    rightCx,
    ovalW,
    ovalH,
    domainLabel,
    codomainLabel,
    fnLabel,
    domNodes,
    codNodes,
    arrows,
    width: sepX + ovalW + 40,
    height: ovalH + 45,
  };
}

export function renderBipartiteMappingItem(rc, ctx, mp, font, baseSize, stroke, seed = 1601) {
  const { leftCx, rightCx, origin, ovalW, ovalH, domainLabel, codomainLabel, fnLabel, domNodes, codNodes, arrows } = mp;
  let sSeed = seed;

  rEllipse(rc, ctx, leftCx, origin.y, ovalW, ovalH, { seed: sSeed++, stroke, strokeWidth: 1.65 });
  rEllipse(rc, ctx, rightCx, origin.y, ovalW, ovalH, { seed: sSeed++, stroke, strokeWidth: 1.65 });

  drawDiagramText(ctx, domainLabel, leftCx, origin.y - ovalH * 0.5 - 14, {
    font,
    size: baseSize,
    color: stroke,
    align: 'center',
    baseline: 'bottom',
    seed: sSeed++,
  });
  drawDiagramText(ctx, codomainLabel, rightCx, origin.y - ovalH * 0.5 - 14, {
    font,
    size: baseSize,
    color: stroke,
    align: 'center',
    baseline: 'bottom',
    seed: sSeed++,
  });

  if (fnLabel) {
    const topY = origin.y - ovalH * 0.5 - 6;
    drawDiagramText(ctx, fnLabel, origin.x, topY - 8, {
      font,
      size: baseSize,
      color: stroke,
      align: 'center',
      baseline: 'bottom',
      seed: sSeed++,
    });
  }

  for (const d of domNodes) {
    rCircle(rc, ctx, d.x + 10, d.y, 2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });
    drawDiagramText(ctx, d.val, d.x - 4, d.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'right',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  for (const c of codNodes) {
    rCircle(rc, ctx, c.x - 10, c.y, 2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });
    drawDiagramText(ctx, c.val, c.x + 4, c.y, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'left',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  for (const ar of arrows) {
    rLine(rc, ctx, ar.from.x, ar.from.y, ar.to.x, ar.to.y, { seed: sSeed++, stroke, strokeWidth: 1.4 });
    drawArrowEndpoint(rc, ctx, ar.to, Vec2.norm(Vec2.sub(ar.to, ar.from)), {
      size: 7.5,
      stroke,
      seed: sSeed++,
    });
  }
}

// ============================================================================
// 3. BOTTOM-UP HASSE POSET LATTICE SOLVER
// ============================================================================
export function layoutHasseDiagram({
  edgesSpec = '1->2, 1->3, 2->6, 3->6',
  origin = { x: 0, y: 0 },
  rankGap = 62,
  nodeGap = 72,
} = {}) {
  const dag = layoutLayeredDAG({
    edgesSpec,
    origin: { x: 0, y: 0 },
    rankGap,
    nodeGap,
    direction: 'TB',
  });
  // Invert Y so minimal elements (rank 0) sit at the BOTTOM and maximal elements sit at the TOP
  const nodes = dag.nodes.map((n) => ({
    ...n,
    x: origin.x + n.x,
    y: origin.y - n.y,
  }));
  return {
    nodes,
    edges: dag.edges,
  };
}
