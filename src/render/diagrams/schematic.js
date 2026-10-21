/**
 * ScriptForge Universal Node-Port-Wire & Schematic Engine (Wave 1 - Universal Engine #3)
 * Renders:
 * 1. Sequential Flip-Flop Conversion Circuits (SR/JK/D/T with clock triangle & orthogonal feedback buses)
 * 2. Combinational Boolean Logic Gate Schematics (parsed from arbitrary `expr=...`)
 * 3. Finite State Automata (`DFA`/`NFA` with self-loops, curved transitions, double-ring accept states)
 * 4. Compact Binary / N-ary Trees & Linked-List Record Graphs (`[data|next]`)
 */

import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';
import {
    drawSharpArrowhead,
    drawArrowLine,
    drawSolderDot,
    drawOrthogonalWire,
    drawLogicGateSymbol,
    drawLabelOrMath
} from './primitives.js';

/**
 * 1. Renders a Sequential Flip-Flop Conversion Schematic (e.g. SR-to-T, SR-to-D, JK-to-T)
 * with authentic Manhattan orthogonal feedback routing above and below the flip-flop block.
 * Syntax: `[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]` or `[DIAGRAM: circuit | ff=SR | to=T]`
 */
export function renderFlipFlopSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const target = String(params.target || params.to || 'T').toUpperCase();
    const baseFF = String(params.ff || 'SR').toUpperCase();
    const cx = startX + 24;
    const cy = startY + 14;
    const wireOpts = { ...roughOpts, strokeWidth: 1.55 * (ink.widthScale || 1.0) };

    // Central Flip-Flop rectangular block
    const ffx = cx + 190;
    const ffy = cy + 28;
    const ffw = 96;
    const ffh = 112;

    rc.rectangle(ffx, ffy, ffw, ffh, {
        ...roughOpts,
        strokeWidth: 1.85 * (ink.widthScale || 1.0),
        seed: charCounterRef.count++
    });

    // Internal FF pin labels: S/J (top-left), CLK triangle (mid-left), R/K (bot-left), Q (top-right), \overline{Q} (bot-right)
    const pinTopName = baseFF[0] || 'S';
    const pinBotName = baseFF[1] || 'R';
    const sY = ffy + 26;
    const clkY = ffy + 56;
    const rY = ffy + 88;

    drawLabelOrMath(ctx, rc, pinTopName, ffx + 9, sY + 6, 20, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, pinBotName, ffx + 9, rY + 6, 20, charCounterRef, opts);

    // Clock triangle notch
    rc.linearPath([
        [ffx, clkY - 7],
        [ffx + 11, clkY],
        [ffx, clkY + 7]
    ], { ...roughOpts, seed: charCounterRef.count++ });

    drawLabelOrMath(ctx, rc, 'Q', ffx + ffw - 24, sY + 6, 20, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, '$\\overline{Q}$', ffx + ffw - 24, rY + 6, 20, charCounterRef, opts);

    // Output wires for Q and \overline{Q}
    const qOutX = ffx + ffw + 68;
    rc.line(ffx + ffw, sY, qOutX, sY, { ...wireOpts, seed: charCounterRef.count++ });
    rc.line(ffx + ffw, rY, qOutX, rY, { ...wireOpts, seed: charCounterRef.count++ });
    drawLabelOrMath(ctx, rc, '$Q_n$', qOutX + 8, sY + 6, 20, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, '$\\overline{Q_n}$', qOutX + 8, rY + 6, 20, charCounterRef, opts);

    if (target === 'D') {
        // SR-to-D conversion: D connects directly to S, and through a NOT inverter to R
        drawLabelOrMath(ctx, rc, 'D', cx + 18, sY + 6, 21, charCounterRef, opts);
        rc.line(cx + 42, sY, ffx, sY, { ...wireOpts, seed: charCounterRef.count++ });

        const branchX = cx + 74;
        drawSolderDot(rc, branchX, sY, 4.5, wireOpts);
        rc.line(branchX, sY, branchX, rY - 26, { ...wireOpts, seed: charCounterRef.count++ });

        // Vertical NOT gate on branch
        rc.linearPath([
            [branchX - 11, rY - 26],
            [branchX + 11, rY - 26],
            [branchX, rY - 8],
            [branchX - 11, rY - 26]
        ], { ...roughOpts, seed: charCounterRef.count++ });
        rc.circle(branchX, rY - 4, 6.5, { ...roughOpts, seed: charCounterRef.count++ });
        rc.line(branchX, rY, ffx, rY, { ...wireOpts, seed: charCounterRef.count++ });

        // Clock line
        drawLabelOrMath(ctx, rc, 'CLK', cx + 10, clkY + 6, 18, charCounterRef, opts);
        rc.line(cx + 48, clkY, ffx, clkY, { ...wireOpts, seed: charCounterRef.count++ });
        return ffh + 52;
    }

    // Default / SR-to-T conversion: Two input AND gates with orthogonal feedback loops from Q and \overline{Q}
    const topGate = drawLogicGateSymbol(rc, 'and', cx + 82, sY - 19, 44, 38, {
        ...roughOpts, strokeWidth: 1.75, seed: charCounterRef.count++
    });
    const botGate = drawLogicGateSymbol(rc, 'and', cx + 82, rY - 19, 44, 38, {
        ...roughOpts, strokeWidth: 1.75, seed: charCounterRef.count++
    });

    // Gate outputs to S and R pins with intermediate Boolean labels
    rc.line(topGate.out[0], topGate.out[1], ffx, sY, { ...wireOpts, seed: charCounterRef.count++ });
    rc.line(botGate.out[0], botGate.out[1], ffx, rY, { ...wireOpts, seed: charCounterRef.count++ });
    drawLabelOrMath(ctx, rc, '$T\\overline{Q_n}$', topGate.out[0] + 6, sY - 6, 16, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, '$TQ_n$', botGate.out[0] + 8, rY - 6, 16, charCounterRef, opts);

    // Shared T input bus feeding both AND gates
    const tBusX = cx + 48;
    drawLabelOrMath(ctx, rc, target, cx + 16, topGate.inBot[1] + 6, 21, charCounterRef, opts);
    rc.line(cx + 34, topGate.inBot[1], topGate.inBot[0], topGate.inBot[1], { ...wireOpts, seed: charCounterRef.count++ });
    drawSolderDot(rc, tBusX, topGate.inBot[1], 4.5, wireOpts);
    drawOrthogonalWire(ctx, rc, [
        [tBusX, topGate.inBot[1]],
        [tBusX, botGate.inTop[1]],
        [botGate.inTop[0], botGate.inTop[1]]
    ], false, { ...wireOpts, seed: charCounterRef.count++ });

    // Clock input line
    drawLabelOrMath(ctx, rc, 'CLK', cx + 4, clkY + 6, 18, charCounterRef, opts);
    rc.line(cx + 42, clkY, ffx, clkY, { ...wireOpts, seed: charCounterRef.count++ });

    // Orthogonal Feedback Wire 1: \overline{Q} taps off and routes OVER top of FF into top AND gate
    const tapQbX = ffx + ffw + 30;
    const topChannelY = cy + 6;
    drawSolderDot(rc, tapQbX, rY, 4.5, wireOpts);
    drawOrthogonalWire(ctx, rc, [
        [tapQbX, rY],
        [tapQbX, topChannelY],
        [cx + 62, topChannelY],
        [cx + 62, topGate.inTop[1]],
        [topGate.inTop[0], topGate.inTop[1]]
    ], false, { ...wireOpts, seed: charCounterRef.count++ });

    // Orthogonal Feedback Wire 2: Q taps off and routes UNDER bottom of FF into bottom AND gate
    const tapQX = ffx + ffw + 50;
    const botChannelY = ffy + ffh + 20;
    drawSolderDot(rc, tapQX, sY, 4.5, wireOpts);
    drawOrthogonalWire(ctx, rc, [
        [tapQX, sY],
        [tapQX, botChannelY],
        [cx + 62, botChannelY],
        [cx + 62, botGate.inBot[1]],
        [botGate.inBot[0], botGate.inBot[1]]
    ], false, { ...wireOpts, seed: charCounterRef.count++ });

    return ffh + 62;
}

