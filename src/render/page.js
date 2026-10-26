/**
 * ScriptForge Multi-Page Notebook Flow & Line-Snap Compositor (`src/render/page.js` - Wave 3 + v1.1 Polish)
 * Automatically paginates arbitrarily long documents across Page 1..N canvases inside `#pagesContainer`
 * while preserving `#notebookCanvas` as Page 1 for 100% backward compatibility.
 * Never splits a 2D equation or diagram across a page boundary.
 * v1.1 polish: horizontal auto-scaling for wide `$$ ... $$` display math, punctuation-safe
 * inline math tokenization, multi-word `~~strike-through~~` support, and +18px vertical
 * clearance between consecutive diagram blocks.
 */

import { HI_DPI, LOGICAL_W, LOGICAL_H, INK_PROFILES } from '../core/config.js';
import { state } from '../core/state.js';
import { getRenderOptions } from '../core/options.js';
import * as noiseMod from '../core/noise.js';
import { drawHandwrittenWord, drawAllographicChar } from './glyph.js';
import { drawPaperBackground, applyCameraLightingAndSpine } from './paper.js';
import { parseLatexToAST } from './math/parser.js';
import { measureMathAST } from './math/measure.js';
import { renderMathAST } from './math/renderer.js';
import { renderHandSketchedDiagram, parseDiagramSpec } from './diagrams/index.js';

function getNoiseEngine() {
    return noiseMod.noise || noiseMod.default || {
        setSeed() {},
        hash(n) {
            const x = Math.sin(n * 12.9898 + (state.handSeed || 4219) * 78.233) * 43758.5453;
            return x - Math.floor(x);
        },
        noise1D(x) {
            return Math.sin(x * 1.7 + (state.handSeed || 4219));
        }
    };
}

/**
 * Estimates the vertical pixel height of a `[DIAGRAM: ...]` block prior to drawing
 * so the page compositor knows whether to break to a new page first.
 * Estimates are deliberately upper bounds: over-reserving a few ruled lines is
 * cheap, while under-reserving would clip a diagram at the page bottom.
 */
function estimateDiagramHeight(specStr, lineSpacing = 34) {
    const { diagType, params } = parseDiagramSpec(specStr);
    if (diagType === 'bitfield' || params.fields || params.bits) return 118;
    if (diagType === 'kmap' || params.ones) return 224;
    if (diagType === 'grid' || diagType === 'table') {
        if (params.cells) return params.pointers ? 124 : 88;
        const rows = (params.rows || '').split(';').filter(Boolean).length;
        return Math.max(96, (rows + 1) * 34 + 28);
    }
    if (diagType === 'tree') return 180;
    if (diagType === 'list' || params.list) return 76;
    if (diagType === 'svg') return (parseFloat(params.height) || 195) + 24;
    if (diagType === 'schematic' || diagType === 'circuit' || diagType === 'flipflop' || diagType === 'dfa') return 200;
    if (diagType === 'canvas2d' || diagType === 'plot' || diagType === 'geometry') return 210;
    return 175;
}

/**
 * Ensures `#pagesContainer` has at least `pageIndex + 1` initialized HiDPI canvases,
 * reusing `#notebookCanvas` for `pageIndex === 0`.
 */
function acquirePageSurface(pageIndex, W, H, dpr, opts) {
    let container = document.getElementById('pagesContainer');
    const primaryCanvas = document.getElementById('notebookCanvas');

    if (!container && primaryCanvas) {
        container = primaryCanvas.parentElement;
    }

    let canvas = null;
    if (pageIndex === 0 && primaryCanvas) {
        canvas = primaryCanvas;
        canvas.classList.add('notebook-page-canvas');
        canvas.dataset.pageIndex = '0';
    } else if (container) {
        const existing = container.querySelectorAll('canvas.notebook-page-canvas');
        if (existing[pageIndex]) {
            canvas = existing[pageIndex];
        } else {
            canvas = document.createElement('canvas');
            canvas.className = 'notebook-page-canvas w-full max-w-[680px] h-auto rounded-sm paper-shadow bg-white mt-6';
            canvas.dataset.pageIndex = String(pageIndex);
            container.appendChild(canvas);
        }
    }

    if (!canvas) {
        canvas = document.createElement('canvas');
    }

    canvas.classList.remove('hidden');
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const rc = typeof window !== 'undefined' && window.rough
        ? window.rough.canvas(canvas)
        : null;

    const lineSpacing = 34;
    const topMargin = 96;
    const leftMargin = opts.paperStyle === 'cornell' ? 222 : 92;

    drawPaperBackground(ctx, W, H, lineSpacing, topMargin, leftMargin, opts, pageIndex);

    return { canvas, ctx, rc, pageIndex };
}

