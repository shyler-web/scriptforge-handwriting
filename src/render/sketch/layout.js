// src/render/sketch/layout.js
// Mathematical Layout & Constraint Solvers for ScriptForge Universal Sketch Engine

import { Vec2, EPS } from './vecmath.js';

export function normalizeArrowText(str) {
  return String(str || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2194\u27F7\u21D4]/g, ' <-> ')
    .replace(/[\u21A6]/g, ' |-> ')
    .replace(/[\u2192\u27F6\u21D2\u2794\u279C\u279E]/g, ' -> ')
    .replace(/[\u2014\u2013]/g, '--');
}

const RELATIVE_DIRS = {
  right: { dx: 1, dy: 0 },
  left: { dx: -1, dy: 0 },
  below: { dx: 0, dy: 1 },
  down: { dx: 0, dy: 1 },
  above: { dx: 0, dy: -1 },
  up: { dx: 0, dy: -1 },
  'above right': { dx: 0.7071, dy: -0.7071 },
  'above-right': { dx: 0.7071, dy: -0.7071 },
  ne: { dx: 0.7071, dy: -0.7071 },
  'above left': { dx: -0.7071, dy: -0.7071 },
  'above-left': { dx: -0.7071, dy: -0.7071 },
  nw: { dx: -0.7071, dy: -0.7071 },
  'below right': { dx: 0.7071, dy: 0.7071 },
  'below-right': { dx: 0.7071, dy: 0.7071 },
  se: { dx: 0.7071, dy: 0.7071 },
  'below left': { dx: -0.7071, dy: 0.7071 },
  'below-left': { dx: -0.7071, dy: 0.7071 },
  sw: { dx: -0.7071, dy: 0.7071 },
};

export function resolveRelativePosition(attrs, nodeW, nodeH, ctxState) {
  if (attrs.between) {
    const parts = String(attrs.between)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const n1 = ctxState.nodes.get(parts[0]) || ctxState.points.get(parts[0]);
      const n2 = ctxState.nodes.get(parts[1]) || ctxState.points.get(parts[1]);
      if (n1 && n2) return Vec2.mid(n1, n2);
    }
  }

  for (const [dirKey, vec] of Object.entries(RELATIVE_DIRS)) {
    const rawTarget = attrs[dirKey];
    if (!rawTarget) continue;
    const targetId = String(rawTarget).replace(/^of\s+/i, '').trim();
    const refNode = ctxState.nodes.get(targetId);
    const refPt = refNode || ctxState.points.get(targetId);
    if (!refPt) continue;

    const gap = Number(attrs.gap ?? 54);
    const refW = refNode?.w ?? 12;
    const refH = refNode?.h ?? 12;
    const stepX = (refW * 0.5 + nodeW * 0.5 + gap) * vec.dx;
    const stepY = (refH * 0.5 + nodeH * 0.5 + gap) * vec.dy;
    const pos = {
      x: refPt.x + stepX + Number(attrs.dx || 0),
      y: refPt.y + stepY + Number(attrs.dy || 0),
    };

    if (attrs.alignX) {
      const ax = ctxState.nodes.get(attrs.alignX) || ctxState.points.get(attrs.alignX);
      if (ax) pos.x = ax.x;
    }
    if (attrs.alignY) {
      const ay = ctxState.nodes.get(attrs.alignY) || ctxState.points.get(attrs.alignY);
      if (ay) pos.y = ay.y;
    }
    return pos;
  }

  return null;
}

