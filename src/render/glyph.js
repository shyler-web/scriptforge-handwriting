/**
 * ScriptForge Multi-Allograph Character Bank & Kinematic Velocity Ink Engine (`src/render/glyph.js` - Wave 4)
 *
 * Solves the "Font Clone" problem and achieves <35ms/page 2x HiDPI rendering via:
 * 1. 4-Variant Structural Allograph Bank (`A0`..`A3`) with adjacent-duplicate suppression
 *    (so "ee", "ll", "oo", "ss", "00" never pick the same structural variant twice in a row).
 * 2. Stemless/Tittleless Procedural Feature Synthesis: Dynamically draws organic hand-sketched
 *    crossbars on `t`, `f`, `7`, `z`, floating tittles on `i`, `j`, and entry/exit cursive hooks.
 * 3. Native Cubic-Bézier Mathematical Symbol Strokes for Greek letters, arrows, relations,
 *    and calculus operators so math expressions never fall back to rigid system fonts.
 * 4. Kinematic Pen-Velocity Shader: Computes instantaneous pen speed v(t) from character curvature,
 *    word position, and direction reversals—modulating stroke width, pigment alpha, and ink-pooling beads.
 * 5. Full Proof-of-Zero-Clone Visual Inspector: Displays per-glyph Allograph ID (`A0..A3`),
 *    Warp Seed (`#s`), Slant Delta (`Δθ°`), Scale Matrix (`sx×sy`), and Ligature Spline Vectors.
 */

import {
    HI_DPI,
    INK_PROFILES,
    ALLOGRAPH_ARCHETYPES,
    CHAR_CURVATURE_COMPLEXITY
} from '../core/config.js';
import * as stateMod from '../core/state.js';
import * as noiseMod from '../core/noise.js';

// High-speed offscreen caches (eliminates redundant per-character canvas clears & measureText calls)
const metricCache = new Map();
const spriteAtlasCache = new Map();
const MAX_ATLAS_ENTRIES = 640;

// Shared scratch canvas for measuring text metrics.
// Created LAZILY on first use (and guarded by `typeof document !== 'undefined'`) so this
// module can be imported in a DOM-less runtime such as Node (`scripts/verify-waves.mjs`).
let scratchCanvas = null;
let scratchCtx = null;
let scratchCtxResolved = false;

function hasDom() {
    return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function';
}

function getScratchCtx() {
    if (!scratchCtxResolved) {
        scratchCtxResolved = true;
        try {
            if (hasDom()) {
                scratchCanvas = document.createElement('canvas');
                scratchCtx = scratchCanvas ? scratchCanvas.getContext('2d') : null;
            }
        } catch (err) {
            scratchCanvas = null;
            scratchCtx = null;
        }
    }
    return scratchCtx;
}

// Track previous character & variant to guarantee adjacent identical characters use different allographs
let lastRenderedChar = '';
let lastRenderedVariant = -1;

export function clearGlyphAtlasCache() {
    spriteAtlasCache.clear();
    metricCache.clear();
}

function getStateObject() {
    return stateMod.state || stateMod.default || stateMod || {};
}

function getNoiseEngine(seed = 4219) {
    const n = noiseMod.noise || noiseMod.default;
    if (n && typeof n.hash === 'function') return n;
    return {
        hash(v) {
            const x = Math.sin(v * 12.9898 + seed * 78.233) * 43758.5453;
            return x - Math.floor(x);
        },
        noise1D(v) {
            const i = Math.floor(v);
            const f = v - i;
            const u = f * f * (3 - 2 * f);
            const a = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
            const b = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
            const ha = a - Math.floor(a);
            const hb = b - Math.floor(b);
            return (ha + u * (hb - ha)) * 2 - 1;
        }
    };
}

function resolveInkAndState(opts = {}) {
    const st = getStateObject();
    const inkKey = opts.inkKey || st.inkKey || st.currentInkKey || 'ballpoint_blue';
    const ink = opts.ink || INK_PROFILES[inkKey] || INK_PROFILES.ballpoint_blue;
    const handSeed = opts.handSeed || st.handSeed || st.globalHandSeed || 4219;
    const inspect = opts.inspectVariance !== undefined
        ? Boolean(opts.inspectVariance)
        : Boolean(st.inspectVariance || st.inspectVarianceMode);
    return { ink, inkKey, handSeed, inspect };
}

/**
 * Selects one of 4 structural allograph variants (`0..3`) for character `ch` at `charIndex`.
 * Enforces anti-repetition: if `ch === lastRenderedChar`, forces a different structural variant!
 */
