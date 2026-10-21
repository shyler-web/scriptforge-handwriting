/**
 * ScriptForge Per-Page Physical Stationery & Optical Lighting Compositor (`src/render/paper.js` - Wave 3)
 * Uses `pageIndex` to vary fiber grain, margin micro-drift, and camera shadow per page
 * so multi-page documents never look like identical cloned backgrounds.
 */

import * as noiseMod from '../core/noise.js';

/**
 * Deterministic per-page seed offset (mission exit criterion 4):
 * every page derives its grain, margin drift and lighting vignette from
 * `handSeed + pageIndex * PAGE_SEED_STRIDE`.
 */
export const PAGE_SEED_STRIDE = 1009;

function pageSeedFor(opts, pageIndex) {
    return (opts.handSeed || 4219) + pageIndex * PAGE_SEED_STRIDE;
}

function getNoiseHash(n, seed = 4219) {
    if (noiseMod.noise && typeof noiseMod.noise.hash === 'function') {
        return noiseMod.noise.hash(n + seed * 0.13);
    }
    if (typeof noiseMod.hash === 'function') {
        return noiseMod.hash(n + seed * 0.13);
    }
    const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * Draws the physical paper substrate, ruled lines, red margin lines, and binder holes for `pageIndex`.
 */
export function drawPaperBackground(ctx, width, height, lineSpacing, topMargin, leftMargin, opts = {}, pageIndex = 0) {
    const pageSeed = pageSeedFor(opts, pageIndex);

    // Warm physical notebook sheet tone with slight per-page warmth variation
    ctx.fillStyle = '#fcfaf2';
    ctx.fillRect(0, 0, width, height);

    // Back-of-page faint fiber texture & ink ghosting
    if ((opts.paperGrain ?? 0.4) > 0.04) {
        ctx.save();
        ctx.globalAlpha = (opts.paperGrain ?? 0.4) * 0.065;
        ctx.fillStyle = '#475569';
        for (let i = 0; i < 420; i++) {
            const rx = getNoiseHash(i * 19.1, pageSeed) * width;
            const ry = getNoiseHash(i * 37.7, pageSeed) * height;
            const rw = 1 + getNoiseHash(i * 7.3, pageSeed) * 2.5;
            ctx.fillRect(rx, ry, rw, 1);
        }
        ctx.restore();
    }

    const style = opts.paperStyle || 'ruled_margin';

    if (style === 'ruled_margin' || style === 'cornell') {
        ctx.save();
        ctx.strokeStyle = 'rgba(116, 169, 216, 0.52)';
        ctx.lineWidth = 1.1;
        for (let y = topMargin; y < height - 35; y += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Top header double rule
        ctx.strokeStyle = 'rgba(116, 169, 216, 0.68)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(0, topMargin - lineSpacing);
        ctx.lineTo(width, topMargin - lineSpacing);
        ctx.stroke();

        // Vertical red margin line (double line)
        ctx.strokeStyle = 'rgba(219, 105, 118, 0.58)';
        ctx.lineWidth = 1.2;
        const mX = style === 'cornell' ? 210 : leftMargin;
        ctx.beginPath();
        ctx.moveTo(mX, 0);
        ctx.lineTo(mX, height);
        ctx.moveTo(mX + 4, 0);
        ctx.lineTo(mX + 4, height);
        ctx.stroke();

        // 3-ring binder punch holes on left edge
        if (style === 'ruled_margin') {
            const holeYs = [130, height / 2, height - 130];
            for (let hIdx = 0; hIdx < holeYs.length; hIdx++) {
                const hy = holeYs[hIdx] + (getNoiseHash(hIdx * 11, pageSeed) - 0.5) * 2.5;
                ctx.beginPath();
                ctx.arc(32, hy, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.22)';
                ctx.stroke();
            }
        }
        ctx.restore();
    } else if (style === 'engineering_grid') {
        ctx.save();
        ctx.strokeStyle = 'rgba(110, 168, 145, 0.34)';
        ctx.lineWidth = 0.85;
        const gridStep = lineSpacing / 2;
        for (let y = topMargin - gridStep * 2; y < height; y += gridStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        for (let x = 0; x < width; x += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        ctx.restore();
    }
}

/**
 * Applies 3D spine curvature gradient and overhead phone-camera vignette lighting.
 */
export function applyCameraLightingAndSpine(ctx, width, height, opts = {}, pageIndex = 0) {
    const pageTilt = opts.pageTilt ?? 0.30;
    const camShadow = opts.camShadow ?? 0.35;
    const pageSeed = pageSeedFor(opts, pageIndex);

    if (pageTilt > 0.04) {
        const spineGrad = ctx.createLinearGradient(0, 0, 58, 0);
        spineGrad.addColorStop(0, `rgba(15, 23, 42, ${0.22 * pageTilt})`);
        spineGrad.addColorStop(0.5, `rgba(15, 23, 42, ${0.06 * pageTilt})`);
        spineGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = spineGrad;
        ctx.fillRect(0, 0, 58, height);
    }

    if (camShadow > 0.04) {
        // Subtle per-page camera focal shift
        const fx = width * (0.36 + (getNoiseHash(1, pageSeed) - 0.5) * 0.08);
        const fy = height * (0.34 + (getNoiseHash(2, pageSeed) - 0.5) * 0.08);
        const shadowGrad = ctx.createRadialGradient(
            fx, fy, width * 0.18,
            width * 0.55, height * 0.58, width * 0.92
        );
        shadowGrad.addColorStop(0, 'rgba(255, 253, 245, 0)');
        shadowGrad.addColorStop(0.65, `rgba(30, 35, 48, ${0.14 * camShadow})`);
        shadowGrad.addColorStop(1, `rgba(15, 20, 32, ${0.42 * camShadow})`);
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(0, 0, width, height);
    }
}

export default { drawPaperBackground, applyCameraLightingAndSpine };
