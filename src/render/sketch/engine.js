// src/render/sketch/engine.js
// Universal Declarative Mathematical Sketch Compiler ("[sketch]") for ScriptForge
// Master Unified Engine: Drops #1, #2, #3, #4, #5, and #6.

import {
  Vec2,
  compileMathExpr,
  solveSmoothSpline,
  polylinePointAndTangentAt,
  getShapePolygon,
  computeShapeBoundaryPoint,
  resolveNodeAnchor,
  Projector3D,
} from './vecmath.js';
import {
  drawPointChain,
  buildSpringPoints,
  buildWavePoints,
  buildCurlyBrace,
  drawArrowEndpoint,
  drawMechanicalSupport,
  drawAngleMarker,
  drawDimensionCallout,
  drawHatchedPolygon,
} from './strokes.js';
import {
  normalizeArrowText,
  resolveRelativePosition,
  layoutTree,
  layoutLayeredDAG,
  layoutGraphTopology,
  computeClusterBox,
} from './layout.js';
import {
  isDirectLineBlocked,
  routeOrthogonal,
  routeCurvedAroundObstacles,
  buildSelfLoop,
  assignParallelEdgeBends,
} from './router.js';
import {
  solveInclinedPlane,
  solvePulleySystem,
  solveOpticsRayTrace,
  solveElectrostaticField,
  solveVectorFieldGrid,
} from './physics.js';
import {
  parseWaveformSpec,
  renderWaveformItem,
  solveLinkedList,
  renderLinkedListItem,
  solveMemoryFrame,
  renderMemoryFrameItem,
  solveBTree,
  renderBTreeItem,
  parsePipelineSpec,
  renderPipelineItem,
  renderGanttItem,
  renderPacketHeaderItem,
} from './systems.js';
import {
  drawWedgeBond,
  drawDashBond,
  solveSkeletalChain,
  renderSkeletalChainItem,
  solveChairConformation,
  renderChairItem,
  solveNewmanProjection,
  renderNewmanItem,
} from './chemistry.js';
import {
  solveVennDiagram,
  renderVennItem,
  solveBipartiteMapping,
  renderBipartiteMappingItem,
  layoutHasseDiagram,
} from './discrete.js';
import {
  solveSurface3D,
  renderSurface3DItem,
  solveRiemannSum,
  renderRiemannItem,
  solveMatrixGrid,
  renderMatrixGridItem,
  solveSlopeField,
  renderSlopeFieldItem,
} from './calculus3d.js';
import {
  rLine,
  rCircle,
  rEllipse,
  rRect,
  drawDiagramText,
  measureDiagramText,
} from '../diagrams/primitives.js';

function splitStatements(body) {
  const normalizedBody = normalizeArrowText(body);
  const rawLines = normalizedBody.split(/\r?\n/);
  const stmts = [];
  for (const rawLine of rawLines) {
    let line = '';
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i++) {
      if (rawLine[i] === '"' && rawLine[i - 1] !== '\\') inQuotes = !inQuotes;
      if (!inQuotes && rawLine[i] === '/' && rawLine[i + 1] === '/') break;
      line += rawLine[i];
    }
    line = line.trim();
    if (!line) continue;

    let cur = '';
    let depth = 0;
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== '\\') q = !q;
      if (!q) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
        else if (ch === ';' && depth === 0) {
          if (cur.trim()) stmts.push(cur.trim());
          cur = '';
          continue;
        }
      }
      cur += ch;
    }
    if (cur.trim()) stmts.push(cur.trim());
  }
  return stmts;
}

function parseAttributes(str) {
  const attrs = {};
  const positional = [];
  let i = 0;
  const s = String(str || '').trim();

  const readToken = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) return null;
    if (s[i] === '"') {
      i++;
      let val = '';
      while (i < s.length && !(s[i] === '"' && s[i - 1] !== '\\')) val += s[i++];
      i++;
      return { quoted: true, value: val.replace(/\\"/g, '"') };
    }
    if (s[i] === '(' || s[i] === '[') {
      const open = s[i];
      const close = open === '(' ? ')' : ']';
      let depth = 0;
      let val = '';
      while (i < s.length) {
        if (s[i] === open) depth++;
        else if (s[i] === close) {
          depth--;
          if (depth === 0) {
            val += s[i++];
            break;
          }
        }
        val += s[i++];
      }
      return { group: true, value: val };
    }
    let val = '';
    while (i < s.length && !/\s/.test(s[i])) {
      if (s[i] === '=' && val.length > 0) break;
      val += s[i++];
    }
    return { value: val };
  };

  while (i < s.length) {
    const tok = readToken();
    if (!tok) break;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (!tok.quoted && !tok.group && s[i] === '=') {
      i++;
      const valTok = readToken();
      if (valTok) attrs[tok.value] = valTok.value;
    } else {
      positional.push(tok);
    }
  }
  return { attrs, positional };
}

function parseTuple(tupleStr, vars = {}) {
  const clean = String(tupleStr || '')
    .trim()
    .replace(/^[\(\[]/, '')
    .replace(/[\)\]]$/, '');
  if (!clean) return [0, 0];
  const parts = [];
  let cur = '';
  let depth = 0;
  for (const ch of clean) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.map((p) => compileMathExpr(p)(vars));
}

function resolvePointExpr(expr, ctxState) {
  const s = String(expr || '').trim();
  if (!s) return { x: 0, y: 0 };

  let depth = 0;
  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i];
    if (ch === ')' || ch === ']') depth++;
    else if (ch === '(' || ch === '[') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === '+' || ch === '-')) {
      const prev = s.slice(0, i).trim();
      const rhs = s.slice(i + 1).trim();
      if (prev && rhs && !/[eE^*/,(]$/.test(prev)) {
        const pA = resolvePointExpr(prev, ctxState);
        const pB = resolvePointExpr(rhs, ctxState);
        return ch === '+' ? Vec2.add(pA, pB) : Vec2.sub(pA, pB);
      }
    }
  }

  const polarMatch = s.match(/^polar\s*\((.+)\)$/i);
  if (polarMatch) {
    const [r = 0, deg = 0] = parseTuple(polarMatch[1], ctxState.vars);
    return Vec2.polar(r, deg, true);
  }

  const midMatch = s.match(/^(?:mid|midpoint|lerp)\s*\((.+)\)$/i);
  if (midMatch) {
    const args = midMatch[1].split(',').map((x) => x.trim());
    const p1 = resolvePointExpr(args[0], ctxState);
    const p2 = resolvePointExpr(args[1], ctxState);
    const t = args[2] !== undefined ? compileMathExpr(args[2])(ctxState.vars) : 0.5;
    return Vec2.lerp(p1, p2, t);
  }

  const projMatch = s.match(/^p3d\s*\((.+)\)$/i);
  if (projMatch) {
    const [x = 0, y = 0, z = 0] = parseTuple(projMatch[1], ctxState.vars);
    return ctxState.projector3d.project(x, y, z);
  }

  if (s.startsWith('(') && s.endsWith(')')) {
    const vals = parseTuple(s, ctxState.vars);
    if (vals.length === 3) return ctxState.projector3d.project(vals[0], vals[1], vals[2]);
    return { x: vals[0] ?? 0, y: vals[1] ?? 0 };
  }

  if (ctxState.points.has(s)) return { ...ctxState.points.get(s) };

  if (s.includes('.')) {
    const [nodeId, anchor] = s.split('.');
    const node = ctxState.nodes.get(nodeId.trim());
    if (node) return resolveNodeAnchor(node, anchor.trim());
  }

  if (ctxState.nodes.has(s)) {
    const n = ctxState.nodes.get(s);
    return { x: n.x, y: n.y };
  }
  return { x: 0, y: 0 };
}