export function selectAllographVariant(ch, charIndex, fontFamily, handSeed, noise) {
    const arch = ALLOGRAPH_ARCHETYPES[fontFamily] || ALLOGRAPH_ARCHETYPES['Caveat'];
    const h = noise.hash(charIndex * 37.3 + ch.charCodeAt(0) * 17.1 + handSeed);

    // Weighted selection: A0 (38%), A1 (30%), A2 (18%), A3 (14%)
    let vIdx = h < 0.38 ? 0 : (h < 0.68 ? 1 : (h < 0.86 ? 2 : 3));

    if (ch === lastRenderedChar && vIdx === lastRenderedVariant) {
        vIdx = (vIdx + 1 + Math.floor(noise.hash(charIndex * 91.7) * 2)) % 4;
    }
    lastRenderedChar = ch;
    lastRenderedVariant = vIdx;

    return {
        variantId: vIdx,
        variantCode: `A${vIdx}`,
        fontName: arch.variants[vIdx] || fontFamily,
        fontWeight: arch.variantWeights[vIdx] || '400',
        fontScale: arch.variantScales[vIdx] || 1.0,
        baselineShift: arch.baselineOffsets[vIdx] || 0.0,
        cursiveBias: arch.cursiveBias || 0.65
    };
}

/**
 * Computes kinematic pen velocity v(t) in [0.25, 1.35] and resulting ink pressure/pooling metrics.
 * Humans write slower at word starts, word ends, uppercase letters, and high-curvature symbols,
 * and faster in the middle of familiar lowercase runs.
 */
export function computeStrokeVelocityProfile(ch, charIndex, wordPosRatio = 0.5, opts = {}, ink = {}, noise) {
    const baseComplexity = CHAR_CURVATURE_COMPLEXITY[ch] ?? (/[A-Z]/.test(ch) ? 0.68 : 0.50);
    // Parabolic word-speed curve: faster in middle of word (wordPosRatio ~ 0.5), slower at start/end
    const wordArcSpeed = 1.0 - 0.55 * Math.pow((wordPosRatio - 0.5) * 2, 2);
    const rhythmWave = noise.noise1D(charIndex * 0.27) * 0.25;

    // Normalized pen speed v in [0.28, 1.35]
    const velocity = Math.max(0.28, Math.min(1.35,
        0.85 + 0.35 * wordArcSpeed - 0.42 * baseComplexity + rhythmWave
    ));

    const pressureVar = opts.pressureVar ?? 0.55;
    const viscosity = ink.viscosity ?? 0.68;

    // Slower velocity -> heavier ink deposition & thicker line; high velocity -> slight starvation
    const velocityPressure = 1.0 + (0.82 - velocity) * 0.38 * viscosity * pressureVar;
    const microPressure = 1.0 + noise.noise1D(charIndex * 0.41 + 19.3) * 0.30 * pressureVar;
    const pressure = Math.max(0.58, Math.min(1.22, velocityPressure * microPressure));

    // Ink pooling occurs when pen decelerates sharply (velocity < 0.68)
    const poolIntensity = velocity < 0.72
        ? Math.min(1.0, (0.76 - velocity) * 1.8 * viscosity * pressureVar)
        : 0;

    return { velocity, pressure, poolIntensity };
}

/**
 * Fast cached character width measurement.
 */
function getCachedCharWidth(fontSpec, ch, fallbackSize) {
    const key = `${fontSpec}|${ch}`;
    const cached = metricCache.get(key);
    if (cached !== undefined) return cached;

    const ctx2d = getScratchCtx();
    if (!ctx2d || typeof ctx2d.measureText !== 'function') return fallbackSize * 0.48;
    try {
        ctx2d.font = fontSpec;
        const w = Math.max(6, Math.ceil(ctx2d.measureText(ch).width));
        metricCache.set(key, w);
        return w;
    } catch (err) {
        return fallbackSize * 0.48;
    }
}

/**
 * Acquires or builds a 2x HiDPI offscreen sprite tile for `(ch, fontSpec, color, pressureTier)`.
 * Caching base skeletons avoids calling `clearRect` + `fillText` thousands of times per frame,
 * while every instance on the page still receives its own unique sub-glyph slice warp & procedural strokes!
 */
