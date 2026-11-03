// src/render/sketch/systems.js
// Mathematical Layout & Geometry Solvers for CS, COA, OS, Networks & DSA Diagrams

import { Vec2 } from './vecmath.js';
import { normalizeArrowText } from './layout.js';
import {
  drawPointChain,
  drawArrowEndpoint,
  drawHatchedPolygon,
} from './strokes.js';
import {
  rLine,
  rCircle,
  rRect,
  drawDiagramText,
} from '../diagrams/primitives.js';

export function parseWaveformSpec(signalsStr) {
  const rawSignals = String(signalsStr || '')
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const signals = [];
  let maxCycles = 1;

  for (const entry of rawSignals) {
    const colonIdx = entry.indexOf(':');
    const name = colonIdx !== -1 ? entry.slice(0, colonIdx).trim() : 'SIG';
    const pattern = colonIdx !== -1 ? entry.slice(colonIdx + 1).trim() : entry.trim();

    const tokens = [];
    let i = 0;
    while (i < pattern.length) {
      const ch = pattern[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '=') {
        i++;
        let val = '';
        while (i < pattern.length && !/[.01lhLHpPnNxzXZ=\s]/.test(pattern[i])) {
          val += pattern[i++];
        }
        tokens.push({ kind: 'bus', label: val || 'DATA', fresh: true });
      } else if (ch === '.') {
        const prev = tokens.length > 0 ? tokens[tokens.length - 1] : { kind: '0', label: '' };
        tokens.push({ ...prev, fresh: false });
        i++;
      } else {
        tokens.push({ kind: ch, label: '', fresh: true });
        i++;
      }
    }

    if (tokens.length > maxCycles) maxCycles = tokens.length;
    signals.push({ name, tokens });
  }

  return { signals, maxCycles };
}