/**
 * 2. Renders a Combinational Logic Gate Schematic from any two-level Boolean expression.
 * Syntax: `[DIAGRAM: circuit | expr=(B' AND D') OR (B AND D)]`
 */
export function renderCombinationalCircuit(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    if (params.ff || params.type === 'flipflop') {
        return renderFlipFlopSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }

    const expr = params.expr || "(B' AND D') OR (B AND D)";
    const cx = startX + 28;
    const cy = startY + 16;
    const wireOpts = { ...roughOpts, strokeWidth: 1.55 * (ink.widthScale || 1.0) };

    // Parse product/clause groups from expression
    const topOp = /\bXOR\b/i.test(expr) ? 'xor' : (/\bNOR\b/i.test(expr) ? 'nor' : (/\bNAND\b/i.test(expr) ? 'nand' : 'or'));
    const groupMatches = expr.match(/\([^)]+\)/g);
    const groups = groupMatches && groupMatches.length >= 2
        ? groupMatches.slice(0, 3).map(g => g.replace(/[()]/g, '').trim())
        : ["B' AND D'", "B AND D"];

    const inputs1 = groups[0].split(/\s+(?:AND|OR|NAND|NOR|XOR|\*|\+)\s+/i).map(s => s.trim());
    const inputs2 = (groups[1] || 'C AND D').split(/\s+(?:AND|OR|NAND|NOR|XOR|\*|\+)\s+/i).map(s => s.trim());
    const gate1Type = /\bOR\b/i.test(groups[0]) ? 'or' : (/\bNAND\b/i.test(groups[0]) ? 'nand' : 'and');
    const gate2Type = /\bOR\b/i.test(groups[1] || '') ? 'or' : (/\bNAND\b/i.test(groups[1] || '') ? 'nand' : 'and');

    const in1A = inputs1[0] || "B'";
    const in1B = inputs1[1] || "D'";
    const in2A = inputs2[0] || "B";
    const in2B = inputs2[1] || "D";

    drawLabelOrMath(ctx, rc, in1A, cx, cy + 28, 21, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, in1B, cx, cy + 54, 21, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, in2A, cx + 2, cy + 100, 21, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, in2B, cx + 2, cy + 126, 21, charCounterRef, opts);

    const g1 = drawLogicGateSymbol(rc, gate1Type, cx + 98, cy + 14, 50, 44, {
        ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++
    });
    const g2 = drawLogicGateSymbol(rc, gate2Type, cx + 98, cy + 86, 50, 44, {
        ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++
    });

    rc.line(cx + 30, g1.inTop[1], g1.inTop[0], g1.inTop[1], { ...wireOpts, seed: charCounterRef.count++ });
    rc.line(cx + 30, g1.inBot[1], g1.inBot[0], g1.inBot[1], { ...wireOpts, seed: charCounterRef.count++ });
    rc.line(cx + 30, g2.inTop[1], g2.inTop[0], g2.inTop[1], { ...wireOpts, seed: charCounterRef.count++ });
    rc.line(cx + 30, g2.inBot[1], g2.inBot[0], g2.inBot[1], { ...wireOpts, seed: charCounterRef.count++ });

    const term1Lbl = `${in1A}${in1B}`;
    const term2Lbl = `${in2A}${in2B}`;
    drawLabelOrMath(ctx, rc, term1Lbl, g1.out[0] + 6, g1.out[1] - 6, 16, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, term2Lbl, g2.out[0] + 6, g2.out[1] - 6, 16, charCounterRef, opts);

    const outGate = drawLogicGateSymbol(rc, topOp, cx + 236, cy + 48, 56, 48, {
        ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++
    });

    drawOrthogonalWire(ctx, rc, [
        g1.out,
        [cx + 206, g1.out[1]],
        [cx + 206, outGate.inTop[1]],
        outGate.inTop
    ], false, { ...wireOpts, seed: charCounterRef.count++ });

    drawOrthogonalWire(ctx, rc, [
        g2.out,
        [cx + 206, g2.out[1]],
        [cx + 206, outGate.inBot[1]],
        outGate.inBot
    ], false, { ...wireOpts, seed: charCounterRef.count++ });

    rc.line(outGate.out[0], outGate.out[1], outGate.out[0] + 44, outGate.out[1], { ...wireOpts, seed: charCounterRef.count++ });
    rc.circle(outGate.out[0] + 48, outGate.out[1], 7, { ...roughOpts, seed: charCounterRef.count++ });

    const outLabel = params.out || `F = ${term1Lbl} + ${term2Lbl}`;
    drawLabelOrMath(ctx, rc, outLabel, outGate.out[0] + 60, outGate.out[1] + 6, 20, charCounterRef, opts);

    return 154;
}

