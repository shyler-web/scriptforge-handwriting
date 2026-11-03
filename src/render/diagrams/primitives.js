/**
 * ScriptForge Shared Hand-Drawn Diagram Primitives (Wave 1)
 * Provides reusable geometric & text/math building blocks for all 5 Universal Diagram Engines.
 */

import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';
import { parseLatexToAST } from '../math/parser.js';
import { measureMathAST } from '../math/measure.js';
import { renderMathAST } from '../math/renderer.js';
import { INK_PROFILES } from '../../core/config.js';

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

// ============================================================================
// Rough.js compatibility helpers used by the Universal Sketch Engine.
// These keep the sketch modules independent of the older diagram renderers.
// ============================================================================

function roughStyle(opts = {}) {
    return {
        stroke: opts.stroke || opts.color || '#1e293b',
        strokeWidth: opts.strokeWidth ?? 1.6,
        roughness: opts.roughness ?? 0.75,
        bowing: opts.bowing ?? 0.5,
        seed: opts.seed ?? 1,
        ...(opts.fill ? { fill: opts.fill } : {}),
        ...(opts.fillStyle ? { fillStyle: opts.fillStyle } : {}),
        ...(opts.dash || opts.dashed ? { strokeLineDash: Array.isArray(opts.dash || opts.dashed) ? (opts.dash || opts.dashed) : [6, 5] } : {}),
        ...(opts.disableMultiStroke !== undefined ? { disableMultiStroke: opts.disableMultiStroke } : {})
    };
}