export function renderWaveformItem(rc, ctx, item, font, baseSize, stroke, seed = 601) {
  const { origin, signals, maxCycles, stepW = 34, rowH = 26, rowGap = 18 } = item;
  const labelGutter = 58;
  const startX = origin.x - (maxCycles * stepW) * 0.5 + labelGutter * 0.35;
  const totalH = signals.length * (rowH + rowGap);
  const startY = origin.y - totalH * 0.5;
  const slew = Math.min(5, stepW * 0.14);

  for (let c = 0; c <= maxCycles; c++) {
    const gx = startX + c * stepW;
    drawPointChain(
      rc,
      ctx,
      [
        { x: gx, y: startY - 8 },
        { x: gx, y: startY + totalH - rowGap + 8 },
      ],
      { seed: seed + c * 3, stroke: stroke + '35', strokeWidth: 0.85, dashed: [4, 4] }
    );
    if (c < maxCycles) {
      drawDiagramText(ctx, `T${c}`, gx + stepW * 0.5, startY - 12, {
        font,
        size: baseSize - 4,
        color: stroke,
        align: 'center',
        baseline: 'bottom',
        seed: seed + c * 3 + 1,
      });
    }
  }

  signals.forEach((sig, sIdx) => {
    const topY = startY + sIdx * (rowH + rowGap);
    const botY = topY + rowH;
    const midY = (topY + botY) * 0.5;
    let sSeed = seed + (sIdx + 1) * 47;

    drawDiagramText(ctx, sig.name, startX - 10, midY, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'right',
      baseline: 'middle',
      seed: sSeed++,
    });

    const pts = [];
    let prevY = null;

    for (let c = 0; c < sig.tokens.length; c++) {
      const tok = sig.tokens[c];
      const x0 = startX + c * stepW;
      const xMid = x0 + stepW * 0.5;
      const x1 = x0 + stepW;
      const k = tok.kind;

      if (k === 'p' || k === 'P' || k === 'n' || k === 'N') {
        const isPos = k === 'p' || k === 'P';
        const hasEdgeArrow = k === 'P' || k === 'N';
        const yFirst = isPos ? topY : botY;
        const ySecond = isPos ? botY : topY;

        pts.push({ x: x0, y: ySecond }, { x: x0, y: yFirst }, { x: xMid, y: yFirst }, { x: xMid, y: ySecond }, { x: x1, y: ySecond });
        prevY = ySecond;

        if (hasEdgeArrow) {
          drawArrowEndpoint(
            rc,
            ctx,
            { x: x0, y: midY },
            { x: 0, y: isPos ? -1 : 1 },
            { size: 6.5, stroke, seed: sSeed++ }
          );
        }
        continue;
      }

      if (k === 'bus' || k === 'x' || k === 'X') {
        if (pts.length >= 2) {
          drawPointChain(rc, ctx, pts, { seed: sSeed++, stroke, strokeWidth: 1.65 });
          pts.length = 0;
        }
        let endC = c;
        while (
          endC + 1 < sig.tokens.length &&
          sig.tokens[endC + 1].kind === k &&
          !sig.tokens[endC + 1].fresh
        ) {
          endC++;
        }
        const bx0 = startX + c * stepW;
        const bx1 = startX + (endC + 1) * stepW;
        const hex = [
          { x: bx0, y: midY },
          { x: bx0 + slew, y: topY },
          { x: bx1 - slew, y: topY },
          { x: bx1, y: midY },
          { x: bx1 - slew, y: botY },
          { x: bx0 + slew, y: botY },
        ];
        drawHatchedPolygon(rc, ctx, hex, {
          fill: k === 'bus' ? 'none' : 'hatch',
          hatchAngle: 45,
          hatchSpacing: 6,
          stroke,
          strokeWidth: 1.5,
          outline: true,
          seed: sSeed++,
        });
        if (k === 'bus' && tok.label) {
          drawDiagramText(ctx, tok.label, (bx0 + bx1) * 0.5, midY, {
            font,
            size: baseSize - 2,
            color: stroke,
            align: 'center',
            baseline: 'middle',
            seed: sSeed++,
          });
        }
        prevY = midY;
        c = endC;
        continue;
      }

      if (k === 'z' || k === 'Z') {
        if (pts.length >= 2) {
          drawPointChain(rc, ctx, pts, { seed: sSeed++, stroke, strokeWidth: 1.65 });
          pts.length = 0;
        }
        drawPointChain(rc, ctx, [{ x: x0, y: midY }, { x: x1, y: midY }], {
          seed: sSeed++,
          stroke,
          strokeWidth: 1.3,
          dashed: [4, 3],
        });
        prevY = midY;
        continue;
      }

      const targetY = k === '1' || k === 'H' || k === 'h' ? topY : botY;
      if (prevY === null) {
        pts.push({ x: x0, y: targetY }, { x: x1, y: targetY });
      } else if (Math.abs(prevY - targetY) > 1) {
        pts.push({ x: x0, y: prevY }, { x: x0 + slew, y: targetY }, { x: x1, y: targetY });
      } else {
        pts.push({ x: x1, y: targetY });
      }
      prevY = targetY;
    }

    if (pts.length >= 2) {
      drawPointChain(rc, ctx, pts, { seed: sSeed++, stroke, strokeWidth: 1.65 });
    }
  });
}

