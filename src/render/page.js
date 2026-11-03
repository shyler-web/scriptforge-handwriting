/**
 * ScriptForge Multi-Page Notebook Flow & 2D Spatial Compositor
 * (`src/render/page.js` - Wave 3 + Drop #7)
 *
 * Renders a document across one or more notebook canvases. Pages may use
 * single-column A4, two-column A4, three-column A3 landscape, or the
 * four-column wall-chart preset. Diagrams can float left/right, pack into
 * side-by-side shelves, be pinned, or be resized with layout directives.
 */

import { HI_DPI, INK_PROFILES } from '../core/config.js';
import { state } from '../core/state.js';
import { getRenderOptions } from '../core/options.js';
import * as noiseMod from '../core/noise.js';
import { drawHandwrittenWord } from './glyph.js';
import { drawPaperBackground, drawColumnDividers, applyCameraLightingAndSpine } from './paper.js';
import { parseLatexToAST } from './math/parser.js';
import { measureMathAST } from './math/measure.js';
import { renderMathAST } from './math/renderer.js';
import { renderHandSketchedDiagram, parseDiagramSpec } from './diagrams/index.js';
import { estimateGraphHeight } from './diagrams/graph.js';
import { measureSketch } from './sketch/engine.js';
import { PAGE_PRESETS, parsePageDirective, SpatialExclusionManager } from './spatialLayout.js';

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
 * Collapses multi-line `[sketch: ...]` blocks into a single encoded `[DIAGRAM]`
 * line so the page compositor can treat them exactly like every other figure.
 */
function collapseSketchBlocks(text) {
    const lines = String(text ?? '').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\s*)\[sketch:\s*(.*)$/i);
        if (!match) {
            out.push(line);
            continue;
        }

        let body = match[2];
        if (body.trimEnd().endsWith(']')) {
            body = body.trimEnd().slice(0, -1);
        } else {
            const chunks = [body];
            let closing = -1;
            for (let j = i + 1; j < lines.length; j++) {
                const next = lines[j].trimEnd();
                if (next.endsWith(']')) {
                    chunks.push(next.slice(0, -1));
                    closing = j;
                    break;
                }
                chunks.push(lines[j]);
            }
            if (closing === -1) {
                out.push(line);
                continue;
            }
            body = chunks.join('\n');
            i = closing;
        }
        out.push(`${match[1]}[DIAGRAM: sketch | body=${encodeURIComponent(body)}]`);
    }
    return out.join('\n');
}

/**
 * Collapses multi-line display-math blocks (`$$` on its own line, content,
 * then `$$`) into the single-line form understood by the compositor.
 */
function collapseDisplayMathBlocks(text) {
    const lines = String(text ?? '').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '$$') {
            const chunks = [];
            let closing = -1;
            for (let j = i + 1; j < lines.length; j++) {
                const next = lines[j];
                if (next.trim().endsWith('$$')) {
                    chunks.push(next.slice(0, next.lastIndexOf('$$')));
                    closing = j;
                    break;
                }
                chunks.push(next);
            }
            if (closing !== -1) {
                out.push(`$$ ${chunks.join(' ').trim()} $$`);
                i = closing;
                continue;
            }
        }
        out.push(line);
    }
    return out.join('\n');
}

function extractPageDirective(rawText) {
    const lines = String(rawText ?? '').split('\n');
    const kept = [];
    let cfg = null;
    for (const line of lines) {
        if (!cfg) {
            const parsed = parsePageDirective(line);
            if (parsed) {
                cfg = parsed;
                continue;
            }
        }
        kept.push(line);
    }
    return { cfg, text: kept.join('\n') };
}

function resolvePagePreset(opts, pageCfg) {
    let preset = { ...(PAGE_PRESETS[opts.pagePreset] || PAGE_PRESETS.a4) };
    if (pageCfg) {
        if (pageCfg.preset && PAGE_PRESETS[pageCfg.preset]) {
            preset = { ...PAGE_PRESETS[pageCfg.preset] };
        }
        if (pageCfg.cols) preset.cols = pageCfg.cols;
        if (pageCfg.width) preset.width = pageCfg.width;
        if (pageCfg.height) preset.height = pageCfg.height;
    }
    preset.cols = Math.max(1, Math.min(6, Number(preset.cols) || 1));
    return preset;
}

