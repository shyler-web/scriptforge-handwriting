import { HI_DPI } from '../core/config.js';
import { noise } from '../core/noise.js';
import { getInk, state } from '../core/state.js';

// Offscreen buffer for sub-glyph elastic strip slicing (solves the "Font Clone" giveaway)
const glyphBuffer = document.createElement('canvas');
glyphBuffer.width = 128 * HI_DPI;
glyphBuffer.height = 128 * HI_DPI;
const gCtx = glyphBuffer.getContext('2d');

/**
 * Renders a single character with unique Allographic Perturbation.
 * Slices the character glyph into horizontal & vertical strips and shifts them via
 * continuous Perlin noise + affine shear + variable ink pressure so NO TWO LETTERS ARE IDENTICAL.
 */
export function drawAllographicChar(ctx, ch, x, y, fontSize, charIndex, opts) {
    if (ch === ' ') return fontSize * 0.34;

    const ink = getInk();
    const warpAmt = opts.glyphWarp;
    const pressureVar = opts.pressureVar;

    // Unique deterministic parameters for this specific character instance
    const h1 = noise.hash(charIndex * 13.7 + state.handSeed);
    const h2 = noise.hash(charIndex * 29.3 + state.handSeed);
    const h3 = noise.hash(charIndex * 53.1 + state.handSeed);
    const h4 = noise.hash(charIndex * 97.7 + state.handSeed);

    // Instance-level scale, slant, and vertical micro-bounce
    const scaleX = 1.0 + (h1 - 0.5) * 0.16 * warpAmt;
    const scaleY = 1.0 + (h2 - 0.5) * 0.18 * warpAmt;
    const dTheta = ((h3 - 0.5) * 0.18 * warpAmt) + (opts.slantAngle * Math.PI / 180);
    const dyBounce = (h4 - 0.5) * 3.2 * warpAmt;

    // Measure base advance width
    gCtx.font = `${fontSize}px "${opts.fontFamily}"`;
    const metrics = gCtx.measureText(ch);
    const charW = Math.max(8, Math.ceil(metrics.width));

    // Modulate ink opacity & stroke thickness from simulated pen velocity/pressure
    const pressure = Math.max(0.55, Math.min(1.15, 1.0 + (noise.noise1D(charIndex * 0.35) * 0.45 * pressureVar)));

    if (warpAmt <= 0.05) {
        // Fast direct render if warp is turned off
        ctx.save();
        ctx.translate(x, y + dyBounce);
        ctx.transform(scaleX, 0, Math.tan(dTheta), scaleY, 0, 0);
        ctx.font = `${fontSize}px "${opts.fontFamily}"`;
        ctx.fillStyle = ink.color;
        ctx.globalAlpha = ink.alpha * pressure;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
    } else {
        // HI-DPI SUB-GLYPH ELASTIC STRIP WARPING (Sharp 2x supersampled anti-clone geometry)
        const pad = 18;
        const boxW = Math.min(120, charW + pad * 2);
        const boxH = Math.min(120, Math.ceil(fontSize * 1.65) + pad);
        const baseLineOffset = Math.floor(boxH * 0.68);

        gCtx.save();
        gCtx.setTransform(HI_DPI, 0, 0, HI_DPI, 0, 0);
        gCtx.clearRect(0, 0, boxW, boxH);
        gCtx.font = `${fontSize}px "${opts.fontFamily}"`;
        gCtx.fillStyle = ink.color;
        gCtx.strokeStyle = ink.secondary;
        gCtx.lineWidth = Math.max(0.2, (pressure - 0.78) * 1.15 * ink.widthScale);
        gCtx.fillText(ch, pad, baseLineOffset);
        if (pressure > 0.85) {
            gCtx.strokeText(ch, pad, baseLineOffset);
        }
        gCtx.restore();

        // Slice the HiDPI offscreen glyph into 8 horizontal micro-strips
        const slices = 8;
        const sliceH = boxH / slices;
        ctx.save();
        ctx.translate(x, y + dyBounce);
        ctx.transform(scaleX, 0, Math.tan(dTheta), scaleY, 0, 0);
        ctx.globalAlpha = Math.min(1, ink.alpha * pressure);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        for (let s = 0; s < slices; s++) {
            const sy = s * sliceH;
            const waveShift = Math.sin((s / slices) * Math.PI * 2 + h1 * 6.28) * 1.15 * warpAmt;
            const dyStretch = (h2 - 0.5) * 0.55 * warpAmt * (s - slices / 2);
            ctx.drawImage(
                glyphBuffer,
                0, sy * HI_DPI, boxW * HI_DPI, sliceH * HI_DPI,
                -pad + waveShift, sy - baseLineOffset + dyStretch, boxW, sliceH
            );
        }
        ctx.restore();
    }

    // Proof-of-Zero-Clone Visual Inspector Overlay
    if (state.inspectVariance && /[a-zA-Z0-9]/.test(ch)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x - 1, y - fontSize * 0.72 + dyBounce, charW * scaleX + 2, fontSize * 0.88);
        ctx.fillStyle = '#059669';
        ctx.font = '8px "JetBrains Mono", monospace';
        const deg = Math.round((dTheta * 180) / Math.PI);
        ctx.fillText(`${deg}°`, x, y - fontSize * 0.76 + dyBounce);
        ctx.restore();
    }

    // Advance width with natural kerning jitter
    const kernJitter = (h3 - 0.48) * 1.9 * warpAmt;
    return (charW * scaleX) + kernJitter;
}

