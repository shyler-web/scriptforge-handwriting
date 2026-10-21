/**
 * ScriptForge Universal SVG Scene-Graph Adapter (Wave 2 - Universal Engine #5)
 * Converts ANY arbitrary `<svg>...</svg>` string into hand-sketched Rough.js pen strokes
 * and replaces all `<text>` nodes with Allographic Handwriting / 2D Math AST strokes.
 */

import { drawLabelOrMath } from './primitives.js';

/**
 * Parses an SVG `transform="translate(tx, ty) scale(sx, sy)"` attribute into an affine offset/scale.
 */
function parseTransformAttr(transformStr) {
    let tx = 0, ty = 0, sx = 1, sy = 1;
    if (!transformStr) return { tx, ty, sx, sy };

    const trMatch = transformStr.match(/translate\(\s*([+-]?\d*\.?\d+)(?:[\s,]+([+-]?\d*\.?\d+))?\s*\)/i);
    if (trMatch) {
        tx = parseFloat(trMatch[1]) || 0;
        ty = trMatch[2] !== undefined ? (parseFloat(trMatch[2]) || 0) : 0;
    }

    const scMatch = transformStr.match(/scale\(\s*([+-]?\d*\.?\d+)(?:[\s,]+([+-]?\d*\.?\d+))?\s*\)/i);
    if (scMatch) {
        sx = parseFloat(scMatch[1]) || 1;
        sy = scMatch[2] !== undefined ? (parseFloat(scMatch[2]) || 1) : sx;
    }

    return { tx, ty, sx, sy };
}

/**
 * Tokenizes an SVG `<path d="...">` string into an array of continuous polyline point arrays
 * by sampling cubic/quadratic Bézier segments and lines (`M, L, H, V, C, S, Q, Z`).
 */
export function flattenSvgPathD(dStr) {
    if (!dStr || typeof dStr !== 'string') return [];
    const tokens = dStr.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
    if (!tokens) return [];

    const polylines = [];
    let curPoly = [];
    let cx = 0, cy = 0;
    let startX = 0, startY = 0;
    let prevCtrlX = 0, prevCtrlY = 0;
    let i = 0;
    let cmd = 'M';

    const nextNum = () => (i < tokens.length ? parseFloat(tokens[i++]) : 0);
    const isCmd = (tok) => /^[a-zA-Z]$/.test(tok);

    while (i < tokens.length) {
        if (isCmd(tokens[i])) {
            cmd = tokens[i++];
        }

        switch (cmd) {
            case 'M':
            case 'm': {
                if (curPoly.length >= 2) polylines.push(curPoly);
                const dx = nextNum();
                const dy = nextNum();
                cx = cmd === 'm' ? cx + dx : dx;
                cy = cmd === 'm' ? cy + dy : dy;
                startX = cx;
                startY = cy;
                curPoly = [[cx, cy]];
                cmd = cmd === 'm' ? 'l' : 'L';
                break;
            }
            case 'L':
            case 'l': {
                const dx = nextNum();
                const dy = nextNum();
                cx = cmd === 'l' ? cx + dx : dx;
                cy = cmd === 'l' ? cy + dy : dy;
                curPoly.push([cx, cy]);
                break;
            }
            case 'H':
            case 'h': {
                const dx = nextNum();
                cx = cmd === 'h' ? cx + dx : dx;
                curPoly.push([cx, cy]);
                break;
            }
            case 'V':
            case 'v': {
                const dy = nextNum();
                cy = cmd === 'v' ? cy + dy : dy;
                curPoly.push([cx, cy]);
                break;
            }
            case 'C':
            case 'c': {
                const x1 = (cmd === 'c' ? cx : 0) + nextNum();
                const y1 = (cmd === 'c' ? cy : 0) + nextNum();
                const x2 = (cmd === 'c' ? cx : 0) + nextNum();
                const y2 = (cmd === 'c' ? cy : 0) + nextNum();
                const ex = (cmd === 'c' ? cx : 0) + nextNum();
                const ey = (cmd === 'c' ? cy : 0) + nextNum();
                const steps = 8;
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const mt = 1 - t;
                    const px = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * ex;
                    const py = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * ey;
                    curPoly.push([px, py]);
                }
                prevCtrlX = x2;
                prevCtrlY = y2;
                cx = ex;
                cy = ey;
                break;
            }
            case 'S':
            case 's': {
                const x1 = 2 * cx - prevCtrlX;
                const y1 = 2 * cy - prevCtrlY;
                const x2 = (cmd === 's' ? cx : 0) + nextNum();
                const y2 = (cmd === 's' ? cy : 0) + nextNum();
                const ex = (cmd === 's' ? cx : 0) + nextNum();
                const ey = (cmd === 's' ? cy : 0) + nextNum();
                const steps = 8;
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const mt = 1 - t;
                    const px = mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * ex;
                    const py = mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * ey;
                    curPoly.push([px, py]);
                }
                prevCtrlX = x2;
                prevCtrlY = y2;
                cx = ex;
                cy = ey;
                break;
            }
            case 'Q':
            case 'q': {
                const x1 = (cmd === 'q' ? cx : 0) + nextNum();
                const y1 = (cmd === 'q' ? cy : 0) + nextNum();
                const ex = (cmd === 'q' ? cx : 0) + nextNum();
                const ey = (cmd === 'q' ? cy : 0) + nextNum();
                const steps = 6;
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const mt = 1 - t;
                    const px = mt * mt * cx + 2 * mt * t * x1 + t * t * ex;
                    const py = mt * mt * cy + 2 * mt * t * y1 + t * t * ey;
                    curPoly.push([px, py]);
                }
                prevCtrlX = x1;
                prevCtrlY = y1;
                cx = ex;
                cy = ey;
                break;
            }
            case 'Z':
            case 'z': {
                if (curPoly.length > 0) {
                    curPoly.push([startX, startY]);
                    polylines.push(curPoly);
                    curPoly = [];
                }
                cx = startX;
                cy = startY;
                break;
            }
            default: {
                // Unsupported command token (e.g. A/a arc) -> skip numeric args gracefully
                while (i < tokens.length && !isCmd(tokens[i])) i++;
                break;
            }
        }
    }

    if (curPoly.length >= 2) polylines.push(curPoly);
    return polylines;
}