export function solveLinkedList({
  origin = { x: 0, y: 0 },
  valuesStr = '10, 20, 30, 40',
  doubly = false,
  circular = false,
  showNull = true,
  headLabel = 'head',
  pointersStr = '',
  cellH = 34,
  dataW = 44,
  ptrW = 22,
  gap = 38,
} = {}) {
  const values = String(valuesStr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const nodeW = doubly ? ptrW + dataW + ptrW : dataW + ptrW;
  const totalSpan = values.length * nodeW + Math.max(0, values.length - 1) * gap + (showNull && !circular ? 48 : 0);
  const startX = origin.x - totalSpan * 0.5;

  const nodes = values.map((val, idx) => {
    const xLeft = startX + idx * (nodeW + gap);
    return {
      idx,
      val,
      x: xLeft,
      y: origin.y - cellH * 0.5,
      w: nodeW,
      h: cellH,
      cx: xLeft + nodeW * 0.5,
      cy: origin.y,
    };
  });

  const externalPointers = [];
  if (headLabel && headLabel !== 'none' && nodes.length > 0) {
    externalPointers.push({ targetIdx: 0, label: headLabel });
  }
  if (pointersStr) {
    for (const part of String(pointersStr).split(',').map((s) => s.trim()).filter(Boolean)) {
      const [idxStr, lbl] = part.includes(':') ? part.split(':') : ['0', part];
      const idx = Number(idxStr);
      if (Number.isFinite(idx) && idx >= 0 && idx < nodes.length && lbl) {
        externalPointers.push({ targetIdx: idx, label: lbl.trim() });
      }
    }
  }

  return {
    origin,
    nodes,
    doubly,
    circular,
    showNull: showNull && !circular,
    dataW,
    ptrW,
    cellH,
    gap,
    externalPointers,
    totalWidth: totalSpan + 40,
    totalHeight: cellH + (circular ? 72 : 52),
  };
}

export function renderLinkedListItem(rc, ctx, ll, font, baseSize, stroke, seed = 701) {
  const { nodes, doubly, circular, showNull, dataW, ptrW, cellH, externalPointers } = ll;
  let sSeed = seed;

  nodes.forEach((n, idx) => {
    rRect(rc, ctx, n.x, n.y, n.w, n.h, { seed: sSeed++, stroke, strokeWidth: 1.6 });

    if (doubly) {
      rLine(rc, ctx, n.x + ptrW, n.y, n.x + ptrW, n.y + n.h, { seed: sSeed++, stroke, strokeWidth: 1.3 });
      rLine(rc, ctx, n.x + ptrW + dataW, n.y, n.x + ptrW + dataW, n.y + n.h, { seed: sSeed++, stroke, strokeWidth: 1.3 });
      drawDiagramText(ctx, n.val, n.x + ptrW + dataW * 0.5, n.cy, {
        font,
        size: baseSize,
        color: stroke,
        align: 'center',
        baseline: 'middle',
        seed: sSeed++,
      });

      const nextOrigin = { x: n.x + ptrW + dataW + ptrW * 0.5, y: n.cy - 5 };
      const prevOrigin = { x: n.x + ptrW * 0.5, y: n.cy + 5 };
      rCircle(rc, ctx, nextOrigin.x, nextOrigin.y, 2.2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });
      rCircle(rc, ctx, prevOrigin.x, prevOrigin.y, 2.2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });

      if (idx + 1 < nodes.length) {
        const nextNode = nodes[idx + 1];
        const nextTarget = { x: nextNode.x, y: nextOrigin.y };
        rLine(rc, ctx, nextOrigin.x, nextOrigin.y, nextTarget.x, nextTarget.y, { seed: sSeed++, stroke, strokeWidth: 1.5 });
        drawArrowEndpoint(rc, ctx, nextTarget, { x: 1, y: 0 }, { size: 8, stroke, seed: sSeed++ });

        const prevFrom = { x: nextNode.x + ptrW * 0.5, y: n.cy + 5 };
        const prevTarget = { x: n.x + n.w, y: n.cy + 5 };
        rLine(rc, ctx, prevFrom.x, prevFrom.y, prevTarget.x, prevTarget.y, { seed: sSeed++, stroke, strokeWidth: 1.5 });
        drawArrowEndpoint(rc, ctx, prevTarget, { x: -1, y: 0 }, { size: 8, stroke, seed: sSeed++ });
      }
    } else {
      rLine(rc, ctx, n.x + dataW, n.y, n.x + dataW, n.y + n.h, { seed: sSeed++, stroke, strokeWidth: 1.3 });
      drawDiagramText(ctx, n.val, n.x + dataW * 0.5, n.cy, {
        font,
        size: baseSize,
        color: stroke,
        align: 'center',
        baseline: 'middle',
        seed: sSeed++,
      });

      const ptrDot = { x: n.x + dataW + ptrW * 0.5, y: n.cy };
      rCircle(rc, ctx, ptrDot.x, ptrDot.y, 2.5, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });

      if (idx + 1 < nodes.length) {
        const target = { x: nodes[idx + 1].x, y: n.cy };
        rLine(rc, ctx, ptrDot.x, ptrDot.y, target.x, target.y, { seed: sSeed++, stroke, strokeWidth: 1.5 });
        drawArrowEndpoint(rc, ctx, target, { x: 1, y: 0 }, { size: 8.5, stroke, seed: sSeed++ });
      } else if (showNull) {
        const nullX = n.x + n.w + 28;
        rLine(rc, ctx, ptrDot.x, ptrDot.y, nullX, n.cy, { seed: sSeed++, stroke, strokeWidth: 1.5 });
        drawArrowEndpoint(rc, ctx, { x: nullX, y: n.cy }, { x: 1, y: 0 }, { size: 8, stroke, seed: sSeed++ });
        drawDiagramText(ctx, 'NULL', nullX + 6, n.cy, {
          font,
          size: baseSize - 2,
          color: stroke,
          align: 'left',
          baseline: 'middle',
          seed: sSeed++,
        });
      } else if (circular && nodes.length >= 2) {
        const first = nodes[0];
        const loopY = n.y + cellH + 22;
        const chain = [
          ptrDot,
          { x: n.x + n.w + 18, y: n.cy },
          { x: n.x + n.w + 18, y: loopY },
          { x: first.x + dataW * 0.5, y: loopY },
          { x: first.x + dataW * 0.5, y: first.y + cellH },
        ];
        drawPointChain(rc, ctx, chain, { seed: sSeed++, stroke, strokeWidth: 1.5 });
        drawArrowEndpoint(rc, ctx, chain[chain.length - 1], { x: 0, y: -1 }, { size: 8.5, stroke, seed: sSeed++ });
      }
    }
  });

  const offsetMap = new Map();
  for (const ep of externalPointers) {
    const targetNode = nodes[ep.targetIdx];
    if (!targetNode) continue;
    const count = offsetMap.get(ep.targetIdx) || 0;
    offsetMap.set(ep.targetIdx, count + 1);
    const xShift = (count - 0.2) * 18;
    const tip = { x: targetNode.x + dataW * 0.5 + xShift, y: targetNode.y - 3 };
    const tail = { x: tip.x, y: targetNode.y - 25 };
    rLine(rc, ctx, tail.x, tail.y, tip.x, tip.y, { seed: sSeed++, stroke, strokeWidth: 1.5 });
    drawArrowEndpoint(rc, ctx, tip, { x: 0, y: 1 }, { size: 7.5, stroke, seed: sSeed++ });
    drawDiagramText(ctx, ep.label, tail.x, tail.y - 4, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'bottom',
      seed: sSeed++,
    });
  }
}

