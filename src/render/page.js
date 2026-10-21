/**
 * STAGE 5: FULL PAGE COMPOSITOR
 * Lays out the document, the stationery, and every inked element onto the
 * notebook canvas in a single pass.
 */

import { HI_DPI, LOGICAL_W, LOGICAL_H } from '../core/config.js';
import { noise } from '../core/noise.js';
import { getInk, state } from '../core/state.js';
import { readOptions } from '../core/options.js';
import { drawAllographicChar, drawHandwrittenWord } from './glyph.js';
import { parseLatexToAST } from './math/parser.js';
import { measureMathAST } from './math/measure.js';
import { renderMathAST } from './math/renderer.js';
import { renderHandSketchedDiagram } from './diagrams/index.js';
import { drawPaperBackground, applyCameraLightingAndSpine } from './paper.js';

/**
 * True when a `[DIAGRAM: ...]` block is terminated.
 * A bare `]` closes the block, unless the payload embeds an `<svg>...</svg>`
 * island whose own `]` characters must not be mistaken for the terminator.
 */
function isDiagramBlockClosed(block) {
    const lower = block.toLowerCase();
    const svgStart = lower.indexOf('<svg');
    if (svgStart !== -1) {
        const svgEnd = lower.indexOf('</svg>', svgStart);
        if (svgEnd === -1) return false;
        return block.slice(svgEnd + 6).includes(']');
    }
    return block.includes(']');
}

/**
 * Collapses a multi-line diagram payload onto one logical line so that the
 * dispatcher's `|`-separated parts stay intact and every `key=value` value
 * stays a clean single-line string.
 */
function normalizeDiagramSpec(spec) {
    return String(spec || '').replace(/\r\n?/g, '\n').replace(/\s*\n\s*/g, ' ').trim();
}