/**
 * Hides any surplus page canvases from previous longer renders and returns the active canvas list.
 */
function finalizePageSurfaces(totalPagesUsed, W, H, opts) {
    const allCanvases = Array.from(document.querySelectorAll('canvas.notebook-page-canvas'));
    const activeCanvases = [];

    allCanvases.forEach((cv, idx) => {
        if (idx < totalPagesUsed) {
            cv.classList.remove('hidden');
            const ctx = cv.getContext('2d');
            // Draw subtle handwritten page number in top-right margin if multi-page
            if (totalPagesUsed > 1) {
                const charCounter = { count: 9000 + idx * 37 };
                drawHandwrittenWord(ctx, `Pg. ${idx + 1}/${totalPagesUsed}`, W - 118, 56, 17, charCounter, opts, false);
            }
            applyCameraLightingAndSpine(ctx, W, H, opts, idx);
            ctx.restore();
            activeCanvases.push(cv);
        } else if (idx > 0) {
            cv.classList.add('hidden');
        }
    });

    state.pageCount = totalPagesUsed;
    const pageBadge = document.getElementById('pageCountBadge');
    if (pageBadge) {
        pageBadge.textContent = `${totalPagesUsed} ${totalPagesUsed === 1 ? 'Page' : 'Pages'}`;
    }

    return activeCanvases;
}

/**
 * Renders the entire document across 1 or more notebook pages (`Page 1..N`).
 */
