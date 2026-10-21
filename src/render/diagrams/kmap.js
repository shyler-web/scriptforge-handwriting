import { drawHandRoundedRect } from './primitives.js';
import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';

export function drawKmap(d) {
    // 1. 4-VARIABLE KARNAUGH MAP (K-MAP) WITH CRISP ROUNDED IMPLICANT LOOPS & CORNER BRACKETS
    const cellSize = 44;
    const gridW = cellSize * 4;
    const gridH = cellSize * 4;
    const gx = d.startX + 82;
    const gy = d.startY + 42;
    const ones = (d.params.ones || '0,2,5,7,8,10,13,15').split(',').map(n => parseInt(n.trim(), 10));
    const grayCodes = ['00', '01', '11', '10'];
    const mintermMap = [
        [0, 1, 3, 2],
        [4, 5, 7, 6],
        [12, 13, 15, 14],
        [8, 9, 11, 10]
    ];

    // Outer border & crisp interior grid lines
    for (let i = 0; i <= 4; i++) {
        const isBorder = (i === 0 || i === 4);
        const lineStyle = {
            ...d.roughOpts,
            strokeWidth: (isBorder ? 1.85 : 1.25) * d.ink.widthScale,
            seed: d.charCounterRef.count++
        };
        d.rc.line(gx, gy + i * cellSize, gx + gridW, gy + i * cellSize, lineStyle);
        d.rc.line(gx + i * cellSize, gy, gx + i * cellSize, gy + gridH, lineStyle);
    }

    // Diagonal variable header divider (AB \ CD)
    d.rc.line(gx - 38, gy - 30, gx, gy, { ...d.roughOpts, strokeWidth: 1.6 * d.ink.widthScale, seed: d.charCounterRef.count++ });
    drawHandwrittenWord(d.ctx, 'AB', gx - 46, gy - 5, 19, d.charCounterRef, d.opts);
    drawHandwrittenWord(d.ctx, 'CD', gx - 16, gy - 18, 19, d.charCounterRef, d.opts);

    // Gray code headers & cell values with subtle minterm index subscript
    for (let i = 0; i < 4; i++) {
        drawHandwrittenWord(d.ctx, grayCodes[i], gx + i * cellSize + 12, gy - 9, 19, d.charCounterRef, d.opts);
        drawHandwrittenWord(d.ctx, grayCodes[i], gx - 34, gy + i * cellSize + 29, 19, d.charCounterRef, d.opts);
        for (let j = 0; j < 4; j++) {
            const m = mintermMap[i][j];
            const val = ones.includes(m) ? '1' : '0';
            drawAllographicChar(d.ctx, val, gx + j * cellSize + 16, gy + i * cellSize + 29, 23, d.charCounterRef.count++, d.opts);

            // Tiny corner minterm index number like real engineering homework
            d.ctx.save();
            d.ctx.font = `10px "${d.opts.fontFamily}"`;
            d.ctx.fillStyle = d.ink.secondary;
            d.ctx.globalAlpha = 0.55;
            d.ctx.fillText(String(m), gx + j * cellSize + 31, gy + (i + 1) * cellSize - 4);
            d.ctx.restore();
        }
    }

    // Group 1: Center 2x2 Quad (minterms 5, 7, 13, 15 -> B*D) drawn as crisp rounded rectangle
    if (ones.includes(5) && ones.includes(7) && ones.includes(13) && ones.includes(15)) {
        drawHandRoundedRect(
            d.rc,
            gx + cellSize * 1 + 6,
            gy + cellSize * 1 + 6,
            cellSize * 2 - 12,
            cellSize * 2 - 12,
            14,
            {
                ...d.roughOpts,
                stroke: d.ink.accent,
                strokeWidth: 1.75 * d.ink.widthScale,
                seed: d.charCounterRef.count++
            }
        );
        // Callout label for Quad 1
        d.rc.line(gx + cellSize * 2.8, gy + cellSize * 2.2, gx + gridW + 24, gy + cellSize * 1.7, {
            ...d.roughOpts, stroke: d.ink.accent, strokeWidth: 1.2, seed: d.charCounterRef.count++
        });
        drawHandwrittenWord(d.ctx, 'BD', gx + gridW + 28, gy + cellSize * 1.7 + 5, 20, d.charCounterRef, d.opts);
    }

    // Group 2: 4-Corner Wrap-Around Quad (minterms 0, 2, 8, 10 -> B'*D') drawn with open wrap brackets
    if (ones.includes(0) && ones.includes(2) && ones.includes(8) && ones.includes(10)) {
        const cStyle = {
            ...d.roughOpts,
            stroke: d.ink.secondary,
            strokeWidth: 1.65 * d.ink.widthScale
        };
        const pad = 7;
        const cSpan = cellSize - pad;
        // Top-Left corner bracket (m0)
        d.rc.curve([[gx - 5, gy + cSpan], [gx + cSpan, gy + cSpan], [gx + cSpan, gy - 5]], { ...cStyle, seed: d.charCounterRef.count++ });
        // Top-Right corner bracket (m2)
        d.rc.curve([[gx + gridW + 5, gy + cSpan], [gx + gridW - cSpan, gy + cSpan], [gx + gridW - cSpan, gy - 5]], { ...cStyle, seed: d.charCounterRef.count++ });
        // Bottom-Left corner bracket (m8)
        d.rc.curve([[gx - 5, gy + gridH - cSpan], [gx + cSpan, gy + gridH - cSpan], [gx + cSpan, gy + gridH + 5]], { ...cStyle, seed: d.charCounterRef.count++ });
        // Bottom-Right corner bracket (m10)
        d.rc.curve([[gx + gridW + 5, gy + gridH - cSpan], [gx + gridW - cSpan, gy + gridH - cSpan], [gx + gridW - cSpan, gy + gridH + 5]], { ...cStyle, seed: d.charCounterRef.count++ });

        drawHandwrittenWord(d.ctx, "B'D' (corners)", gx + gridW + 28, gy + cellSize * 3.3, 19, d.charCounterRef, d.opts);
    }

    return gridH + 62;
}