function estimateDiagramHeight(specStr, lineSpacing = 34, fontFamily = 'Caveat') {
    const { diagType, params } = parseDiagramSpec(specStr);
    if (diagType === 'sketch') return Math.max(110, measureSketch(params.body || '', 680, fontFamily).height + 24);
    if (diagType === 'bitfield' || params.fields || params.bits) return 118;
    if (diagType === 'kmap' || params.ones) return 224;
    if (diagType === 'grid' || diagType === 'table') {
        if (params.cells) return params.pointers ? 124 : 88;
        const rows = (params.rows || '').split(';').filter(Boolean).length;
        return Math.max(96, (rows + 1) * 34 + 28);
    }
    if (diagType === 'tree') return 180;
    if (diagType === 'graph') return estimateGraphHeight(params);
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
            canvas.className = 'notebook-page-canvas w-full h-auto rounded-sm paper-shadow bg-white mt-6';
            canvas.dataset.pageIndex = String(pageIndex);
            container.appendChild(canvas);
        }
    }

    if (!canvas) {
        canvas = document.createElement('canvas');
    }

    canvas.classList.remove('hidden');
    canvas.style.maxWidth = W > 900 ? '100%' : '680px';
    canvas.style.cursor = 'zoom-in';
    canvas.title = 'Click to expand canvas';
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

    const layout = opts.pageLayout || {};
    const lineSpacing = layout.lineSpacing || 34;
    const topMargin = layout.marginTop ?? 96;
    const paperLeft = opts.paperStyle === 'cornell' && (layout.cols || 1) === 1
        ? Math.max(222, layout.marginLeft ?? 92)
        : (layout.marginLeft ?? 92);

    drawPaperBackground(ctx, W, H, lineSpacing, topMargin, paperLeft, opts, pageIndex);
    drawColumnDividers(ctx, W, H, layout, opts, pageIndex);

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
 * Renders the entire document across 1 or more notebook pages.
 */