function ctxRoughAdapter(ctx) {
    const apply = (o) => {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (o.fill && o.fill !== 'none') ctx.fillStyle = o.fill;
        if (o.strokeLineDash) ctx.setLineDash(o.strokeLineDash);
        else ctx.setLineDash([]);
    };

    const path = (points, close = false) => {
        if (!points || !points.length) return;
        ctx.beginPath();
        points.forEach((pt, idx) => {
            const x = Array.isArray(pt) ? pt[0] : pt.x;
            const y = Array.isArray(pt) ? pt[1] : pt.y;
            idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
        ctx.stroke();
    };

    return {
        line(x1, y1, x2, y2, o = {}) {
            ctx.save(); apply(roughStyle(o));
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.restore();
        },
        linearPath(points, o = {}) {
            ctx.save(); apply(roughStyle(o)); path(points, false); ctx.restore();
        },
        curve(points, o = {}) {
            ctx.save(); apply(roughStyle(o));
            const pts = (points || []).map(pt => Array.isArray(pt) ? pt : [pt.x, pt.y]);
            if (pts.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length - 1; i++) {
                    const mx = (pts[i][0] + pts[i + 1][0]) * 0.5;
                    const my = (pts[i][1] + pts[i + 1][1]) * 0.5;
                    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
                }
                const last = pts[pts.length - 1];
                ctx.lineTo(last[0], last[1]);
                ctx.stroke();
            } else {
                path(pts, false);
            }
            ctx.restore();
        },
        circle(cx, cy, diameter, o = {}) {
            const r = Math.abs(diameter) * 0.5;
            ctx.save(); apply(roughStyle(o));
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (o.fill && o.fill !== 'none') ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        ellipse(cx, cy, w, h, o = {}) {
            ctx.save(); apply(roughStyle(o));
            ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(w) * 0.5, Math.abs(h) * 0.5, 0, 0, Math.PI * 2);
            if (o.fill && o.fill !== 'none') ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        rectangle(x, y, w, h, o = {}) {
            ctx.save(); apply(roughStyle(o));
            ctx.beginPath(); ctx.rect(x, y, w, h);
            if (o.fill && o.fill !== 'none') ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        polygon(points, o = {}) {
            ctx.save(); apply(roughStyle(o));
            path(points, true);
            if (o.fill && o.fill !== 'none') ctx.fill();
            ctx.restore();
        },
        arc(cx, cy, w, h, start, stop, closed, o = {}) {
            ctx.save(); apply(roughStyle(o));
            ctx.beginPath();
            ctx.ellipse(cx, cy, Math.abs(w) * 0.5, Math.abs(h) * 0.5, 0, start, stop);
            if (closed) ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
    };
}

function getRoughRc(ctx) {
    if (!ctx) return null;
    if (typeof window !== 'undefined' && window.rough && typeof window.rough.canvas === 'function' && ctx.canvas) {
        return window.rough.canvas(ctx.canvas);
    }
    return ctxRoughAdapter(ctx);
}

export function rLine(rc, ctx, x1, y1, x2, y2, opts = {}) {
    if (rc && typeof rc.line === 'function') {
        rc.line(x1, y1, x2, y2, roughStyle(opts));
        return;
    }
    if (ctx) {
        ctx.save();
        const o = roughStyle(opts);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }
}

export function rCircle(rc, ctx, cx, cy, radius, opts = {}) {
    if (rc && typeof rc.circle === 'function') {
        rc.circle(cx, cy, Math.abs(radius) * 2, roughStyle(opts));
        return;
    }
    if (ctx) {
        const o = roughStyle(opts);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Math.abs(radius), 0, Math.PI * 2);
        ctx.fillStyle = o.fill && o.fill !== 'none' ? o.fill : o.stroke;
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        if (o.fill && o.fill !== 'none') ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

export function rEllipse(rc, ctx, cx, cy, w, h, opts = {}) {
    if (rc && typeof rc.ellipse === 'function') {
        rc.ellipse(cx, cy, Math.abs(w), Math.abs(h), roughStyle(opts));
        return;
    }
    if (ctx) {
        const o = roughStyle(opts);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(w) * 0.5, Math.abs(h) * 0.5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.stroke();
        ctx.restore();
    }
}

export function rRect(rc, ctx, x, y, w, h, opts = {}) {
    if (rc && typeof rc.rectangle === 'function') {
        rc.rectangle(x, y, w, h, roughStyle(opts));
        return;
    }
    if (ctx) {
        ctx.save();
        const o = roughStyle(opts);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }
}

export function rPolygon(rc, ctx, points, opts = {}) {
    const pts = (points || []).map(pt => Array.isArray(pt) ? pt : [pt.x, pt.y]);
    if (rc && typeof rc.polygon === 'function') {
        rc.polygon(pts, roughStyle(opts));
        return;
    }
    if (ctx && pts.length) {
        ctx.save();
        const o = roughStyle(opts);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.beginPath();
        pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.closePath();
        if (o.fill && o.fill !== 'none') ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

export function rCurve(rc, ctx, points, opts = {}) {
    if (rc && typeof rc.curve === 'function') {
        rc.curve(points, roughStyle(opts));
        return;
    }
    if (ctx) ctxRoughAdapter(ctx).curve(points, opts);
}

export function rArc(rc, ctx, cx, cy, w, h, start, stop, closed = false, opts = {}) {
    if (rc && typeof rc.arc === 'function') {
        rc.arc(cx, cy, w, h, start, stop, closed, roughStyle(opts));
        return;
    }
    if (ctx) ctxRoughAdapter(ctx).arc(cx, cy, w, h, start, stop, closed, opts);
}

export function measureDiagramText(text, font = 'Caveat', size = 15) {
    const str = String(text ?? '').trim();
    if (!str) return { width: 0, height: 0 };
    const isMath = (str.startsWith('$') && str.endsWith('$') && str.length > 2)
        || str.includes('\\') || str.includes('_') || str.includes('^');
    if (isMath) {
        const clean = str.startsWith('$') && str.endsWith('$') ? str.slice(1, -1) : str;
        try {
            const m = measureMathAST(parseLatexToAST(clean), size, size * 1.65);
            return { width: Math.max(6, m.width), height: Math.max(size, m.height) };
        } catch {
            // Fall through to a proportional estimate.
        }
    }
    return { width: Math.max(6, str.length * size * 0.46), height: size * 1.25 };
}

export function drawDiagramText(ctx, text, x, y, opts = {}) {
    const str = String(text ?? '').trim();
    if (!str || !ctx) return 0;

    const font = opts.font || opts.fontFamily || 'Caveat';
    const size = opts.size || 15;
    const color = opts.color || '#1e293b';
    const m = measureDiagramText(str, font, size);

    let drawX = x;
    if (opts.align === 'center') drawX -= m.width * 0.5;
    else if (opts.align === 'right' || opts.align === 'end') drawX -= m.width;

    let drawY = y;
    if (opts.baseline === 'middle') drawY += size * 0.35;
    else if (opts.baseline === 'top' || opts.baseline === 'hanging') drawY += size * 0.82;
    else if (opts.baseline === 'bottom') drawY -= size * 0.08;

    const ink = {
        ...INK_PROFILES.ballpoint_blue,
        color,
        secondary: color,
        accent: color
    };
    const counter = { count: Number(opts.seed) || 1 };
    drawLabelOrMath(ctx, getRoughRc(ctx), str, drawX, drawY, size, counter, {
        fontFamily: font,
        ink,
        handSeed: Number(opts.seed) || 4219,
        diagRoughness: opts.roughness ?? 0.45,
        diagBowing: opts.bowing ?? 0.4,
        singlePassStroke: true
    });
    return m.width;
}
