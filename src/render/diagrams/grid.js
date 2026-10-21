/**
 * ScriptForge Universal 2D Cellular & Tabular Grid Engine (Wave 1 - Universal Engine #2)
 * Renders compact hand-ruled notebook tables, 32-bit instruction bitfields,
 * 2/3/4-variable Karnaugh maps, pipeline timing tables, and array strips with pointers.
 * Strictly obeys the [leftMargin, rightMargin] (<= 680px) compactness invariant.
 */

import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';
import {
    drawHandRoundedRect,
    drawArrowLine,
    drawCurlyBrace,
    drawLabelOrMath,
    wrapCellText
} from './primitives.js';

/**
 * 1. Renders a compact 32-bit / N-bit segmented instruction format or register strip.
 * Syntax: `[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]`
 */
export function renderBitfieldDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const totalBits = parseInt(params.bits || '32', 10) || 32;
    const rawFields = (params.fields || 'Opcode:6,R1:4,R2:4,R3:4,Unused:14').split(',').map(s => s.trim()).filter(Boolean);
    const fields = rawFields.map(item => {
        const [name, bitsStr] = item.split(':').map(x => x.trim());
        return { name: name || 'Field', bits: parseInt(bitsStr || '4', 10) || 4 };
    });

    const sumBits = fields.reduce((acc, f) => acc + f.bits, 0) || totalBits;
    const maxW = Math.min(availWidth - 28, 560);
    const boxX = startX + 12;
    const boxY = startY + 26;
    const boxH = 42;

    // Outer register rectangle
    rc.rectangle(boxX, boxY, maxW, boxH, {
        ...roughOpts,
        strokeWidth: 1.8 * (ink.widthScale || 1.0),
        seed: charCounterRef.count++
    });

    let curX = boxX;
    let bitCursor = totalBits - 1;

    fields.forEach((f, idx) => {
        // Proportional width with minimum 68px so labels never clip
        const rawW = (f.bits / sumBits) * maxW;
        const segW = idx === fields.length - 1
            ? (boxX + maxW - curX)
            : Math.max(66, Math.min(rawW, maxW - (fields.length - 1 - idx) * 62 - (curX - boxX)));

        if (idx < fields.length - 1) {
            rc.line(curX + segW, boxY, curX + segW, boxY + boxH, {
                ...roughOpts,
                strokeWidth: 1.45 * (ink.widthScale || 1.0),
                seed: charCounterRef.count++
            });
        }

        // Top bit range boundary indices (e.g. 31 .. 26)
        const hiBit = bitCursor;
        const loBit = Math.max(0, bitCursor - f.bits + 1);
        bitCursor = loBit - 1;

        drawLabelOrMath(ctx, rc, String(hiBit), curX + 4, boxY - 6, 15, charCounterRef, opts);
        if (loBit !== hiBit && segW > 48) {
            drawLabelOrMath(ctx, rc, String(loBit), curX + segW - 18, boxY - 6, 15, charCounterRef, opts);
        }

        // Field name centered inside segment
        const nameFs = f.name.length > 7 ? 17 : 19;
        const estW = f.name.length * nameFs * 0.44;
        const tx = curX + Math.max(5, (segW - estW) / 2);
        drawLabelOrMath(ctx, rc, f.name, tx, boxY + 27, nameFs, charCounterRef, opts);

        // Underbrace + bit count label below segment
        drawCurlyBrace(rc, curX + 4, boxY + boxH + 3, curX + segW - 4, boxY + boxH + 3, 'down', {
            ...roughOpts,
            stroke: ink.secondary,
            strokeWidth: 1.25,
            seed: charCounterRef.count++
        });
        const bitLabel = `${f.bits}b`;
        drawLabelOrMath(ctx, rc, bitLabel, curX + segW / 2 - 11, boxY + boxH + 28, 17, charCounterRef, opts);

        curX += segW;
    });

    if (params.title || params.label) {
        drawLabelOrMath(ctx, rc, params.title || params.label, boxX, boxY + boxH + 50, 18, charCounterRef, opts);
        return boxH + 84;
    }

    return boxH + 64;
}

/**
 * 2. Renders a 2, 3, or 4-variable Karnaugh Map with implicant loops and corner wrap brackets.
 * Syntax: `[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15 | dcares=]`
 */