export function compileSketchScene(spec, font, baseSize = 15) {
  const ctxState = {
    vars: { pi: Math.PI, e: Math.E },
    points: new Map(),
    nodes: new Map(),
    items: [],
    deferredMemLinks: [],
    axesConfig: null,
    projector3d: new Projector3D({ azimuth: 35, elevation: 25, scale: 1 }),
    title: '',
  };

  const registerNodeObj = (nodeObj) => {
    ctxState.nodes.set(nodeObj.id, nodeObj);
    ctxState.points.set(nodeObj.id, { x: nodeObj.x, y: nodeObj.y });
    ctxState.items.push({ type: 'node', node: nodeObj });
  };

  const stmts = splitStatements(spec);

  for (const stmt of stmts) {
    const { attrs, positional } = parseAttributes(stmt);
    if (positional.length === 0 && Object.keys(attrs).length === 0) continue;
    const cmd = (positional[0]?.value || '').toLowerCase();

    if (cmd === 'let' || cmd === 'var' || cmd === 'const') {
      const m = stmt.match(/^(?:let|var|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/i);
      if (m) ctxState.vars[m[1]] = compileMathExpr(m[2])(ctxState.vars);
      continue;
    }

    if (cmd === 'title' || attrs.title) {
      ctxState.title = attrs.title || positional[1]?.value || '';
      if (cmd === 'title') continue;
    }

    if (cmd === 'camera3d' || cmd === 'view3d') {
      ctxState.projector3d = new Projector3D({
        azimuth: Number(attrs.azimuth ?? attrs.az ?? 35),
        elevation: Number(attrs.elevation ?? attrs.el ?? 25),
        scale: Number(attrs.scale ?? 1),
      });
      continue;
    }

    if (cmd === 'point' || cmd === 'pt') {
      const id = positional[1]?.value || `pt_${ctxState.points.size}`;
      let expr = attrs.at || '';
      const eqIdx = stmt.indexOf('=');
      if (!expr && eqIdx !== -1 && stmt.slice(0, eqIdx).trim().split(/\s+/).length === 2) {
        expr = positional.slice(2).map((t) => t.value).join(' ') || '(0,0)';
      }
      if (!expr) expr = positional.find((t) => t.group)?.value || '(0,0)';
      const pt = resolvePointExpr(expr, ctxState);
      ctxState.points.set(id, pt);
      ctxState.nodes.set(id, { id, x: pt.x, y: pt.y, w: 6, h: 6, shape: 'point' });

      if (attrs.dot !== 'false' && (attrs.label || attrs.show === 'true' || attrs.dot === 'true')) {
        ctxState.items.push({
          type: 'point',
          pt,
          r: Number(attrs.r ?? (attrs.dot === 'true' ? 3 : 2.5)),
          showDot: attrs.dot !== 'false',
          label: attrs.label ?? '',
          pos: attrs.pos || 'ne',
          color: attrs.color || null,
        });
      }
      continue;
    }

    if (cmd === 'row' || cmd === 'col' || cmd === 'ring') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const gap = Number(attrs.gap ?? (cmd === 'ring' ? 95 : 115));
      const shape = attrs.shape || 'box';
      const names = (attrs.nodes || attrs.items || positional.slice(1).map((p) => p.value).join(','))
        .replace(/^[\[\(]/, '')
        .replace(/[\]\)]$/, '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      names.forEach((entry, idx) => {
        const [rawId, rawLbl] = entry.includes(':') ? entry.split(':') : [entry, entry];
        const id = rawId.trim();
        const label = (rawLbl || id).trim();
        const m = measureDiagramText(label, font, baseSize);
        const w = Math.max(Number(attrs.w || 68), m.width + 24);
        const h = Math.max(Number(attrs.h || 40), m.height + 18);
        let pos = { x: origin.x, y: origin.y };
        if (cmd === 'row') pos = { x: origin.x + idx * gap, y: origin.y };
        else if (cmd === 'col') pos = { x: origin.x, y: origin.y + idx * gap };
        else if (cmd === 'ring') {
          const deg = 90 - (idx * 360) / Math.max(1, names.length);
          pos = Vec2.add(origin, Vec2.polar(gap, deg, true));
        }
        registerNodeObj({
          id,
          x: pos.x,
          y: pos.y,
          w,
          h,
          shape,
          label,
          fill: attrs.fill || 'none',
          color: attrs.color || null,
          dashed: attrs.dashed === 'true',
        });
      });
      continue;
    }

    if (cmd === 'tree' || cmd === 'bst') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const shape = (attrs.shape || 'circle').toLowerCase();
      const edgesSpec = attrs.edges || positional.slice(1).map((p) => p.value).join(' ');
      const res = layoutTree({
        edgesSpec,
        rootId: attrs.root || null,
        origin,
        levelGap: Number(attrs.levelGap ?? 66),
        siblingGap: Number(attrs.siblingGap ?? 46),
        nodeSize: Number(attrs.r ? attrs.r * 2 : 34),
        direction: (attrs.dir || 'TB').toUpperCase(),
      });
      for (const tn of res.nodes) {
        const m = measureDiagramText(tn.label, font, baseSize);
        const d = Math.max(32, Math.max(m.width, m.height) + 14);
        registerNodeObj({
          id: tn.id,
          x: tn.x,
          y: tn.y,
          w: shape === 'box' ? Math.max(52, m.width + 20) : d,
          h: shape === 'box' ? Math.max(32, m.height + 12) : d,
          shape,
          label: tn.label,
          fill: attrs.fill || 'none',
          color: attrs.color || null,
        });
      }
      for (const te of res.edges) {
        const n1 = ctxState.nodes.get(te.from);
        const n2 = ctxState.nodes.get(te.to);
        if (!n1 || !n2) continue;
        ctxState.items.push({
          type: 'connector',
          subtype: 'arrow',
          fromId: te.from,
          toId: te.to,
          p1: computeShapeBoundaryPoint(n1, n2),
          p2: computeShapeBoundaryPoint(n2, n1),
          arrow: attrs.directed === 'false' ? 'none' : te.arrow,
          bend: 0,
          label: te.label || '',
          labelSide: 'above',
        });
      }
      if (attrs.costs) {
        const maxRight = Math.max(...res.nodes.map((n) => n.x), origin.x) + 42;
        for (const cp of String(attrs.costs).split(',').map((s) => s.trim()).filter(Boolean)) {
          const [lvlStr, costLbl] = cp.includes(':') ? cp.split(':') : ['0', cp];
          const yLvl = origin.y + Number(lvlStr) * Number(attrs.levelGap ?? 66);
          ctxState.items.push(
            {
              type: 'connector',
              subtype: 'arrow',
              p1: { x: maxRight - 14, y: yLvl },
              p2: { x: maxRight + 14, y: yLvl },
              arrow: '->',
              bend: 0,
              dashed: true,
            },
            { type: 'label', pt: { x: maxRight + 22, y: yLvl }, text: costLbl.trim(), align: 'left' }
          );
        }
      }
      continue;
    }

    if (cmd === 'dag' || cmd === 'flowchart') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const shape = (attrs.shape || 'box').toLowerCase();
      const edgesSpec = attrs.edges || positional.slice(1).map((p) => p.value).join(' ');
      const res = layoutLayeredDAG({
        edgesSpec,
        origin,
        rankGap: Number(attrs.rankGap ?? 102),
        nodeGap: Number(attrs.nodeGap ?? 84),
        direction: (attrs.dir || 'TB').toUpperCase(),
      });
      for (const dn of res.nodes) {
        const m = measureDiagramText(dn.label, font, baseSize);
        const nodeShape = dn.label.endsWith('?') ? 'diamond' : shape;
        registerNodeObj({
          id: dn.id,
          x: dn.x,
          y: dn.y,
          w: Math.max(nodeShape === 'diamond' ? 80 : 64, m.width + 22),
          h: Math.max(nodeShape === 'diamond' ? 50 : 36, m.height + 16),
          shape: nodeShape,
          label: dn.label,
          fill: attrs.fill || 'none',
          color: attrs.color || null,
        });
      }
      for (const de of res.edges) {
        const n1 = ctxState.nodes.get(de.from);
        const n2 = ctxState.nodes.get(de.to);
        if (!n1 || !n2) continue;
        const bend = de.isBackEdge ? 44 : 0;
        ctxState.items.push({
          type: 'connector',
          subtype: 'arrow',
          fromId: de.from,
          toId: de.to,
          p1: computeShapeBoundaryPoint(n1, n2),
          p2: computeShapeBoundaryPoint(n2, n1),
          arrow: de.arrow,
          bend,
          bendExplicit: de.isBackEdge,
          route: attrs.route || 'direct',
          label: de.label || '',
          labelSide: 'above',
        });
      }
      continue;
    }

    if (cmd === 'hasse' || cmd === 'poset' || cmd === 'lattice') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const shape = (attrs.shape || 'circle').toLowerCase();
      const edgesSpec = attrs.edges || positional.slice(1).map((p) => p.value).join(' ');
      const res = layoutHasseDiagram({
        edgesSpec,
        origin,
        rankGap: Number(attrs.rankGap ?? 62),
        nodeGap: Number(attrs.nodeGap ?? 72),
      });
      for (const hn of res.nodes) {
        const m = measureDiagramText(hn.label, font, baseSize);
        const d = Math.max(28, Math.max(m.width, m.height) + 12);
        registerNodeObj({
          id: hn.id,
          x: hn.x,
          y: hn.y,
          w: d,
          h: d,
          shape,
          label: hn.label,
          fill: attrs.fill || 'none',
          color: attrs.color || null,
        });
      }
      for (const he of res.edges) {
        const n1 = ctxState.nodes.get(he.from);
        const n2 = ctxState.nodes.get(he.to);
        if (!n1 || !n2) continue;
        ctxState.items.push({
          type: 'connector',
          subtype: 'line',
          fromId: he.from,
          toId: he.to,
          p1: computeShapeBoundaryPoint(n1, n2),
          p2: computeShapeBoundaryPoint(n2, n1),
          arrow: attrs.directed === 'true' ? '->' : 'none',
          bend: 0,
          label: he.label || '',
          labelSide: 'above',
        });
      }
      continue;
    }

    if (cmd === 'graph' || cmd === 'network') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const shape = (attrs.shape || 'circle').toLowerCase();
      const edgesSpec = attrs.edges || positional.slice(1).map((p) => p.value).join(' ');
      const res = layoutGraphTopology({
        edgesSpec,
        layout: (attrs.layout || 'force').toLowerCase(),
        origin,
        radius: Number(attrs.r ?? attrs.radius ?? 90),
        directed: attrs.directed === 'true',
      });
      for (const gn of res.nodes) {
        const m = measureDiagramText(gn.label, font, baseSize);
        const d = Math.max(34, Math.max(m.width, m.height) + 14);
        registerNodeObj({
          id: gn.id,
          x: gn.x,
          y: gn.y,
          w: d,
          h: d,
          shape,
          label: gn.label,
          fill: attrs.fill || 'none',
          color: attrs.color || null,
        });
      }
      for (const ge of res.edges) {
        const n1 = ctxState.nodes.get(ge.from);
        const n2 = ctxState.nodes.get(ge.to);
        if (!n1 || !n2) continue;
        ctxState.items.push({
          type: 'connector',
          subtype: 'arrow',
          fromId: ge.from,
          toId: ge.to,
          p1: computeShapeBoundaryPoint(n1, n2),
          p2: computeShapeBoundaryPoint(n2, n1),
          arrow: ge.directed ? ge.arrow : 'none',
          bend: 0,
          label: ge.label || '',
          labelSide: 'above',
        });
      }
      continue;
    }

    if (cmd === 'cluster' || cmd === 'group' || cmd === 'subgraph') {
      const label = attrs.label || positional.find((t) => t.quoted)?.value || '';
      const ids = String(attrs.nodes || attrs.items || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const box = computeClusterBox(ids, ctxState.nodes, Number(attrs.pad ?? 20));
      if (box) {
        ctxState.items.unshift({
          type: 'cluster',
          box,
          label,
          dashed: attrs.dashed !== 'false',
          color: attrs.color || null,
        });
      }
      continue;
    }

    if (cmd === 'waveform' || cmd === 'timing') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const signalsStr = attrs.signals || attrs.waves || positional.slice(1).map((p) => p.value).join(' ');
      const { signals, maxCycles } = parseWaveformSpec(signalsStr);
      ctxState.items.push({
        type: 'waveform',
        origin,
        signals,
        maxCycles,
        stepW: Number(attrs.stepW ?? 34),
        rowH: Number(attrs.rowH ?? 26),
        rowGap: Number(attrs.rowGap ?? 18),
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'linkedlist' || cmd === 'llist') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const ll = solveLinkedList({
        origin,
        valuesStr: attrs.values || attrs.nodes || attrs.cells || '10, 20, 30',
        doubly: attrs.doubly === 'true',
        circular: attrs.circular === 'true',
        showNull: attrs.null !== 'false',
        headLabel: attrs.head ?? 'head',
        pointersStr: attrs.pointers || '',
      });
      ctxState.items.push({ type: 'linkedlist', ll, color: attrs.color || null });
      continue;
    }

    if (cmd === 'memframe' || cmd === 'struct' || cmd === 'activation') {
      const id = attrs.id || positional[1]?.value || `mem_${ctxState.nodes.size}`;
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const mf = solveMemoryFrame({
        id,
        origin,
        title: attrs.title ?? id,
        fieldsStr: attrs.fields || attrs.rows || 'x: 0, next: NULL',
        w: Number(attrs.w ?? 138),
      });
      ctxState.nodes.set(id, { id, x: origin.x, y: origin.y, w: mf.w, h: mf.totalH, shape: 'box' });
      for (const r of mf.rows) {
        ctxState.points.set(`${id}.${r.idx}`, r.leftAnchor);
        ctxState.points.set(`${id}.${r.key}`, r.leftAnchor);
        ctxState.points.set(`${id}.${r.idx}.out`, r.rightAnchor);
        ctxState.points.set(`${id}.${r.key}.out`, r.rightAnchor);
      }
      for (const pl of mf.pointerLinks) {
        ctxState.deferredMemLinks.push(pl);
      }
      ctxState.items.push({ type: 'memframe', mf, color: attrs.color || null });
      continue;
    }

    if (cmd === 'btree' || cmd === 'bplustree') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const bt = solveBTree({
        origin,
        edgesSpec: attrs.edges || attrs.keys || positional.slice(1).map((p) => p.value).join(' '),
      });
      ctxState.items.push({ type: 'btree', bt, color: attrs.color || null });
      continue;
    }

    if (cmd === 'pipeline') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const { rows, maxCols } = parsePipelineSpec(
        attrs.rows || attrs.instructions || positional.slice(1).map((p) => p.value).join(' ')
      );
      ctxState.items.push({
        type: 'pipeline',
        origin,
        rows,
        maxCols,
        cellW: Number(attrs.cellW ?? 38),
        cellH: Number(attrs.cellH ?? 26),
        rowGap: Number(attrs.rowGap ?? 8),
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'gantt') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const rawTasks = String(attrs.tasks || 'P1:0..4, P2:4..8')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const tasks = rawTasks.map((t) => {
        const [lbl, rangeStr = '0..1'] = t.split(':');
        const [s, e] = rangeStr.split('..').map(Number);
        return { label: lbl.trim(), start: s || 0, end: e || (s || 0) + 1 };
      });
      ctxState.items.push({
        type: 'gantt',
        origin,
        tasks,
        totalW: Number(attrs.w ?? 340),
        barH: Number(attrs.h ?? 36),
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'packet' || cmd === 'bitfield') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const bits = Number(attrs.bits ?? 32);
      const fields = String(attrs.fields || 'Src Port:16, Dst Port:16')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const [name, spanStr] = entry.includes(':') ? entry.split(':') : [entry, String(bits)];
          return { name: name.trim(), span: Math.max(1, Number(spanStr) || bits) };
        });
      ctxState.items.push({
        type: 'packet',
        origin,
        bits,
        fields,
        totalW: Number(attrs.w ?? 340),
        rowH: Number(attrs.rowH ?? 34),
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'chain' || cmd === 'alkane' || cmd === 'molecule') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const ch = solveSkeletalChain({
        origin,
        carbons: Number(attrs.carbons ?? attrs.c ?? 6),
        bondLen: Number(attrs.bondLen ?? 38),
        bondsStr: attrs.bonds || '',
        branchesStr: attrs.branches || attrs.subs || '',
      });
      const prefix = attrs.id || 'C';
      for (const v of ch.vertices) {
        ctxState.points.set(`${prefix}${v.idx}`, { x: v.x, y: v.y });
      }
      ctxState.items.push({ type: 'skeletalChain', chain: ch, color: attrs.color || null });
      continue;
    }

    if (cmd === 'chair' || cmd === 'cyclohexane') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const chair = solveChairConformation({
        origin,
        scale: Number(attrs.scale ?? 1),
        flip: attrs.flip === 'true',
        axialStr: attrs.axial || '',
        equatorialStr: attrs.equatorial || attrs.eq || '',
      });
      for (const c of chair.carbons) {
        ctxState.points.set(c.id, { x: c.x, y: c.y });
      }
      ctxState.items.push({ type: 'chair', chair, color: attrs.color || null });
      continue;
    }

    if (cmd === 'newman') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const nm = solveNewmanProjection({
        origin,
        radius: Number(attrs.r ?? 30),
        spokeLen: Number(attrs.spokeLen ?? 50),
        dihedralDeg: Number(attrs.angle ?? attrs.dihedral ?? 60),
        frontStr: attrs.front || 'CH3,H,H',
        backStr: attrs.back || 'Br,H,CH3',
      });
      ctxState.items.push({ type: 'newman', nm, color: attrs.color || null });
      continue;
    }

    if (cmd === 'venn') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const venn = solveVennDiagram({
        origin,
        setsStr: attrs.sets || 'A,B',
        shadeStr: attrs.shade || attrs.region || '',
        radius: Number(attrs.r ?? 50),
        universal: attrs.universal !== 'false',
      });
      ctxState.items.push({ type: 'venn', venn, color: attrs.color || null });
      continue;
    }

    if (cmd === 'mapping' || cmd === 'relation') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const mp = solveBipartiteMapping({
        origin,
        domainStr: attrs.domain || attrs.from || '1,2,3,4',
        codomainStr: attrs.codomain || attrs.to || 'a,b,c',
        pairsStr: attrs.pairs || attrs.edges || '1->a, 2->b, 3->b, 4->c',
        domainLabel: attrs.domainLabel || '$A$',
        codomainLabel: attrs.codomainLabel || '$B$',
        fnLabel: attrs.label || '$f: A \\to B$',
      });
      ctxState.items.push({ type: 'mapping', mp, color: attrs.color || null });
      continue;
    }

    // Drop #6: 3D Surfaces, Riemann Sums, Matrix Grids & ODE Slope Fields
    if (cmd === 'surface3d' || cmd === 'mesh3d' || cmd === 'plot3d') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const xr = attrs.xrange ? parseTuple(attrs.xrange, ctxState.vars) : [-2.5, 2.5];
      const yr = attrs.yrange ? parseTuple(attrs.yrange, ctxState.vars) : [-2.5, 2.5];
      const surf = solveSurface3D({
        origin,
        fnStr: attrs.fn || attrs.expr || positional[1]?.value || '0.35*(x^2 - y^2)',
        xMin: xr[0],
        xMax: xr[1],
        yMin: yr[0],
        yMax: yr[1],
        steps: Number(attrs.steps ?? 12),
        azimuth: Number(attrs.azimuth ?? attrs.az ?? 38),
        elevation: Number(attrs.elevation ?? attrs.el ?? 26),
      });
      ctxState.items.push({ type: 'surface3d', surf, color: attrs.color || null });
      continue;
    }

    if (cmd === 'riemann') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const dom = attrs.domain ? parseTuple(attrs.domain, ctxState.vars) : [0, 4];
      const rm = solveRiemannSum({
        origin,
        fnStr: attrs.fn || attrs.expr || positional[1]?.value || '0.18*x^2 + 0.6',
        a: dom[0],
        b: dom[1],
        n: Number(attrs.n ?? 6),
        method: (attrs.method || 'left').toLowerCase(),
      });
      ctxState.items.push({ type: 'riemann', rm, color: attrs.color || null });
      continue;
    }

    if (cmd === 'matrixgrid' || cmd === 'transform2d') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const mg = solveMatrixGrid({
        origin,
        matrixStr: attrs.matrix || attrs.mat || '1.3, 0.5, 0.3, 1.1',
        range: Number(attrs.range ?? 2),
        showDet: attrs.det !== 'false',
      });
      ctxState.items.push({ type: 'matrixgrid', mg, color: attrs.color || null });
      continue;
    }

    if (cmd === 'slopefield' || cmd === 'ode') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const sf = solveSlopeField({
        origin,
        dyStr: attrs.dy || attrs.fn || 'x - y',
        solutionsStr: attrs.solutions || attrs.ivp || '',
      });
      ctxState.items.push({ type: 'slopefield', sf, color: attrs.color || null });
      continue;
    }

    if (cmd === 'node' || cmd === 'box' || cmd === 'block' || cmd === 'state') {
      const id = positional[1]?.value || `node_${ctxState.nodes.size}`;
      const label = attrs.label ?? positional.find((t, idx) => idx >= 2 && t.quoted)?.value ?? id;
      const shape = (attrs.shape || (cmd === 'state' ? 'circle' : 'box')).toLowerCase();
      const m = label ? measureDiagramText(label, font, baseSize) : { width: 20, height: 16 };
      const defaultW =
        shape === 'circle' || shape === 'doublecircle'
          ? Math.max(40, Math.max(m.width, m.height) + 18)
          : Math.max(66, m.width + 24);
      const defaultH =
        shape === 'circle' || shape === 'doublecircle' ? defaultW : Math.max(38, m.height + 16);

      let w = Number(attrs.w || defaultW);
      let h = Number(attrs.h || defaultH);
      if (attrs.size) {
        const [sw, sh] = parseTuple(attrs.size, ctxState.vars);
        if (sw) w = sw;
        if (sh) h = sh;
      }
      if (attrs.r) {
        w = Number(attrs.r) * 2;
        h = w;
      }

      const relPt = resolveRelativePosition(attrs, w, h, ctxState);
      const ptExpr = attrs.at || positional.find((t) => t.group)?.value || positional[2]?.value || '(0,0)';
      const pt = relPt || resolvePointExpr(ptExpr, ctxState);

      registerNodeObj({
        id,
        x: pt.x,
        y: pt.y,
        w,
        h,
        shape,
        label: attrs.label === 'none' ? '' : label,
        sublabel: attrs.sub || attrs.sublabel || '',
        fill: attrs.fill || 'none',
        hatchAngle: Number(attrs.hatchAngle ?? 45),
        color: attrs.color || null,
        dashed: attrs.dashed === 'true',
      });
      continue;
    }

    if (cmd === 'incline' || cmd === 'ramp' || cmd === 'fbd') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const inc = solveInclinedPlane({
        origin,
        baseWidth: Number(attrs.w ?? 220),
        angleDeg: Number(attrs.angle ?? 30),
        blockPos: Number(attrs.pos ?? 0.52),
      });
      ctxState.items.push(
        { type: 'polygon', points: inc.triangle, fill: 'none', closed: true },
        { type: 'connector', subtype: 'support', p1: inc.A, p2: inc.B, hatchSide: 'below' },
        { type: 'angle', vertex: inc.A, p1: inc.B, p2: inc.C, radius: 34, label: attrs.theta || '$\\theta$' },
        { type: 'polygon', points: inc.blockCorners, fill: 'hatch', hatchAngle: 45, hatchSpacing: 9, closed: true },
        { type: 'label', pt: inc.com, text: attrs.mass || '$m$', halo: true }
      );
      if (attrs.mg !== 'false') {
        ctxState.items.push({
          type: 'connector',
          subtype: 'vector',
          p1: inc.forces.mg.from,
          p2: inc.forces.mg.to,
          arrow: '->',
          label: attrs.mg || '$mg$',
          labelAt: 'tip',
          tipOffset: { x: 0, y: 14 },
        });
      }
      if (attrs.normal !== 'false') {
        ctxState.items.push({
          type: 'connector',
          subtype: 'vector',
          p1: inc.forces.normal.from,
          p2: inc.forces.normal.to,
          arrow: '->',
          label: attrs.normal || '$N$',
          labelAt: 'tip',
          tipOffset: Vec2.scale(inc.nOut, 14),
        });
      }
      if (attrs.friction) {
        ctxState.items.push({
          type: 'connector',
          subtype: 'vector',
          p1: inc.forces.friction.from,
          p2: inc.forces.friction.to,
          arrow: '->',
          label: attrs.friction,
          labelAt: 'tip',
          tipOffset: Vec2.add(Vec2.scale(inc.uUp, 14), Vec2.scale(inc.nOut, 6)),
        });
      }
      if (attrs.components === 'true') {
        ctxState.items.push(
          {
            type: 'connector',
            subtype: 'vector',
            p1: inc.forces.mgCos.from,
            p2: inc.forces.mgCos.to,
            arrow: '->',
            dashed: true,
            label: '$mg\\cos\\theta$',
            labelAt: 'tip',
            tipOffset: { x: 34, y: 8 },
          },
          {
            type: 'connector',
            subtype: 'vector',
            p1: inc.forces.mgSin.from,
            p2: inc.forces.mgSin.to,
            arrow: '->',
            dashed: true,
            label: '$mg\\sin\\theta$',
            labelAt: 'tip',
            tipOffset: Vec2.add(Vec2.scale(inc.uDown, 22), Vec2.scale(inc.nOut, 10)),
          }
        );
      }
      continue;
    }

    if (cmd === 'atwood' || cmd === 'pulleys') {
      const c1 = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const r1 = Number(attrs.r1 ?? attrs.r ?? 28);
      const c2 = attrs.p2 ? resolvePointExpr(attrs.p2, ctxState) : null;
      const r2 = Number(attrs.r2 ?? r1);
      const sys = solvePulleySystem({
        c1,
        r1,
        c2,
        r2,
        crossed: attrs.crossed === 'true',
        hangLeft: Number(attrs.hangLeft ?? 66),
        hangRight: Number(attrs.hangRight ?? 92),
      });
      if (!c2) {
        const ceilY = c1.y - r1 - 18;
        ctxState.items.push(
          { type: 'connector', subtype: 'support', p1: { x: c1.x - 36, y: ceilY }, p2: { x: c1.x + 36, y: ceilY }, hatchSide: 'above' },
          { type: 'connector', subtype: 'line', p1: { x: c1.x, y: ceilY }, p2: c1, arrow: 'none' }
        );
      }
      ctxState.items.push({ type: 'pulley', center: c1, r: r1, fill: 'none', label: '' });
      if (c2) ctxState.items.push({ type: 'pulley', center: c2, r: r2, fill: 'none', label: '' });
      for (const rp of sys.ropes) {
        ctxState.items.push({ type: 'connector', subtype: 'line', p1: rp.from, p2: rp.to, arrow: 'none' });
      }
      sys.blocks.forEach((b, idx) => {
        const lbl = idx === 0 ? attrs.m1 || '$m_1$' : attrs.m2 || '$m_2$';
        registerNodeObj({
          id: `atwood_m_${idx + 1}_${ctxState.nodes.size}`,
          x: b.center.x,
          y: b.center.y,
          w: b.w,
          h: b.h,
          shape: 'box',
          label: lbl,
          fill: 'hatch',
          hatchAngle: 45,
        });
      });
      continue;
    }

    if (cmd === 'optics' || cmd === 'lens') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const opt = solveOpticsRayTrace({
        origin,
        kind: (attrs.kind || 'convex').toLowerCase(),
        f: Number(attrs.f ?? 65),
        u: Number(attrs.u ?? 125),
        h: Number(attrs.h ?? 40),
      });
      ctxState.items.push({ type: 'optics', opt, color: attrs.color || null });
      continue;
    }

    if (cmd === 'charges' || cmd === 'dipole') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const q1 = Number(attrs.q1 ?? 1);
      const q2 = Number(attrs.q2 ?? -1);
      const sep = Number(attrs.sep ?? 120);
      const charges = [
        { x: origin.x - sep * 0.5, y: origin.y, q: q1, label: q1 > 0 ? '$+q$' : '$-q$' },
        { x: origin.x + sep * 0.5, y: origin.y, q: q2, label: q2 > 0 ? '$+q$' : '$-q$' },
      ];
      const ef = solveElectrostaticField({ charges, raysPerCharge: Number(attrs.rays ?? 10) });
      ctxState.items.push({ type: 'electrofield', ef, color: attrs.color || null });
      continue;
    }

    if (cmd === 'vectorfield' || cmd === 'quiver') {
      const origin = attrs.at ? resolvePointExpr(attrs.at, ctxState) : { x: 0, y: 0 };
      const vecs = solveVectorFieldGrid({
        origin,
        fnXStr: attrs.fx || attrs.fnX || '-y',
        fnYStr: attrs.fy || attrs.fnY || 'x',
      });
      for (const v of vecs) {
        ctxState.items.push({
          type: 'connector',
          subtype: 'vector',
          p1: v.from,
          p2: v.to,
          arrow: '->',
          bend: 0,
        });
      }
      continue;
    }

    if (
      [
        'arrow',
        'line',
        'edge',
        'vector',
        'vec',
        'spring',
        'coil',
        'wave',
        'resistor',
        'brace',
        'dim',
        'dimension',
        'support',
        'ground',
        'wall',
        'wedge',
        'dash',
      ].includes(cmd)
    ) {
      let fromExpr = attrs.from || '';
      let toExpr = attrs.to || '';
      let arrowKind =
        attrs.head ||
        (cmd === 'line' ||
        cmd === 'support' ||
        cmd === 'ground' ||
        cmd === 'wall' ||
        cmd === 'wedge' ||
        cmd === 'dash'
          ? 'none'
          : '->');

      if (!fromExpr || !toExpr) {
        const restTokens = positional.slice(1).filter((t) => !t.quoted).map((t) => t.value);
        const arrowIdx = restTokens.findIndex((v) =>
          ['->', '<->', '--', '|->', '->>', '-o', '-|', '=>'].includes(v)
        );
        if (arrowIdx !== -1) {
          const op = restTokens[arrowIdx];
          if (op === '--') arrowKind = 'none';
          else if (op !== '=>') arrowKind = op;
          fromExpr = restTokens.slice(0, arrowIdx).join(' ');
          toExpr = restTokens.slice(arrowIdx + 1).join(' ');
        } else if (restTokens.length >= 2) {
          fromExpr = restTokens[0];
          toExpr = restTokens[1];
        }
      }

      const [fromBase, fromAnchor] = fromExpr.includes('.')
        ? fromExpr.split('.').map((s) => s.trim())
        : [fromExpr.trim(), null];
      const [toBase, toAnchor] = toExpr.includes('.')
        ? toExpr.split('.').map((s) => s.trim())
        : [toExpr.trim(), null];

      if (fromBase && fromBase === toBase && ctxState.nodes.has(fromBase)) {
        const loopNode = ctxState.nodes.get(fromBase);
        const loop = buildSelfLoop(loopNode, {
          dir: attrs.loop || attrs.dir || fromAnchor || 'n',
          radius: Number(attrs.r ?? 24),
        });
        ctxState.items.push({
          type: 'selfLoop',
          loop,
          arrow: arrowKind,
          label: attrs.label || positional.find((t, i) => i >= 2 && t.quoted)?.value || '',
          color: attrs.color || null,
        });
        continue;
      }

      let p1 = resolvePointExpr(fromExpr, ctxState);
      let p2 = resolvePointExpr(toExpr, ctxState);
      const n1 = !fromAnchor ? ctxState.nodes.get(fromBase) : null;
      const n2 = !toAnchor ? ctxState.nodes.get(toBase) : null;
      const bendExplicit = attrs.bend !== undefined;
      const bend = Number(attrs.bend ?? 0);
      const route = (attrs.route || 'direct').toLowerCase();

      let exitDir = fromAnchor;
      let entryDir = toAnchor;

      if (
        (route === 'ortho' || route === 'orthogonal' || route === 'manhattan') &&
        n1 &&
        n2 &&
        !fromAnchor &&
        !toAnchor
      ) {
        const allObstacles = [...ctxState.nodes.values()];
        if (isDirectLineBlocked(n1, n2, allObstacles, fromBase, toBase)) {
          if (Math.abs(n1.y - n2.y) <= Math.abs(n1.x - n2.x)) {
            exitDir = 'n';
            entryDir = 'n';
            p1 = resolveNodeAnchor(n1, 'n');
            p2 = resolveNodeAnchor(n2, 'n');
          } else {
            exitDir = 'e';
            entryDir = 'e';
            p1 = resolveNodeAnchor(n1, 'e');
            p2 = resolveNodeAnchor(n2, 'e');
          }
        }
      }

      if (!exitDir && n1 && n1.shape !== 'point') {
        const rawMid = Vec2.mid(p1, p2);
        const rawNorm = Vec2.perp(Vec2.norm(Vec2.sub(p2, p1)));
        const guidePt = bend !== 0 ? Vec2.add(rawMid, Vec2.scale(rawNorm, bend)) : null;
        p1 = computeShapeBoundaryPoint(n1, guidePt || p2);
      }
      if (!entryDir && n2 && n2.shape !== 'point') {
        const rawMid = Vec2.mid(p1, p2);
        const rawNorm = Vec2.perp(Vec2.norm(Vec2.sub(p2, p1)));
        const guidePt = bend !== 0 ? Vec2.add(rawMid, Vec2.scale(rawNorm, bend)) : null;
        p2 = computeShapeBoundaryPoint(n2, guidePt || p1);
      }

      ctxState.items.push({
        type: 'connector',
        subtype: cmd,
        fromId: fromBase,
        toId: toBase,
        exitDir,
        entryDir,
        p1,
        p2,
        arrow: arrowKind,
        bend,
        bendExplicit,
        route,
        label: attrs.label || positional.find((t, i) => i >= 2 && t.quoted)?.value || '',
        labelSide: attrs.side || 'above',
        labelAt: attrs.labelAt || (cmd === 'vector' || cmd === 'vec' ? 'tip' : 'mid'),
        dashed: attrs.dashed === 'true' || attrs.style === 'dashed',
        coils: Number(attrs.coils ?? 7),
        freq: Number(attrs.freq ?? 5),
        amp: Number(attrs.amp ?? (cmd === 'brace' ? 12 : 6)),
        offset: Number(attrs.offset ?? 22),
        flip: attrs.flip === 'true',
        hatchSide: attrs.side || 'below',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'angle') {
      const p1 = resolvePointExpr(attrs.p1 || positional[1]?.value, ctxState);
      const vertex = resolvePointExpr(attrs.vertex || attrs.at || positional[2]?.value, ctxState);
      const p2 = resolvePointExpr(attrs.p2 || positional[3]?.value, ctxState);
      ctxState.items.push({
        type: 'angle',
        vertex,
        p1,
        p2,
        radius: Number(attrs.r ?? attrs.radius ?? 26),
        rightAngle: attrs.right === 'true',
        ticks: Number(attrs.ticks ?? 0),
        label: attrs.label || '',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'circle' || cmd === 'pulley') {
      const center = resolvePointExpr(
        attrs.at || positional.find((t) => t.group)?.value || positional[1]?.value || '(0,0)',
        ctxState
      );
      ctxState.items.push({
        type: cmd,
        center,
        r: Number(attrs.r ?? attrs.radius ?? 32),
        fill: attrs.fill || 'none',
        hatchAngle: Number(attrs.hatchAngle ?? 45),
        label: attrs.label || '',
        dashed: attrs.dashed === 'true',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'polygon' || cmd === 'poly' || cmd === 'spline' || cmd === 'curve') {
      const pts = positional
        .slice(1)
        .filter((t) => !t.quoted)
        .map((t) => resolvePointExpr(t.value, ctxState));
      ctxState.items.push({
        type: cmd === 'spline' || cmd === 'curve' ? 'spline' : 'polygon',
        points: pts,
        fill: attrs.fill || 'none',
        hatchAngle: Number(attrs.hatchAngle ?? 45),
        hatchSpacing: Number(attrs.spacing ?? 7),
        closed: attrs.closed !== 'false',
        arrow: attrs.arrow || attrs.head || 'none',
        dashed: attrs.dashed === 'true',
        label: attrs.label || '',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'tape' || cmd === 'array') {
      const origin = resolvePointExpr(attrs.at || '(0,0)', ctxState);
      const cells = String(attrs.cells || attrs.values || '0,1,0,1')
        .split(',')
        .map((c) => c.trim());
      ctxState.items.push({
        type: 'tape',
        origin,
        cells,
        cellW: Number(attrs.cellW ?? 38),
        cellH: Number(attrs.cellH ?? 34),
        headIdx: attrs.head !== undefined ? Number(attrs.head) : -1,
        headLabel: attrs.headLabel || attrs.state || '',
        showIndices: attrs.indices === 'true' || cmd === 'array',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'ring6' || cmd === 'benzene' || cmd === 'chemring') {
      const center = resolvePointExpr(attrs.at || positional[1]?.value || '(0,0)', ctxState);
      const r = Number(attrs.r ?? 34);
      const sides = Number(attrs.sides ?? 6);
      const idPrefix = attrs.id || 'R';
      for (let k = 0; k < sides; k++) {
        const deg = 90 - (k * 360) / sides;
        ctxState.points.set(`${idPrefix}${k + 1}`, Vec2.add(center, Vec2.polar(r, deg, true)));
      }
      ctxState.items.push({
        type: 'chemring',
        center,
        r,
        sides,
        aromatic: cmd === 'benzene' || attrs.aromatic === 'true',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'axes') {
      const origin = resolvePointExpr(attrs.at || '(0,0)', ctxState);
      const xrange = attrs.xrange ? parseTuple(attrs.xrange, ctxState.vars) : [-4, 4];
      const yrange = attrs.yrange ? parseTuple(attrs.yrange, ctxState.vars) : [-3, 3];
      const w = Number(attrs.w ?? 260);
      const h = Number(attrs.h ?? 180);
      ctxState.axesConfig = {
        origin,
        xMin: xrange[0],
        xMax: xrange[1],
        yMin: yrange[0],
        yMax: yrange[1],
        w,
        h,
        xlabel: attrs.xlabel || '$x$',
        ylabel: attrs.ylabel || '$y$',
        grid: attrs.grid === 'true',
        toCanvas(mx, my) {
          const tx = (mx - this.xMin) / Math.max(1e-6, this.xMax - this.xMin);
          const ty = (my - this.yMin) / Math.max(1e-6, this.yMax - this.yMin);
          return {
            x: this.origin.x - this.w * 0.5 + tx * this.w,
            y: this.origin.y + this.h * 0.5 - ty * this.h,
          };
        },
      };
      ctxState.items.push({ type: 'axes', axes: ctxState.axesConfig });
      continue;
    }

    if (cmd === 'plot' || cmd === 'func') {
      const fn = compileMathExpr(attrs.fn || attrs.expr || positional[1]?.value || 'sin(x)');
      const ax = ctxState.axesConfig;
      const dom = attrs.domain
        ? parseTuple(attrs.domain, ctxState.vars)
        : [ax ? ax.xMin : -3.14, ax ? ax.xMax : 3.14];
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const x = dom[0] + ((dom[1] - dom[0]) * i) / 90;
        const y = fn({ ...ctxState.vars, x, t: x });
        pts.push(ax ? ax.toCanvas(x, y) : { x: x * 30, y: -y * 30 });
      }
      ctxState.items.push({
        type: 'plotCurve',
        points: pts,
        label: attrs.label || '',
        dashed: attrs.dashed === 'true',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'parametric' || cmd === 'param') {
      const fx = compileMathExpr(attrs.x || positional[1]?.value || 'cos(t)');
      const fy = compileMathExpr(attrs.y || positional[2]?.value || 'sin(t)');
      const dom = attrs.domain ? parseTuple(attrs.domain, ctxState.vars) : [0, Math.PI * 2];
      const ax = ctxState.axesConfig;
      const scale = Number(attrs.scale ?? 40);
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const t = dom[0] + ((dom[1] - dom[0]) * i) / 100;
        const mx = fx({ ...ctxState.vars, t });
        const my = fy({ ...ctxState.vars, t });
        pts.push(ax ? ax.toCanvas(mx, my) : { x: mx * scale, y: -my * scale });
      }
      ctxState.items.push({
        type: 'plotCurve',
        points: pts,
        label: attrs.label || '',
        dashed: attrs.dashed === 'true',
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'shade' || cmd === 'integral') {
      const f1 = compileMathExpr(attrs.f1 || attrs.top || positional[1]?.value || 'sin(x)');
      const f2 = compileMathExpr(attrs.f2 || attrs.bottom || positional[2]?.value || '0');
      const ax = ctxState.axesConfig;
      const dom = attrs.domain ? parseTuple(attrs.domain, ctxState.vars) : [0, Math.PI];
      const upper = [];
      const lower = [];
      for (let i = 0; i <= 40; i++) {
        const x = dom[0] + ((dom[1] - dom[0]) * i) / 40;
        const y1 = f1({ ...ctxState.vars, x });
        const y2 = f2({ ...ctxState.vars, x });
        upper.push(ax ? ax.toCanvas(x, y1) : { x: x * 30, y: -y1 * 30 });
        lower.unshift(ax ? ax.toCanvas(x, y2) : { x: x * 30, y: -y2 * 30 });
      }
      ctxState.items.push({
        type: 'polygon',
        points: [...upper, ...lower],
        fill: 'hatch',
        hatchAngle: Number(attrs.angle ?? 45),
        hatchSpacing: Number(attrs.spacing ?? 6),
        closed: true,
        outline: false,
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'label' || cmd === 'text' || cmd === 'math') {
      const pt = resolvePointExpr(
        attrs.at || positional.find((t) => t.group)?.value || '(0,0)',
        ctxState
      );
      const text =
        attrs.text ||
        attrs.label ||
        positional.find((t) => t.quoted)?.value ||
        positional[1]?.value ||
        '';
      ctxState.items.push({
        type: 'label',
        pt,
        text,
        align: attrs.align || 'center',
        scale: Number(attrs.scale ?? 1),
        color: attrs.color || null,
      });
      continue;
    }

    if (cmd === 'axes3d') {
      const L = Number(attrs.size ?? attrs.r ?? 85);
      const O = ctxState.projector3d.project(0, 0, 0);
      const X = ctxState.projector3d.project(L, 0, 0);
      const Y = ctxState.projector3d.project(0, L, 0);
      const Z = ctxState.projector3d.project(0, 0, L);
      ctxState.items.push(
        { type: 'connector', subtype: 'vector', p1: O, p2: X, arrow: '->', bend: 0, label: attrs.xlabel || '$x$', labelAt: 'tip' },
        { type: 'connector', subtype: 'vector', p1: O, p2: Y, arrow: '->', bend: 0, label: attrs.ylabel || '$y$', labelAt: 'tip' },
        { type: 'connector', subtype: 'vector', p1: O, p2: Z, arrow: '->', bend: 0, label: attrs.zlabel || '$z$', labelAt: 'tip' }
      );
      continue;
    }
  }

  for (const dl of ctxState.deferredMemLinks) {
    const p2 = resolvePointExpr(dl.targetRef, ctxState);
    ctxState.items.push({
      type: 'connector',
      subtype: 'arrow',
      p1: dl.fromPt,
      p2,
      arrow: '->',
      bend: -16,
      bendExplicit: true,
      route: 'direct',
    });
  }

  const allObstacles = [...ctxState.nodes.values()];
  const connectors = ctxState.items.filter((i) => i.type === 'connector');
  assignParallelEdgeBends(connectors);
  for (const conn of connectors) {
    if (conn.bend !== 0 && conn.fromId && conn.toId) {
      const n1 = ctxState.nodes.get(conn.fromId);
      const n2 = ctxState.nodes.get(conn.toId);
      if (n1 && n2 && n1.shape !== 'point' && n2.shape !== 'point') {
        const mid = Vec2.mid(n1, n2);
        const norm = Vec2.perp(Vec2.norm(Vec2.sub(n2, n1)));
        const guide = Vec2.add(mid, Vec2.scale(norm, conn.bend));
        conn.p1 = computeShapeBoundaryPoint(n1, guide);
        conn.p2 = computeShapeBoundaryPoint(n2, guide);
      }
    }

    const { p1, p2, subtype, bend = 0, route = 'direct' } = conn;
    const d = Vec2.sub(p2, p1);
    const u = Vec2.norm(d);
    const n = Vec2.perp(u);
    if (subtype === 'spring' || subtype === 'coil') {
      conn.chain = buildSpringPoints(p1, p2, { coils: conn.coils, amp: conn.amp });
    } else if (subtype === 'wave' || subtype === 'resistor') {
      conn.chain = buildWavePoints(p1, p2, {
        freq: conn.freq,
        amp: conn.amp,
        type: subtype === 'resistor' ? 'resistor' : 'sine',
      });
    } else if (route === 'ortho' || route === 'orthogonal' || route === 'manhattan') {
      conn.chain = routeOrthogonal(p1, p2, allObstacles, {
        sourceId: conn.fromId,
        targetId: conn.toId,
        exitDir: conn.exitDir,
        entryDir: conn.entryDir,
      });
    } else if (route === 'avoid' || route === 'auto') {
      conn.chain = routeCurvedAroundObstacles(p1, p2, allObstacles, {
        sourceId: conn.fromId,
        targetId: conn.toId,
      });
    } else if (Math.abs(bend) > 1) {
      const mid = Vec2.add(Vec2.mid(p1, p2), Vec2.scale(n, bend));
      conn.chain = solveSmoothSpline([p1, mid, p2], 0.55, false, 14);
    } else {
      conn.chain = [p1, p2];
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expandPt = (p, padX = 14, padY = 14) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (p.x - padX < minX) minX = p.x - padX;
    if (p.x + padX > maxX) maxX = p.x + padX;
    if (p.y - padY < minY) minY = p.y - padY;
    if (p.y + padY > maxY) maxY = p.y + padY;
  };

  for (const item of ctxState.items) {
    if (item.type === 'node') expandPt(item.node, item.node.w * 0.5 + 12, item.node.h * 0.5 + 14);
    else if (item.type === 'cluster') {
      expandPt({ x: item.box.x, y: item.box.y }, 10, 10);
      expandPt({ x: item.box.x + item.box.w, y: item.box.y + item.box.h }, 10, 10);
    } else if (item.type === 'point') expandPt(item.pt, 24, 20);
    else if (item.type === 'selfLoop') {
      for (const p of item.loop.points) expandPt(p, 16, 16);
      expandPt(item.loop.labelPos, 24, 16);
    } else if (item.type === 'connector') {
      for (const p of item.chain || [item.p1, item.p2]) expandPt(p, 22, 22);
      if (item.tipOffset) expandPt(Vec2.add(item.p2, item.tipOffset), 32, 18);
    } else if (item.type === 'circle' || item.type === 'pulley' || item.type === 'chemring') {
      expandPt(item.center, item.r + 18, item.r + 18);
    } else if (item.type === 'polygon' || item.type === 'spline' || item.type === 'plotCurve') {
      for (const p of item.points || []) expandPt(p, 14, 14);
    } else if (item.type === 'axes') {
      expandPt(item.axes.origin, item.axes.w * 0.5 + 28, item.axes.h * 0.5 + 26);
    } else if (item.type === 'tape') {
      const totalW = item.cells.length * item.cellW;
      expandPt({ x: item.origin.x + totalW * 0.5, y: item.origin.y }, totalW * 0.5 + 20, item.cellH + 34);
    } else if (item.type === 'waveform') {
      const w = item.maxCycles * item.stepW + 85;
      const h = item.signals.length * (item.rowH + item.rowGap) + 32;
      expandPt(item.origin, w * 0.5, h * 0.5);
    } else if (item.type === 'linkedlist') {
      expandPt(item.ll.origin, item.ll.totalWidth * 0.5 + 16, item.ll.totalHeight * 0.5 + 16);
    } else if (item.type === 'memframe') {
      expandPt(item.mf.origin, item.mf.w * 0.5 + 16, item.mf.totalH * 0.5 + 16);
    } else if (item.type === 'btree') {
      for (const bn of item.bt.nodes) expandPt(bn, bn.w * 0.5 + 14, bn.h * 0.5 + 14);
    } else if (item.type === 'pipeline') {
      const w = 100 + item.maxCols * item.cellW;
      const h = item.rows.length * (item.cellH + item.rowGap) + 32;
      expandPt(item.origin, w * 0.5 + 14, h * 0.5 + 14);
    } else if (item.type === 'gantt') {
      expandPt(item.origin, item.totalW * 0.5 + 20, item.barH + 20);
    } else if (item.type === 'packet') {
      const totalBits = item.fields.reduce((a, f) => a + f.span, 0);
      const rows = Math.max(1, Math.ceil(totalBits / item.bits));
      expandPt(item.origin, item.totalW * 0.5 + 18, (rows * item.rowH) * 0.5 + 24);
    } else if (item.type === 'skeletalChain') {
      expandPt(item.chain.origin, item.chain.width * 0.5 + 20, item.chain.height * 0.5 + 20);
    } else if (item.type === 'chair') {
      expandPt(item.chair.origin, item.chair.width * 0.5 + 24, item.chair.height * 0.5 + 24);
    } else if (item.type === 'newman') {
      expandPt(item.nm.origin, item.nm.spokeLen + 28, item.nm.spokeLen + 28);
    } else if (item.type === 'venn') {
      expandPt(item.venn.origin, item.venn.uBox.w * 0.5 + 16, item.venn.uBox.h * 0.5 + 18);
    } else if (item.type === 'mapping') {
      expandPt(item.mp.origin, item.mp.width * 0.5 + 18, item.mp.height * 0.5 + 18);
    } else if (item.type === 'surface3d') {
      expandPt({ x: item.surf.bounds.minX, y: item.surf.bounds.minY }, 22, 22);
      expandPt({ x: item.surf.bounds.maxX, y: item.surf.bounds.maxY }, 22, 22);
    } else if (item.type === 'riemann') {
      expandPt(item.rm.origin, item.rm.w * 0.5 + 24, item.rm.h * 0.5 + 24);
    } else if (item.type === 'matrixgrid') {
      expandPt(item.mg.origin, item.mg.span + 20, item.mg.span + 20);
    } else if (item.type === 'slopefield') {
      expandPt(item.sf.origin, item.sf.w * 0.5 + 20, item.sf.h * 0.5 + 20);
    } else if (item.type === 'optics') {
      expandPt(item.opt.axisLeft, 18, 76);
      expandPt(item.opt.axisRight, 18, 76);
    } else if (item.type === 'electrofield') {
      for (const sl of item.ef.streamlines) for (const p of sl.points) expandPt(p, 10, 10);
      for (const c of item.ef.charges) expandPt(c, 28, 28);
    } else if (item.type === 'label') {
      const m = measureDiagramText(item.text, font, baseSize);
      expandPt(item.pt, m.width * 0.5 + 10, m.height * 0.5 + 10);
    } else if (item.type === 'angle') {
      expandPt(item.vertex, item.radius + 22, item.radius + 22);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -100;
    maxX = 100;
    minY = -60;
    maxY = 60;
  }

  return {
    ...ctxState,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(80, maxX - minX),
      height: Math.max(55, maxY - minY),
    },
  };
}

export function measureSketch(spec, maxW = 520, font = 'Caveat') {
  const scene = compileSketchScene(spec, font, 15);
  const titleH = scene.title ? 24 : 0;
  const rawW = scene.bounds.width + 24;
  const rawH = scene.bounds.height + 20 + titleH;
  const scale = rawW > maxW ? maxW / rawW : 1;
  return {
    width: Math.min(maxW, Math.max(220, Math.ceil(rawW * scale))),
    height: Math.max(80, Math.ceil(rawH * scale)),
  };
}

export function renderSketch(ctx, rc, spec, x, y, maxW, font, ink, seed = 101) {
  const baseSize = 15;
  const scene = compileSketchScene(spec, font, baseSize);
  const titleH = scene.title ? 24 : 0;
  const rawW = scene.bounds.width + 24;
  const rawH = scene.bounds.height + 20;
  const scale = rawW > maxW ? maxW / rawW : 1;
  const drawW = Math.min(maxW, Math.max(220, rawW * scale));
  const drawH = Math.max(80, rawH * scale + titleH);

  ctx.save();
  if (scene.title) {
    drawDiagramText(ctx, scene.title, x + drawW * 0.5, y + 4, {
      font,
      size: baseSize + 1,
      color: ink,
      align: 'center',
      baseline: 'top',
      seed: seed + 3,
    });
  }

  const contentCx = x + drawW * 0.5;
  const contentCy = y + titleH + (drawH - titleH) * 0.5;
  const boundsCx = (scene.bounds.minX + scene.bounds.maxX) * 0.5;
  const boundsCy = (scene.bounds.minY + scene.bounds.maxY) * 0.5;

  ctx.translate(contentCx, contentCy);
  ctx.scale(scale, scale);
  ctx.translate(-boundsCx, -boundsCy);

  let itemSeed = seed + 17;

  for (const item of scene.items) {
    itemSeed += 31;
    const stroke = item.color || item.node?.color || ink;

    if (item.type === 'waveform') {
      renderWaveformItem(rc, ctx, item, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'linkedlist') {
      renderLinkedListItem(rc, ctx, item.ll, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'memframe') {
      renderMemoryFrameItem(rc, ctx, item.mf, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'btree') {
      renderBTreeItem(rc, ctx, item.bt, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'pipeline') {
      renderPipelineItem(rc, ctx, item, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'gantt') {
      renderGanttItem(rc, ctx, item, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'packet') {
      renderPacketHeaderItem(rc, ctx, item, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'skeletalChain') {
      renderSkeletalChainItem(rc, ctx, item.chain, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'chair') {
      renderChairItem(rc, ctx, item.chair, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'newman') {
      renderNewmanItem(rc, ctx, item.nm, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'venn') {
      renderVennItem(rc, ctx, item.venn, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'mapping') {
      renderBipartiteMappingItem(rc, ctx, item.mp, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'surface3d') {
      renderSurface3DItem(rc, ctx, item.surf, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'riemann') {
      renderRiemannItem(rc, ctx, item.rm, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'matrixgrid') {
      renderMatrixGridItem(rc, ctx, item.mg, font, baseSize, stroke, itemSeed);
      continue;
    }
    if (item.type === 'slopefield') {
      renderSlopeFieldItem(rc, ctx, item.sf, font, baseSize, stroke, itemSeed);
      continue;
    }

    if (item.type === 'cluster') {
      const { box, label } = item;
      rRect(rc, ctx, box.x, box.y, box.w, box.h, { seed: itemSeed, stroke, strokeWidth: 1.3 });
      if (label) {
        drawDiagramText(ctx, label, box.x + 10, box.y + 6, {
          font,
          size: baseSize - 2,
          color: stroke,
          align: 'left',
          baseline: 'top',
          seed: itemSeed + 2,
        });
      }
      continue;
    }

    if (item.type === 'axes') {
      const ax = item.axes;
      const left = ax.origin.x - ax.w * 0.5;
      const right = ax.origin.x + ax.w * 0.5;
      const top = ax.origin.y - ax.h * 0.5;
      const bottom = ax.origin.y + ax.h * 0.5;
      const zeroPt = ax.toCanvas(
        Math.min(ax.xMax, Math.max(ax.xMin, 0)),
        Math.min(ax.yMax, Math.max(ax.yMin, 0))
      );
      rLine(rc, ctx, left, zeroPt.y, right, zeroPt.y, { seed: itemSeed + 1, stroke, strokeWidth: 1.5 });
      drawArrowEndpoint(rc, ctx, { x: right, y: zeroPt.y }, { x: 1, y: 0 }, { stroke, seed: itemSeed + 2 });
      rLine(rc, ctx, zeroPt.x, bottom, zeroPt.x, top, { seed: itemSeed + 3, stroke, strokeWidth: 1.5 });
      drawArrowEndpoint(rc, ctx, { x: zeroPt.x, y: top }, { x: 0, y: -1 }, { stroke, seed: itemSeed + 4 });
      if (ax.xlabel) {
        drawDiagramText(ctx, ax.xlabel, right + 12, zeroPt.y, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'left',
          baseline: 'middle',
          seed: itemSeed + 5,
        });
      }
      if (ax.ylabel) {
        drawDiagramText(ctx, ax.ylabel, zeroPt.x, top - 12, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'center',
          baseline: 'bottom',
          seed: itemSeed + 6,
        });
      }
      continue;
    }

    if (item.type === 'plotCurve') {
      drawPointChain(rc, ctx, item.points, { seed: itemSeed, stroke, strokeWidth: 1.8, dashed: item.dashed });
      if (item.label && item.points.length > 0) {
        const last = item.points[item.points.length - 1];
        drawDiagramText(ctx, item.label, last.x + 8, last.y, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'left',
          baseline: 'middle',
          seed: itemSeed + 9,
        });
      }
      continue;
    }

    if (item.type === 'node') {
      const n = item.node;
      const hw = n.w * 0.5;
      const hh = n.h * 0.5;
      if (n.shape === 'circle' || n.shape === 'doublecircle') {
        const rad = Math.max(hw, hh);
        rCircle(rc, ctx, n.x, n.y, rad, { seed: itemSeed, stroke, strokeWidth: 1.6 });
        if (n.shape === 'doublecircle') {
          rCircle(rc, ctx, n.x, n.y, Math.max(4, rad - 4), { seed: itemSeed + 3, stroke, strokeWidth: 1.3 });
        }
      } else if (n.shape === 'ellipse' || n.shape === 'oval') {
        rEllipse(rc, ctx, n.x, n.y, n.w, n.h, { seed: itemSeed, stroke, strokeWidth: 1.6 });
      } else if (n.shape === 'cylinder' || n.shape === 'db') {
        const capH = Math.min(12, n.h * 0.25);
        rEllipse(rc, ctx, n.x, n.y - hh + capH * 0.5, n.w, capH, { seed: itemSeed, stroke, strokeWidth: 1.5 });
        rLine(rc, ctx, n.x - hw, n.y - hh + capH * 0.5, n.x - hw, n.y + hh - capH * 0.5, { seed: itemSeed + 1, stroke, strokeWidth: 1.5 });
        rLine(rc, ctx, n.x + hw, n.y - hh + capH * 0.5, n.x + hw, n.y + hh - capH * 0.5, { seed: itemSeed + 2, stroke, strokeWidth: 1.5 });
        rEllipse(rc, ctx, n.x, n.y + hh - capH * 0.5, n.w, capH, { seed: itemSeed + 3, stroke, strokeWidth: 1.5 });
      } else if (n.shape !== 'point' && n.shape !== 'none' && n.shape !== 'text') {
        drawHatchedPolygon(rc, ctx, getShapePolygon(n), {
          fill: n.fill,
          hatchAngle: n.hatchAngle,
          stroke,
          strokeWidth: 1.6,
          outline: true,
          seed: itemSeed,
        });
      }
      if (n.label) {
        drawDiagramText(ctx, n.label, n.x, n.y, {
          font,
          size: baseSize,
          color: stroke,
          align: 'center',
          baseline: 'middle',
          seed: itemSeed + 7,
        });
      }
      continue;
    }

    if (item.type === 'selfLoop') {
      const { loop, arrow, label } = item;
      drawPointChain(rc, ctx, loop.points, { seed: itemSeed, stroke, strokeWidth: 1.5 });
      if (arrow && arrow !== 'none') {
        drawArrowEndpoint(rc, ctx, loop.points[loop.points.length - 1], loop.endTangent, {
          type: arrow,
          stroke,
          seed: itemSeed + 3,
        });
      }
      if (label) {
        drawDiagramText(ctx, label, loop.labelPos.x, loop.labelPos.y, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'center',
          baseline: 'middle',
          seed: itemSeed + 5,
        });
      }
      continue;
    }

    if (item.type === 'connector') {
      const { p1, p2, subtype, arrow, label, labelSide, labelAt, tipOffset, dashed } = item;
      const chain = item.chain || [p1, p2];
      const sign = labelSide === 'below' || labelSide === 'right' ? 1 : -1;

      if (subtype === 'wedge') {
        drawWedgeBond(rc, ctx, p1, p2, { stroke, seed: itemSeed });
        continue;
      }
      if (subtype === 'dash') {
        drawDashBond(rc, ctx, p1, p2, { stroke, seed: itemSeed });
        continue;
      }
      if (subtype === 'support' || subtype === 'ground' || subtype === 'wall') {
        drawMechanicalSupport(rc, ctx, p1, p2, { hatchSide: item.hatchSide, stroke, seed: itemSeed });
        continue;
      }
      if (subtype === 'brace') {
        const br = buildCurlyBrace(p1, p2, { amp: item.amp, flip: item.flip });
        drawPointChain(rc, ctx, br.points, { seed: itemSeed, stroke, strokeWidth: 1.5 });
        if (label) {
          drawDiagramText(ctx, label, br.labelPos.x, br.labelPos.y, {
            font,
            size: baseSize - 1,
            color: stroke,
            align: 'center',
            baseline: 'middle',
            seed: itemSeed + 5,
          });
        }
        continue;
      }
      if (subtype === 'dim' || subtype === 'dimension') {
        const dm = drawDimensionCallout(rc, ctx, p1, p2, { offset: item.offset, stroke, seed: itemSeed });
        if (label) {
          drawDiagramText(ctx, label, dm.labelPos.x, dm.labelPos.y, {
            font,
            size: baseSize - 1,
            color: stroke,
            align: 'center',
            baseline: 'middle',
            seed: itemSeed + 5,
          });
        }
        continue;
      }

      drawPointChain(rc, ctx, chain, { seed: itemSeed, stroke, strokeWidth: 1.6, dashed });

      if (arrow && arrow !== 'none') {
        const endInfo = polylinePointAndTangentAt(chain, 1.0);
        drawArrowEndpoint(rc, ctx, chain[chain.length - 1], endInfo.tangent, {
          type: arrow === '<->' ? '->' : arrow,
          stroke,
          seed: itemSeed + 11,
        });
        if (arrow === '<->') {
          const startInfo = polylinePointAndTangentAt(chain, 0.0);
          drawArrowEndpoint(rc, ctx, chain[0], Vec2.scale(startInfo.tangent, -1), {
            type: '->',
            stroke,
            seed: itemSeed + 15,
          });
        }
      }
      if (label) {
        let lblPt;
        if (labelAt === 'tip') {
          const endInfo = polylinePointAndTangentAt(chain, 1.0);
          lblPt = tipOffset
            ? Vec2.add(chain[chain.length - 1], tipOffset)
            : Vec2.add(chain[chain.length - 1], Vec2.scale(endInfo.tangent, 16));
        } else {
          const midInfo = polylinePointAndTangentAt(chain, 0.5);
          const norm = Vec2.perp(midInfo.tangent);
          const offsetDist = subtype === 'spring' || subtype === 'wave' ? item.amp + 13 : 12;
          lblPt = Vec2.add(midInfo.point, Vec2.scale(norm, sign * offsetDist));
        }
        drawDiagramText(ctx, label, lblPt.x, lblPt.y, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'center',
          baseline: 'middle',
          seed: itemSeed + 19,
        });
      }
      continue;
    }

    if (item.type === 'optics') {
      const { opt } = item;
      rLine(rc, ctx, opt.axisLeft.x, opt.axisLeft.y, opt.axisRight.x, opt.axisRight.y, {
        seed: itemSeed,
        stroke,
        strokeWidth: 1.2,
      });
      rEllipse(rc, ctx, opt.O.x, opt.O.y, 20, opt.lensBottom.y - opt.lensTop.y, {
        seed: itemSeed + 1,
        stroke,
        strokeWidth: 1.6,
      });
      rLine(rc, ctx, opt.objBase.x, opt.objBase.y, opt.objTip.x, opt.objTip.y, { seed: itemSeed + 2, stroke, strokeWidth: 2 });
      drawArrowEndpoint(rc, ctx, opt.objTip, { x: 0, y: -1 }, { stroke, seed: itemSeed + 3 });
      drawDiagramText(ctx, '$O$', opt.objBase.x, opt.objBase.y + 14, { font, size: baseSize - 2, color: stroke, align: 'center', seed: itemSeed + 4 });

      drawPointChain(rc, ctx, [opt.imgBase, opt.imgTip], { seed: itemSeed + 5, stroke, strokeWidth: 1.8, dashed: opt.isVirtual });
      drawArrowEndpoint(rc, ctx, opt.imgTip, { x: 0, y: opt.imgTip.y < opt.imgBase.y ? -1 : 1 }, { stroke, seed: itemSeed + 6 });
      drawDiagramText(ctx, '$I$', opt.imgBase.x, opt.imgBase.y - 14, { font, size: baseSize - 2, color: stroke, align: 'center', seed: itemSeed + 7 });

      for (const [pt, lbl] of [[opt.F1, '$F_1$'], [opt.F2, '$F_2$']]) {
        rCircle(rc, ctx, pt.x, pt.y, 2.5, { seed: itemSeed + 8, stroke, fill: stroke, fillStyle: 'solid' });
        drawDiagramText(ctx, lbl, pt.x, pt.y + 16, { font, size: baseSize - 2, color: stroke, align: 'center', seed: itemSeed + 9 });
      }
      for (const [a, b] of opt.solidRays) {
        rLine(rc, ctx, a.x, a.y, b.x, b.y, { seed: itemSeed + 12, stroke, strokeWidth: 1.3 });
        const arrowPt = Vec2.lerp(a, b, 0.32);
        drawArrowEndpoint(rc, ctx, arrowPt, Vec2.norm(Vec2.sub(b, a)), { size: 7, stroke, seed: itemSeed + 13 });
      }
      for (const [a, b] of opt.dashedRays) {
        drawPointChain(rc, ctx, [a, b], { seed: itemSeed + 15, stroke, strokeWidth: 1.2, dashed: true });
      }
      continue;
    }

    if (item.type === 'electrofield') {
      const { ef } = item;
      const chargeRad = ef.chargeRadius || 15;
      for (const sl of ef.streamlines) {
        drawPointChain(rc, ctx, sl.points, { seed: itemSeed++, stroke, strokeWidth: 1.3 });
        const midInfo = polylinePointAndTangentAt(sl.points, 0.52);
        drawArrowEndpoint(rc, ctx, midInfo.point, midInfo.tangent, { size: 7, stroke, seed: itemSeed++ });
      }
      for (const c of ef.charges) {
        rCircle(rc, ctx, c.x, c.y, chargeRad, { seed: itemSeed++, stroke, fill: '#ffffff', fillStyle: 'solid', strokeWidth: 1.7 });
        drawDiagramText(ctx, c.label, c.x, c.y, { font, size: baseSize - 1, color: stroke, align: 'center', baseline: 'middle', seed: itemSeed++ });
      }
      continue;
    }

    if (item.type === 'angle') {
      const res = drawAngleMarker(rc, ctx, item.vertex, item.p1, item.p2, {
        radius: item.radius,
        rightAngle: item.rightAngle,
        ticks: item.ticks,
        stroke,
        seed: itemSeed,
      });
      if (item.label) {
        drawDiagramText(ctx, item.label, res.labelPos.x, res.labelPos.y, {
          font,
          size: baseSize - 1,
          color: stroke,
          align: 'center',
          baseline: 'middle',
          seed: itemSeed + 5,
        });
      }
      continue;
    }

    if (item.type === 'circle' || item.type === 'pulley') {
      rCircle(rc, ctx, item.center.x, item.center.y, item.r, { seed: itemSeed, stroke, strokeWidth: 1.6 });
      if (item.type === 'pulley') {
        rCircle(rc, ctx, item.center.x, item.center.y, 3.5, { seed: itemSeed + 2, stroke, fill: stroke, fillStyle: 'solid' });
      }
      if (item.label) {
        drawDiagramText(ctx, item.label, item.center.x, item.center.y, {
          font,
          size: baseSize,
          color: stroke,
          align: 'center',
          baseline: 'middle',
          seed: itemSeed + 4,
        });
      }
      continue;
    }

    if (item.type === 'polygon') {
      drawHatchedPolygon(rc, ctx, item.points, {
        fill: item.fill,
        hatchAngle: item.hatchAngle,
        hatchSpacing: item.hatchSpacing,
        stroke,
        outline: item.outline !== false,
        seed: itemSeed,
      });
      continue;
    }

    if (item.type === 'spline') {
      const curvePts = solveSmoothSpline(item.points, 0.5, item.closed === true, 14);
      drawPointChain(rc, ctx, curvePts, { seed: itemSeed, stroke, strokeWidth: 1.6, dashed: item.dashed });
      continue;
    }

    if (item.type === 'tape') {
      const { origin, cells, cellW, cellH, headIdx, headLabel, showIndices } = item;
      cells.forEach((val, idx) => {
        const cx = origin.x + idx * cellW;
        const cy = origin.y - cellH * 0.5;
        rRect(rc, ctx, cx, cy, cellW, cellH, { seed: itemSeed + idx * 5, stroke, strokeWidth: idx === headIdx ? 2.2 : 1.5 });
        drawDiagramText(ctx, val, cx + cellW * 0.5, origin.y, { font, size: baseSize, color: stroke, align: 'center', baseline: 'middle', seed: itemSeed + idx * 5 + 1 });
        if (showIndices) {
          drawDiagramText(ctx, String(idx), cx + cellW * 0.5, origin.y + cellH * 0.5 + 10, { font, size: baseSize - 3, color: stroke, align: 'center', baseline: 'top', seed: itemSeed + idx * 5 + 2 });
        }
        if (idx === headIdx) {
          const tip = { x: cx + cellW * 0.5, y: origin.y - cellH * 0.5 - 3 };
          const tail = { x: cx + cellW * 0.5, y: origin.y - cellH * 0.5 - 24 };
          rLine(rc, ctx, tail.x, tail.y, tip.x, tip.y, { seed: itemSeed + 99, stroke, strokeWidth: 1.7 });
          drawArrowEndpoint(rc, ctx, tip, { x: 0, y: 1 }, { stroke, seed: itemSeed + 100 });
          if (headLabel) {
            drawDiagramText(ctx, headLabel, tail.x, tail.y - 6, { font, size: baseSize, color: stroke, align: 'center', baseline: 'bottom', seed: itemSeed + 101 });
          }
        }
      });
      continue;
    }

    if (item.type === 'chemring') {
      const { center, r, sides, aromatic } = item;
      const verts = [];
      for (let k = 0; k < sides; k++) verts.push(Vec2.add(center, Vec2.polar(r, 90 - (k * 360) / sides, true)));
      drawPointChain(rc, ctx, [...verts, verts[0]], { seed: itemSeed, stroke, strokeWidth: 1.6 });
      if (aromatic) rCircle(rc, ctx, center.x, center.y, r * 0.58, { seed: itemSeed + 9, stroke, strokeWidth: 1.3 });
      continue;
    }

    if (item.type === 'point') {
      if (item.showDot) rCircle(rc, ctx, item.pt.x, item.pt.y, item.r, { seed: itemSeed, stroke, fill: stroke, fillStyle: 'solid' });
      if (item.label) {
        const offset = resolveNodeAnchor({ x: 0, y: 0, w: 26, h: 26, shape: 'circle' }, item.pos);
        drawDiagramText(ctx, item.label, item.pt.x + offset.x, item.pt.y + offset.y, { font, size: baseSize - 1, color: stroke, align: 'center', baseline: 'middle', seed: itemSeed + 2 });
      }
      continue;
    }

    if (item.type === 'label') {
      drawDiagramText(ctx, item.text, item.pt.x, item.pt.y, {
        font,
        size: Math.round(baseSize * (item.scale || 1)),
        color: stroke,
        align: item.align || 'center',
        baseline: 'middle',
        seed: itemSeed,
      });
      continue;
    }
  }

  ctx.restore();
  return drawH;
}
