/**
 * ScriptForge Shared Hand-Drawn Diagram Primitives (Wave 1)
 * Provides reusable geometric & text/math building blocks for all 5 Universal Diagram Engines.
 */

import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';
import { parseLatexToAST } from '../math/parser.js';
import { measureMathAST } from '../math/measure.js';
import { renderMathAST } from '../math/renderer.js';

/**
 * Draws a crisp hand-drawn rounded rectangle loop (for K-Map Prime Implicant groups & nodes)
 */
export function drawHandRoundedRect(rc, x, y, w, h, r, roughOpts = {}) {
    const rad = Math.min(r, w / 2, h / 2);
    const pts = [
        [x + rad, y],
        [x + w - rad, y],
        [x + w, y + rad],
        [x + w, y + h - rad],
        [x + w - rad, y + h],
        [x + r, y + h],
        [x, y + h - rad],
        [x, y + rad],
        [x + rad, y]
    ];
    rc.curve(pts, roughOpts);
}

/**
 * Draws a sharp hand-inked arrowhead at `(tipX, tipY)` pointing along angle `angleRad`
 */
export function drawSharpArrowhead(ctx, rc, tipX, tipY, angleRad, size = 9, roughOpts = {}) {
    const spread = 0.46;
    const x1 = tipX - size * Math.cos(angleRad - spread);
    const y1 = tipY - size * Math.sin(angleRad - spread);
    const x2 = tipX - size * Math.cos(angleRad + spread);
    const y2 = tipY - size * Math.sin(angleRad + spread);
    rc.linearPath([[x1, y1], [tipX, tipY], [x2, y2]], {
        ...roughOpts,
        roughness: (roughOpts.roughness ?? 0.5) * 0.45
    });
}

/**
 * Draws a line with an arrowhead at the destination `(x2, y2)`
 */
export function drawArrowLine(ctx, rc, x1, y1, x2, y2, arrowSize = 9, roughOpts = {}) {
    rc.line(x1, y1, x2, y2, roughOpts);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    drawSharpArrowhead(ctx, rc, x2, y2, angle, arrowSize, roughOpts);
}

/**
 * Draws a filled solder junction dot at a wire split `(x, y)`
 */
export function drawSolderDot(rc, x, y, radius = 4.5, roughOpts = {}) {
    rc.circle(x, y, radius, {
        ...roughOpts,
        fill: roughOpts.stroke || '#1b3b8c',
        fillStyle: 'solid',
        roughness: 0.25
    });
}

/**
 * Draws a hand-sketched curly brace (horizontal or vertical) for bitfield / array spans
 */
export function drawCurlyBrace(rc, x1, y1, x2, y2, dir = 'down', roughOpts = {}) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (dir === 'down' || dir === 'up') {
        const s = dir === 'down' ? 1 : -1;
        rc.curve([
            [x1, y1],
            [x1 + 4, y1 + s * 5],
            [mx - 5, y1 + s * 5],
            [mx, y1 + s * 10],
            [mx + 5, y1 + s * 5],
            [x2 - 4, y2 + s * 5],
            [x2, y2]
        ], roughOpts);
    } else {
        const s = dir === 'right' ? 1 : -1;
        rc.curve([
            [x1, y1],
            [x1 + s * 5, y1 + 4],
            [x1 + s * 5, my - 5],
            [x1 + s * 10, my],
            [x1 + s * 5, my + 5],
            [x2 + s * 5, y2 - 4],
            [x2, y2]
        ], roughOpts);
    }
}

/**
 * Draws a Manhattan orthogonal polyline path through an array of `[x, y]` waypoints
 */
export function drawOrthogonalWire(ctx, rc, waypoints, withArrow = false, roughOpts = {}) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return;
    rc.linearPath(waypoints, roughOpts);
    if (withArrow) {
        const last = waypoints[waypoints.length - 1];
        const prev = waypoints[waypoints.length - 2];
        const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
        drawSharpArrowhead(ctx, rc, last[0], last[1], angle, 8.5, roughOpts);
    }
}

/**
 * Draws an IEEE-standard logic gate (`and`, `nand`, `or`, `nor`, `xor`, `xnor`, `not`, `buffer`)
 * inside bounding box `(x, y, w, h)` and returns `{ inPorts, outPort }`.
 */