export function solveMemoryFrame({
  id = 'mem0',
  origin = { x: 0, y: 0 },
  title = 'Stack Frame',
  fieldsStr = 'x: 42, ptr: ->heap0.0',
  w = 135,
  rowH = 26,
} = {}) {
  const rawFields = normalizeArrowText(fieldsStr)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const headerH = title ? 26 : 0;
  const totalH = headerH + rawFields.length * rowH;
  const topY = origin.y - totalH * 0.5;
  const leftX = origin.x - w * 0.5;

  const rows = [];
  const pointerLinks = [];

  rawFields.forEach((entry, idx) => {
    const colonIdx = entry.indexOf(':');
    const key = colonIdx !== -1 ? entry.slice(0, colonIdx).trim() : String(idx);
    let val = colonIdx !== -1 ? entry.slice(colonIdx + 1).trim() : entry.trim();

    const ry = topY + headerH + idx * rowH;
    const cy = ry + rowH * 0.5;

    if (val.startsWith('->')) {
      const targetRef = val.slice(2).trim();
      val = '•';
      pointerLinks.push({
        fromPt: { x: leftX + w * 0.78, y: cy },
        targetRef,
      });
    }

    rows.push({
      idx,
      key,
      val,
      y: ry,
      cy,
      leftAnchor: { x: leftX, y: cy },
      rightAnchor: { x: leftX + w, y: cy },
    });
  });

  return {
    id,
    origin,
    leftX,
    topY,
    w,
    rowH,
    headerH,
    totalH,
    title,
    rows,
    pointerLinks,
  };
}

