/**
 * ScriptForge Recursive 2D Math Stroke Renderer (Wave 1)
 * Draws any 2D Math Box AST onto the notebook canvas using Allographic glyphs
 * and single-pass Rough.js procedural mathematical strokes.
 */

import { drawAllographicChar } from '../glyph.js';
import { measureMathAST } from './measure.js';
import { INK_PROFILES } from '../../core/config.js';
import * as stateMod from '../../core/state.js';

function resolveInkProfile(opts) {
    if (opts && opts.ink && opts.ink.color) return opts.ink;
    const stateObj = stateMod.state || stateMod.default || stateMod;
    const key = (opts && opts.inkKey) || (stateObj && stateObj.inkKey) || (stateObj && stateObj.currentInkKey) || 'ballpoint_blue';
    return INK_PROFILES[key] || INK_PROFILES.ballpoint_blue || {
        color: '#1b3b8c',
        secondary: '#2952b3',
        accent: '#b91c1c',
        alpha: 0.94,
        widthScale: 1.0
    };
}

/**
 * Draws a stretchy vertical delimiter `(`, `)`, `[`, `]`, `{`, `}`, `|`, `‖`, `⟨`, `⟩`
 */
function drawStretchyDelimiter(rc, delim, x, topY, botY, mathRoughBase, seed) {
    if (!delim || delim === '.') return 2;
    const h = Math.max(16, botY - topY);
    const midY = (topY + botY) / 2;
    const w = 8;

    const style = { ...mathRoughBase, seed };

    switch (delim) {
        case '[':
        case '⌈':
        case '⌊': {
            const pts = [];
            if (delim !== '⌊') pts.push([x + w, topY]);
            pts.push([x + 2, topY], [x + 2, botY]);
            if (delim !== '⌈') pts.push([x + w, botY]);
            rc.linearPath(pts, style);
            return w + 3;
        }
        case ']':
        case '⌉':
        case '⌋': {
            const pts = [];
            if (delim !== '⌋') pts.push([x + 1, topY]);
            pts.push([x + w - 1, topY], [x + w - 1, botY]);
            if (delim !== '⌈') pts.push([x + 1, botY]);
            rc.linearPath(pts, style);
            return w + 3;
        }
        case '(': {
            rc.curve([
                [x + w, topY],
                [x + 1.5, topY + h * 0.25],
                [x + 1.5, botY - h * 0.25],
                [x + w, botY]
            ], style);
            return w + 3;
        }
        case ')': {
            rc.curve([
                [x + 1, topY],
                [x + w - 0.5, topY + h * 0.25],
                [x + w - 0.5, botY - h * 0.25],
                [x + 1, botY]
            ], style);
            return w + 3;
        }
        case '{': {
            rc.curve([
                [x + w + 1, topY],
                [x + 4, topY + 3],
                [x + 4, midY - 4],
                [x + 0.5, midY],
                [x + 4, midY + 4],
                [x + 4, botY - 3],
                [x + w + 1, botY]
            ], style);
            return w + 4;
        }
        case '}': {
            rc.curve([
                [x + 1, topY],
                [x + w - 2, topY + 3],
                [x + w - 2, midY - 4],
                [x + w + 1.5, midY],
                [x + w - 2, midY + 4],
                [x + w - 2, botY - 3],
                [x + 1, botY]
            ], style);
            return w + 4;
        }
        case '|': {
            rc.line(x + 4, topY, x + 4, botY, style);
            return 9;
        }
        case '‖': {
            rc.line(x + 2.5, topY, x + 2.5, botY, style);
            rc.line(x + 6.5, topY, x + 6.5, botY, { ...style, seed: seed + 1 });
            return 11;
        }
        case '⟨': {
            rc.linearPath([[x + w, topY], [x + 1.5, midY], [x + w, botY]], style);
            return w + 3;
        }
        case '⟩': {
            rc.linearPath([[x + 1.5, topY], [x + w, midY], [x + 1.5, botY]], style);
            return w + 3;
        }
        default: {
            rc.line(x + 4, topY, x + 4, botY, style);
            return 9;
        }
    }
}