/**
 * Compiles any `<svg>...</svg>` string into Rough.js pen strokes + handwritten labels.
 * Syntax: `[DIAGRAM: svg | <svg viewBox="0 0 320 120">...</svg>]`
 */
export function renderSvgDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const rawSvg = String(params.rawSvg || params.svg || '').trim();
    if (!rawSvg || !rawSvg.includes('<svg')) {
        drawLabelOrMath(ctx, rc, '[Empty SVG Block]', startX + 20, startY + 28, 18, charCounterRef, opts);
        return 42;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return 42;

    // Determine source coordinate space from viewBox or width/height
    let vbX = 0, vbY = 0, vbW = 400, vbH = 160;
    const vbAttr = svgEl.getAttribute('viewBox');
    if (vbAttr) {
        const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
            [vbX, vbY, vbW, vbH] = parts;
        }
    } else {
        vbW = parseFloat(svgEl.getAttribute('width')) || 400;
        vbH = parseFloat(svgEl.getAttribute('height')) || 160;
    }

    const targetMaxW = Math.min(availWidth - 36, 560);
    const targetMaxH = parseFloat(params.height) || 195;
    const scale = Math.min(targetMaxW / vbW, targetMaxH / vbH, 1.35);
    const offsetX = startX + 18 - vbX * scale;
    const offsetY = startY + 12 - vbY * scale;

    const mapPt = (x, y, tr) => [
        offsetX + ((x * tr.sx) + tr.tx) * scale,
        offsetY + ((y * tr.sy) + tr.ty) * scale
    ];

    function walkNode(node, parentTr) {
        if (!node || node.nodeType !== 1) return;
        const tag = node.tagName.toLowerCase();
        const localTr = parseTransformAttr(node.getAttribute('transform'));
        const tr = {
            tx: parentTr.tx + localTr.tx * parentTr.sx,
            ty: parentTr.ty + localTr.ty * parentTr.sy,
            sx: parentTr.sx * localTr.sx,
            sy: parentTr.sy * localTr.sy
        };

        const strokeAttr = node.getAttribute('stroke');
        const elemRough = {
            ...roughOpts,
            stroke: (strokeAttr && strokeAttr !== 'none' && strokeAttr !== '#000' && strokeAttr !== 'black')
                ? strokeAttr
                : ink.color,
            seed: charCounterRef.count++
        };

        switch (tag) {
            case 'line': {
                const [x1, y1] = mapPt(parseFloat(node.getAttribute('x1')) || 0, parseFloat(node.getAttribute('y1')) || 0, tr);
                const [x2, y2] = mapPt(parseFloat(node.getAttribute('x2')) || 0, parseFloat(node.getAttribute('y2')) || 0, tr);
                rc.line(x1, y1, x2, y2, elemRough);
                break;
            }
            case 'rect': {
                const rx = parseFloat(node.getAttribute('x')) || 0;
                const ry = parseFloat(node.getAttribute('y')) || 0;
                const rw = (parseFloat(node.getAttribute('width')) || 0) * tr.sx * scale;
                const rh = (parseFloat(node.getAttribute('height')) || 0) * tr.sy * scale;
                const [px, py] = mapPt(rx, ry, tr);
                if (rw > 0 && rh > 0) {
                    rc.rectangle(px, py, rw, rh, elemRough);
                }
                break;
            }
            case 'circle': {
                const cx = parseFloat(node.getAttribute('cx')) || 0;
                const cy = parseFloat(node.getAttribute('cy')) || 0;
                const r = (parseFloat(node.getAttribute('r')) || 0) * tr.sx * scale;
                const [px, py] = mapPt(cx, cy, tr);
                if (r > 0) {
                    rc.circle(px, py, r * 2, elemRough);
                }
                break;
            }
            case 'ellipse': {
                const cx = parseFloat(node.getAttribute('cx')) || 0;
                const cy = parseFloat(node.getAttribute('cy')) || 0;
                const rx = (parseFloat(node.getAttribute('rx')) || 0) * tr.sx * scale;
                const ry = (parseFloat(node.getAttribute('ry')) || 0) * tr.sy * scale;
                const [px, py] = mapPt(cx, cy, tr);
                if (rx > 0 && ry > 0) {
                    rc.ellipse(px, py, rx * 2, ry * 2, elemRough);
                }
                break;
            }
            case 'polyline':
            case 'polygon': {
                const rawPts = (node.getAttribute('points') || '').trim();
                const coords = rawPts.split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n));
                const pts = [];
                for (let k = 0; k + 1 < coords.length; k += 2) {
                    pts.push(mapPt(coords[k], coords[k + 1], tr));
                }
                if (tag === 'polygon' && pts.length > 2) {
                    pts.push(pts[0]);
                }
                if (pts.length >= 2) {
                    rc.linearPath(pts, elemRough);
                }
                break;
            }
            case 'path': {
                const d = node.getAttribute('d') || '';
                const polys = flattenSvgPathD(d);
                for (const poly of polys) {
                    const mapped = poly.map(([x, y]) => mapPt(x, y, tr));
                    if (mapped.length >= 2) {
                        rc.linearPath(mapped, { ...elemRough, seed: charCounterRef.count++ });
                    }
                }
                break;
            }
            case 'text': {
                const tx = parseFloat(node.getAttribute('x')) || 0;
                const ty = parseFloat(node.getAttribute('y')) || 0;
                const [px, py] = mapPt(tx, ty, tr);
                const label = (node.textContent || '').trim();
                if (label) {
                    const anchor = (node.getAttribute('text-anchor') || 'start').toLowerCase();
                    const fs = Math.max(15, Math.min(22, (parseFloat(node.getAttribute('font-size')) || 18) * scale));
                    const estW = label.length * fs * 0.44;
                    const adjX = anchor === 'middle' ? px - estW / 2 : (anchor === 'end' ? px - estW : px);
                    drawLabelOrMath(ctx, rc, label, adjX, py, fs, charCounterRef, opts);
                }
                break;
            }
            default:
                break;
        }

        for (const child of node.children) {
            walkNode(child, tr);
        }
    }

    walkNode(svgEl, { tx: 0, ty: 0, sx: 1, sy: 1 });
    return Math.ceil(vbH * scale) + 24;
}

export default renderSvgDiagram;
