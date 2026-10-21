import { drawSharpArrowhead } from './primitives.js';
import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';

export function drawDfa(d) {
    // 3. CRISP DETERMINISTIC FINITE AUTOMATON (DFA STATE GRAPH)
    const cy = d.startY + 74;
    const s0x = d.startX + 95;
    const s1x = d.startX + 255;
    const s2x = d.startX + 415;
    const r = 50; // diameter
    const rad = r / 2;

    // Start arrow into q0
    d.rc.line(s0x - 70, cy, s0x - rad - 2, cy, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, s0x - rad - 2, cy, 0, 10, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawHandwrittenWord(d.ctx, 'start', s0x - 72, cy - 8, 17, d.charCounterRef, d.opts);

    // State Circles (q2 has crisp concentric double accepting ring)
    d.rc.circle(s0x, cy, r, { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    d.rc.circle(s1x, cy, r, { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    d.rc.circle(s2x, cy, r, { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    d.rc.circle(s2x, cy, r - 10, { ...d.roughOpts, strokeWidth: 1.45 * d.ink.widthScale, seed: d.charCounterRef.count++ });

    // State Labels
    drawHandwrittenWord(d.ctx, 'q0', s0x - 11, cy + 6, 22, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, 'q1', s1x - 11, cy + 6, 22, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, 'q2', s2x - 11, cy + 6, 22, d.charCounterRef, d.opts);

    // Forward Transitions: q0 -> q1 ('0') and q1 -> q2 ('1')
    d.rc.line(s0x + rad + 2, cy, s1x - rad - 3, cy, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, s1x - rad - 2, cy, 0, 10, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawAllographicChar(d.ctx, '0', (s0x + s1x) / 2 - 4, cy - 9, 21, d.charCounterRef.count++, d.opts);

    d.rc.line(s1x + rad + 2, cy, s2x - rad - 3, cy, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, s2x - rad - 2, cy, 0, 10, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawAllographicChar(d.ctx, '1', (s1x + s2x) / 2 - 4, cy - 9, 21, d.charCounterRef.count++, d.opts);

    // Crisp Self-loop on q0 ('1') and q1 ('0')
    const drawSelfLoop = (sx, label) => {
        d.rc.curve([
            [sx - 11, cy - rad + 2],
            [sx - 18, cy - rad - 26],
            [sx, cy - rad - 34],
            [sx + 18, cy - rad - 26],
            [sx + 11, cy - rad + 2]
        ], { ...d.roughOpts, seed: d.charCounterRef.count++ });
        drawSharpArrowhead(d.ctx, d.rc, sx + 11, cy - rad + 2, Math.PI * 0.62, 9, { ...d.roughOpts, seed: d.charCounterRef.count++ });
        drawAllographicChar(d.ctx, label, sx - 4, cy - rad - 38, 20, d.charCounterRef.count++, d.opts);
    };
    drawSelfLoop(s0x, '1');
    drawSelfLoop(s1x, '0');

    // Smooth Return Arc q2 -> q1 ('0') underneath
    d.rc.curve([
        [s2x - 12, cy + rad - 1],
        [(s1x + s2x) / 2, cy + rad + 36],
        [s1x + 12, cy + rad - 1]
    ], { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawSharpArrowhead(d.ctx, d.rc, s1x + 12, cy + rad - 1, -Math.PI * 0.72, 9, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawAllographicChar(d.ctx, '0', (s1x + s2x) / 2 - 4, cy + rad + 29, 20, d.charCounterRef.count++, d.opts);

    // Smooth Return Arc q2 -> q0 ('1') over top or bottom
    return 162;
}