/**
 * Draws a horizontal curly overbrace or underbrace across `[x, x + w]`
 */
function drawHorizontalBrace(rc, x, y, w, pointUp, mathRoughBase, seed) {
    const midX = x + w / 2;
    const dir = pointUp ? -1 : 1;
    rc.curve([
        [x, y - dir * 3],
        [x + 4, y],
        [midX - 5, y],
        [midX, y + dir * 5],
        [midX + 5, y],
        [x + w - 4, y],
        [x + w, y - dir * 3]
    ], { ...mathRoughBase, seed });
}

/**
 * Renders an array of 2D Math AST nodes starting at `(x, y)` baseline.
 * Returns the ending `curX` coordinate.
 */
export function renderMathAST(ctx, rc, nodes, x, y, fontSize, charCounterRef, opts = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0) return x;

    let curX = x;
    const fs = (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 4) ? fontSize : 24;
    const counter = charCounterRef || { count: 1 };
    const ink = resolveInkProfile(opts);

    const roughness = typeof opts.diagRoughness === 'number' ? opts.diagRoughness : 0.55;
    const bowing = typeof opts.diagBowing === 'number' ? opts.diagBowing : 0.60;
    const singlePass = opts.singlePassStroke !== undefined ? opts.singlePassStroke : true;

    const mathRoughBase = {
        stroke: ink.color,
        strokeWidth: 1.55 * (ink.widthScale || 1.0),
        roughness: roughness * 0.52,
        bowing: bowing * 0.55,
        disableMultiStroke: singlePass
    };

    for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;

        switch (n.type) {
            case 'space': {
                const factor = typeof n.factor === 'number' ? n.factor : 0.22;
                curX += Math.max(-fs * 0.15, fs * factor);
                break;
            }

            case 'text':
            case 'func': {
                const str = String(n.val ?? '');
                const isRelOp = n.type === 'text' && /^[=+\-±∓×÷·⊕⊗→←↔⇒⇔≤≥≠≈≡∈⊂⊆∪∩]$/.test(str);
                if (isRelOp) curX += fs * 0.14;

                // Upright slant adjustment for named functions (sin, cos, log, lim)
                const localOpts = n.type === 'func'
                    ? { ...opts, slantAngle: (opts.slantAngle || 0) * 0.25 }
                    : opts;

                for (let c = 0; c < str.length; c++) {
                    const cIdx = counter.count++;
                    curX += drawAllographicChar(ctx, str[c], curX, y, fs, cIdx, localOpts);
                }

                if (isRelOp) curX += fs * 0.14;
                if (n.type === 'func') curX += fs * 0.16;
                break;
            }

            case 'group': {
                curX = renderMathAST(ctx, rc, n.body, curX, y, fs, counter, opts);
                break;
            }

            case 'sup': {
                curX = renderMathAST(ctx, rc, n.body, curX + 1, y - fs * 0.44, fs * 0.68, counter, opts) + 1;
                break;
            }

            case 'sub': {
                curX = renderMathAST(ctx, rc, n.body, curX + 1, y + fs * 0.30, fs * 0.68, counter, opts) + 1;
                break;
            }

            case 'supsub': {
                const baseStartX = curX;
                const baseEndX = renderMathAST(ctx, rc, n.base, baseStartX, y, fs, counter, opts);
                const mBase = measureMathAST(n.base, fs);
                const scriptX = baseEndX + 1;
                let maxEndX = baseEndX;

                if (n.sup) {
                    const supY = y - Math.max(fs * 0.42, mBase.ascent * 0.55);
                    const endSup = renderMathAST(ctx, rc, n.sup, scriptX, supY, fs * 0.66, counter, opts);
                    maxEndX = Math.max(maxEndX, endSup);
                }
                if (n.sub) {
                    const subY = y + Math.max(fs * 0.28, mBase.descent * 0.65 + 4);
                    const endSub = renderMathAST(ctx, rc, n.sub, scriptX, subY, fs * 0.66, counter, opts);
                    maxEndX = Math.max(maxEndX, endSub);
                }
                curX = maxEndX + 2;
                break;
            }

            case 'accent': {
                const mBody = measureMathAST(n.body, fs);
                const startX = curX;
                const endX = renderMathAST(ctx, rc, n.body, startX, y, fs, counter, opts);
                const w = Math.max(10, endX - startX);
                const topY = y - mBody.ascent - 2;
                const botY = y + mBody.descent + 4;
                const midX = startX + w / 2;
                const seed = counter.count++;

                if (n.kind === 'overline' || n.kind === 'bar') {
                    rc.line(startX - 1, topY, endX + 1, topY, { ...mathRoughBase, seed });
                } else if (n.kind === 'underline') {
                    rc.line(startX - 1, botY, endX + 1, botY, { ...mathRoughBase, seed });
                } else if (n.kind === 'vec') {
                    rc.line(startX, topY, endX + 2, topY, { ...mathRoughBase, seed });
                    rc.linearPath([
                        [endX - 4, topY - 3.5],
                        [endX + 2, topY],
                        [endX - 4, topY + 3.5]
                    ], { ...mathRoughBase, seed: counter.count++ });
                } else if (n.kind === 'hat' || n.kind === 'widehat') {
                    const span = n.kind === 'widehat' ? Math.min(w * 0.48, 22) : Math.min(w * 0.42, 9);
                    rc.linearPath([
                        [midX - span, topY + 3],
                        [midX, topY - 3],
                        [midX + span, topY + 3]
                    ], { ...mathRoughBase, seed });
                } else if (n.kind === 'tilde' || n.kind === 'widetilde') {
                    const span = Math.min(w * 0.45, 14);
                    rc.curve([
                        [midX - span, topY + 2],
                        [midX - span * 0.35, topY - 3],
                        [midX + span * 0.35, topY + 3],
                        [midX + span, topY - 2]
                    ], { ...mathRoughBase, seed });
                } else if (n.kind === 'dot') {
                    rc.circle(midX, topY, 2.5, { ...mathRoughBase, fill: ink.color, fillStyle: 'solid', seed });
                } else if (n.kind === 'ddot') {
                    rc.circle(midX - 3.5, topY, 2.5, { ...mathRoughBase, fill: ink.color, fillStyle: 'solid', seed });
                    rc.circle(midX + 3.5, topY, 2.5, { ...mathRoughBase, fill: ink.color, fillStyle: 'solid', seed: counter.count++ });
                } else if (n.kind === 'underbrace') {
                    drawHorizontalBrace(rc, startX, botY + 2, w, false, mathRoughBase, seed);
                    if (n.note) {
                        const mNote = measureMathAST(n.note, fs * 0.65);
                        renderMathAST(ctx, rc, n.note, midX - mNote.width / 2, botY + 18, fs * 0.65, counter, opts);
                    }
                } else if (n.kind === 'overbrace') {
                    drawHorizontalBrace(rc, startX, topY - 2, w, true, mathRoughBase, seed);
                    if (n.note) {
                        const mNote = measureMathAST(n.note, fs * 0.65);
                        renderMathAST(ctx, rc, n.note, midX - mNote.width / 2, topY - 11, fs * 0.65, counter, opts);
                    }
                }
                curX = endX + 3;
                break;
            }

            case 'frac':
            case 'binom': {
                const childScale = n.display ? 0.90 : 0.82;
                const childFs = fs * childScale;
                const mNum = measureMathAST(n.num, childFs);
                const mDen = measureMathAST(n.den, childFs);
                const innerW = Math.max(mNum.width, mDen.width) + 10;
                const axisY = y - fs * 0.25;

                if (n.type === 'binom') {
                    const topY = axisY - mNum.height - 4;
                    const botY = axisY + mDen.height + 6;
                    const leftW = drawStretchyDelimiter(rc, '(', curX, topY, botY, mathRoughBase, counter.count++);
                    const contentX = curX + leftW;
                    renderMathAST(ctx, rc, n.num, contentX + (innerW - mNum.width) / 2, axisY - mNum.descent - 4, childFs, counter, opts);
                    renderMathAST(ctx, rc, n.den, contentX + (innerW - mDen.width) / 2, axisY + mDen.ascent + 5, childFs, counter, opts);
                    const rightW = drawStretchyDelimiter(rc, ')', contentX + innerW, topY, botY, mathRoughBase, counter.count++);
                    curX = contentX + innerW + rightW + 4;
                } else {
                    const numX = curX + (innerW - mNum.width) / 2;
                    renderMathAST(ctx, rc, n.num, numX, axisY - mNum.descent - 5, childFs, counter, opts);

                    rc.line(curX + 1, axisY, curX + innerW - 1, axisY, {
                        ...mathRoughBase,
                        strokeWidth: 1.65 * (ink.widthScale || 1.0),
                        seed: counter.count++
                    });

                    const denX = curX + (innerW - mDen.width) / 2;
                    renderMathAST(ctx, rc, n.den, denX, axisY + mDen.ascent + 6, childFs, counter, opts);
                    curX += innerW + 6;
                }
                break;
            }

            case 'sqrt': {
                const mBody = measureMathAST(n.body, fs * 0.92);
                const mIdx = n.index ? measureMathAST(n.index, fs * 0.56) : { width: 0, height: 0 };
                const hookW = Math.max(14, mIdx.width + 8);
                const topY = y - mBody.ascent - 4;
                const botY = y + mBody.descent * 0.55;

                if (n.index) {
                    renderMathAST(ctx, rc, n.index, curX + 1, y - fs * 0.42, fs * 0.56, counter, opts);
                }

                rc.linearPath([
                    [curX + hookW - 12, y - fs * 0.24],
                    [curX + hookW - 8, y - fs * 0.32],
                    [curX + hookW - 4, botY],
                    [curX + hookW, topY],
                    [curX + hookW + mBody.width + 6, topY],
                    [curX + hookW + mBody.width + 6, topY + 4]
                ], {
                    ...mathRoughBase,
                    seed: counter.count++
                });

                renderMathAST(ctx, rc, n.body, curX + hookW + 2, y, fs * 0.92, counter, opts);
                curX += hookW + mBody.width + 10;
                break;
            }

            case 'bigop': {
                const mSub = n.sub ? measureMathAST(n.sub, fs * 0.62) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const mSup = n.sup ? measureMathAST(n.sup, fs * 0.62) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const topY = y - fs * 0.88;
                const botY = y + fs * 0.38;
                const midY = (topY + botY) / 2;

                if (n.op === 'int' || n.op === 'oint' || n.op === 'iint' || n.op === 'iiint') {
                    const count = n.op === 'iiint' ? 3 : (n.op === 'iint' ? 2 : 1);
                    const opW = fs * (0.72 + (count - 1) * 0.30);

                    for (let k = 0; k < count; k++) {
                        const ox = curX + k * (fs * 0.28);
                        rc.curve([
                            [ox + fs * 0.58, topY + 4],
                            [ox + fs * 0.42, topY - 4],
                            [ox + fs * 0.30, midY],
                            [ox + fs * 0.20, botY + 4],
                            [ox + fs * 0.05, botY - 2]
                        ], {
                            ...mathRoughBase,
                            strokeWidth: 1.80 * (ink.widthScale || 1.0),
                            seed: counter.count++
                        });
                    }

                    if (n.op === 'oint') {
                        rc.ellipse(curX + fs * 0.31, midY, fs * 0.38, fs * 0.32, {
                            ...mathRoughBase,
                            seed: counter.count++
                        });
                    }

                    let limitAdv = opW;
                    if (n.sup) {
                        const supEnd = renderMathAST(ctx, rc, n.sup, curX + opW * 0.82, topY + 4, fs * 0.62, counter, opts);
                        limitAdv = Math.max(limitAdv, supEnd - curX);
                    }
                    if (n.sub) {
                        const subEnd = renderMathAST(ctx, rc, n.sub, curX + opW * 0.65, botY + 8, fs * 0.62, counter, opts);
                        limitAdv = Math.max(limitAdv, subEnd - curX);
                    }
                    curX += limitAdv + 6;
                } else if (n.op === 'sum' || n.op === 'prod' || n.op === 'coprod' || n.op === 'bigcup' || n.op === 'bigcap' || n.op === 'bigoplus') {
                    const opW = fs * 0.92;
                    const blockW = Math.max(opW, mSub.width, mSup.width);
                    const symX = curX + (blockW - opW) / 2;

                    if (n.op === 'sum') {
                        rc.linearPath([
                            [symX + opW * 0.85, topY + 3],
                            [symX + opW * 0.85, topY],
                            [symX + opW * 0.15, topY],
                            [symX + opW * 0.55, midY],
                            [symX + opW * 0.15, botY],
                            [symX + opW * 0.85, botY],
                            [symX + opW * 0.85, botY - 3]
                        ], { ...mathRoughBase, strokeWidth: 1.72 * (ink.widthScale || 1.0), seed: counter.count++ });
                    } else if (n.op === 'prod' || n.op === 'coprod') {
                        const barY = n.op === 'coprod' ? botY : topY;
                        rc.line(symX + opW * 0.10, barY, symX + opW * 0.90, barY, { ...mathRoughBase, strokeWidth: 1.75, seed: counter.count++ });
                        rc.line(symX + opW * 0.28, topY, symX + opW * 0.28, botY, { ...mathRoughBase, strokeWidth: 1.70, seed: counter.count++ });
                        rc.line(symX + opW * 0.72, topY, symX + opW * 0.72, botY, { ...mathRoughBase, strokeWidth: 1.70, seed: counter.count++ });
                    } else {
                        // Set union/intersection/oplus big operator
                        renderMathAST(ctx, rc, [{ type: 'text', val: n.symbol }], symX + opW * 0.18, y + fs * 0.08, fs * 1.25, counter, opts);
                    }

                    if (n.sup) {
                        renderMathAST(ctx, rc, n.sup, curX + (blockW - mSup.width) / 2, topY - mSup.descent - 4, fs * 0.62, counter, opts);
                    }
                    if (n.sub) {
                        renderMathAST(ctx, rc, n.sub, curX + (blockW - mSub.width) / 2, botY + mSub.ascent + 4, fs * 0.62, counter, opts);
                    }
                    curX += blockW + 8;
                } else {
                    // \lim, \max, \min, \sup, \inf with centered subscript underneath
                    const labelStr = String(n.symbol || 'lim');
                    const opW = labelStr.length * fs * 0.46;
                    const blockW = Math.max(opW, mSub.width);
                    const lblX = curX + (blockW - opW) / 2;
                    renderMathAST(ctx, rc, [{ type: 'func', val: labelStr }], lblX, y, fs, counter, opts);

                    if (n.sub) {
                        renderMathAST(ctx, rc, n.sub, curX + (blockW - mSub.width) / 2, y + mSub.ascent + 5, fs * 0.62, counter, opts);
                    }
                    curX += blockW + 7;
                }
                break;
            }

            case 'delim': {
                const mBody = measureMathAST(n.body, fs);
                const axisY = y - fs * 0.25;
                const halfSpan = Math.max(mBody.ascent - fs * 0.25, mBody.descent + fs * 0.25, fs * 0.55);
                const topY = axisY - halfSpan - 2;
                const botY = axisY + halfSpan + 2;

                const leftAdv = drawStretchyDelimiter(rc, n.left, curX, topY, botY, mathRoughBase, counter.count++);
                curX += leftAdv;
                curX = renderMathAST(ctx, rc, n.body, curX, y, fs, counter, opts);
                const rightAdv = drawStretchyDelimiter(rc, n.right, curX + 1, topY, botY, mathRoughBase, counter.count++);
                curX += rightAdv + 3;
                break;
            }

            case 'matrix': {
                const rows = Array.isArray(n.rows) && n.rows.length > 0 ? n.rows : [[[]]];
                const rowCount = rows.length;
                const colCount = Math.max(1, ...rows.map(r => (Array.isArray(r) ? r.length : 1)));
                const cellFs = fs * 0.82;
                const colWidths = new Array(colCount).fill(0);
                const rowMetrics = [];

                for (let r = 0; r < rowCount; r++) {
                    let rowAsc = cellFs * 0.75;
                    let rowDesc = cellFs * 0.30;
                    for (let c = 0; c < colCount; c++) {
                        const cellAst = rows[r] && rows[r][c] ? rows[r][c] : [];
                        const mCell = measureMathAST(cellAst, cellFs);
                        colWidths[c] = Math.max(colWidths[c], mCell.width);
                        rowAsc = Math.max(rowAsc, mCell.ascent);
                        rowDesc = Math.max(rowDesc, mCell.descent);
                    }
                    rowMetrics.push({ ascent: rowAsc, descent: rowDesc, height: rowAsc + rowDesc + 8 });
                }

                const totalH = rowMetrics.reduce((acc, rm) => acc + rm.height, 0);
                const axisY = y - fs * 0.25;
                const topMatrixY = axisY - totalH / 2;
                const botMatrixY = topMatrixY + totalH;

                const bracketLeftMap = {
                    square: '[', paren: '(', pipe: '|', doublepipe: '‖', brace: '{', cases: '{', none: '.'
                };
                const bracketRightMap = {
                    square: ']', paren: ')', pipe: '|', doublepipe: '‖', brace: '}', cases: '.', none: '.'
                };

                const leftDelim = bracketLeftMap[n.bracket] || '.';
                const rightDelim = bracketRightMap[n.bracket] || '.';

                if (leftDelim !== '.') {
                    curX += drawStretchyDelimiter(rc, leftDelim, curX, topMatrixY, botMatrixY, mathRoughBase, counter.count++) + 3;
                }

                const colGap = n.bracket === 'cases' ? 18 : 15;
                let cellX = curX + 2;

                for (let c = 0; c < colCount; c++) {
                    let curRowTop = topMatrixY;
                    for (let r = 0; r < rowCount; r++) {
                        const rm = rowMetrics[r];
                        const cellAst = rows[r] && rows[r][c] ? rows[r][c] : [];
                        const mCell = measureMathAST(cellAst, cellFs);

                        // Left-align cases/aligned columns; center standard matrices
                        let cx = cellX + (colWidths[c] - mCell.width) / 2;
                        if (n.bracket === 'cases' || n.env === 'aligned' || n.env === 'align') {
                            cx = (n.env === 'aligned' && c % 2 === 0)
                                ? cellX + colWidths[c] - mCell.width
                                : cellX;
                        }
                        const cy = curRowTop + rm.ascent + 3;
                        renderMathAST(ctx, rc, cellAst, cx, cy, cellFs, counter, opts);
                        curRowTop += rm.height;
                    }
                    cellX += colWidths[c] + (c < colCount - 1 ? colGap : 4);
                }

                curX = cellX;
                if (rightDelim !== '.') {
                    curX += drawStretchyDelimiter(rc, rightDelim, curX, topMatrixY, botMatrixY, mathRoughBase, counter.count++);
                }
                curX += 5;
                break;
            }

            default:
                break;
        }
    }

    return curX;
}

export default renderMathAST;