export function renderFullPage() {
    const t0 = performance.now();

    if (typeof rough === 'undefined') {
        document.getElementById('renderTimer').textContent = 'rough.js unavailable';
        return;
    }

    const canvas = document.getElementById('notebookCanvas');
    // Ensure 2x HiDPI backing store resolution for razor-sharp rendering
    if (canvas.width !== LOGICAL_W * HI_DPI || canvas.height !== LOGICAL_H * HI_DPI) {
        canvas.width = LOGICAL_W * HI_DPI;
        canvas.height = LOGICAL_H * HI_DPI;
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(HI_DPI, 0, 0, HI_DPI, 0, 0);
    const rc = rough.canvas(canvas);

    noise.setSeed(state.handSeed);

    const opts = readOptions();

    const W = LOGICAL_W;
    const H = LOGICAL_H;
    const lineSpacing = 34;
    const topMargin = 96;
    const leftMargin = opts.paperStyle === 'cornell' ? 222 : 92;
    const rightMargin = W - 42;
    const baseFontSize = opts.fontFamily === 'Caveat' ? 27 : 23;

    ctx.clearRect(0, 0, W, H);

    // Apply subtle 3D perspective scan tilt on wrapper
    const wrapper = document.getElementById('canvasWrapper');
    const tiltDeg = (opts.pageTilt * 1.1).toFixed(2);
    wrapper.style.transform = `perspective(1200px) rotateZ(-${tiltDeg * 0.35}deg) rotateX(${tiltDeg}deg)`;

    // 1. Render Stationery Background & Ruled Lines
    drawPaperBackground(ctx, W, H, lineSpacing, topMargin, leftMargin, opts);

    // 2. Parse Document Lines, 2D Display Math ($$ ... $$), Inline Math ($ ... $), and [DIAGRAM: ...]
    const rawText = document.getElementById('docInput').value;
    const lines = rawText.split('\n');
    const charCounterRef = { count: 1 };

    let curLineIdx = 0;
    const getBaselineY = (lineIdx) => topMargin + lineIdx * lineSpacing;

    for (let l = 0; l < lines.length; l++) {
        let line = lines[l].trimEnd();
        if (getBaselineY(curLineIdx) > H - 45) break;

        // Empty line -> advance one ruled line
        if (line.trim() === '') {
            curLineIdx++;
            continue;
        }

        // A. Check for [DIAGRAM: ...] block (the payload may span several lines)
        const diagTrimmed = line.trim();
        if (/^\[DIAGRAM:/i.test(diagTrimmed)) {
            let block = diagTrimmed;
            let j = l + 1;
            while (!isDiagramBlockClosed(block) && j < lines.length) {
                block += '\n' + lines[j].trim();
                j++;
            }
            const diagMatch = block.match(/^\[DIAGRAM:\s*([\s\S]+)\]$/i);
            if (diagMatch) {
                const startY = getBaselineY(curLineIdx) - lineSpacing * 0.65;
                const usedH = renderHandSketchedDiagram(
                    ctx, rc, normalizeDiagramSpec(diagMatch[1]),
                    leftMargin + 12, startY, rightMargin - leftMargin,
                    charCounterRef, opts
                );
                curLineIdx += Math.ceil(usedH / lineSpacing);
                l = j - 1;
                continue;
            }
        }

        // B. Check for 2D Display Math Block $$ ... $$
        const displayMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
        if (displayMathMatch) {
            const latex = displayMathMatch[1].trim();
            const ast = parseLatexToAST(latex);
            const m = measureMathAST(ast, baseFontSize * 1.04, lineSpacing);

            // Allocate enough vertical ruled lines so numerators/denominators/matrices never collide
            const extraLinesTop = typeof m.linesAbove === 'number'
                ? m.linesAbove
                : Math.max(0, Math.ceil((m.ascent - 0.65 * lineSpacing) / lineSpacing));
            curLineIdx += extraLinesTop;

            const mathY = getBaselineY(curLineIdx);
            const mathX = leftMargin + Math.max(24, (rightMargin - leftMargin - m.width) * 0.32);
            renderMathAST(ctx, rc, ast, mathX, mathY, baseFontSize * 1.04, charCounterRef, opts);

            const extraLinesBot = typeof m.linesBelow === 'number'
                ? m.linesBelow
                : Math.max(1, Math.ceil((m.descent + 0.35 * lineSpacing) / lineSpacing));
            curLineIdx += extraLinesBot;
            continue;
        }

        // C. Check for Heading (# Title)
        let lineFontSize = baseFontSize;
        let underlineHeading = false;
        if (line.startsWith('# ')) {
            line = line.slice(2);
            lineFontSize = baseFontSize * 1.18;
            underlineHeading = true;
        }

        // D. Tokenize inline segments: ~~strike~~, $inline math$, or regular words
        const tokenRegex = /(~~[^~]+~~|\$[^$]+\$|\S+)/g;
        const tokens = line.match(tokenRegex) || [];

        // Slight random left-margin human indentation drift per line
        let curX = leftMargin + 10 + (noise.hash(curLineIdx * 31.7 + state.handSeed) - 0.3) * 8 * opts.baselineDrift;

        for (let t = 0; t < tokens.length; t++) {
            const tok = tokens[t];
            const baseLineY = getBaselineY(curLineIdx);
            // Slow horizontal line slope/wave across the width of the page
            const lineSlopeY = ((curX - leftMargin) / (rightMargin - leftMargin)) * 4.5 * (noise.hash(curLineIdx * 11.3) - 0.42) * opts.baselineDrift;

            if (tok.startsWith('$') && tok.endsWith('$') && tok.length > 2) {
                const inlineLatex = tok.slice(1, -1);
                const ast = parseLatexToAST(inlineLatex);
                const m = measureMathAST(ast, lineFontSize * 0.94, lineSpacing);

                if (curX + m.width > rightMargin) {
                    curLineIdx++;
                    curX = leftMargin + 12;
                }
                curX = renderMathAST(ctx, rc, ast, curX, getBaselineY(curLineIdx) + lineSlopeY, lineFontSize * 0.94, charCounterRef, opts);
                curX += lineFontSize * 0.35;
            } else {
                const isStruck = tok.startsWith('~~') && tok.endsWith('~~') && tok.length > 4;
                const cleanWord = isStruck ? tok.slice(2, -2) : tok;
                const estW = cleanWord.length * lineFontSize * 0.46;

                if (curX + estW > rightMargin && curX > leftMargin + 30) {
                    curLineIdx++;
                    curX = leftMargin + 12 + (noise.hash(curLineIdx * 19.3) - 0.5) * 6;
                }

                const wAdv = drawHandwrittenWord(
                    ctx, cleanWord, curX,
                    getBaselineY(curLineIdx) + lineSlopeY,
                    lineFontSize, charCounterRef, opts, isStruck
                );
                // Word spacing with natural human variance
                const spaceVar = 1.0 + (noise.hash(charCounterRef.count * 7.1) - 0.45) * 0.38 * opts.glyphWarp;
                curX += wAdv + (lineFontSize * 0.36 * spaceVar);
            }
        }

        // Hand-sketched underline for section headings
        if (underlineHeading) {
            const yUnder = getBaselineY(curLineIdx) + 5;
            rc.line(leftMargin + 8, yUnder, Math.min(rightMargin, curX + 10), yUnder, {
                stroke: getInk().color,
                strokeWidth: 1.7,
                roughness: opts.diagRoughness * 0.65,
                disableMultiStroke: opts.singlePassStroke,
                seed: charCounterRef.count++
            });
        }

        curLineIdx++;
    }

    // 3. Apply Stage 4 Spine Shadow & Phone Camera Lighting
    applyCameraLightingAndSpine(ctx, W, H, opts);
    ctx.restore();

    // Update telemetry
    const elapsed = Math.round(performance.now() - t0);
    document.getElementById('renderTimer').textContent = `${elapsed}ms`;
    document.getElementById('charStats').textContent = `${charCounterRef.count - 1} glyphs • 2x HiDPI Vector`;
}
