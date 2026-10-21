/**
 * STAGE 3: 2D SPATIAL MATH ENGINE
 * Parses LaTeX strings into a hierarchical 2D Abstract Syntax Tree (AST) supporting:
 * - \frac{num}{den} (nested fractions with hand-sketched vinculum bar)
 * - \int_{a}^{b}, \sum_{i=0}^{n} (large hand-drawn integral/sigma symbols with 2D limits)
 * - \sqrt{expr} (hand-drawn radical sign & overbar scaling to expression box)
 * - \begin{bmatrix} a & b \\ c & d \end{bmatrix} (2D matrices with hand-drawn brackets)
 * - \overline{expr} (Boolean negation bars for Digital Logic)
 * - Superscripts ^{...} and Subscripts _{...}
 */
export const GREEK_MAP = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
    '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
    '\\pi': 'π', '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ',
    '\\omega': 'ω', '\\Omega': 'Ω', '\\Delta': 'Δ', '\\Sigma': 'Σ', '\\infty': '∞',
    '\\partial': '∂', '\\pm': '±', '\\cdot': '·', '\\times': '×', '\\oplus': '⊕',
    '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',
    '\\in': '∈', '\\forall': '∀', '\\exists': '∃', '\\log': 'log ', '\\sin': 'sin ', '\\cos': 'cos '
};

export function extractBracedGroup(str, startIdx) {
    while (startIdx < str.length && str[startIdx] === ' ') startIdx++;
    if (str[startIdx] !== '{') {
        return { content: str[startIdx] || '', nextIdx: startIdx + 1 };
    }
    let depth = 0;
    let i = startIdx;
    for (; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
            depth--;
            if (depth === 0) {
                return { content: str.slice(startIdx + 1, i), nextIdx: i + 1 };
            }
        }
    }
    return { content: str.slice(startIdx + 1), nextIdx: str.length };
}

export function parseLatexToAST(latex) {
    let s = latex.trim()
        .replace(/\\left/g, '')
        .replace(/\\right/g, '');

    const nodes = [];
    let i = 0;

    while (i < s.length) {
        if (s[i] === ' ') {
            nodes.push({ type: 'space' });
            while (i < s.length && s[i] === ' ') i++;
            continue;
        }

        // Check for \begin{bmatrix} ... \end{bmatrix}
        if (s.startsWith('\\begin{bmatrix}', i) || s.startsWith('\\begin{pmatrix}', i)) {
            const isParen = s.startsWith('\\begin{pmatrix}', i);
            const endTag = isParen ? '\\end{pmatrix}' : '\\end{bmatrix}';
            const startContent = i + 15;
            const endPos = s.indexOf(endTag, startContent);
            const body = endPos !== -1 ? s.slice(startContent, endPos) : s.slice(startContent);
            i = endPos !== -1 ? endPos + 13 : s.length;

            const rows = body.split('\\\\').map(r => r.trim()).filter(Boolean).map(rowStr => {
                return rowStr.split('&').map(cell => parseLatexToAST(cell.trim()));
            });
            nodes.push({ type: 'matrix', bracket: isParen ? 'paren' : 'square', rows });
            continue;
        }

        // Check for \frac{num}{den}
        if (s.startsWith('\\frac', i)) {
            i += 5;
            const num = extractBracedGroup(s, i);
            const den = extractBracedGroup(s, num.nextIdx);
            i = den.nextIdx;
            nodes.push({
                type: 'frac',
                num: parseLatexToAST(num.content),
                den: parseLatexToAST(den.content)
            });
            continue;
        }

        // Check for \sqrt{expr}
        if (s.startsWith('\\sqrt', i)) {
            i += 5;
            const rad = extractBracedGroup(s, i);
            i = rad.nextIdx;
            nodes.push({
                type: 'sqrt',
                body: parseLatexToAST(rad.content)
            });
            continue;
        }

        // Check for \overline{expr}
        if (s.startsWith('\\overline', i)) {
            i += 9;
            const grp = extractBracedGroup(s, i);
            i = grp.nextIdx;
            nodes.push({
                type: 'overline',
                body: parseLatexToAST(grp.content)
            });
            continue;
        }

        // Check for \int or \sum with optional _{sub}^{sup}
        if (s.startsWith('\\int', i) || s.startsWith('\\sum', i)) {
            const opType = s.startsWith('\\int', i) ? 'int' : 'sum';
            i += 4;
            let sub = null, sup = null;
            while (i < s.length) {
                while (i < s.length && s[i] === ' ') i++;
                if (s[i] === '_') {
                    const g = extractBracedGroup(s, i + 1);
                    sub = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else if (s[i] === '^') {
                    const g = extractBracedGroup(s, i + 1);
                    sup = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else break;
            }
            nodes.push({ type: 'bigop', op: opType, sub, sup });
            continue;
        }

        // Check for Superscript / Subscript attached to previous token
        if (s[i] === '^' || s[i] === '_') {
            const kind = s[i] === '^' ? 'sup' : 'sub';
            const grp = extractBracedGroup(s, i + 1);
            i = grp.nextIdx;
            nodes.push({ type: kind, body: parseLatexToAST(grp.content) });
            continue;
        }

        // Check for Greek or Symbol commands
        if (s[i] === '\\') {
            let matched = false;
            for (const [cmd, sym] of Object.entries(GREEK_MAP)) {
                if (s.startsWith(cmd, i)) {
                    const nextChar = s[i + cmd.length];
                    if (!nextChar || !/[a-zA-Z]/.test(nextChar)) {
                        nodes.push({ type: 'text', val: sym });
                        i += cmd.length;
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched) {
                // Consume unknown command gracefully
                if (s[i + 1] === '{' || s[i + 1] === '}') {
                    nodes.push({ type: 'text', val: s[i + 1] });
                    i += 2;
                } else {
                    i++;
                }
            }
            continue;
        }

        // Regular character
        nodes.push({ type: 'text', val: s[i] });
        i++;
    }
    return nodes;
}