export function renderKMapGrid(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const vars = (params.vars || 'A,B,C,D').split(',').map(v => v.trim()).filter(Boolean);
    const numVars = Math.min(4, Math.max(2, vars.length));
    const cellSize = 42;
    const rows = numVars <= 3 ? 2 : 4;
    const cols = numVars === 2 ? 2 : 4;
    const gridW = cols * cellSize;
    const gridH = rows * cellSize;
    const gx = startX + 76;
    const gy = startY + 38;

    const ones = (params.ones || '0,2,5,7,8,10,13,15')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !Number.isNaN(n));
    const dcares = (params.dcares || params.x || '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !Number.isNaN(n));

    const rowCodes = rows === 2 ? ['0', '1'] : ['00', '01', '11', '10'];
    const colCodes = cols === 2 ? ['0', '1'] : ['00', '01', '11', '10'];
    const grayIdx = [0, 1, 3, 2];

    // Grid lines
    for (let r = 0; r <= rows; r++) {
        const isBorder = (r === 0 || r === rows);
        rc.line(gx, gy + r * cellSize, gx + gridW, gy + r * cellSize, {
            ...roughOpts,
            strokeWidth: (isBorder ? 1.85 : 1.25) * (ink.widthScale || 1.0),
            seed: charCounterRef.count++
        });
    }
    for (let c = 0; c <= cols; c++) {
        const isBorder = (c === 0 || c === cols);
        rc.line(gx + c * cellSize, gy, gx + c * cellSize, gy + gridH, {
            ...roughOpts,
            strokeWidth: (isBorder ? 1.85 : 1.25) * (ink.widthScale || 1.0),
            seed: charCounterRef.count++
        });
    }

    // Diagonal corner split header
    const rowVarLabel = numVars === 4 ? vars.slice(0, 2).join('') : vars[0];
    const colVarLabel = numVars === 4 ? vars.slice(2, 4).join('') : vars.slice(1).join('');
    rc.line(gx - 36, gy - 28, gx, gy, { ...roughOpts, strokeWidth: 1.6 * (ink.widthScale || 1.0), seed: charCounterRef.count++ });
    drawHandwrittenWord(ctx, rowVarLabel, gx - 44, gy - 4, 18, charCounterRef, opts);
    drawHandwrittenWord(ctx, colVarLabel, gx - 16, gy - 17, 18, charCounterRef, opts);

    // Headers & Minterm Cells
    for (let c = 0; c < cols; c++) {
        drawHandwrittenWord(ctx, colCodes[c], gx + c * cellSize + 11, gy - 8, 18, charCounterRef, opts);
    }
    for (let r = 0; r < rows; r++) {
        drawHandwrittenWord(ctx, rowCodes[r], gx - 32, gy + r * cellSize + 27, 18, charCounterRef, opts);
        for (let c = 0; c < cols; c++) {
            const rBits = grayIdx[r];
            const cBits = grayIdx[c];
            const minterm = (rBits << (cols === 4 ? 2 : 1)) | cBits;
            const val = dcares.includes(minterm) ? 'X' : (ones.includes(minterm) ? '1' : '0');
            drawAllographicChar(ctx, val, gx + c * cellSize + 15, gy + r * cellSize + 28, 22, charCounterRef.count++, opts);

            // Corner minterm index subscript
            ctx.save();
            ctx.font = `10px "${opts.fontFamily || 'Caveat'}"`;
            ctx.fillStyle = ink.secondary;
            ctx.globalAlpha = 0.55;
            ctx.fillText(String(minterm), gx + c * cellSize + 29, gy + (r + 1) * cellSize - 4);
            ctx.restore();
        }
    }

    // Custom loops (`loops=1,1,2,2:BD`) OR automatic 4-var implicant detection
    if (params.loops) {
        const loopDefs = params.loops.split(';').map(s => s.trim()).filter(Boolean);
        loopDefs.forEach((ld, idx) => {
            const [coordsStr, lbl] = ld.split(':').map(s => s.trim());
            const [r1, c1, r2, c2] = coordsStr.split(',').map(n => parseInt(n, 10));
            if (![r1, c1, r2, c2].some(Number.isNaN)) {
                const lx = gx + c1 * cellSize + 5;
                const ly = gy + r1 * cellSize + 5;
                const lw = (c2 - c1 + 1) * cellSize - 10;
                const lh = (r2 - r1 + 1) * cellSize - 10;
                drawHandRoundedRect(rc, lx, ly, lw, lh, 12, {
                    ...roughOpts,
                    stroke: idx % 2 === 0 ? ink.accent : ink.secondary,
                    strokeWidth: 1.7 * (ink.widthScale || 1.0),
                    seed: charCounterRef.count++
                });
                if (lbl) {
                    drawLabelOrMath(ctx, rc, lbl, gx + gridW + 20, ly + lh / 2 + 5, 19, charCounterRef, opts);
                }
            }
        });
    } else if (rows === 4 && cols === 4) {
        if ([5, 7, 13, 15].every(m => ones.includes(m))) {
            drawHandRoundedRect(rc, gx + cellSize + 6, gy + cellSize + 6, cellSize * 2 - 12, cellSize * 2 - 12, 13, {
                ...roughOpts, stroke: ink.accent, strokeWidth: 1.75 * (ink.widthScale || 1.0), seed: charCounterRef.count++
            });
            rc.line(gx + cellSize * 2.8, gy + cellSize * 2.2, gx + gridW + 22, gy + cellSize * 1.7, {
                ...roughOpts, stroke: ink.accent, strokeWidth: 1.2, seed: charCounterRef.count++
            });
            drawLabelOrMath(ctx, rc, 'BD', gx + gridW + 26, gy + cellSize * 1.7 + 5, 19, charCounterRef, opts);
        }
        if ([0, 2, 8, 10].every(m => ones.includes(m))) {
            const cStyle = { ...roughOpts, stroke: ink.secondary, strokeWidth: 1.65 * (ink.widthScale || 1.0) };
            const cSpan = cellSize - 7;
            rc.curve([[gx - 5, gy + cSpan], [gx + cSpan, gy + cSpan], [gx + cSpan, gy - 5]], { ...cStyle, seed: charCounterRef.count++ });
            rc.curve([[gx + gridW + 5, gy + cSpan], [gx + gridW - cSpan, gy + cSpan], [gx + gridW - cSpan, gy - 5]], { ...cStyle, seed: charCounterRef.count++ });
            rc.curve([[gx - 5, gy + gridH - cSpan], [gx + cSpan, gy + gridH - cSpan], [gx + cSpan, gy + gridH + 5]], { ...cStyle, seed: charCounterRef.count++ });
            rc.curve([[gx + gridW + 5, gy + gridH - cSpan], [gx + gridW - cSpan, gy + gridH - cSpan], [gx + gridW - cSpan, gy + gridH + 5]], { ...cStyle, seed: charCounterRef.count++ });
            drawLabelOrMath(ctx, rc, "B'D' (corners)", gx + gridW + 26, gy + cellSize * 3.3, 18, charCounterRef, opts);
        }
    }

    return gridH + 56;
}