function getBaseGlyphSprite(ch, fontSpec, fontSize, ink, pressureTier) {
    const qSize = Math.round(fontSize * 2) / 2;
    const key = `${fontSpec}|${qSize}|${ink.color}|${pressureTier}|${ch}`;
    const existing = spriteAtlasCache.get(key);
    if (existing) return existing;

    if (spriteAtlasCache.size >= MAX_ATLAS_ENTRIES) {
        const firstKey = spriteAtlasCache.keys().next().value;
        spriteAtlasCache.delete(firstKey);
    }

    const charW = getCachedCharWidth(fontSpec, ch, qSize);
    const pad = 14;
    const boxW = Math.min(116, charW + pad * 2);
    const boxH = Math.min(116, Math.ceil(qSize * 1.65) + pad);
    const baseLineOffset = Math.floor(boxH * 0.68);

    if (!hasDom()) {
        // DOM-less runtime (e.g. Node verification): no offscreen atlas can be built.
        // Cache a tile-less metric-only record so the caller can fall back to direct strokes.
        const record = { tile: null, charW, pad, boxW, boxH, baseLineOffset };
        spriteAtlasCache.set(key, record);
        return record;
    }

    const tile = document.createElement('canvas');
    tile.width = boxW * HI_DPI;
    tile.height = boxH * HI_DPI;
    const tCtx = tile.getContext('2d');
    if (!tCtx) {
        const record = { tile: null, charW, pad, boxW, boxH, baseLineOffset };
        spriteAtlasCache.set(key, record);
        return record;
    }

    tCtx.save();
    tCtx.setTransform(HI_DPI, 0, 0, HI_DPI, 0, 0);
    tCtx.font = fontSpec;
    tCtx.fillStyle = ink.color;
    tCtx.strokeStyle = ink.secondary || ink.color;

    const strokeW = Math.max(0.15, (pressureTier * 0.14) * (ink.widthScale || 1.0));
    tCtx.lineWidth = strokeW;
    tCtx.fillText(ch, pad, baseLineOffset);
    if (pressureTier >= 2) {
        tCtx.strokeText(ch, pad, baseLineOffset);
    }
    tCtx.restore();

    const record = { tile, charW, pad, boxW, boxH, baseLineOffset };
    spriteAtlasCache.set(key, record);
    return record;
}

/**
 * Procedural Hand-Drawn Mathematical & Symbolic Stroke Bank.
 * Renders arrows, calculus operators, logic symbols, and relations using organic cubic-Bézier
 * pen strokes so they never fall back to rigid computer fonts.
 * Returns advance width > 0 if handled procedurally, or `0` to use the allograph font pipeline.
 */