/**
 * 3. Renders a Finite Automaton (DFA / NFA) State Transition Graph.
 * Supports custom `states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0`
 */
export function renderAutomatonSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const states = (params.states || 'q0,q1,q2').split(',').map(s => s.trim()).filter(Boolean);
    const accepts = new Set((params.accept || states[states.length - 1] || 'q2').split(',').map(s => s.trim()));
    const n = Math.min(5, Math.max(1, states.length));

    const cy = startY + 72;
    const r = 48;
    const rad = r / 2;
    const spacing = Math.min(155, Math.floor((availWidth - 130) / Math.max(1, n - 1)));
    const stateCoords = {};

    // Start arrow into first state
    const firstX = startX + 90;
    drawArrowLine(ctx, rc, firstX - 66, cy, firstX - rad - 2, cy, 9.5, { ...roughOpts, seed: charCounterRef.count++ });
    drawHandwrittenWord(ctx, 'start', firstX - 68, cy - 8, 17, charCounterRef, opts);

    // Draw state circles
    states.slice(0, n).forEach((st, idx) => {
        const sx = firstX + idx * spacing;
        stateCoords[st] = { x: sx, y: cy, idx };
        rc.circle(sx, cy, r, { ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++ });
        if (accepts.has(st)) {
            rc.circle(sx, cy, r - 10, { ...roughOpts, strokeWidth: 1.45 * (ink.widthScale || 1.0), seed: charCounterRef.count++ });
        }
        drawLabelOrMath(ctx, rc, st, sx - 11, cy + 6, 21, charCounterRef, opts);
    });

    const rawEdges = params.edges || params.transitions || 'q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0';
    const edgeList = rawEdges.split(/[,;]/).map(s => s.trim()).filter(Boolean);

    edgeList.forEach(edgeStr => {
        const [pair, lbl = ''] = edgeStr.split(':').map(s => s.trim());
        const [u, v] = pair.split('->').map(s => s.trim());
        const src = stateCoords[u];
        const dst = stateCoords[v];
        if (!src || !dst) return;

        if (u === v) {
            // Self-loop above state
            rc.curve([
                [src.x - 10, cy - rad + 2],
                [src.x - 17, cy - rad - 25],
                [src.x, cy - rad - 33],
                [src.x + 17, cy - rad - 25],
                [src.x + 10, cy - rad + 2]
            ], { ...roughOpts, seed: charCounterRef.count++ });
            drawSharpArrowhead(ctx, rc, src.x + 10, cy - rad + 2, Math.PI * 0.62, 8.5, { ...roughOpts, seed: charCounterRef.count++ });
            if (lbl) drawLabelOrMath(ctx, rc, lbl, src.x - 4, cy - rad - 37, 19, charCounterRef, opts);
        } else if (dst.idx === src.idx + 1) {
            // Direct forward transition
            drawArrowLine(ctx, rc, src.x + rad + 2, cy, dst.x - rad - 3, cy, 9.5, { ...roughOpts, seed: charCounterRef.count++ });
            if (lbl) drawLabelOrMath(ctx, rc, lbl, (src.x + dst.x) / 2 - 4, cy - 9, 19, charCounterRef, opts);
        } else {
            // Curved return or skip arc underneath
            const midX = (src.x + dst.x) / 2;
            const arcDepth = 34 + Math.abs(dst.idx - src.idx) * 6;
            rc.curve([
                [src.x - 10, cy + rad - 1],
                [midX, cy + rad + arcDepth],
                [dst.x + 10, cy + rad - 1]
            ], { ...roughOpts, seed: charCounterRef.count++ });
            drawSharpArrowhead(ctx, rc, dst.x + 10, cy + rad - 1, -Math.PI * 0.72, 8.5, { ...roughOpts, seed: charCounterRef.count++ });
            if (lbl) drawLabelOrMath(ctx, rc, lbl, midX - 4, cy + rad + arcDepth - 6, 19, charCounterRef, opts);
        }
    });

    return 156;
}