export function drawLogicGateSymbol(rc, gateType, x, y, w, h, roughOpts = {}) {
    const type = String(gateType || 'and').toLowerCase();
    const hasBubble = type === 'nand' || type === 'nor' || type === 'xnor' || type === 'not';
    const bodyW = hasBubble ? w - 8 : w;
    const seed = roughOpts.seed || 101;

    if (type === 'not' || type === 'buffer') {
        rc.linearPath([
            [x, y + 4],
            [x + bodyW, y + h / 2],
            [x, y + h - 4],
            [x, y + 4]
        ], { ...roughOpts, seed });
    } else if (type === 'and' || type === 'nand') {
        rc.linearPath([
            [x + bodyW * 0.52, y],
            [x, y],
            [x, y + h],
            [x + bodyW * 0.52, y + h]
        ], { ...roughOpts, seed });
        rc.curve([
            [x + bodyW * 0.50, y],
            [x + bodyW * 0.88, y + h * 0.16],
            [x + bodyW, y + h * 0.50],
            [x + bodyW * 0.88, y + h * 0.84],
            [x + bodyW * 0.50, y + h]
        ], { ...roughOpts, seed: seed + 1 });
    } else {
        // OR, NOR, XOR, XNOR
        const backOffset = (type === 'xor' || type === 'xnor') ? 7 : 0;
        if (backOffset > 0) {
            rc.curve([
                [x, y],
                [x + 11, y + h * 0.5],
                [x, y + h]
            ], { ...roughOpts, seed: seed + 2 });
        }
        const ox = x + backOffset;
        const ow = bodyW - backOffset;
        rc.curve([[ox, y], [ox + 12, y + h * 0.5], [ox, y + h]], { ...roughOpts, seed });
        rc.curve([[ox, y], [ox + ow * 0.55, y + 3], [ox + ow, y + h * 0.5]], { ...roughOpts, seed: seed + 3 });
        rc.curve([[ox, y + h], [ox + ow * 0.55, y + h - 3], [ox + ow, y + h * 0.5]], { ...roughOpts, seed: seed + 4 });
    }

    if (hasBubble) {
        rc.circle(x + bodyW + 4.5, y + h * 0.5, 7.5, { ...roughOpts, seed: seed + 5 });
    }

    const inX = (type === 'or' || type === 'nor') ? x + 5 : ((type === 'xor' || type === 'xnor') ? x + 10 : x);
    return {
        inTop: [inX, y + h * 0.28],
        inMid: [inX, y + h * 0.50],
        inBot: [inX, y + h * 0.72],
        out: [x + w, y + h * 0.50]
    };
}

/**
 * Renders a label string that may contain `$inline LaTeX$` or plain text at `(x, y)` baseline.
 */
export function drawLabelOrMath(ctx, rc, text, x, y, fontSize, charCounterRef, opts = {}) {
    const str = String(text ?? '').trim();
    if (!str) return 0;

    // Pure math expression or contains LaTeX commands / sub / sup
    if ((str.startsWith('$') && str.endsWith('$') && str.length > 2) ||
        str.includes('\\') || str.includes('_') || str.includes('^')) {
        const cleanMath = (str.startsWith('$') && str.endsWith('$')) ? str.slice(1, -1) : str;
        const ast = parseLatexToAST(cleanMath);
        const endX = renderMathAST(ctx, rc, ast, x, y, fontSize, charCounterRef, opts);
        return endX - x;
    }

    // Mixed words and $inline math$
    const parts = str.split(/(\$[^$]+\$|\s+)/g).filter(Boolean);
    let curX = x;
    for (const part of parts) {
        if (/^\s+$/.test(part)) {
            curX += fontSize * 0.30;
        } else if (part.startsWith('$') && part.endsWith('$')) {
            const ast = parseLatexToAST(part.slice(1, -1));
            curX = renderMathAST(ctx, rc, ast, curX, y, fontSize * 0.95, charCounterRef, opts);
        } else {
            curX += drawHandwrittenWord(ctx, part, curX, y, fontSize, charCounterRef, opts);
        }
    }
    return curX - x;
}

/**
 * Splits a long string into wrapped lines that fit within `maxWidthPx` at `fontSize`.
 */
export function wrapCellText(text, maxWidthPx, fontSize) {
    const raw = String(text ?? '').trim();
    if (!raw) return [''];
    const words = raw.split(/\s+/);
    const lines = [];
    let curLine = '';
    const charW = fontSize * 0.45;

    for (const word of words) {
        const testLine = curLine ? `${curLine} ${word}` : word;
        if (testLine.length * charW > maxWidthPx && curLine) {
            lines.push(curLine);
            curLine = word;
        } else {
            curLine = testLine;
        }
    }
    if (curLine) lines.push(curLine);
    return lines;
}