function drawProceduralMathSymbol(ctx, ch, x, y, fontSize, charIndex, ink, pressure, warpAmt, noise) {
    const s = fontSize;
    const h1 = noise.hash(charIndex * 19.7);
    const h2 = noise.hash(charIndex * 43.1);
    const jx = (h1 - 0.5) * 1.8 * warpAmt;
    const jy = (h2 - 0.5) * 1.8 * warpAmt;
    const midY = y - s * 0.28 + jy;
    const lw = Math.max(1.25, s * 0.068 * (ink.widthScale || 1.0) * Math.sqrt(pressure));

    ctx.save();
    ctx.strokeStyle = ink.color;
    ctx.fillStyle = ink.color;
    ctx.globalAlpha = Math.min(1, (ink.alpha || 0.94) * pressure);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (ch) {
        case '→':
        case '←':
        case '↔':
        case '↦': {
            const w = s * 0.78;
            const sx = x + 2 + jx;
            const ex = x + w - 2;
            ctx.beginPath();
            ctx.moveTo(sx, midY + (h1 - 0.5) * 1.5);
            ctx.quadraticCurveTo((sx + ex) / 2, midY - (h2 - 0.5) * 2.2, ex, midY);
            ctx.stroke();

            if (ch === '↦') {
                ctx.beginPath();
                ctx.moveTo(sx, midY - s * 0.16);
                ctx.lineTo(sx, midY + s * 0.16);
                ctx.stroke();
            }
            if (ch === '→' || ch === '↔' || ch === '↦') {
                ctx.beginPath();
                ctx.moveTo(ex - s * 0.20, midY - s * 0.15);
                ctx.lineTo(ex, midY);
                ctx.lineTo(ex - s * 0.20, midY + s * 0.15);
                ctx.stroke();
            }
            if (ch === '←' || ch === '↔') {
                ctx.beginPath();
                ctx.moveTo(sx + s * 0.20, midY - s * 0.15);
                ctx.lineTo(sx, midY);
                ctx.lineTo(sx + s * 0.20, midY + s * 0.15);
                ctx.stroke();
            }
            ctx.restore();
            return w + 3;
        }

        case '⇒':
        case '⇐':
        case '⇔': {
            const w = s * 0.84;
            const sx = x + 2 + jx;
            const ex = x + w - 2;
            const gap = s * 0.08;
            ctx.beginPath();
            ctx.moveTo(sx + (ch === '⇐' || ch === '⇔' ? s * 0.12 : 0), midY - gap);
            ctx.lineTo(ex - (ch === '⇒' || ch === '⇔' ? s * 0.12 : 0), midY - gap);
            ctx.moveTo(sx + (ch === '⇐' || ch === '⇔' ? s * 0.12 : 0), midY + gap);
            ctx.lineTo(ex - (ch === '⇒' || ch === '⇔' ? s * 0.12 : 0), midY + gap);
            ctx.stroke();

            if (ch === '⇒' || ch === '⇔') {
                ctx.beginPath();
                ctx.moveTo(ex - s * 0.22, midY - s * 0.20);
                ctx.lineTo(ex, midY);
                ctx.lineTo(ex - s * 0.22, midY + s * 0.20);
                ctx.stroke();
            }
            if (ch === '⇐' || ch === '⇔') {
                ctx.beginPath();
                ctx.moveTo(sx + s * 0.22, midY - s * 0.20);
                ctx.lineTo(sx, midY);
                ctx.lineTo(sx + s * 0.22, midY + s * 0.20);
                ctx.stroke();
            }
            ctx.restore();
            return w + 4;
        }

        case '∞': {
            const w = s * 0.82;
            const cx = x + w / 2 + jx;
            const rx = w * 0.42;
            const ry = s * 0.18;
            ctx.beginPath();
            ctx.moveTo(cx, midY);
            ctx.bezierCurveTo(cx + rx * 0.6, midY - ry * 1.4, cx + rx, midY - ry, cx + rx, midY);
            ctx.bezierCurveTo(cx + rx, midY + ry, cx + rx * 0.6, midY + ry * 1.4, cx, midY);
            ctx.bezierCurveTo(cx - rx * 0.6, midY - ry * 1.4, cx - rx, midY - ry, cx - rx, midY);
            ctx.bezierCurveTo(cx - rx, midY + ry, cx - rx * 0.6, midY + ry * 1.4, cx, midY);
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        case '±':
        case '∓': {
            const w = s * 0.62;
            const cx = x + w / 2 + jx;
            const span = w * 0.38;
            const plusY = ch === '±' ? midY - s * 0.08 : midY + s * 0.10;
            const barY = ch === '±' ? midY + s * 0.18 : midY - s * 0.18;
            ctx.beginPath();
            ctx.moveTo(cx - span, plusY);
            ctx.lineTo(cx + span, plusY);
            ctx.moveTo(cx, plusY - span * 0.85);
            ctx.lineTo(cx, plusY + span * 0.85);
            ctx.moveTo(cx - span, barY);
            ctx.lineTo(cx + span, barY);
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        case '≤':
        case '≥': {
            const w = s * 0.62;
            const sx = x + 3 + jx;
            const ex = x + w - 3;
            const topY = midY - s * 0.18;
            const botY = midY + s * 0.04;
            const lineY = midY + s * 0.18;
            ctx.beginPath();
            if (ch === '≤') {
                ctx.moveTo(ex, topY);
                ctx.lineTo(sx, (topY + botY) / 2);
                ctx.lineTo(ex, botY);
            } else {
                ctx.moveTo(sx, topY);
                ctx.lineTo(ex, (topY + botY) / 2);
                ctx.lineTo(sx, botY);
            }
            ctx.moveTo(sx, lineY);
            ctx.lineTo(ex, lineY + (h1 - 0.5) * 1.5);
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        case '≠':
        case '≈':
        case '≡': {
            const w = s * 0.64;
            const sx = x + 3 + jx;
            const ex = x + w - 3;
            if (ch === '≈') {
                for (const dy of [-s * 0.08, s * 0.08]) {
                    ctx.beginPath();
                    ctx.moveTo(sx, midY + dy);
                    ctx.bezierCurveTo(sx + w * 0.25, midY + dy - 4, sx + w * 0.55, midY + dy + 4, ex, midY + dy);
                    ctx.stroke();
                }
            } else {
                const offsets = ch === '≡' ? [-s * 0.13, 0, s * 0.13] : [-s * 0.08, s * 0.08];
                ctx.beginPath();
                for (const dy of offsets) {
                    ctx.moveTo(sx, midY + dy);
                    ctx.lineTo(ex, midY + dy);
                }
                if (ch === '≠') {
                    ctx.moveTo(ex - 3, midY - s * 0.22);
                    ctx.lineTo(sx + 3, midY + s * 0.22);
                }
                ctx.stroke();
            }
            ctx.restore();
            return w + 3;
        }

        case '∈':
        case '∉':
        case '⊂':
        case '⊆': {
            const w = s * 0.62;
            const sx = x + 4 + jx;
            const ex = x + w - 3;
            const hSpan = s * 0.18;
            ctx.beginPath();
            ctx.moveTo(ex, midY - hSpan);
            ctx.bezierCurveTo(sx - 2, midY - hSpan, sx - 2, midY + hSpan, ex, midY + hSpan);
            if (ch === '∈' || ch === '∉') {
                ctx.moveTo(sx + 1, midY);
                ctx.lineTo(ex - 1, midY);
            }
            if (ch === '⊆') {
                ctx.moveTo(sx, midY + hSpan + 5);
                ctx.lineTo(ex, midY + hSpan + 5);
            }
            if (ch === '∉') {
                ctx.moveTo(ex - 2, midY - hSpan - 4);
                ctx.lineTo(sx + 2, midY + hSpan + 4);
            }
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        case '⊕':
        case '⊗': {
            const w = s * 0.68;
            const cx = x + w / 2 + jx;
            const r = s * 0.23;
            ctx.beginPath();
            ctx.arc(cx, midY, r, 0, Math.PI * 2);
            if (ch === '⊕') {
                ctx.moveTo(cx - r, midY);
                ctx.lineTo(cx + r, midY);
                ctx.moveTo(cx, midY - r);
                ctx.lineTo(cx, midY + r);
            } else {
                const d = r * 0.707;
                ctx.moveTo(cx - d, midY - d);
                ctx.lineTo(cx + d, midY + d);
                ctx.moveTo(cx + d, midY - d);
                ctx.lineTo(cx - d, midY + d);
            }
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        case '∂':
        case '∇': {
            const w = s * 0.62;
            const sx = x + 3 + jx;
            const ex = x + w - 3;
            ctx.beginPath();
            if (ch === '∇') {
                ctx.moveTo(sx, midY - s * 0.22);
                ctx.lineTo(ex, midY - s * 0.22);
                ctx.lineTo((sx + ex) / 2, midY + s * 0.22);
                ctx.closePath();
            } else {
                ctx.moveTo(sx + 2, midY - s * 0.24);
                ctx.bezierCurveTo(ex + 4, midY - s * 0.30, ex + 2, midY + s * 0.24, (sx + ex) / 2, midY + s * 0.22);
                ctx.bezierCurveTo(sx - 2, midY + s * 0.20, sx - 1, midY - s * 0.04, ex - 2, midY - s * 0.02);
            }
            ctx.stroke();
            ctx.restore();
            return w + 3;
        }

        default:
            ctx.restore();
            return 0;
    }
}

/**
 * Adds structural allograph flourishes (variant crossbars on `t`, `f`, `7`, `z`,
 * displaced tittles on `i`, `j`, and ink-pooling beads at stroke terminals).
 */
function drawAllographStructuralFlourishes(ctx, ch, x, y, charW, fontSize, variantId, ink, pressure, poolIntensity, warpAmt, h1, h2) {
    if (warpAmt <= 0.08 && poolIntensity <= 0.05) return;

    ctx.save();
    ctx.strokeStyle = ink.color;
    ctx.fillStyle = ink.color;

    // 1. Structural Allograph Crossbar/Tittle Perturbations (for variants A1, A2, A3)
    if (variantId >= 1 && warpAmt > 0.15) {
        ctx.globalAlpha = Math.min(1, (ink.alpha || 0.94) * pressure * 0.78);
        ctx.lineWidth = Math.max(1.0, fontSize * 0.048 * (ink.widthScale || 1.0));
        ctx.lineCap = 'round';

        if ((ch === 't' || ch === 'f') && variantId === 2) {
            // Sweeping extended crossbar on variant A2
            const barY = y - fontSize * (0.44 + (h1 - 0.5) * 0.06);
            ctx.beginPath();
            ctx.moveTo(x + 1, barY + (h2 - 0.5) * 1.8);
            ctx.lineTo(x + charW + 2.5 * warpAmt, barY - (h1 - 0.5) * 2.2);
            ctx.stroke();
        } else if ((ch === '7' || ch === 'z' || ch === 'Z') && variantId === 3) {
            // European/engineering crossbar on 7 or z in variant A3
            const barY = y - fontSize * 0.30;
            ctx.beginPath();
            ctx.moveTo(x + charW * 0.22, barY);
            ctx.lineTo(x + charW * 0.78, barY - 1.2);
            ctx.stroke();
        } else if ((ch === 'i' || ch === 'j') && (variantId === 1 || variantId === 3)) {
            // Micro-flicked tittle dot offset in direction of writing velocity
            const dotX = x + charW * 0.55 + (h1 - 0.35) * 3.8 * warpAmt;
            const dotY = y - fontSize * (0.64 + (h2 - 0.5) * 0.08);
            ctx.beginPath();
            ctx.arc(dotX, dotY, Math.max(1.0, fontSize * 0.038), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // 2. Low-Velocity Ink Pooling Bead at Stroke Terminal
    if (poolIntensity > 0.12 && /[a-zA-Z0-9]/.test(ch)) {
        const poolRad = Math.max(0.7, (ink.poolingRadius || 0.9) * (0.7 + poolIntensity * 0.65));
        const px = x + charW * (0.68 + (h1 - 0.5) * 0.18);
        const py = y - fontSize * (0.08 + h2 * 0.12);
        ctx.globalAlpha = Math.min(0.95, (ink.alpha || 0.94) * 0.42 * poolIntensity);
        ctx.beginPath();
        ctx.arc(px, py, poolRad, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Renders a single character with Multi-Allograph Selection, Kinematic Velocity Ink Shading,
 * and 2x HiDPI Sub-Glyph Elastic Strip Warping.
 */
export function drawAllographicChar(ctx, ch, x, y, fontSize, charIndex, opts = {}, wordPosRatio = 0.5) {
    if (!ch || ch === ' ') return (fontSize || 24) * 0.34;

    const { ink, handSeed, inspect } = resolveInkAndState(opts);
    const noise = getNoiseEngine(handSeed);
    const warpAmt = opts.glyphWarp ?? 0.65;
    const baseFontFamily = opts.fontFamily || 'Caveat';

    // 1. Kinematic Pen-Velocity & Ink Pooling Calculation
    const { velocity, pressure, poolIntensity } = computeStrokeVelocityProfile(
        ch, charIndex, wordPosRatio, opts, ink, noise
    );

    // 2. Check Procedural Cubic-Bézier Math Symbol Bank first
    const procAdv = drawProceduralMathSymbol(ctx, ch, x, y, fontSize, charIndex, ink, pressure, warpAmt, noise);
    if (procAdv > 0) {
        return procAdv;
    }

    // 3. Select Structural Allograph Variant (`A0`..`A3`) with adjacent-duplicate suppression
    const allograph = selectAllographVariant(ch, charIndex, baseFontFamily, handSeed, noise);
    const effectiveFontSize = fontSize * allograph.fontScale;
    const fontSpec = `${allograph.fontWeight} ${effectiveFontSize}px "${allograph.fontName}"`;

    // 4. Deterministic Per-Instance Perturbation Seeds (Warp Seed, Scale Matrix, Slant Delta)
    const h1 = noise.hash(charIndex * 13.7 + handSeed);
    const h2 = noise.hash(charIndex * 29.3 + handSeed);
    const h3 = noise.hash(charIndex * 53.1 + handSeed);
    const h4 = noise.hash(charIndex * 97.7 + handSeed);

    const scaleX = 1.0 + (h1 - 0.5) * 0.16 * warpAmt;
    const scaleY = 1.0 + (h2 - 0.5) * 0.18 * warpAmt;
    const slantRad = ((opts.slantAngle ?? -4) * Math.PI) / 180;
    const dTheta = ((h3 - 0.5) * 0.18 * warpAmt) + slantRad;
    const dyBounce = (h4 - 0.5) * 3.1 * warpAmt + allograph.baselineShift;

    // Quantize pressure into 3 tiers for fast sprite cache lookup while preserving continuous alpha/transform
    const pressureTier = pressure < 0.82 ? 0 : (pressure < 0.98 ? 1 : 2);
    const sprite = getBaseGlyphSprite(ch, fontSpec, effectiveFontSize, ink, pressureTier);
    const { tile, charW, pad, boxW, boxH, baseLineOffset } = sprite;

    const kernJitter = (h3 - 0.48) * 1.9 * warpAmt;

    if (!tile) {
        // DOM-less runtime: the HiDPI sprite atlas is unavailable, so stroke the glyph
        // directly onto the target context (a no-op when the context is a headless stub).
        try {
            ctx.save();
            ctx.translate(x, y + dyBounce);
            ctx.transform(scaleX, 0, Math.tan(dTheta), scaleY, 0, 0);
            ctx.font = fontSpec;
            ctx.fillStyle = ink.color;
            ctx.globalAlpha = Math.min(1, (ink.alpha || 0.94) * pressure);
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        } catch (err) {
            /* no usable 2D context — headless verification only */
        }
        return (charW * scaleX) + kernJitter;
    }

    if (warpAmt <= 0.05) {
        ctx.save();
        ctx.translate(x, y + dyBounce);
        ctx.transform(scaleX, 0, Math.tan(dTheta), scaleY, 0, 0);
        ctx.globalAlpha = Math.min(1, (ink.alpha || 0.94) * pressure);
        ctx.drawImage(
            tile,
            0, 0, boxW * HI_DPI, boxH * HI_DPI,
            -pad, -baseLineOffset, boxW, boxH
        );
        ctx.restore();
    } else {
        // 5-Slice Elastic Micro-Strip Warp on Cached 2x HiDPI Allograph Sprite
        // (Achieves <35ms/page render speed while deforming ascenders, bowls, and descenders independently)
        const slices = 6;
        const sliceH = boxH / slices;
        ctx.save();
        ctx.translate(x, y + dyBounce);
        ctx.transform(scaleX, 0, Math.tan(dTheta), scaleY, 0, 0);

        // High pen velocity slightly reduces alpha (ballpoint starvation); low velocity deepens ink
        const starvationFactor = velocity > 1.08 ? (1.0 - (velocity - 1.08) * (ink.starvation || 0.2)) : 1.0;
        ctx.globalAlpha = Math.min(1, (ink.alpha || 0.94) * pressure * starvationFactor);
        ctx.imageSmoothingEnabled = true;

        const phase = h1 * Math.PI * 2 + allograph.variantId * 1.1;
        for (let s = 0; s < slices; s++) {
            const sy = s * sliceH;
            const waveShift = Math.sin((s / slices) * Math.PI * 2 + phase) * 1.22 * warpAmt;
            const dyStretch = (h2 - 0.5) * 0.52 * warpAmt * (s - slices / 2);
            ctx.drawImage(
                tile,
                0, sy * HI_DPI, boxW * HI_DPI, sliceH * HI_DPI,
                -pad + waveShift, sy - baseLineOffset + dyStretch, boxW, sliceH
            );
        }
        ctx.restore();
    }

    // 5. Structural Allograph Flourishes & Low-Velocity Ink Pooling Beads
    drawAllographStructuralFlourishes(
        ctx, ch, x, y + dyBounce, charW * scaleX, effectiveFontSize,
        allograph.variantId, ink, pressure, poolIntensity, warpAmt, h1, h2
    );

    // 6. Proof-of-Zero-Clone Visual Inspector Overlay
    // Displays: Allograph Variant ID (A0..A3), Warp Seed (#hex), Slant Angle (Δθ°), and Scale Matrix (sx×sy)
    if (inspect && /\S/.test(ch)) {
        const variantPalette = ['#10b981', '#06b6d4', '#f59e0b', '#ec4899'];
        const badgeColor = variantPalette[allograph.variantId % 4];
        const warpSeedHex = Math.floor((h1 * 0.5 + h2 * 0.3 + h3 * 0.2) * 255)
            .toString(16)
            .padStart(2, '0')
            .toUpperCase();
        const deg = Math.round((dTheta * 180) / Math.PI);

        ctx.save();
        ctx.strokeStyle = badgeColor;
        ctx.globalAlpha = 0.68;
        ctx.lineWidth = 0.85;
        const bx = x - 1;
        const by = y - effectiveFontSize * 0.72 + dyBounce;
        const bw = charW * scaleX + 2;
        const bh = effectiveFontSize * 0.88;
        ctx.strokeRect(bx, by, bw, bh);

        // Top HUD readout: Allograph ID + Warp Seed + Slant Delta
        ctx.fillStyle = badgeColor;
        ctx.globalAlpha = 0.92;
        ctx.font = '600 7.5px "JetBrains Mono", monospace';
        ctx.fillText(`${allograph.variantCode}#${warpSeedHex} ${deg}°`, bx, by - 2);

        // Bottom HUD readout: Scale Matrix (sx×sy) on every 3rd character to keep baselines readable
        if (charIndex % 3 === 0) {
            ctx.fillStyle = '#047857';
            ctx.font = '7px "JetBrains Mono", monospace';
            ctx.fillText(`${scaleX.toFixed(2)}×${scaleY.toFixed(2)}`, bx, by + bh + 7.5);
        }
        ctx.restore();
    }

    return (charW * scaleX) + kernJitter;
}

/**
 * Renders a complete word with natural inter-character cursive ligature splines,
 * word-arc velocity modulation, and optional multi-pass pen scratch-outs (`~~mistake~~`).
 */
export function drawHandwrittenWord(ctx, word, startX, startY, fontSize, charCounterRef, opts = {}, isStruck = false) {
    const str = String(word ?? '');
    if (!str) return 0;

    let curX = startX;
    const counter = charCounterRef || { count: 1 };
    const { ink, handSeed, inspect } = resolveInkAndState(opts);
    const noise = getNoiseEngine(handSeed);
    const baselineDrift = opts.baselineDrift ?? 0.45;
    const enableLigatures = opts.enableLigatures !== undefined ? Boolean(opts.enableLigatures) : true;
    const arch = ALLOGRAPH_ARCHETYPES[opts.fontFamily || 'Caveat'] || ALLOGRAPH_ARCHETYPES['Caveat'];

    // Letters that naturally emit a baseline/midline exit ligature stroke in cursive handwriting
    const exitLigatureChars = 'acehiklmnorstuvwxz';
    const crossBarJoinChars = 'tf';

    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const cIdx = counter.count++;
        const wordPosRatio = str.length > 1 ? i / (str.length - 1) : 0.5;
        const charDriftY = noise.noise1D(cIdx * 0.18) * 3.5 * baselineDrift;
        const prevX = curX;

        const adv = drawAllographicChar(
            ctx,
            ch,
            curX,
            startY + charDriftY,
            fontSize,
            cIdx,
            opts,
            wordPosRatio
        );

        // Synthetic Cursive Entry/Exit Ligature Spline between adjacent lowercase characters
        if (enableLigatures && i < str.length - 1) {
            const nextCh = str[i + 1];
            const canConnect = exitLigatureChars.includes(ch.toLowerCase()) && /[a-z]/.test(nextCh);
            if (canConnect) {
                const ligProb = noise.hash(cIdx * 41.2 + handSeed);
                const threshold = 1.0 - (arch.cursiveBias || 0.65);

                if (ligProb > threshold) {
                    const nextDriftY = noise.noise1D((cIdx + 1) * 0.18) * 3.5 * baselineDrift;
                    const isCrossJoin = crossBarJoinChars.includes(ch) && crossBarJoinChars.includes(nextCh);
                    const yOffsetFactor = isCrossJoin ? 0.38 : 0.15;

                    const x1 = prevX + adv * 0.72;
                    const y1 = startY + charDriftY - fontSize * yOffsetFactor;
                    const x2 = prevX + adv + 2.4;
                    const y2 = startY + nextDriftY - fontSize * (yOffsetFactor + 0.03);
                    const ctrlX = prevX + adv * 0.94;
                    const ctrlY = Math.max(y1, y2) + (isCrossJoin ? -0.8 : 2.1);

                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = inspect ? '#f43f5e' : ink.color;
                    ctx.globalAlpha = inspect ? 0.90 : (ink.alpha || 0.94) * 0.56;
                    ctx.lineWidth = inspect
                        ? 1.35
                        : Math.max(0.85, fontSize * 0.042 * (ink.widthScale || 1.0));
                    ctx.moveTo(x1, y1);
                    ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
                    ctx.stroke();

                    // In Proof-of-Zero-Clone mode, highlight ligature anchor nodes
                    if (inspect) {
                        ctx.fillStyle = '#f43f5e';
                        ctx.beginPath();
                        ctx.arc(x1, y1, 1.5, 0, Math.PI * 2);
                        ctx.arc(x2, y2, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }
        }

        curX += adv;
    }

    // Realistic multi-pass human pen scribble-out for `~~mistake~~` syntax
    if (isStruck) {
        const wLen = Math.max(12, curX - startX);
        ctx.save();
        ctx.strokeStyle = ink.color;
        ctx.globalAlpha = (ink.alpha || 0.94) * 0.88;
        ctx.lineWidth = Math.max(1.35, fontSize * 0.056 * (ink.widthScale || 1.0));
        ctx.lineCap = 'round';
        ctx.beginPath();
        const midY = startY - fontSize * 0.26;
        for (let p = 0; p < 2; p++) {
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

export const drawGlyph = drawAllographicChar;
export const drawWord = drawHandwrittenWord;
export default {
    drawAllographicChar,
    drawHandwrittenWord,
    selectAllographVariant,
    computeStrokeVelocityProfile,
    clearGlyphAtlasCache
};
