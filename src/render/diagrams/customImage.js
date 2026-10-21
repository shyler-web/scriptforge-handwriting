import { state } from '../../core/state.js';
import { drawHandwrittenWord } from '../glyph.js';

export function drawCustomImage(d) {
    // 5. PIPELINE A: HIGH-RES CUSTOM UPLOADED IMAGE DIAGRAM -> CRISP HAND-SKETCHED CONTOURS
    const boxH = 185;
    const scale = 0.88;
    for (const poly of state.customContours) {
        if (poly.length >= 2) {
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
