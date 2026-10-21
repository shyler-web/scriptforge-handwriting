import { noise } from '../core/noise.js';

/**
 * STAGE 4: PHYSICAL STATIONERY & LIGHTING RENDERER
 */
export function drawPaperBackground(ctx, width, height, lineSpacing, topMargin, leftMargin, opts) {
    // Base warm paper tone
    ctx.fillStyle = '#fcfaf2';
    ctx.fillRect(0, 0, width, height);

    // Back-of-page faint ghosting / fiber texture
    if (opts.paperGrain > 0.05) {
        ctx.save();
        ctx.globalAlpha = opts.paperGrain * 0.065;
        ctx.fillStyle = '#475569';
        for (let i = 0; i < 420; i++) {
            const rx = noise.hash(i * 19.1) * width;
            const ry = noise.hash(i * 37.7) * height;
            const rw = 1 + noise.hash(i * 7.3) * 2.5;
            ctx.fillRect(rx, ry, rw, 1);
        }
        ctx.restore();
    }

    const style = opts.paperStyle;

    // Ruled Notebook Lines
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

        // Binder punch holes on left edge
        if (style === 'ruled_margin') {
            const holeYs = [130, height / 2, height - 130];
            for (const hy of holeYs) {
                ctx.beginPath();
                ctx.arc(32, hy, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#1e293b';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.25)';
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

export function applyCameraLightingAndSpine(ctx, width, height, opts) {
    // Left notebook spine fold depth gradient
    if (opts.pageTilt > 0.05) {
        const spineGrad = ctx.createLinearGradient(0, 0, 58, 0);
        spineGrad.addColorStop(0, `rgba(15, 23, 42, ${0.22 * opts.pageTilt})`);
        spineGrad.addColorStop(0.5, `rgba(15, 23, 42, ${0.06 * opts.pageTilt})`);
        spineGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = spineGrad;
        ctx.fillRect(0, 0, 58, height);
    }

    // Overhead smartphone shadow & natural corner vignette
    if (opts.camShadow > 0.05) {
        const shadowGrad = ctx.createRadialGradient(
            width * 0.38, height * 0.35, width * 0.18,
            width * 0.55, height * 0.58, width * 0.92
        );
        shadowGrad.addColorStop(0, 'rgba(255, 253, 245, 0)');
        shadowGrad.addColorStop(0.65, `rgba(30, 35, 48, ${0.14 * opts.camShadow})`);
        shadowGrad.addColorStop(1, `rgba(15, 20, 32, ${0.42 * opts.camShadow})`);
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(0, 0, width, height);
    }
}
