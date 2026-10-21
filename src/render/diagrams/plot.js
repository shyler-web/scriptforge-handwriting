import { drawSharpArrowhead } from './primitives.js';
import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';

const DEFAULT_INK = {
    color: '#1b3b8c',
    secondary: '#2952b3',
    accent: '#b91c1c',
    alpha: 0.94,
    widthScale: 1.0
};

const DEFAULT_OPTS = {
    fontFamily: 'Caveat',
    glyphWarp: 0.65,
    baselineDrift: 0.45,
    pressureVar: 0.55,
    slantAngle: -4,
    enableLigatures: true,
    diagRoughness: 0.55,
    diagBowing: 0.60,
    singlePassStroke: true
};

function resolveOpts(opts) {
    const merged = { ...(opts || {}) };
    for (const key of Object.keys(DEFAULT_OPTS)) {
        if (merged[key] === undefined) merged[key] = DEFAULT_OPTS[key];
    }
    return merged;
}

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

    // `label` is honoured today; `fn`/`domain`/`shade` need the Wave 2 math evaluator.
    const label = d.params && d.params.label ? String(d.params.label) : '';
    if (label) {
        drawHandwrittenWord(d.ctx, label, ox + 135, oy - 42, 20, d.charCounterRef, d.opts);
    }
    return h + 20;
}

/**
 * Wave 1 dispatcher adapter.
 * New-style positional signature expected by `src/render/diagrams/index.js`:
 *   renderPlot(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts)
 * Builds the legacy `d` bag and delegates to `drawPlot(d)`.
 */
export function renderPlot(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const d = {
        ctx,
        rc,
        params: params || {},
        startX: startX || 0,
        startY: startY || 0,
        roughOpts: roughOpts || {},
        ink: ink || DEFAULT_INK,
        opts: resolveOpts(opts),
        charCounterRef: charCounterRef || { count: 1 }
    };
    return drawPlot(d);
}

export default renderPlot;