/**
 * 3. Renders a 1D Array / Memory Tape with external cell index pointers.
 * Syntax: `[DIAGRAM: grid | cells=12,25,38,44,71,90 | pointers=0:low,2:mid,5:high]`
 */
export function renderArrayStrip(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const cells = (params.cells || '12,25,38,44,71,90').split(',').map(s => s.trim());
    const cellW = Math.min(64, Math.floor((availWidth - 60) / Math.max(1, cells.length)));
    const cellH = 38;
    const gx = startX + 20;
    const gy = startY + 24;
    const totalW = cellW * cells.length;

    rc.rectangle(gx, gy, totalW, cellH, {
        ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++
    });

    cells.forEach((val, idx) => {
        const cx = gx + idx * cellW;
        if (idx > 0) {
            rc.line(cx, gy, cx, gy + cellH, { ...roughOpts, seed: charCounterRef.count++ });
        }
        // Index label above box
        drawLabelOrMath(ctx, rc, String(idx), cx + cellW / 2 - 4, gy - 6, 15, charCounterRef, opts);
        // Cell value centered
        const estW = val.length * 10;
        drawLabelOrMath(ctx, rc, val, cx + Math.max(6, (cellW - estW) / 2), gy + 26, 20, charCounterRef, opts);
    });

    let extraBottom = 18;
    if (params.pointers) {
        extraBottom = 52;
        const ptrs = params.pointers.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        ptrs.forEach(p => {
            const [idxStr, lbl] = p.split(':').map(s => s.trim());
            const idx = parseInt(idxStr, 10);
            if (!Number.isNaN(idx) && idx >= 0 && idx < cells.length) {
                const px = gx + (idx + 0.5) * cellW;
                drawArrowLine(ctx, rc, px, gy + cellH + 24, px, gy + cellH + 3, 7.5, {
                    ...roughOpts, stroke: ink.accent, seed: charCounterRef.count++
                });
                if (lbl) {
                    drawLabelOrMath(ctx, rc, lbl, px - lbl.length * 4.5, gy + cellH + 42, 17, charCounterRef, opts);
                }
            }
        });
    }

    return cellH + extraBottom + 24;
}

