// Measure 2D AST bounding box before drawing
export function measureMathAST(nodes, fontSize) {
    let width = 0;
    let ascent = fontSize * 0.75;
    let descent = fontSize * 0.28;

    for (const n of nodes) {
        if (n.type === 'space') {
            width += fontSize * 0.22;
        } else if (n.type === 'text') {
            width += n.val.length * fontSize * 0.48;
        } else if (n.type === 'sup' || n.type === 'sub') {
            const m = measureMathAST(n.body, fontSize * 0.68);
            width += m.width + 2;
            if (n.type === 'sup') ascent = Math.max(ascent, fontSize * 0.55 + m.height * 0.7);
            if (n.type === 'sub') descent = Math.max(descent, fontSize * 0.35 + m.height * 0.6);
        } else if (n.type === 'frac') {
            const mNum = measureMathAST(n.num, fontSize * 0.82);
            const mDen = measureMathAST(n.den, fontSize * 0.82);
            width += Math.max(mNum.width, mDen.width) + 18;
            ascent = Math.max(ascent, mNum.height + 12);
            descent = Math.max(descent, mDen.height + 12);
        } else if (n.type === 'sqrt') {
            const mBody = measureMathAST(n.body, fontSize * 0.92);
            width += mBody.width + 22;
            ascent = Math.max(ascent, mBody.ascent + 8);
            descent = Math.max(descent, mBody.descent + 4);
        } else if (n.type === 'overline') {
            const mBody = measureMathAST(n.body, fontSize);
            width += mBody.width + 4;
            ascent = Math.max(ascent, mBody.ascent + 8);
        } else if (n.type === 'bigop') {
            const mSub = n.sub ? measureMathAST(n.sub, fontSize * 0.62) : { width: 0, height: 0 };
            const mSup = n.sup ? measureMathAST(n.sup, fontSize * 0.62) : { width: 0, height: 0 };
            width += Math.max(fontSize * 0.95, mSub.width, mSup.width) + 12;
            ascent = Math.max(ascent, fontSize * 1.15 + mSup.height);
            descent = Math.max(descent, fontSize * 0.65 + mSub.height);
        } else if (n.type === 'matrix') {
            const rowCount = n.rows.length;
            const colCount = Math.max(...n.rows.map(r => r.length));
            let totalW = 28;
            for (let c = 0; c < colCount; c++) {
                let colW = 0;
                for (let r = 0; r < rowCount; r++) {
                    if (n.rows[r][c]) {
                        const mCell = measureMathAST(n.rows[r][c], fontSize * 0.82);
                        colW = Math.max(colW, mCell.width);
                    }
                }
                totalW += colW + 18;
            }
            const totalH = rowCount * (fontSize * 1.35);
            width += totalW;
            ascent = Math.max(ascent, totalH * 0.55);
            descent = Math.max(descent, totalH * 0.55);
        }
    }
    return { width, ascent, descent, height: ascent + descent };
}