export function renderFullPage() {
    const t0 = performance.now();
    const opts = getRenderOptions();
    const noise = getNoiseEngine();
    if (typeof noise.setSeed === 'function') {
        noise.setSeed(opts.handSeed);
    }

    const docEl = document.getElementById('docInput');
    const rawValue = docEl ? docEl.value : '';
    const { cfg: pageCfg, text: docText } = extractPageDirective(rawValue);
    const preset = resolvePagePreset(opts, pageCfg);

    const W = preset.width;
    const H = preset.height;
    const cols = preset.cols;
    const dpr = HI_DPI || 2;
    const lineSpacing = 34;
    const topMargin = preset.marginTop;
    const bottomLimitY = H - preset.marginBottom;
    const baseFontSize = opts.fontFamily === 'Caveat' ? 27 : 23;

    opts.pageLayout = {
        ...preset,
        cols,
        lineSpacing,
        topMargin,
        marginTop: topMargin,
        marginBottom: preset.marginBottom,
    };
    opts.pagePreset = preset.id;

    const columnBounds = (colIdx) => {
        const usableW = W - preset.marginLeft - preset.marginRight;
        const colW = (usableW - (cols - 1) * preset.colGap) / cols;
        const left = preset.marginLeft + colIdx * (colW + preset.colGap);
        return { left, right: left + colW, width: colW };
    };

    // Apply subtle 3D perspective scan tilt on wrapper
    const wrapper = document.getElementById('canvasWrapper') || document.getElementById('pagesContainer');
    if (wrapper) {
        const tiltDeg = (opts.pageTilt * 0.85).toFixed(2);
        const zoom = state.zoomLevel || 1.0;
        wrapper.style.transform = `scale(${zoom}) perspective(1400px) rotateZ(-${(tiltDeg * 0.25).toFixed(2)}deg) rotateX(${tiltDeg}deg)`;
        wrapper.style.transformOrigin = 'top center';
    }

    const rawText = collapseDisplayMathBlocks(collapseSketchBlocks(docText));
    const rawLines = rawText.split('\n');
    const charCounterRef = { count: 1 };

    let curPageIdx = 0;
    let curColIdx = 0;
    let curLineIdx = 0;
    let pendingShelfBottom = null;
    let surface = acquirePageSurface(curPageIdx, W, H, dpr, opts);

    const makeSpatialManager = (colIdx) => {
        const b = columnBounds(colIdx);
        return new SpatialExclusionManager({
            colLeft: b.left,
            colRight: b.right,
            pageTop: topMargin,
            pageBottom: bottomLimitY,
            minTextWidth: Math.min(145, Math.max(92, b.width * 0.32)),
        });
    };
    let spatialMgr = makeSpatialManager(curColIdx);

    const getBaselineY = (lineIdx) => topMargin + lineIdx * lineSpacing;

    const advanceToNextColumn = () => {
        if (curColIdx + 1 < cols) {
            curColIdx++;
            curLineIdx = 0;
            pendingShelfBottom = null;
            spatialMgr = makeSpatialManager(curColIdx);
            return true;
        }
        return false;
    };

    const advanceToNextPage = () => {
        curPageIdx++;
        curColIdx = 0;
        curLineIdx = 0;
        pendingShelfBottom = null;
        surface = acquirePageSurface(curPageIdx, W, H, dpr, opts);
        spatialMgr = makeSpatialManager(0);
    };

    const ensureVerticalSpace = (requiredPx) => {
        if (getBaselineY(curLineIdx) + requiredPx <= bottomLimitY) return;
        if (advanceToNextColumn()) return;
        advanceToNextPage();
    };

    const getTextSlot = () => {
        if (pendingShelfBottom != null) {
            const targetTop = pendingShelfBottom + 4;
            const targetLine = Math.ceil((targetTop - topMargin) / lineSpacing);
            if (targetLine > curLineIdx) curLineIdx = targetLine;
            pendingShelfBottom = null;
            spatialMgr.lastRowShelf = null;
        }

        let guard = 0;
        while (guard++ < 40) {
            const bandTop = getBaselineY(curLineIdx) - lineSpacing * 0.72;
            if (bandTop > bottomLimitY - lineSpacing * 0.5) {
                if (advanceToNextColumn()) continue;
                advanceToNextPage();
                continue;
            }
            const slot = spatialMgr.resolveTextLineSlot(bandTop, lineSpacing);
            const delta = Math.ceil((slot.y - bandTop) / lineSpacing);
            if (delta > 0) {
                curLineIdx += delta;
                continue;
            }
            return slot;
        }

        const b = columnBounds(curColIdx);
        return { x1: b.left, x2: b.right, width: b.width };
    };

    for (let l = 0; l < rawLines.length; l++) {
        let line = rawLines[l].trimEnd();

        // Explicit manual page break syntax: `---PAGE---` or `[PAGEBREAK]`
        if (/^(--+PAGE--+|\[\s*PAGE\s*BREAK\s*\])$/i.test(line.trim())) {
            advanceToNextPage();
            continue;
        }

        // Empty line -> advance one ruled line (or wrap to the next column/page)
        if (line.trim() === '') {
            if (getBaselineY(curLineIdx + 1) > bottomLimitY) {
                if (!advanceToNextColumn()) advanceToNextPage();
            } else {
                curLineIdx++;
            }
            continue;
        }

        // A. Diagram block
        const diagMatch = line.trim().match(/^\[DIAGRAM:\s*(.+)\]$/i);
        if (diagMatch) {
            const spec = diagMatch[1];
            const parsed = parseDiagramSpec(spec);
            const layout = parsed.params.layout || { place: 'auto', scale: 1, pad: 12 };
            const colB = columnBounds(curColIdx);

            let naturalW = colB.width;
            let naturalH = estimateDiagramHeight(spec, lineSpacing, opts.fontFamily);
            if (parsed.diagType === 'sketch') {
                const m = measureSketch(parsed.params.body || '', colB.width, opts.fontFamily);
                naturalW = Math.max(100, m.width);
                naturalH = Math.max(60, m.height);
            } else {
                const explicitW = parseFloat(parsed.params.width || parsed.params.w || '');
                if (Number.isFinite(explicitW) && explicitW > 0) {
                    naturalW = Math.min(colB.width, explicitW);
                }
            }

            const pad = Number(layout.pad ?? 12);
            const topY = getBaselineY(curLineIdx) - lineSpacing * 0.62;
            if (
                layout.place !== 'xy' &&
                topY + naturalH + pad > bottomLimitY &&
                !spatialMgr.lastRowShelf
            ) {
                if (!advanceToNextColumn()) advanceToNextPage();
            }

            const currentCol = columnBounds(curColIdx);
            if (parsed.diagType !== 'sketch') naturalW = Math.min(naturalW, currentCol.width);

            const placed = spatialMgr.placeDiagram({
                naturalW,
                naturalH,
                cursorY: getBaselineY(curLineIdx) - lineSpacing * 0.62,
                layout,
            });

            const usedH = renderHandSketchedDiagram(
                surface.ctx,
                surface.rc,
                spec,
                placed.x,
                placed.y,
                placed.w,
                charCounterRef,
                opts
            );
            if (placed.obstacle) placed.obstacle.h = Math.max(placed.obstacle.h, usedH);

            if (placed.isRowShelf) {
                pendingShelfBottom = Math.max(
                    pendingShelfBottom || 0,
                    placed.shelfBottom || placed.y + usedH + pad
                );
            } else if (placed.isFloating) {
                // Text continues at the current cursorY and wraps beside the diagram.
            } else {
                const bottom = placed.y + Math.max(usedH, placed.h) + pad;
                const targetLine = Math.ceil((bottom - topMargin) / lineSpacing);
                curLineIdx = Math.max(curLineIdx + 1, targetLine);
            }
            continue;
        }

        // B. Display math block
        const displayMathMatch = line.trim().match(/^\$\$(.+)\$\$$/);
        if (displayMathMatch) {
            const latex = displayMathMatch[1].trim();
            const ast = parseLatexToAST(latex);
            const rawMathFs = baseFontSize * 1.04;
            const mRaw = measureMathAST(ast, rawMathFs, lineSpacing);

            ensureVerticalSpace(mRaw.height + 18);
            const slot = getTextSlot();
            const availMathW = slot.width - 24;
            const mathScale = mRaw.width > availMathW
                ? Math.max(0.58, availMathW / Math.max(1, mRaw.width))
                : 1.0;
            const effectiveMathFs = rawMathFs * mathScale;
            const m = mathScale < 1.0 ? measureMathAST(ast, effectiveMathFs, lineSpacing) : mRaw;

            curLineIdx += m.linesAbove;
            const mathY = getBaselineY(curLineIdx);
            const mathX = slot.x1 + Math.max(12, (slot.width - m.width) * 0.28);
            renderMathAST(surface.ctx, surface.rc, ast, mathX, mathY, effectiveMathFs, charCounterRef, opts);

            curLineIdx += m.linesBelow;
            continue;
        }

        // C. Section heading
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

        const textSlot = getTextSlot();
        let lineLeft = textSlot.x1;
        let lineRight = textSlot.x2;

        const normalizedLine = line
            .replace(/~~([^~]+)~~/g, (_, inner) => `~~${inner.trim().replace(/\s+/g, '\u00A0')}~~`)
            .replace(/([(\[{])(\$[^$]+\$)/g, '$1 $2')
            .replace(/(\$[^$]+\$)([)\]},.;:!])/g, '$1 $2');
        const tokenRegex = /(~~[^~]+~~|\$[^$]+\$|\S+)/g;
        const tokens = normalizedLine.match(tokenRegex) || [];

        let curX = lineLeft + 10 + (noise.hash(curLineIdx * 31.7 + opts.handSeed) - 0.3) * 8 * opts.baselineDrift;

        for (let t = 0; t < tokens.length; t++) {
            const tok = tokens[t];
            const lineSlopeY = ((curX - lineLeft) / Math.max(1, lineRight - lineLeft)) * 4.2 * (noise.hash(curLineIdx * 11.3 + curPageIdx) - 0.42) * opts.baselineDrift;

            if (tok.startsWith('$') && tok.endsWith('$') && tok.length > 2) {
                const inlineLatex = tok.slice(1, -1);
                const ast = parseLatexToAST(inlineLatex);
                const m = measureMathAST(ast, lineFontSize * 0.92, lineSpacing);

                if (curX + m.width > lineRight && curX > lineLeft + 30) {
                    curLineIdx++;
                    ensureVerticalSpace(m.height);
                    const ns = getTextSlot();
                    lineLeft = ns.x1;
                    lineRight = ns.x2;
                    curX = lineLeft + 12;
                }

                if (m.linesAbove > 0 && curX <= lineLeft + 24) {
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

                if (curX + estW > lineRight && curX > lineLeft + 30) {
                    curLineIdx++;
                    ensureVerticalSpace(lineSpacing);
                    const ns = getTextSlot();
                    lineLeft = ns.x1;
                    lineRight = ns.x2;
                    curX = lineLeft + 12 + (noise.hash(curLineIdx * 19.3) - 0.5) * 6;
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

        if (underlineHeading && surface.rc) {
            const yUnder = getBaselineY(curLineIdx) + 5;
            const ink = INK_PROFILES[opts.inkKey] || INK_PROFILES.ballpoint_blue;
            surface.rc.line(lineLeft + 8, yUnder, Math.min(lineRight, curX + 10), yUnder, {
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
        statsEl.textContent = `${charCounterRef.count - 1} glyphs • ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}${cols > 1 ? ` • ${cols} cols` : ''} • 2x HiDPI`;
    }
}

export const renderDocumentPages = renderFullPage;
export default renderFullPage;