/**
 * 4. Renders a Universal Multi-Column Auto-Wrapping Table (Hardware specs, Truth/Excitation tables, Pipeline charts).
 * Syntax: `[DIAGRAM: grid | cols=Component,Spec,Role | rows=CPU~8 Cores~Executes code;RAM~16GB~Working memory]`
 */
export function renderUniversalGrid(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    // Dispatch specialized sub-modes
    if (params.fields || params.bits) {
        return renderBitfieldDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (params.ones || (params.vars && !params.cols && !params.rows)) {
        return renderKMapGrid(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (params.cells) {
        return renderArrayStrip(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }

    const headers = (params.cols || params.headers || 'Col 1,Col 2,Col 3')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const rawRows = (params.rows || '0~0~0;0~1~1;1~0~1;1~1~0')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);

    const colCount = Math.max(1, headers.length);
    const rowsData = rawRows.map(rStr => {
        const delim = rStr.includes('~') ? '~' : ',';
        return rStr.split(delim).map(c => c.trim());
    });

    const maxTableW = Math.min(availWidth - 20, 650);
    const cellFs = colCount >= 6 ? 17 : 18.5;
    const lineH = 22;

    // Compute proportional column widths based on max text length in each column
    const colMaxChars = new Array(colCount).fill(4);
    headers.forEach((h, c) => { colMaxChars[c] = Math.max(colMaxChars[c], h.length + 2); });
    rowsData.forEach(row => {
        for (let c = 0; c < colCount; c++) {
            const val = row[c] || '';
            colMaxChars[c] = Math.max(colMaxChars[c], Math.min(28, val.length + 1));
        }
    });

    const totalWeight = colMaxChars.reduce((a, b) => a + b, 0) || 1;
    const colWidths = colMaxChars.map(w => Math.max(42, Math.floor((w / totalWeight) * maxTableW)));
    const tableW = Math.min(maxTableW, colWidths.reduce((a, b) => a + b, 0));

    // Pre-wrap all cells and compute row heights
    const allRows = [headers, ...rowsData];
    const wrappedRows = [];
    const rowHeights = [];

    for (let r = 0; r < allRows.length; r++) {
        const rowCells = [];
        let maxLines = 1;
        for (let c = 0; c < colCount; c++) {
            const cellStr = allRows[r][c] ?? '';
            const lines = wrapCellText(cellStr, colWidths[c] - 12, cellFs);
            rowCells.push(lines);
            maxLines = Math.max(maxLines, lines.length);
        }
        wrappedRows.push(rowCells);
        rowHeights.push(maxLines * lineH + 10);
    }

    const totalH = rowHeights.reduce((a, b) => a + b, 0);
    const gx = startX + 8;
    const gy = startY + 8;

    // Draw outer table box and horizontal row dividers
    let curY = gy;
    rc.line(gx, gy, gx + tableW, gy, { ...roughOpts, strokeWidth: 1.8, seed: charCounterRef.count++ });

    for (let r = 0; r < wrappedRows.length; r++) {
        const rh = rowHeights[r];
        let curX = gx;

        for (let c = 0; c < colCount; c++) {
            const cw = colWidths[c];
            const lines = wrappedRows[r][c];
            lines.forEach((ln, lIdx) => {
                const ty = curY + 20 + lIdx * lineH;
                // Center short values (1-3 chars); left-align longer prose
                const tx = ln.length <= 3
                    ? curX + Math.max(6, (cw - ln.length * cellFs * 0.48) / 2)
                    : curX + 7;
                drawLabelOrMath(ctx, rc, ln, tx, ty, r === 0 ? cellFs * 1.03 : cellFs, charCounterRef, opts);
            });
            curX += cw;
        }

        curY += rh;
        const isHeaderRow = r === 0;
        const isBottom = r === wrappedRows.length - 1;
        rc.line(gx, curY, gx + tableW, curY, {
            ...roughOpts,
            strokeWidth: (isHeaderRow || isBottom) ? 1.8 : 1.15,
            seed: charCounterRef.count++
        });
    }

    // Draw vertical column dividers
    let vx = gx;
    for (let c = 0; c <= colCount; c++) {
        const isEdge = (c === 0 || c === colCount);
        rc.line(vx, gy, vx, gy + totalH, {
            ...roughOpts,
            strokeWidth: isEdge ? 1.8 : 1.2,
            seed: charCounterRef.count++
        });
        if (c < colCount) vx += colWidths[c];
    }

    return totalH + 22;
}

export default renderUniversalGrid;
