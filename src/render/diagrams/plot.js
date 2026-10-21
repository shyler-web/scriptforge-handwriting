import { drawSharpArrowhead } from './primitives.js';
import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';

export function drawPlot(d) {
    // 4. SHARP HAND-SKETCHED MATHEMATICAL FUNCTION PLOT WITH ENVELOPE & TICKS
    const ox = d.startX + 60;
    const oy = d.startY + 82;
    const w = 390;
    const h = 148;

    // Axes with sharp arrowheads
    d.rc.line(ox, oy + 62, ox, oy - 64, { ...d.roughOpts, strokeWidth: 1.65 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, ox, oy - 64, -Math.PI / 2, 9, { ...d.roughOpts, seed: d.charCounterRef.count++ });

    d.rc.line(ox - 16, oy, ox + w, oy, { ...d.roughOpts, strokeWidth: 1.65 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, ox + w, oy, 0, 9, { ...d.roughOpts, seed: d.charCounterRef.count++ });

    // Axis ticks
    for (let tx = 65; tx < w - 25; tx += 65) {
        d.rc.line(ox + tx, oy - 4, ox + tx, oy + 4, { ...d.roughOpts, strokeWidth: 1.2, seed: d.charCounterRef.count++ });
    }
    d.rc.line(ox - 4, oy - 48, ox + 4, oy - 48, { ...d.roughOpts, strokeWidth: 1.2, seed: d.charCounterRef.count++ });
    drawAllographicChar(d.ctx, '1', ox - 18, oy - 42, 17, d.charCounterRef.count++, d.opts);

    drawHandwrittenWord(d.ctx, 'y(t)', ox - 42, oy - 50, 20, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, 't (sec)', ox + w + 10, oy + 6, 19, d.charCounterRef, d.opts);

    // Dashed exponential decay envelope +e^(-0.3t) and -e^(-0.3t)
    for (let px = 0; px < w - 35; px += 16) {
        const t1 = px / 46;
        const t2 = (px + 8) / 46;
        const env1 = Math.exp(-0.32 * t1) * 52;
        const env2 = Math.exp(-0.32 * t2) * 52;
        d.rc.line(ox + px, oy - env1, ox + px + 8, oy - env2, {
            ...d.roughOpts, stroke: d.ink.secondary, strokeWidth: 1.0, roughness: 0.25, seed: d.charCounterRef.count++
        });
        d.rc.line(ox + px, oy + env1, ox + px + 8, oy + env2, {
            ...d.roughOpts, stroke: d.ink.secondary, strokeWidth: 1.0, roughness: 0.25, seed: d.charCounterRef.count++
        });
    }

    // High-density damped oscillation curve points
    const pts = [];
    for (let px = 0; px <= w - 24; px += 4) {
        const t = px / 46;
        const py = oy - Math.exp(-0.32 * t) * Math.cos(2.85 * t) * 52;
        pts.push([ox + px, py]);
    }
    d.rc.curve(pts, {
        ...d.roughOpts,
        stroke: d.ink.accent,
        strokeWidth: 1.95 * d.ink.widthScale,
        roughness: d.opts.diagRoughness * 0.5,
        seed: d.charCounterRef.count++
    });

    if (d.params.label) {
        drawHandwrittenWord(d.ctx, d.params.label, ox + 135, oy - 42, 20, d.charCounterRef, d.opts);
    }
    return h + 20;
}