export function renderFullPage() {
    const t0 = performance.now();
    const opts = getRenderOptions();
    const noise = getNoiseEngine();
    if (typeof noise.setSeed === 'function') {
        noise.setSeed(opts.handSeed);
    }

    const W = LOGICAL_W || 820;
    const H = LOGICAL_H || 1100;
    const dpr = HI_DPI || 2;
    const lineSpacing = 34;
    const topMargin = 96;
    const bottomLimitY = H - 52;
    const leftMargin = opts.paperStyle === 'cornell' ? 222 : 92;
    const rightMargin = W - 42;
    const baseFontSize = opts.fontFamily === 'Caveat' ? 27 : 23;

    // Apply subtle 3D perspective scan tilt on wrapper
    const wrapper = document.getElementById('canvasWrapper') || document.getElementById('pagesContainer');
    if (wrapper) {
        const tiltDeg = (opts.pageTilt * 0.85).toFixed(2);
        const zoom = state.zoomLevel || 1.0;
        wrapper.style.transform = `scale(${zoom}) perspective(1400px) rotateZ(-${(tiltDeg * 0.25).toFixed(2)}deg) rotateX(${tiltDeg}deg)`;
        wrapper.style.transformOrigin = 'top center';
    }

    const docEl = document.getElementById('docInput');
    const rawText = docEl ? docEl.value : '';
    const rawLines = rawText.split('\n');
    const charCounterRef = { count: 1 };

    let curPageIdx = 0;
    let curLineIdx = 0;
    let surface = acquirePageSurface(curPageIdx, W, H, dpr, opts);

    const getBaselineY = (lineIdx) => topMargin + lineIdx * lineSpacing;

    const advanceToNextPage = () => {
        curPageIdx++;
        curLineIdx = 0;
        surface = acquirePageSurface(curPageIdx, W, H, dpr, opts);
    };

    const ensureVerticalSpace = (requiredPx) => {
        if (curLineIdx > 0 && getBaselineY(curLineIdx) + requiredPx > bottomLimitY) {
            advanceToNextPage();
        }
    };

    for (let l = 0; l < rawLines.length; l++) {
        let line = rawLines[l].trimEnd();

        // Explicit manual page break syntax: `---PAGE---` or `[PAGEBREAK]`
        if (/^(--+PAGE--+|\[\s*PAGE\s*BREAK\s*\])$/i.test(line.trim())) {
            advanceToNextPage();
            continue;
        }

        // Empty line -> advance one ruled line (or wrap to next page if at bottom)
        if (line.trim() === '') {
            if (getBaselineY(curLineIdx + 1) > bottomLimitY) {
                advanceToNextPage();
            } else {
                curLineIdx++;
            }
            continue;
        }

        // A. Check for [DIAGRAM: ...] block
        const diagMatch = line.trim().match(/^\[DIAGRAM:\s*(.+)\]$/i);
        if (diagMatch) {
            const spec = diagMatch[1];
            // The block is anchored above its baseline, so reserve that offset too.
            const estH = estimateDiagramHeight(spec, lineSpacing) + lineSpacing * 0.62;
            ensureVerticalSpace(estH);

            const startY = getBaselineY(curLineIdx) - lineSpacing * 0.62;
            const usedH = renderHandSketchedDiagram(
                surface.ctx,
                surface.rc,
                spec,
                leftMargin + 12,
                startY,
                rightMargin - leftMargin - 16,
                charCounterRef,
                opts
            );
            // v1.1: +18px vertical clearance so consecutive diagram blocks never collide
            curLineIdx += Math.max(1, Math.ceil((usedH + 18) / lineSpacing));
            continue;
        }

        // B. Check for 2D Display Math Block $$ ... $$
        const displayMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
        if (displayMathMatch) {
            const latex = displayMathMatch[1].trim();
            const ast = parseLatexToAST(latex);
            const rawMathFs = baseFontSize * 1.04;
            const mRaw = measureMathAST(ast, rawMathFs, lineSpacing);

            // v1.1: horizontally auto-scale wide equations so they never clip past rightMargin
            const availMathW = rightMargin - leftMargin - 24;
            const mathScale = mRaw.width > availMathW
                ? Math.max(0.58, availMathW / Math.max(1, mRaw.width))
                : 1.0;
            const effectiveMathFs = rawMathFs * mathScale;
            const m = mathScale < 1.0 ? measureMathAST(ast, effectiveMathFs, lineSpacing) : mRaw;

            // Prevent display equation from clipping at page bottom
            ensureVerticalSpace(m.height + 18);

            curLineIdx += m.linesAbove;
            const mathY = getBaselineY(curLineIdx);
            const mathX = leftMargin + Math.max(12, (rightMargin - leftMargin - m.width) * 0.28);
            renderMathAST(surface.ctx, surface.rc, ast, mathX, mathY, effectiveMathFs, charCounterRef, opts);

            curLineIdx += m.linesBelow;
            continue;
        }

        // C. Check for Section Heading (# Title, ## Subtitle, ... ###### Micro-heading)
        let lineFontSize = baseFontSize;
        let underlineHeading = false;
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            line = headingMatch[2];
            lineFontSize = baseFontSize * (level === 1 ? 1.18 : level === 2 ? 1.10 : level === 3 ? 1.05 : 1.02);
            underlineHeading = true;
            ensureVerticalSpace(lineSpacing * (level === 1 ? 2 : level === 2 ? 1.5 : 1.2));
        } else {
            ensureVerticalSpace(lineSpacing);
        }

        // D. v1.1: normalize multi-word strike-throughs (inner spaces become NBSP so the
        // scratch-out stays one cohesive token) and pad punctuation touching $inline math$,
        // then tokenize: ~~strike~~, $inline math$, or regular words
        const normalizedLine = line
            .replace(/~~([^~]+)~~/g, (_, inner) => `~~${inner.trim().replace(/\s+/g, '\u00A0')}~~`)
            .replace(/([(\[{])(\$[^$]+\$)/g, '$1 $2')
            .replace(/(\$[^$]+\$)([)\]},.;:!])/g, '$1 $2');
        const tokenRegex = /(~~[^~]+~~|\$[^$]+\$|\S+)/g;
        const tokens = normalizedLine.match(tokenRegex) || [];

        let curX = leftMargin + 10 + (noise.hash(curLineIdx * 31.7 + opts.handSeed) - 0.3) * 8 * opts.baselineDrift;

        for (let t = 0; t < tokens.length; t++) {
            const tok = tokens[t];
            const lineSlopeY = ((curX - leftMargin) / (rightMargin - leftMargin)) * 4.2 * (noise.hash(curLineIdx * 11.3 + curPageIdx) - 0.42) * opts.baselineDrift;

            if (tok.startsWith('$') && tok.endsWith('$') && tok.length > 2) {
                const inlineLatex = tok.slice(1, -1);
                const ast = parseLatexToAST(inlineLatex);
                const m = measureMathAST(ast, lineFontSize * 0.92, lineSpacing);

                if (curX + m.width > rightMargin && curX > leftMargin + 30) {
                    curLineIdx++;
                    ensureVerticalSpace(m.height);
                    curX = leftMargin + 12;
                }

                // If inline math has tall fractions, allocate extra top clearance if needed
                if (m.linesAbove > 0 && curX <= leftMargin + 24) {
                    curLineIdx += m.linesAbove;
                }

                curX = renderMathAST(
                    surface.ctx,
                    surface.rc,
                    ast,
                    curX,
                    getBaselineY(curLineIdx) + lineSlopeY,
                    lineFontSize * 0.92,
                    charCounterRef,
                    opts
                );
                curX += lineFontSize * 0.32;
            } else {
                const isStruck = tok.startsWith('~~') && tok.endsWith('~~') && tok.length > 4;
                const cleanWord = (isStruck ? tok.slice(2, -2) : tok).replace(/\u00A0/g, ' ');
                const estW = cleanWord.length * lineFontSize * 0.46;

                if (curX + estW > rightMargin && curX > leftMargin + 30) {
                    curLineIdx++;
                    ensureVerticalSpace(lineSpacing);
                    curX = leftMargin + 12 + (noise.hash(curLineIdx * 19.3) - 0.5) * 6;
                }

                const wAdv = drawHandwrittenWord(
                    surface.ctx,
                    cleanWord,
                    curX,
                    getBaselineY(curLineIdx) + lineSlopeY,
                    lineFontSize,
                    charCounterRef,
                    opts,
                    isStruck
                );
                const spaceVar = 1.0 + (noise.hash(charCounterRef.count * 7.1) - 0.45) * 0.38 * opts.glyphWarp;
                curX += wAdv + (lineFontSize * 0.35 * spaceVar);
            }
        }

        // Hand-sketched underline for section headings
        if (underlineHeading && surface.rc) {
            const yUnder = getBaselineY(curLineIdx) + 5;
            const ink = INK_PROFILES[opts.inkKey] || INK_PROFILES.ballpoint_blue;
            surface.rc.line(leftMargin + 8, yUnder, Math.min(rightMargin, curX + 10), yUnder, {
                stroke: ink.color,
                strokeWidth: 1.7,
                roughness: opts.diagRoughness * 0.65,
                disableMultiStroke: opts.singlePassStroke,
                seed: charCounterRef.count++
            });
        }

        curLineIdx++;
    }

    const totalPages = curPageIdx + 1;
    finalizePageSurfaces(totalPages, W, H, opts);

    const elapsed = Math.round(performance.now() - t0);
    const timerEl = document.getElementById('renderTimer');
    if (timerEl) timerEl.textContent = `${elapsed}ms`;
    const statsEl = document.getElementById('charStats');
    if (statsEl) {
        statsEl.textContent = `${charCounterRef.count - 1} glyphs • ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} • 2x HiDPI`;
    }
}

export const renderDocumentPages = renderFullPage;
export default renderFullPage;