export function parseEdgeListSpec(edgeStr, defaultDirected = true) {
  const normalized = normalizeArrowText(edgeStr);
  const rawParts = normalized
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nodesOrder = [];
  const nodeLabels = new Map();
  const edges = [];
  let nullCounter = 0;

  const ensureNode = (rawToken) => {
    const tok = String(rawToken || '').trim();
    if (!tok) return null;
    if (tok === '_' || tok.toLowerCase() === 'null' || tok.toLowerCase() === 'nil') {
      const ghostId = `__null_${++nullCounter}`;
      nodesOrder.push(ghostId);
      nodeLabels.set(ghostId, '');
      return { id: ghostId, isNull: true };
    }
    const bracketMatch = tok.match(/^([a-zA-Z0-9_.$+-]+)\[(.+)\]$/);
    const id = bracketMatch ? bracketMatch[1].trim() : tok;
    const lbl = bracketMatch ? bracketMatch[2].trim() : id;
    if (!nodeLabels.has(id)) {
      nodesOrder.push(id);
      nodeLabels.set(id, lbl);
    } else if (bracketMatch) {
      nodeLabels.set(id, lbl);
    }
    return { id, isNull: false };
  };

  for (const part of rawParts) {
    let mainPart = part;
    let edgeLabel = '';
    const colonIdx = part.lastIndexOf(':');
    if (colonIdx !== -1 && !part.slice(colonIdx).includes(']')) {
      const arrowBefore = part.slice(0, colonIdx);
      if (/->|<->|--/.test(arrowBefore)) {
        mainPart = arrowBefore.trim();
        edgeLabel = part.slice(colonIdx + 1).trim();
      }
    }

    let op = defaultDirected ? '->' : '--';
    let tokens = [];
    if (mainPart.includes('<->')) {
      op = '<->';
      tokens = mainPart.split('<->');
    } else if (mainPart.includes('->')) {
      op = '->';
      tokens = mainPart.split('->');
    } else if (mainPart.includes('--')) {
      op = '--';
      tokens = mainPart.split('--');
    } else {
      ensureNode(mainPart);
      continue;
    }

    for (let i = 0; i < tokens.length - 1; i++) {
      const u = ensureNode(tokens[i]);
      const v = ensureNode(tokens[i + 1]);
      if (u && v) {
        edges.push({
          from: u.id,
          to: v.id,
          directed: op !== '--',
          arrow: op === '--' ? 'none' : op,
          label: i === tokens.length - 2 ? edgeLabel : '',
          toIsNull: v.isNull,
        });
      }
    }
  }

  return { nodesOrder, nodeLabels, edges };
}