/**
 * Renders a complete word with natural inter-character ligature strokes
 * and optional scratch-out strike-through.
 */
export function drawHandwrittenWord(ctx, word, startX, startY, fontSize, charCounterRef, opts, isStruck = false) {
    let curX = startX;
    const ink = getInk();
    const connectables = 'aceimnorsuvwxz';

    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const cIdx = charCounterRef.count++;
        const charDriftY = noise.noise1D(cIdx * 0.18) * 3.5 * opts.baselineDrift;
        const prevX = curX;
        const adv = drawAllographicChar(ctx, ch, curX, startY + charDriftY, fontSize, cIdx, opts);

        // Synthetic organic ligature stroke between lowercase letters
        if (opts.enableLigatures && i < word.length - 1) {
            const nextCh = word[i + 1];
            if (connectables.includes(ch.toLowerCase()) && /[a-z]/.test(nextCh)) {
                const ligProb = noise.hash(cIdx * 41.2 + state.handSeed);
                if (ligProb > 0.32) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = ink.color;
                    ctx.globalAlpha = ink.alpha * 0.58;
                    ctx.lineWidth = Math.max(0.9, fontSize * 0.042 * ink.widthScale);
                    const yExit = startY + charDriftY - fontSize * 0.14;
                    const nextDriftY = noise.noise1D((cIdx + 1) * 0.18) * 3.5 * opts.baselineDrift;
                    const yEntry = startY + nextDriftY - fontSize * 0.18;
                    ctx.moveTo(prevX + adv * 0.72, yExit);
                    ctx.quadraticCurveTo(
                        prevX + adv * 0.92,
                        Math.max(yExit, yEntry) + 1.8,
                        prevX + adv + 2.2,
                        yEntry
                    );
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
        curX += adv;
    }

    // Realistic human multi-zig-zag pen scratch-out for ~~mistake~~ syntax
    if (isStruck) {
        const wLen = curX - startX;
        ctx.save();
        ctx.strokeStyle = ink.color;
        ctx.globalAlpha = ink.alpha * 0.88;
        ctx.lineWidth = Math.max(1.3, fontSize * 0.055 * ink.widthScale);
        ctx.beginPath();
        const midY = startY - fontSize * 0.26;
        const passes = 2;
        for (let p = 0; p < passes; p++) {
            const yOff = (p - 0.5) * 4.5;
            ctx.moveTo(startX - 3, midY + yOff + (noise.hash(startX + p) - 0.5) * 4);
            ctx.bezierCurveTo(
                startX + wLen * 0.33, midY - 5 + yOff,
                startX + wLen * 0.66, midY + 5 + yOff,
                curX + 4, midY + yOff + (noise.hash(curX + p) - 0.5) * 4
            );
        }
        ctx.stroke();
        ctx.restore();
    }

    return curX - startX;
}