export function renderMemoryFrameItem(rc, ctx, mf, font, baseSize, stroke, seed = 801) {
  const { leftX, topY, w, rowH, headerH, totalH, title, rows } = mf;
  let sSeed = seed;

  rRect(rc, ctx, leftX, topY, w, totalH, { seed: sSeed++, stroke, strokeWidth: 1.7 });

  if (title) {
    rLine(rc, ctx, leftX, topY + headerH, leftX + w, topY + headerH, {
      seed: sSeed++,
      stroke,
      strokeWidth: 1.5,
    });
    drawDiagramText(ctx, title, leftX + w * 0.5, topY + headerH * 0.5, {
      font,
      size: baseSize - 1,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  const splitX = leftX + w * 0.52;
  rLine(rc, ctx, splitX, topY + headerH, splitX, topY + totalH, {
    seed: sSeed++,
    stroke,
    strokeWidth: 1.2,
  });

  rows.forEach((r, idx) => {
    if (idx > 0) {
      rLine(rc, ctx, leftX, r.y, leftX + w, r.y, { seed: sSeed++, stroke, strokeWidth: 1.1 });
    }
    drawDiagramText(ctx, r.key, leftX + (w * 0.52) * 0.5, r.cy, {
      font,
      size: baseSize - 2,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
    drawDiagramText(ctx, r.val, splitX + (w * 0.48) * 0.5, r.cy, {
      font,
      size: baseSize - 2,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  });
}

export function solveBTree({
  origin = { x: 0, y: 0 },
  edgesSpec = '20|40 -> 5|10, 20|40 -> 25|35, 20|40 -> 50|60',
  slotW = 34,
  slotH = 30,
  levelGap = 68,
  siblingGap = 28,
} = {}) {
  const parts = normalizeArrowText(edgesSpec)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nodesMap = new Map();
  const childrenMap = new Map();
  const inDeg = new Map();

  const ensureBNode = (raw) => {
    const clean = raw.trim();
    if (!clean) return null;
    if (!nodesMap.has(clean)) {
      const keys = clean.split('|').map((k) => k.trim());
      nodesMap.set(clean, {
        id: clean,
        keys,
        w: Math.max(1, keys.length) * slotW,
        h: slotH,
        x: 0,
        y: 0,
      });
      childrenMap.set(clean, []);
      inDeg.set(clean, 0);
    }
    return clean;
  };

  for (const p of parts) {
    if (p.includes('->')) {
      const [uRaw, vRaw] = p.split('->');
      const u = ensureBNode(uRaw);
      const v = ensureBNode(vRaw);
      if (u && v) {
        childrenMap.get(u).push(v);
        inDeg.set(v, (inDeg.get(v) || 0) + 1);
      }
    } else {
      ensureBNode(p);
    }
  }

  const allIds = [...nodesMap.keys()];
  if (allIds.length === 0) return { nodes: [], links: [], width: 120, height: 80 };
  const root = allIds.find((id) => (inDeg.get(id) || 0) === 0) || allIds[0];

  const spanMap = new Map();
  const visited = new Set();
  function measure(u) {
    if (visited.has(u)) return nodesMap.get(u).w;
    visited.add(u);
    const kids = childrenMap.get(u) || [];
    const ownW = nodesMap.get(u).w;
    if (kids.length === 0) {
      spanMap.set(u, ownW);
      return ownW;
    }
    const kidTotal = kids.reduce((acc, k, i) => acc + measure(k) + (i > 0 ? siblingGap : 0), 0);
    const span = Math.max(ownW, kidTotal);
    spanMap.set(u, span);
    return span;
  }
  measure(root);

  const visitedPos = new Set();
  function place(u, cx, depth) {
    if (visitedPos.has(u)) return;
    visitedPos.add(u);
    const node = nodesMap.get(u);
    node.x = origin.x + cx;
    node.y = origin.y + depth * levelGap;

    const kids = childrenMap.get(u) || [];
    if (kids.length === 0) return;
    const total = kids.reduce((acc, k, i) => acc + (spanMap.get(k) || 60) + (i > 0 ? siblingGap : 0), 0);
    let cur = cx - total * 0.5;
    for (const k of kids) {
      const s = spanMap.get(k) || 60;
      place(k, cur + s * 0.5, depth + 1);
      cur += s + siblingGap;
    }
  }
  place(root, 0, 0);

  const links = [];
  for (const [uId, kids] of childrenMap.entries()) {
    const parent = nodesMap.get(uId);
    const pLeft = parent.x - parent.w * 0.5;
    kids.forEach((vId, idx) => {
      const child = nodesMap.get(vId);
      const slotOffset = Math.min(parent.keys.length, idx) * slotW;
      links.push({
        from: { x: pLeft + slotOffset, y: parent.y + parent.h * 0.5 },
        to: { x: child.x, y: child.y - child.h * 0.5 },
      });
    });
  }

  return {
    nodes: [...nodesMap.values()],
    links,
    slotW,
    slotH,
  };
}

export function renderBTreeItem(rc, ctx, bt, font, baseSize, stroke, seed = 901) {
  const { nodes, links, slotW, slotH } = bt;
  let sSeed = seed;

  for (const n of nodes) {
    const left = n.x - n.w * 0.5;
    const top = n.y - n.h * 0.5;
    rRect(rc, ctx, left, top, n.w, n.h, { seed: sSeed++, stroke, strokeWidth: 1.6 });
    n.keys.forEach((k, i) => {
      if (i > 0) {
        rLine(rc, ctx, left + i * slotW, top, left + i * slotW, top + slotH, {
          seed: sSeed++,
          stroke,
          strokeWidth: 1.3,
        });
      }
      drawDiagramText(ctx, k, left + (i + 0.5) * slotW, n.y, {
        font,
        size: baseSize - 1,
        color: stroke,
        align: 'center',
        baseline: 'middle',
        seed: sSeed++,
      });
    });
  }

  for (const lk of links) {
    rCircle(rc, ctx, lk.from.x, lk.from.y, 2.2, { seed: sSeed++, stroke, fill: stroke, fillStyle: 'solid' });
    rLine(rc, ctx, lk.from.x, lk.from.y, lk.to.x, lk.to.y, { seed: sSeed++, stroke, strokeWidth: 1.4 });
    drawArrowEndpoint(rc, ctx, lk.to, Vec2.norm(Vec2.sub(lk.to, lk.from)), {
      size: 7.5,
      stroke,
      seed: sSeed++,
    });
  }
}

export function parsePipelineSpec(rowsStr) {
  const rawRows = String(rowsStr || '')
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let maxCols = 1;
  const rows = rawRows.map((r, idx) => {
    const colonIdx = r.indexOf(':');
    const instr = colonIdx !== -1 ? r.slice(0, colonIdx).trim() : `I${idx + 1}`;
    const stagesStr = colonIdx !== -1 ? r.slice(colonIdx + 1).trim() : r.trim();
    const stages = stagesStr.split(/[\s,]+/).filter(Boolean);
    if (stages.length > maxCols) maxCols = stages.length;
    return { instr, stages };
  });

  return { rows, maxCols };
}

export function renderPipelineItem(rc, ctx, item, font, baseSize, stroke, seed = 1001) {
  const { origin, rows, maxCols, cellW = 38, cellH = 26, rowGap = 8 } = item;
  const labelW = 92;
  const totalW = labelW + maxCols * cellW;
  const totalH = rows.length * (cellH + rowGap) + 22;
  const startX = origin.x - totalW * 0.5 + labelW;
  const startY = origin.y - totalH * 0.5 + 22;
  let sSeed = seed;

  for (let c = 0; c < maxCols; c++) {
    drawDiagramText(ctx, `C${c + 1}`, startX + (c + 0.5) * cellW, startY - 12, {
      font,
      size: baseSize - 3,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
  }

  rows.forEach((row, rIdx) => {
    const ry = startY + rIdx * (cellH + rowGap);
    drawDiagramText(ctx, row.instr, startX - 10, ry + cellH * 0.5, {
      font,
      size: baseSize - 2,
      color: stroke,
      align: 'right',
      baseline: 'middle',
      seed: sSeed++,
    });

    row.stages.forEach((st, cIdx) => {
      if (st === '_' || st === '.' || st === '-') return;
      const cx = startX + cIdx * cellW;
      const isStall = st.toUpperCase() === 'STALL' || st.toUpperCase() === 'BUBBLE' || st === '*';
      if (isStall) {
        const poly = [
          { x: cx + 2, y: ry + 2 },
          { x: cx + cellW - 2, y: ry + 2 },
          { x: cx + cellW - 2, y: ry + cellH - 2 },
          { x: cx + 2, y: ry + cellH - 2 },
        ];
        drawHatchedPolygon(rc, ctx, poly, {
          fill: 'hatch',
          hatchAngle: 45,
          hatchSpacing: 6,
          stroke,
          outline: true,
          seed: sSeed++,
        });
      } else {
        rRect(rc, ctx, cx + 2, ry + 2, cellW - 4, cellH - 4, {
          seed: sSeed++,
          stroke,
          strokeWidth: 1.4,
        });
      }
      drawDiagramText(ctx, st, cx + cellW * 0.5, ry + cellH * 0.5, {
        font,
        size: baseSize - 3,
        color: stroke,
        align: 'center',
        baseline: 'middle',
        seed: sSeed++,
      });
    });
  });
}

export function renderGanttItem(rc, ctx, item, font, baseSize, stroke, seed = 1101) {
  const { origin, tasks, totalW = 340, barH = 36 } = item;
  if (!tasks || tasks.length === 0) return;
  const minT = Math.min(...tasks.map((t) => t.start));
  const maxT = Math.max(...tasks.map((t) => t.end), minT + 1);
  const startX = origin.x - totalW * 0.5;
  const topY = origin.y - barH * 0.5;
  let sSeed = seed;

  const toX = (t) => startX + ((t - minT) / (maxT - minT)) * totalW;

  tasks.forEach((t, idx) => {
    const x0 = toX(t.start);
    const x1 = toX(t.end);
    const w = Math.max(18, x1 - x0);
    rRect(rc, ctx, x0, topY, w, barH, { seed: sSeed++, stroke, strokeWidth: 1.6 });
    drawDiagramText(ctx, t.label, x0 + w * 0.5, origin.y, {
      font,
      size: baseSize,
      color: stroke,
      align: 'center',
      baseline: 'middle',
      seed: sSeed++,
    });
    if (idx === 0) {
      drawDiagramText(ctx, String(t.start), x0, topY + barH + 12, {
        font,
        size: baseSize - 3,
        color: stroke,
        align: 'center',
        baseline: 'top',
        seed: sSeed++,
      });
    }
    drawDiagramText(ctx, String(t.end), x1, topY + barH + 12, {
      font,
      size: baseSize - 3,
      color: stroke,
      align: 'center',
      baseline: 'top',
      seed: sSeed++,
    });
  });
}

export function renderPacketHeaderItem(rc, ctx, item, font, baseSize, stroke, seed = 1201) {
  const { origin, bits = 32, fields, totalW = 340, rowH = 34 } = item;
  let totalBits = 0;
  for (const f of fields) totalBits += f.span;
  const numRows = Math.max(1, Math.ceil(totalBits / bits));
  const startX = origin.x - totalW * 0.5;
  const startY = origin.y - (numRows * rowH) * 0.5;
  let sSeed = seed;

  drawDiagramText(ctx, '0', startX + 4, startY - 12, {
    font,
    size: baseSize - 4,
    color: stroke,
    align: 'left',
    baseline: 'bottom',
    seed: sSeed++,
  });
  drawDiagramText(ctx, String(Math.floor(bits / 2) - 1), startX + totalW * 0.5 - 6, startY - 12, {
    font,
    size: baseSize - 4,
    color: stroke,
    align: 'right',
    baseline: 'bottom',
    seed: sSeed++,
  });
  drawDiagramText(ctx, String(bits - 1), startX + totalW - 4, startY - 12, {
    font,
    size: baseSize - 4,
    color: stroke,
    align: 'right',
    baseline: 'bottom',
    seed: sSeed++,
  });

  let bitCursor = 0;
  for (const f of fields) {
    let rem = f.span;
    while (rem > 0) {
      const rowIdx = Math.floor(bitCursor / bits);
      const colBit = bitCursor % bits;
      const take = Math.min(rem, bits - colBit);
      const fx = startX + (colBit / bits) * totalW;
      const fw = (take / bits) * totalW;
      const fy = startY + rowIdx * rowH;

      rRect(rc, ctx, fx, fy, fw, rowH, { seed: sSeed++, stroke, strokeWidth: 1.5 });
      drawDiagramText(ctx, `${f.name} (${f.span})`, fx + fw * 0.5, fy + rowH * 0.5, {
        font,
        size: baseSize - 3,
        color: stroke,
        align: 'center',
        baseline: 'middle',
        seed: sSeed++,
      });

      bitCursor += take;
      rem -= take;
    }
  }
}