export function layoutTree({
  edgesSpec = '',
  rootId = null,
  origin = { x: 0, y: 0 },
  levelGap = 68,
  siblingGap = 48,
  nodeSize = 36,
  direction = 'TB',
} = {}) {
  const { nodesOrder, nodeLabels, edges } = parseEdgeListSpec(edgesSpec, true);
  if (nodesOrder.length === 0) {
    return { nodes: [], edges: [], levels: new Map(), bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  const childrenMap = new Map();
  const inDegree = new Map();
  const isGhost = new Set();

  for (const id of nodesOrder) {
    childrenMap.set(id, []);
    inDegree.set(id, 0);
  }
  for (const e of edges) {
    if (e.toIsNull) isGhost.add(e.to);
    childrenMap.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  let root = rootId && childrenMap.has(rootId) ? rootId : null;
  if (!root) {
    root = nodesOrder.find((id) => (inDegree.get(id) || 0) === 0 && !isGhost.has(id)) || nodesOrder[0];
  }

  const subtreeSpan = new Map();
  const depthMap = new Map();
  const visited = new Set();

  function measureSubtree(u, depth = 0) {
    if (visited.has(u)) return nodeSize;
    visited.add(u);
    depthMap.set(u, depth);
    const kids = childrenMap.get(u) || [];
    if (kids.length === 0) {
      const w = isGhost.has(u) ? siblingGap * 0.65 : Math.max(nodeSize, siblingGap);
      subtreeSpan.set(u, w);
      return w;
    }
    let total = 0;
    kids.forEach((v, idx) => {
      total += measureSubtree(v, depth + 1);
      if (idx > 0) total += siblingGap * 0.45;
    });
    const span = Math.max(nodeSize, total);
    subtreeSpan.set(u, span);
    return span;
  }

  measureSubtree(root, 0);

  const coords = new Map();
  const visitedAssign = new Set();

  function assignCoords(u, centerBreadth, depth) {
    if (visitedAssign.has(u)) return;
    visitedAssign.add(u);

    if (direction === 'LR') {
      coords.set(u, { x: origin.x + depth * levelGap, y: origin.y + centerBreadth, depth });
    } else {
      coords.set(u, { x: origin.x + centerBreadth, y: origin.y + depth * levelGap, depth });
    }

    const kids = childrenMap.get(u) || [];
    if (kids.length === 0) return;

    const totalSpan = kids.reduce(
      (acc, k, idx) => acc + (subtreeSpan.get(k) || nodeSize) + (idx > 0 ? siblingGap * 0.45 : 0),
      0
    );
    let cursor = centerBreadth - totalSpan * 0.5;
    for (const k of kids) {
      const kSpan = subtreeSpan.get(k) || nodeSize;
      assignCoords(k, cursor + kSpan * 0.5, depth + 1);
      cursor += kSpan + siblingGap * 0.45;
    }
  }

  assignCoords(root, 0, 0);

  const visibleNodes = [];
  const levelMaxX = new Map();
  for (const id of nodesOrder) {
    if (isGhost.has(id) || !coords.has(id)) continue;
    const c = coords.get(id);
    visibleNodes.push({
      id,
      label: nodeLabels.get(id) ?? id,
      x: c.x,
      y: c.y,
      depth: c.depth,
    });
    const prevMax = levelMaxX.get(c.depth) ?? -Infinity;
    if (c.x > prevMax) levelMaxX.set(c.depth, c.x);
  }

  const visibleEdges = edges.filter((e) => !e.toIsNull && coords.has(e.from) && coords.has(e.to));

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    levelMaxX,
    depthMap,
  };
}

export function layoutLayeredDAG({
  edgesSpec = '',
  origin = { x: 0, y: 0 },
  rankGap = 92,
  nodeGap = 86,
  direction = 'TB',
} = {}) {
  const { nodesOrder, nodeLabels, edges } = parseEdgeListSpec(edgesSpec, true);
  const cleanNodes = nodesOrder.filter((id) => !id.startsWith('__null_'));
  if (cleanNodes.length === 0) return { nodes: [], edges: [] };

  const adj = new Map(cleanNodes.map((id) => [id, []]));
  const backEdges = new Set();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from).push({ to: e.to, idx: i });
    }
  }

  const state = new Map();
  function dfsCycle(u) {
    state.set(u, 1);
    for (const { to, idx } of adj.get(u) || []) {
      if (state.get(to) === 1) {
        backEdges.add(idx);
      } else if (!state.get(to)) {
        dfsCycle(to);
      }
    }
    state.set(u, 2);
  }
  for (const id of cleanNodes) {
    if (!state.get(id)) dfsCycle(id);
  }

  const rank = new Map(cleanNodes.map((id) => [id, 0]));
  for (let iter = 0; iter < cleanNodes.length; iter++) {
    let changed = false;
    edges.forEach((e, idx) => {
      if (backEdges.has(idx) || e.from === e.to) return;
      const rU = rank.get(e.from) ?? 0;
      const rV = rank.get(e.to) ?? 0;
      if (rU + 1 > rV) {
        rank.set(e.to, rU + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const maxRank = Math.max(0, ...rank.values());
  const layers = Array.from({ length: maxRank + 1 }, () => []);
  for (const id of cleanNodes) {
    layers[rank.get(id) || 0].push(id);
  }

  for (let sweep = 0; sweep < 4; sweep++) {
    for (let r = 1; r <= maxRank; r++) {
      const prevLayer = layers[r - 1];
      const posInPrev = new Map(prevLayer.map((id, i) => [id, i]));
      const bary = new Map();
      for (const u of layers[r]) {
        const parents = edges
          .filter((e, idx) => !backEdges.has(idx) && e.to === u && posInPrev.has(e.from))
          .map((e) => posInPrev.get(e.from));
        bary.set(
          u,
          parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : layers[r].indexOf(u)
        );
      }
      layers[r].sort((a, b) => bary.get(a) - bary.get(b));
    }
  }

  const positionedNodes = [];
  layers.forEach((layer, r) => {
    const totalBreadth = (layer.length - 1) * nodeGap;
    layer.forEach((id, idx) => {
      const breadth = -totalBreadth * 0.5 + idx * nodeGap;
      const depth = (r - maxRank * 0.5) * rankGap;
      const x = direction === 'LR' ? origin.x + depth : origin.x + breadth;
      const y = direction === 'LR' ? origin.y + breadth : origin.y + depth;
      positionedNodes.push({
        id,
        label: nodeLabels.get(id) ?? id,
        x,
        y,
        rank: r,
      });
    });
  });

  const annotatedEdges = edges
    .map((e, idx) => ({
      ...e,
      isBackEdge: backEdges.has(idx),
    }))
    .filter((e) => !e.toIsNull);

  return { nodes: positionedNodes, edges: annotatedEdges };
}

export function layoutGraphTopology({
  edgesSpec = '',
  layout = 'force',
  origin = { x: 0, y: 0 },
  radius = 95,
  directed = false,
} = {}) {
  const { nodesOrder, nodeLabels, edges } = parseEdgeListSpec(edgesSpec, directed);
  const cleanNodes = nodesOrder.filter((id) => !id.startsWith('__null_'));
  const N = cleanNodes.length;
  if (N === 0) return { nodes: [], edges: [] };

  const pos = new Map();
  cleanNodes.forEach((id, i) => {
    const ang = -Math.PI * 0.5 + (i * Math.PI * 2) / N;
    pos.set(id, {
      x: origin.x + Math.cos(ang) * radius,
      y: origin.y + Math.sin(ang) * radius,
    });
  });

  if (layout === 'bipartite') {
    const side = new Map();
    for (const startId of cleanNodes) {
      if (side.has(startId)) continue;
      side.set(startId, 0);
      const q = [startId];
      while (q.length) {
        const u = q.shift();
        const sU = side.get(u);
        for (const e of edges) {
          if (e.from === u && !side.has(e.to)) {
            side.set(e.to, 1 - sU);
            q.push(e.to);
          } else if (e.to === u && !side.has(e.from)) {
            side.set(e.from, 1 - sU);
            q.push(e.from);
          }
        }
      }
    }
    const leftSet = cleanNodes.filter((id) => (side.get(id) || 0) === 0);
    const rightSet = cleanNodes.filter((id) => side.get(id) === 1);
    const gapY = 58;
    const spanX = Math.max(130, radius * 1.5);
    leftSet.forEach((id, idx) => {
      pos.set(id, {
        x: origin.x - spanX * 0.5,
        y: origin.y + (idx - (leftSet.length - 1) * 0.5) * gapY,
      });
    });
    rightSet.forEach((id, idx) => {
      pos.set(id, {
        x: origin.x + spanX * 0.5,
        y: origin.y + (idx - (rightSet.length - 1) * 0.5) * gapY,
      });
    });
  } else if (layout === 'force' && N > 2) {
    const k = Math.max(55, radius * Math.sqrt(2 / N));
    let temp = radius * 0.45;
    for (let iter = 0; iter < 60; iter++) {
      const disp = new Map(cleanNodes.map((id) => [id, { x: 0, y: 0 }]));
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const u = cleanNodes[i];
          const v = cleanNodes[j];
          const delta = Vec2.sub(pos.get(u), pos.get(v));
          const dist = Math.max(8, Vec2.len(delta));
          const rep = (k * k) / dist;
          const dir = Vec2.scale(delta, rep / dist);
          disp.set(u, Vec2.add(disp.get(u), dir));
          disp.set(v, Vec2.sub(disp.get(v), dir));
        }
      }
      for (const e of edges) {
        if (!pos.has(e.from) || !pos.has(e.to) || e.from === e.to) continue;
        const delta = Vec2.sub(pos.get(e.from), pos.get(e.to));
        const dist = Math.max(8, Vec2.len(delta));
        const attr = (dist * dist) / k;
        const dir = Vec2.scale(delta, attr / dist);
        disp.set(e.from, Vec2.sub(disp.get(e.from), dir));
        disp.set(e.to, Vec2.add(disp.get(e.to), dir));
      }
      for (const id of cleanNodes) {
        const d = disp.get(id);
        const len = Math.max(EPS, Vec2.len(d));
        const step = Math.min(len, temp);
        const cur = pos.get(id);
        pos.set(id, {
          x: cur.x + (d.x / len) * step,
          y: cur.y + (d.y / len) * step,
        });
      }
      temp *= 0.92;
    }
    let cx = 0;
    let cy = 0;
    for (const p of pos.values()) {
      cx += p.x;
      cy += p.y;
    }
    cx /= N;
    cy /= N;
    for (const [id, p] of pos.entries()) {
      pos.set(id, { x: p.x - cx + origin.x, y: p.y - cy + origin.y });
    }
  }

  return {
    nodes: cleanNodes.map((id) => ({
      id,
      label: nodeLabels.get(id) ?? id,
      x: pos.get(id).x,
      y: pos.get(id).y,
    })),
    edges: edges.filter((e) => !e.toIsNull),
  };
}

export function computeClusterBox(nodeIds, nodesMap, pad = 20) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of nodeIds) {
    const n = nodesMap.get(id);
    if (!n) continue;
    const hw = (n.w || 60) * 0.5;
    const hh = (n.h || 38) * 0.5;
    if (n.x - hw < minX) minX = n.x - hw;
    if (n.x + hw > maxX) maxX = n.x + hw;
    if (n.y - hh < minY) minY = n.y - hh;
    if (n.y + hh > maxY) maxY = n.y + hh;
  }

  if (!Number.isFinite(minX)) return null;
  return {
    x: minX - pad,
    y: minY - pad - 12,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2 + 12,
  };
}
