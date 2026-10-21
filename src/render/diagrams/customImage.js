import { state } from '../../core/state.js';
import { drawHandwrittenWord } from '../glyph.js';

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

export function drawCustomImage(d) {
    // 5. PIPELINE A: HIGH-RES CUSTOM UPLOADED IMAGE DIAGRAM -> CRISP HAND-SKETCHED CONTOURS
    const boxH = 185;
    const scale = 0.88;
    const contours = Array.isArray(state.customContours) ? state.customContours : [];

    // Nothing vectorised yet -> render nothing but keep the block height sane.
    if (contours.length === 0) return 40;

    for (const poly of contours) {
        if (Array.isArray(poly) && poly.length >= 2) {
            const transformed = poly.map(([px, py]) => [d.startX + 35 + px * scale, d.startY + 10 + py * scale]);
            d.rc.curve(transformed, {
                ...d.roughOpts,
                strokeWidth: 1.45 * d.ink.widthScale,
                roughness: d.opts.diagRoughness * 0.45,
                bowing: d.opts.diagBowing * 0.5,
                seed: d.charCounterRef.count++
            });
        }
    }
    drawHandwrittenWord(d.ctx, 'Fig: High-Res Hand-Traced Vector Diagram', d.startX + 45, d.startY + boxH, 19, d.charCounterRef, d.opts);
    return boxH + 22;
}

/**
 * Wave 1 dispatcher adapter.
 * New-style positional signature expected by `src/render/diagrams/index.js`:
 *   renderCustomImage(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts)
 * Builds the legacy `d` bag and delegates to `drawCustomImage(d)`.
 */
export function renderCustomImage(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
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
    return drawCustomImage(d);
}

export default renderCustomImage;
