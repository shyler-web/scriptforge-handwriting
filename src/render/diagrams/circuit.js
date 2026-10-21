import { drawHandwrittenWord } from '../glyph.js';

export function drawCircuit(d) {
    // 2. SHARP IEEE-STANDARD DIGITAL LOGIC GATE SCHEMATIC
    const cx = d.startX + 32;
    const cy = d.startY + 20;
    const h = 152;

    // Input labels
    drawHandwrittenWord(d.ctx, "B'", cx, cy + 29, 22, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, "D'", cx, cy + 57, 22, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, "B", cx + 4, cy + 105, 22, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, "D", cx + 4, cy + 133, 22, d.charCounterRef, d.opts);

    // Input wires into the two AND gates
    const wireOpts = { ...d.roughOpts, strokeWidth: 1.55 * d.ink.widthScale };
    d.rc.line(cx + 30, cy + 23, cx + 102, cy + 23, { ...wireOpts, seed: d.charCounterRef.count++ });
    d.rc.line(cx + 30, cy + 51, cx + 102, cy + 51, { ...wireOpts, seed: d.charCounterRef.count++ });
    d.rc.line(cx + 30, cy + 99, cx + 102, cy + 99, { ...wireOpts, seed: d.charCounterRef.count++ });
    d.rc.line(cx + 30, cy + 127, cx + 102, cy + 127, { ...wireOpts, seed: d.charCounterRef.count++ });

    // Crisp IEEE D-Shaped AND Gate helper
    const drawSharpAndGate = (gx, gy, gw, gh) => {
        // Flat back + top/bottom horizontal edges
        d.rc.linearPath([
            [gx + gw * 0.52, gy],
            [gx, gy],
            [gx, gy + gh],
            [gx + gw * 0.52, gy + gh]
        ], { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
        // Smooth semi-circular nose
        d.rc.curve([
            [gx + gw * 0.5, gy],
            [gx + gw * 0.88, gy + gh * 0.16],
            [gx + gw, gy + gh * 0.5],
            [gx + gw * 0.88, gy + gh * 0.84],
            [gx + gw * 0.5, gy + gh]
        ], { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    };

    drawSharpAndGate(cx + 102, cy + 14, 52, 46);
    drawSharpAndGate(cx + 102, cy + 90, 52, 46);

    // Gate internal annotations
    drawHandwrittenWord(d.ctx, "B'D'", cx + 160, cy + 31, 17, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, "BD", cx + 162, cy + 107, 17, d.charCounterRef, d.opts);

    // Orthogonal intermediate routing wires to OR Gate
    d.rc.linearPath([
        [cx + 154, cy + 37],
        [cx + 212, cy + 37],
        [cx + 212, cy + 63],
        [cx + 248, cy + 63]
    ], { ...wireOpts, seed: d.charCounterRef.count++ });

    d.rc.linearPath([
        [cx + 154, cy + 113],
        [cx + 212, cy + 113],
        [cx + 212, cy + 87],
        [cx + 248, cy + 87]
    ], { ...wireOpts, seed: d.charCounterRef.count++ });

    // Crisp IEEE Curved-Shield OR Gate
    const ox = cx + 242, oy = cy + 50, ow = 60, oh = 50;
    // Concave input back arc
    d.rc.curve([
        [ox, oy],
        [ox + 14, oy + oh * 0.5],
        [ox, oy + oh]
    ], { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    // Upper curved shield edge to pointed apex
    d.rc.curve([
        [ox, oy],
        [ox + ow * 0.55, oy + 4],
        [ox + ow, oy + oh * 0.5]
    ], { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    // Lower curved shield edge from pointed apex
    d.rc.curve([
        [ox, oy + oh],
        [ox + ow * 0.55, oy + oh - 4],
        [ox + ow, oy + oh * 0.5]
    ], { ...d.roughOpts, strokeWidth: 1.8 * d.ink.widthScale, seed: d.charCounterRef.count++ });

    // Output wire + terminal circle + expression label
    d.rc.line(ox + ow, oy + oh * 0.5, ox + ow + 48, oy + oh * 0.5, { ...wireOpts, seed: d.charCounterRef.count++ });
    d.rc.circle(ox + ow + 52, oy + oh * 0.5, 7, { ...d.roughOpts, seed: d.charCounterRef.count++ });
    drawHandwrittenWord(d.ctx, "F = B'D' + BD", ox + ow + 64, oy + oh * 0.5 + 6, 22, d.charCounterRef, d.opts);

    return h + 20;
}
