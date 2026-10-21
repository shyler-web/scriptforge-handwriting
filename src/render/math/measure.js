/**
 * ScriptForge Recursive 2D Math Box Measurer (Wave 1)
 * Computes exact { width, ascent, descent, height, linesAbove, linesBelow } for any AST.
 * Guaranteed NaN-free and negative-free on all inputs.
 */

const DEFAULT_LINE_SPACING = 34;

function safeNum(val, fallback = 0) {
    return (typeof val === 'number' && Number.isFinite(val)) ? Math.max(0, val) : fallback;
}

/**
 * Measures an array of 2D Math AST nodes at a given `fontSize`.
 * @param {Array} nodes - Parsed AST nodes from `parseLatexToAST`
 * @param {number} fontSize - Base font size in logical pixels (default 24)
 * @param {number} lineSpacing - Notebook ruled line pitch in pixels (default 34)
 */
export function measureMathAST(nodes, fontSize = 24, lineSpacing = DEFAULT_LINE_SPACING) {
    const fs = safeNum(fontSize, 24) || 24;
    const L = safeNum(lineSpacing, DEFAULT_LINE_SPACING) || DEFAULT_LINE_SPACING;

    if (!Array.isArray(nodes) || nodes.length === 0) {
        return {
            width: 0,
            ascent: fs * 0.72,
            descent: fs * 0.26,
            height: fs * 0.98,
            linesAbove: 0,
            linesBelow: 1
        };
    }

    let width = 0;
    let ascent = fs * 0.74;
    let descent = fs * 0.28;

    for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;

        switch (n.type) {
            case 'space': {
                const factor = typeof n.factor === 'number' ? n.factor : 0.22;
                width += Math.max(-fs * 0.15, fs * factor);
                break;
            }

            case 'text': {
                const str = String(n.val ?? '');
                const charFactor = n.isProse ? 0.45 : 0.49;
                // Add slight horizontal breathing room around binary relations (=, +, -, ->)
                const isRelOp = /^[=+\-±∓×÷·⊕⊗→←↔⇒⇔≤≥≠≈≡∈⊂⊆∪∩]$/.test(str);
                width += str.length * fs * charFactor + (isRelOp ? fs * 0.28 : 0);
                break;
            }

            case 'func': {
                const str = String(n.val ?? '');
                width += str.length * fs * 0.47 + fs * 0.18;
                break;
            }

            case 'group': {
                const m = measureMathAST(n.body, fs, L);
                width += m.width;
                ascent = Math.max(ascent, m.ascent);
                descent = Math.max(descent, m.descent);
                break;
            }

            case 'sup':
            case 'sub': {
                const m = measureMathAST(n.body, fs * 0.68, L);
                width += m.width + 3;
                if (n.type === 'sup') {
                    ascent = Math.max(ascent, fs * 0.52 + m.height * 0.72);
                } else {
                    descent = Math.max(descent, fs * 0.34 + m.height * 0.65);
                }
                break;
            }

            case 'supsub': {
                const mBase = measureMathAST(n.base, fs, L);
                const mSup = n.sup ? measureMathAST(n.sup, fs * 0.66, L) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const mSub = n.sub ? measureMathAST(n.sub, fs * 0.66, L) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const scriptW = Math.max(mSup.width, mSub.width);
                width += mBase.width + scriptW + 3;
                ascent = Math.max(ascent, mBase.ascent, (n.sup ? mBase.ascent * 0.62 + mSup.height * 0.78 : 0));
                descent = Math.max(descent, mBase.descent, (n.sub ? mBase.descent * 0.55 + mSub.height * 0.72 : 0));
                break;
            }

            case 'frac':
            case 'binom': {
                const childScale = n.display ? 0.90 : 0.82;
                const mNum = measureMathAST(n.num, fs * childScale, L);
                const mDen = measureMathAST(n.den, fs * childScale, L);
                const padX = n.type === 'binom' ? 24 : 16;
                width += Math.max(mNum.width, mDen.width) + padX;
                ascent = Math.max(ascent, mNum.height + 10);
                descent = Math.max(descent, mDen.height + 10);
                break;
            }

            case 'sqrt': {
                const mBody = measureMathAST(n.body, fs * 0.92, L);
                const mIdx = n.index ? measureMathAST(n.index, fs * 0.58, L) : { width: 0, height: 0 };
                const hookW = Math.max(15, mIdx.width + 8);
                width += hookW + mBody.width + 8;
                ascent = Math.max(ascent, mBody.ascent + 9, mIdx.height + 6);
                descent = Math.max(descent, mBody.descent + 5);
                break;
            }

            case 'accent': {
                const mBody = measureMathAST(n.body, fs, L);
                const mNote = n.note ? measureMathAST(n.note, fs * 0.65, L) : { width: 0, height: 0 };
                width += Math.max(mBody.width, mNote.width) + 5;
                if (n.kind === 'underline') {
                    descent = Math.max(descent, mBody.descent + 8);
                } else if (n.kind === 'underbrace') {
                    descent = Math.max(descent, mBody.descent + 14 + mNote.height);
                } else if (n.kind === 'overbrace') {
                    ascent = Math.max(ascent, mBody.ascent + 14 + mNote.height);
                } else {
                    ascent = Math.max(ascent, mBody.ascent + 9);
                }
                descent = Math.max(descent, mBody.descent);
                break;
            }

            case 'bigop': {
                const mSub = n.sub ? measureMathAST(n.sub, fs * 0.62, L) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const mSup = n.sup ? measureMathAST(n.sup, fs * 0.62, L) : { width: 0, height: 0, ascent: 0, descent: 0 };
                const symLen = String(n.symbol || '∫').length;
                const opBaseW = n.op === 'lim' ? Math.max(fs * 1.15, symLen * fs * 0.42) : fs * (0.88 + (symLen - 1) * 0.32);

                if (n.limitsMode === 'abovebelow' || n.op === 'sum' || n.op === 'prod' || n.op === 'lim') {
                    width += Math.max(opBaseW, mSub.width, mSup.width) + 10;
                    ascent = Math.max(ascent, fs * 0.95 + (n.sup ? mSup.height + 4 : 0));
                    descent = Math.max(descent, fs * 0.52 + (n.sub ? mSub.height + 6 : 0));
                } else {
                    // Integrals place limits to the upper-right and lower-right
                    width += opBaseW + Math.max(mSub.width, mSup.width) + 10;
                    ascent = Math.max(ascent, fs * 1.10 + mSup.height * 0.65);
                    descent = Math.max(descent, fs * 0.65 + mSub.height * 0.65);
                }
                break;
            }

            case 'delim': {
                const mBody = measureMathAST(n.body, fs, L);
                const leftW = n.left && n.left !== '.' ? 11 : 2;
                const rightW = n.right && n.right !== '.' ? 11 : 2;
                width += leftW + mBody.width + rightW;
                ascent = Math.max(ascent, mBody.ascent + 4);
                descent = Math.max(descent, mBody.descent + 4);
                break;
            }

            case 'matrix': {
                const rows = Array.isArray(n.rows) && n.rows.length > 0 ? n.rows : [[[]]];
                const rowCount = rows.length;
                const colCount = Math.max(1, ...rows.map(r => (Array.isArray(r) ? r.length : 1)));
                const cellFs = fs * 0.82;
                const colWidths = new Array(colCount).fill(0);
                let totalRowsHeight = 0;

                for (let r = 0; r < rowCount; r++) {
                    let rowAsc = cellFs * 0.75;
                    let rowDesc = cellFs * 0.30;
                    for (let c = 0; c < colCount; c++) {
                        const cellAst = rows[r] && rows[r][c] ? rows[r][c] : [];
                        const mCell = measureMathAST(cellAst, cellFs, L);
                        colWidths[c] = Math.max(colWidths[c], mCell.width);
                        rowAsc = Math.max(rowAsc, mCell.ascent);
                        rowDesc = Math.max(rowDesc, mCell.descent);
                    }
                    totalRowsHeight += rowAsc + rowDesc + 8;
                }

                const colGap = n.bracket === 'cases' ? 18 : 15;
                const delimPad = n.bracket === 'none' ? 8 : (n.bracket === 'cases' ? 20 : 26);
                const gridW = colWidths.reduce((acc, w) => acc + w, 0) + Math.max(0, colCount - 1) * colGap + delimPad;

                width += gridW;
                ascent = Math.max(ascent, totalRowsHeight * 0.54);
                descent = Math.max(descent, totalRowsHeight * 0.54);
                break;
            }

            default:
                break;
        }
    }

    const cleanWidth = safeNum(width, 0);
    const cleanAscent = safeNum(ascent, fs * 0.74);
    const cleanDescent = safeNum(descent, fs * 0.28);
    const cleanHeight = cleanAscent + cleanDescent;

    // Ruled-Line Grid Snapping Invariant (L = 34px)
    const linesAbove = Math.max(0, Math.ceil((cleanAscent - 0.65 * L) / L));
    const linesBelow = Math.max(1, Math.ceil((cleanDescent + 0.35 * L) / L));

    return {
        width: cleanWidth,
        ascent: cleanAscent,
        descent: cleanDescent,
        height: cleanHeight,
        linesAbove,
        linesBelow
    };
}

export default measureMathAST;
