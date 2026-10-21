/**
 * Renders 1px skeletonized image contours stored in `state.customContours` (`src/render/diagrams/customImage.js`)
 */
import * as stateMod from '../../core/state.js';
import { drawLabelOrMath } from './primitives.js';

export function renderCustomImage(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const stateObj = stateMod.state || stateMod.default || stateMod;
    const contours = (stateObj && (stateObj.customContours || stateObj.customDiagramContours)) ||
                     (typeof window !== 'undefined' ? window.customDiagramContours : null);

    if (!Array.isArray(contours) || contours.length === 0) {
        drawLabelOrMath(ctx, rc, '[Upload a diagram image to trace 1px centerlines]', startX + 24, startY + 32, 18, charCounterRef, opts);
        return 54;
    }

    const boxH = 185;
    const scale = 0.90;
    for (const poly of contours) {
        if (Array.isArray(poly) && poly.length >= 2) {
            const transformed = poly.map(([px, py]) => [startX + 30 + px * scale, startY + 8 + py * scale]);
            rc.curve(transformed, {
                ...roughOpts,
                strokeWidth: 1.45 * (ink.widthScale || 1.0),
                roughness: (opts.diagRoughness ?? 0.55) * 0.42,
                bowing: (opts.diagBowing ?? 0.60) * 0.48,
                seed: charCounterRef.count++
            });
        }
    }

    const caption = params.label || 'Fig: 1px Centerline Skeletonized Diagram';
    drawLabelOrMath(ctx, rc, caption, startX + 42, startY + boxH + 4, 18, charCounterRef, opts);
    return boxH + 24;
}

export const drawCustomImage = renderCustomImage;
export default renderCustomImage;
