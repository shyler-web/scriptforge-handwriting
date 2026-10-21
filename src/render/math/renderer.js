import { measureMathAST } from './measure.js';
import { drawAllographicChar } from '../glyph.js';
import { getInk } from '../../core/state.js';

// Recursively render 2D Math AST using Allographic strokes + Rough.js mathematical bars
export function renderMathAST(ctx, rc, nodes, x, y, fontSize, charCounterRef, opts) {
    let curX = x;
    const ink = getInk();
    const mathRoughBase = {
        stroke: ink.color,
        strokeWidth: 1.55 * ink.widthScale,
        roughness: opts.diagRoughness * 0.55,
        bowing: opts.diagBowing * 0.6,
        disableMultiStroke: opts.singlePassStroke
    };

    for (const n of nodes) {
        if (n.type === 'space') {
            curX += fontSize * 0.22;
        } else if (n.type === 'text') {
            for (let c = 0; c < n.val.length; c++) {
                const cIdx = charCounterRef.count++;
                curX += drawAllographicChar(ctx, n.val[c], curX, y, fontSize, cIdx, opts);
            }
        } else if (n.type === 'sup') {
            curX = renderMathAST(ctx, rc, n.body, curX + 1, y - fontSize * 0.42, fontSize * 0.68, charCounterRef, opts);
        } else if (n.type === 'sub') {
            curX = renderMathAST(ctx, rc, n.body, curX + 1, y + fontSize * 0.28, fontSize * 0.68, charCounterRef, opts);
        } else if (n.type === 'overline') {
            const startBarX = curX;
            curX = renderMathAST(ctx, rc, n.body, curX, y, fontSize, charCounterRef, opts);
            rc.line(startBarX - 1, y - fontSize * 0.72, curX + 1, y - fontSize * 0.72, {
                ...mathRoughBase,
                seed: charCounterRef.count++
            });
            curX += 3;
        } else if (n.type === 'frac') {
            const mNum = measureMathAST(n.num, fontSize * 0.84);
            const mDen = measureMathAST(n.den, fontSize * 0.84);
            const barW = Math.max(mNum.width, mDen.width) + 12;
            const barY = y - fontSize * 0.25;

            // Numerator centered above vinculum
            const numX = curX + (barW - mNum.width) / 2;
            renderMathAST(ctx, rc, n.num, numX, barY - 9, fontSize * 0.84, charCounterRef, opts);

            // Hand-sketched fraction vinculum bar
            rc.line(curX + 2, barY, curX + barW - 2, barY, {
                ...mathRoughBase,
                strokeWidth: 1.65 * ink.widthScale,
                seed: charCounterRef.count++
            });

            // Denominator centered below vinculum
            const denX = curX + (barW - mDen.width) / 2;
            renderMathAST(ctx, rc, n.den, denX, barY + mDen.ascent + 6, fontSize * 0.84, charCounterRef, opts);

            curX += barW + 8;
        } else if (n.type === 'sqrt') {
            const mBody = measureMathAST(n.body, fontSize * 0.9);
            const topY = y - mBody.ascent - 3;
            const botY = y + mBody.descent * 0.5;
            const radW = 14;

            // Hand-drawn radical hook + vinculum roof
            rc.linearPath([
                [curX, y - fontSize * 0.25],
                [curX + 4, y - fontSize * 0.32],
                [curX + 8, botY],
                [curX + radW, topY],
                [curX + radW + mBody.width + 6, topY],
                [curX + radW + mBody.width + 6, topY + 4]
            ], {
                ...mathRoughBase,
                seed: charCounterRef.count++
            });

            renderMathAST(ctx, rc, n.body, curX + radW + 2, y, fontSize * 0.9, charCounterRef, opts);
            curX += radW + mBody.width + 10;
        } else if (n.type === 'bigop') {
            const opW = fontSize * 0.95;
            const topY = y - fontSize * 0.85;
            const botY = y + fontSize * 0.35;

            if (n.op === 'int') {
                // Organic hand-drawn integral S-curve
                rc.curve([
                    [curX + opW * 0.75, topY + 4],
                    [curX + opW * 0.55, topY - 4],
                    [curX + opW * 0.42, y - fontSize * 0.25],
                    [curX + opW * 0.32, botY + 4],
                    [curX + opW * 0.12, botY - 2]
                ], {
                    ...mathRoughBase,
                    strokeWidth: 1.85 * ink.widthScale,
                    seed: charCounterRef.count++
                });
            } else {
                // Hand-drawn Sigma (\sum)
                rc.linearPath([
                    [curX + opW * 0.85, topY],
                    [curX + opW * 0.15, topY],
                    [curX + opW * 0.55, y - fontSize * 0.25],
                    [curX + opW * 0.15, botY],
                    [curX + opW * 0.85, botY]
                ], {
                    ...mathRoughBase,
                    strokeWidth: 1.7 * ink.widthScale,
                    seed: charCounterRef.count++
                });
            }

            let limitAdvance = opW;
            if (n.sup) {
                const supEnd = renderMathAST(ctx, rc, n.sup, curX + opW * 0.78, topY + 2, fontSize * 0.62, charCounterRef, opts);
                limitAdvance = Math.max(limitAdvance, supEnd - curX);
            }
            if (n.sub) {
                const subEnd = renderMathAST(ctx, rc, n.sub, curX + opW * 0.65, botY + 8, fontSize * 0.62, charCounterRef, opts);
                limitAdvance = Math.max(limitAdvance, subEnd - curX);
            }
            curX += limitAdvance + 6;
        } else if (n.type === 'matrix') {
            const rowCount = n.rows.length;
            const colCount = Math.max(...n.rows.map(r => r.length));
            const colWidths = new Array(colCount).fill(0);
            const cellFontSize = fontSize * 0.82;

            for (let r = 0; r < rowCount; r++) {
                for (let c = 0; c < colCount; c++) {
                    if (n.rows[r][c]) {
                        const m = measureMathAST(n.rows[r][c], cellFontSize);
                        colWidths[c] = Math.max(colWidths[c], m.width);
                    }
                }
            }

            const rowH = fontSize * 1.25;
            const totalH = rowCount * rowH;
            const topMatrixY = y - totalH / 2 - fontSize * 0.22;
            const botMatrixY = topMatrixY + totalH;

            // Left Matrix Bracket
            rc.linearPath([
                [curX + 9, topMatrixY],
                [curX + 2, topMatrixY],
                [curX + 2, botMatrixY],
                [curX + 9, botMatrixY]
            ], {
                ...mathRoughBase,
                strokeWidth: 1.7 * ink.widthScale,
                seed: charCounterRef.count++
            });

            let cellX = curX + 14;
            for (let c = 0; c < colCount; c++) {
                for (let r = 0; r < rowCount; r++) {
                    if (n.rows[r][c]) {
                        const mCell = measureMathAST(n.rows[r][c], cellFontSize);
                        const cx = cellX + (colWidths[c] - mCell.width) / 2;
                        const cy = topMatrixY + (r + 0.72) * rowH;
                        renderMathAST(ctx, rc, n.rows[r][c], cx, cy, cellFontSize, charCounterRef, opts);
                    }
                }
                cellX += colWidths[c] + 16;
            }

            // Right Matrix Bracket
            rc.linearPath([
                [cellX - 10, topMatrixY],
                [cellX - 3, topMatrixY],
                [cellX - 3, botMatrixY],
                [cellX - 10, botMatrixY]
            ], {
                ...mathRoughBase,
                strokeWidth: 1.7 * ink.widthScale,
                seed: charCounterRef.count++
            });

            curX = cellX + 6;
        }
    }
    return curX;
}