/**
 * 4. Renders a Compact Binary / N-ary Tree OR Linked List Record Graph.
 * Syntax:
 * - Tree: `[DIAGRAM: tree | edges=50->30,50->70,30->20,30->40,70->60,70->80]`
 * - Linked List: `[DIAGRAM: list | nodes=10,24,42,NULL]`
 */
export function renderTreeOrListSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    // Linked list mode (`[data|next] -> [data|next]`)
    if (params.list || params.type === 'list' || (params.nodes && !params.edges)) {
        const items = (params.list || params.nodes || '10,24,42,NULL').split(',').map(s => s.trim()).filter(Boolean);
        let curX = startX + 22;
        const boxY = startY + 18;
        const boxH = 34;

        items.forEach((val, idx) => {
            if (val.toUpperCase() === 'NULL' || val === '∅') {
                drawLabelOrMath(ctx, rc, 'NULL', curX + 4, boxY + 24, 19, charCounterRef, opts);
                return;
            }
            const dataW = 44;
            const ptrW = 22;
            rc.rectangle(curX, boxY, dataW + ptrW, boxH, { ...roughOpts, strokeWidth: 1.7, seed: charCounterRef.count++ });
            rc.line(curX + dataW, boxY, curX + dataW, boxY + boxH, { ...roughOpts, seed: charCounterRef.count++ });
            drawLabelOrMath(ctx, rc, val, curX + 10, boxY + 24, 19, charCounterRef, opts);
            drawSolderDot(rc, curX + dataW + ptrW / 2, boxY + boxH / 2, 3.8, roughOpts);

            if (idx < items.length - 1) {
                drawArrowLine(ctx, rc, curX + dataW + ptrW / 2, boxY + boxH / 2, curX + dataW + ptrW + 28, boxY + boxH / 2, 8, {
                    ...roughOpts, seed: charCounterRef.count++
                });
            }
            curX += dataW + ptrW + 30;
        });

        return boxH + 34;
    }

    // Compact Tree Layout from `edges=u->v,u->w`
    const rawEdges = (params.edges || '50->30,50->70,30->20,30->40,70->60,70->80')
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(Boolean);

    const adj = new Map();
    const inDeg = new Map();
    const edgeLabels = new Map();

    rawEdges.forEach(eStr => {
        const [pair, lbl = ''] = eStr.split(':').map(s => s.trim());
        const [u, v] = pair.split('->').map(s => s.trim());
        if (!u || !v) return;
        if (!adj.has(u)) adj.set(u, []);
        if (!adj.has(v)) adj.set(v, []);
        adj.get(u).push(v);
        inDeg.set(v, (inDeg.get(v) || 0) + 1);
        if (!inDeg.has(u)) inDeg.set(u, 0);
        if (lbl) edgeLabels.set(`${u}->${v}`, lbl);
    });

    let root = [...inDeg.entries()].find(([, d]) => d === 0)?.[0] || adj.keys().next().value || 'R';
    const levels = [];
    const visited = new Set([root]);
    let queue = [root];

    while (queue.length > 0 && levels.length < 5) {
        levels.push(queue);
        const nextQ = [];
        for (const u of queue) {
            for (const v of (adj.get(u) || [])) {
                if (!visited.has(v)) {
                    visited.add(v);
                    nextQ.push(v);
                }
            }
        }
        queue = nextQ;
    }

    const levelGapY = 52;
    const nodeRad = 18;
    const maxW = Math.min(availWidth - 40, 480);
    const pos = new Map();

    levels.forEach((lvlNodes, depth) => {
        const y = startY + 26 + depth * levelGapY;
        const stepX = maxW / (lvlNodes.length + 1);
        lvlNodes.forEach((nodeId, idx) => {
            pos.set(nodeId, { x: startX + 20 + stepX * (idx + 1), y });
        });
    });

    // Draw tree edges first
    for (const [u, children] of adj.entries()) {
        const p1 = pos.get(u);
        if (!p1) continue;
        for (const v of children) {
            const p2 = pos.get(v);
            if (!p2) continue;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const sx = p1.x + nodeRad * Math.cos(angle);
            const sy = p1.y + nodeRad * Math.sin(angle);
            const ex = p2.x - nodeRad * Math.cos(angle);
            const ey = p2.y - nodeRad * Math.sin(angle);
            rc.line(sx, sy, ex, ey, { ...roughOpts, seed: charCounterRef.count++ });

            const elbl = edgeLabels.get(`${u}->${v}`);
            if (elbl) {
                drawLabelOrMath(ctx, rc, elbl, (sx + ex) / 2 - 6, (sy + ey) / 2 - 4, 16, charCounterRef, opts);
            }
        }
    }

    // Draw tree node circles and labels
    for (const [nodeId, pt] of pos.entries()) {
        rc.circle(pt.x, pt.y, nodeRad * 2, {
            ...roughOpts, strokeWidth: 1.75 * (ink.widthScale || 1.0), seed: charCounterRef.count++
        });
        const estW = String(nodeId).length * 9;
        drawLabelOrMath(ctx, rc, String(nodeId), pt.x - estW / 2, pt.y + 6, 18, charCounterRef, opts);
    }

    return levels.length * levelGapY + 22;
}

/**
 * Main Universal Dispatcher for `schematic.js`
 */
export function renderUniversalSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const subType = String(params.type || params._diagType || 'circuit').toLowerCase();

    if (subType === 'dfa' || subType === 'nfa' || subType === 'fsm' || params.states) {
        return renderAutomatonSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (subType === 'tree' || subType === 'list' || params.list || (params.edges && !params.states)) {
        return renderTreeOrListSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (subType === 'flipflop' || params.ff || params.target || params.to) {
        return renderFlipFlopSchematic(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    return renderCombinationalCircuit(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
}

export default renderUniversalSchematic;
