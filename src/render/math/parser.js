/**
 * ScriptForge Universal 2D Math AST Parser (Wave 1)
 * Converts arbitrary LaTeX strings into a recursive 2D Box Abstract Syntax Tree:
 * - text / sym / space / func
 * - supsub (base with superscript and/or subscript)
 * - frac (\frac, \dfrac, \tfrac, \cfrac) & binom (\binom, \dbinom, \tbinom)
 * - sqrt (\sqrt{body} and \sqrt[n]{body})
 * - accent (\overline, \underline, \vec, \hat, \widehat, \tilde, \bar, \dot, \ddot, \overbrace, \underbrace)
 * - bigop (\int, \iint, \iiint, \oint, \sum, \prod, \coprod, \bigcup, \bigcap, \bigoplus, \lim, \max, \min)
 * - delim (\left ... \middle ... \right)
 * - matrix / grid (\begin{bmatrix|pmatrix|vmatrix|Bmatrix|matrix|cases|aligned|align|array})
 */

export const GREEK_MAP = {
    // Lowercase Greek
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ϵ', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
    '\\theta': 'θ', '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
    '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ', '\\varrho': 'ϱ',
    '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ',
    '\\phi': 'ϕ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    // Uppercase Greek
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
    '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ',
    '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
    // Calculus, Logic, Set Theory & Relations
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇', '\\aleph': 'ℵ',
    '\\hbar': 'ℏ', '\\ell': 'ℓ', '\\wp': '℘', '\\Re': 'ℜ', '\\Im': 'ℑ',
    '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
    '\\emptyset': '∅', '\\varnothing': '∅',
    '\\in': '∈', '\\notin': '∉', '\\ni': '∋',
    '\\subset': '⊂', '\\subseteq': '⊆', '\\supset': '⊃', '\\supseteq': '⊇',
    '\\cup': '∪', '\\cap': '∩', '\\setminus': '∖',
    '\\wedge': '∧', '\\land': '∧', '\\vee': '∨', '\\lor': '∨',
    '\\neg': '¬', '\\lnot': '¬', '\\top': '⊤', '\\bot': '⊥',
    '\\vdash': '⊢', '\\models': '⊨', '\\therefore': '∴', '\\because': '∵',
    // Binary Operators
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷',
    '\\cdot': '·', '\\ast': '∗', '\\star': '⋆', '\\circ': '∘', '\\bullet': '•',
    '\\oplus': '⊕', '\\ominus': '⊖', '\\otimes': '⊗', '\\oslash': '⊘', '\\odot': '⊙',
    // Relations
    '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
    '\\neq': '≠', '\\ne': '≠', '\\approx': '≈', '\\equiv': '≡',
    '\\cong': '≅', '\\sim': '∼', '\\simeq': '≃', '\\propto': '∝',
    '\\ll': '≪', '\\gg': '≫', '\\prec': '≺', '\\succ': '≻',
    '\\perp': '⊥', '\\parallel': '∥', '\\mid': '|',
    // Arrows
    '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\gets': '←',
    '\\leftrightarrow': '↔', '\\Rightarrow': '⇒', '\\implies': '⇒',
    '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔', '\\iff': '⇔',
    '\\mapsto': '↦', '\\longmapsto': '↦',
    '\\uparrow': '↑', '\\downarrow': '↓', '\\updownarrow': '↕',
    '\\nearrow': '↗', '\\searrow': '↘', '\\swarrow': '↙', '\\nwarrow': '↖',
    // Dots & Delimiters
    '\\dots': '…', '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
    '\\langle': '⟨', '\\rangle': '⟩', '\\lceil': '⌈', '\\rceil': '⌉',
    '\\lfloor': '⌊', '\\rfloor': '⌋', '\\|': '‖', '\\backslash': '\\',
    '\\prime': '′', '\\degree': '°', '\\circ': '∘'
};

export const NAMED_FUNCTIONS = new Set([
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
    'log', 'ln', 'lg', 'exp', 'det', 'dim', 'ker', 'hom',
    'arg', 'deg', 'gcd', 'Pr', 'mod'
]);

export const BIG_OPERATORS = {
    '\\int':     { op: 'int',    symbol: '∫', limitsDefault: 'side' },
    '\\iint':    { op: 'iint',   symbol: '∬', limitsDefault: 'side' },
    '\\iiint':   { op: 'iiint',  symbol: '∭', limitsDefault: 'side' },
    '\\oint':    { op: 'oint',   symbol: '∮', limitsDefault: 'side' },
    '\\sum':     { op: 'sum',    symbol: '∑', limitsDefault: 'abovebelow' },
    '\\prod':    { op: 'prod',   symbol: '∏', limitsDefault: 'abovebelow' },
    '\\coprod':  { op: 'coprod', symbol: '∐', limitsDefault: 'abovebelow' },
    '\\bigcup':  { op: 'bigcup', symbol: '⋃', limitsDefault: 'abovebelow' },
    '\\bigcap':  { op: 'bigcap', symbol: '⋂', limitsDefault: 'abovebelow' },
    '\\bigoplus':{ op: 'bigoplus',symbol:'⨁', limitsDefault: 'abovebelow' },
    '\\lim':     { op: 'lim',    symbol: 'lim', limitsDefault: 'abovebelow' },
    '\\limsup':  { op: 'lim',    symbol: 'lim sup', limitsDefault: 'abovebelow' },
    '\\liminf':  { op: 'lim',    symbol: 'lim inf', limitsDefault: 'abovebelow' },
    '\\max':     { op: 'lim',    symbol: 'max', limitsDefault: 'abovebelow' },
    '\\min':     { op: 'lim',    symbol: 'min', limitsDefault: 'abovebelow' },
    '\\sup':     { op: 'lim',    symbol: 'sup', limitsDefault: 'abovebelow' },
    '\\inf':     { op: 'lim',    symbol: 'inf', limitsDefault: 'abovebelow' }
};

const ACCENT_COMMANDS = {
    '\\overline': 'overline',
    '\\bar': 'bar',
    '\\underline': 'underline',
    '\\vec': 'vec',
    '\\overrightarrow': 'vec',
    '\\hat': 'hat',
    '\\widehat': 'widehat',
    '\\tilde': 'tilde',
    '\\widetilde': 'widetilde',
    '\\dot': 'dot',
    '\\ddot': 'ddot',
    '\\overbrace': 'overbrace',
    '\\underbrace': 'underbrace'
};

const TEXT_WRAP_COMMANDS = new Set([
    '\\text', '\\textrm', '\\textbf', '\\textit', '\\texttt',
    '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathfrak',
    '\\mathsf', '\\operatorname', '\\mbox'
]);

const SPACE_COMMANDS = {
    '\\,': 0.18,
    '\\:': 0.24,
    '\\;': 0.30,
    '\\!': -0.10,
    '\\quad': 0.85,
    '\\qquad': 1.60,
    '\\ ': 0.28
};

/**
 * Extracts a balanced `{ ... }` group or a single LaTeX token starting at `startIdx`.
 */
export function extractBracedGroup(str, startIdx) {
    let i = startIdx;
    while (i < str.length && str[i] === ' ') i++;
    if (i >= str.length) return { content: '', nextIdx: str.length };

    if (str[i] === '{') {
        let depth = 0;
        const openPos = i;
        for (; i < str.length; i++) {
            if (str[i] === '\\') {
                i++; // skip escaped brace
                continue;
            }
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) {
                    return { content: str.slice(openPos + 1, i), nextIdx: i + 1 };
                }
            }
        }
        return { content: str.slice(openPos + 1), nextIdx: str.length };
    }

    // Single backslash command token (e.g. \alpha, \pi)
    if (str[i] === '\\') {
        let j = i + 1;
        if (j < str.length && /[a-zA-Z]/.test(str[j])) {
            while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
        } else if (j < str.length) {
            j++;
        }
        return { content: str.slice(i, j), nextIdx: j };
    }

    return { content: str[i], nextIdx: i + 1 };
}

/**
 * Extracts an optional `[ ... ]` group (used in \sqrt[n]{x}).
 */
export function extractOptionalBracketGroup(str, startIdx) {
    let i = startIdx;
    while (i < str.length && str[i] === ' ') i++;
    if (i >= str.length || str[i] !== '[') {
        return { content: null, nextIdx: startIdx };
    }
    let depth = 0;
    const openPos = i;
    for (; i < str.length; i++) {
        if (str[i] === '[') depth++;
        else if (str[i] === ']') {
            depth--;
            if (depth === 0) {
                return { content: str.slice(openPos + 1, i), nextIdx: i + 1 };
            }
        }
    }
    return { content: str.slice(openPos + 1), nextIdx: str.length };
}

/**
 * Reads a delimiter token after \left, \right, or \middle.
 */
function extractDelimiterToken(str, startIdx) {
    let i = startIdx;
    while (i < str.length && str[i] === ' ') i++;
    if (i >= str.length) return { delim: '.', nextIdx: str.length };

    if (str.startsWith('\\{', i) || str.startsWith('\\}', i) || str.startsWith('\\|', i)) {
        const raw = str.slice(i, i + 2);
        const map = { '\\{': '{', '\\}': '}', '\\|': '‖' };
        return { delim: map[raw] || '|', nextIdx: i + 2 };
    }
    if (str[i] === '\\') {
        let j = i + 1;
        while (j < str.length && /[a-zA-Z]/.test(str[j])) j++;
        const cmd = str.slice(i, j);
        const mapped = GREEK_MAP[cmd] || '|';
        return { delim: mapped, nextIdx: j };
    }
    return { delim: str[i], nextIdx: i + 1 };
}

/**
 * Splits a top-level string by a delimiter (`\\\\` or `&`) while respecting nested `{...}` and `\begin...\end`.
 */
function splitTopLevel(str, sep) {
    const results = [];
    let cur = '';
    let braceDepth = 0;
    let envDepth = 0;
    let i = 0;

    while (i < str.length) {
        if (str.startsWith('\\begin{', i)) {
            envDepth++;
        } else if (str.startsWith('\\end{', i)) {
            envDepth = Math.max(0, envDepth - 1);
        }

        if (str[i] === '{' && (i === 0 || str[i - 1] !== '\\')) {
            braceDepth++;
        } else if (str[i] === '}' && (i === 0 || str[i - 1] !== '\\')) {
            braceDepth = Math.max(0, braceDepth - 1);
        }

        if (braceDepth === 0 && envDepth === 0 && str.startsWith(sep, i)) {
            results.push(cur);
            cur = '';
            i += sep.length;
            continue;
        }
        cur += str[i];
        i++;
    }
    results.push(cur);
    return results;
}

/**
 * Main entry point: parses any LaTeX string into an array of 2D AST Box nodes.
 */
export function parseLatexToAST(latex) {
    if (!latex || typeof latex !== 'string') return [];
    const s = latex.trim();
    const nodes = [];
    let i = 0;

    while (i < s.length) {
        // 1. Whitespace -> collapse into a single space token
        if (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') {
            nodes.push({ type: 'space', factor: 0.20 });
            while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
            continue;
        }

        // 2. Explicit spacing commands (\, \; \quad etc.)
        let matchedSpace = false;
        for (const [cmd, factor] of Object.entries(SPACE_COMMANDS)) {
            if (s.startsWith(cmd, i)) {
                nodes.push({ type: 'space', factor });
                i += cmd.length;
                matchedSpace = true;
                break;
            }
        }
        if (matchedSpace) continue;

        // 3. Environments: \begin{env} ... \end{env}
        if (s.startsWith('\\begin{', i)) {
            const envStart = i + 7;
            const envClose = s.indexOf('}', envStart);
            if (envClose !== -1) {
                const envName = s.slice(envStart, envClose).trim();
                const endTag = `\\end{${envName}}`;
                let bodyStart = envClose + 1;

                // Optional column alignment argument for \begin{array}{ccc}
                let colAlign = '';
                if (envName === 'array' && s[bodyStart] === '{') {
                    const alignGrp = extractBracedGroup(s, bodyStart);
                    colAlign = alignGrp.content;
                    bodyStart = alignGrp.nextIdx;
                }

                // Find matching \end{envName} respecting nested environments
                let depth = 1;
                let scanIdx = bodyStart;
                let endPos = -1;
                while (scanIdx < s.length) {
                    if (s.startsWith(`\\begin{${envName}}`, scanIdx)) {
                        depth++;
                        scanIdx += 8 + envName.length;
                    } else if (s.startsWith(endTag, scanIdx)) {
                        depth--;
                        if (depth === 0) {
                            endPos = scanIdx;
                            break;
                        }
                        scanIdx += endTag.length;
                    } else {
                        scanIdx++;
                    }
                }

                const body = endPos !== -1 ? s.slice(bodyStart, endPos) : s.slice(bodyStart);
                i = endPos !== -1 ? endPos + endTag.length : s.length;

                const rawRows = splitTopLevel(body, '\\\\')
                    .map(r => r.trim())
                    .filter(r => r.length > 0);

                const rows = rawRows.map(rowStr => {
                    const cleanRow = rowStr.replace(/\\hline/g, '').trim();
                    return splitTopLevel(cleanRow, '&').map(cell => parseLatexToAST(cell.trim()));
                });

                const bracketMap = {
                    bmatrix: 'square',
                    pmatrix: 'paren',
                    vmatrix: 'pipe',
                    Vmatrix: 'doublepipe',
                    Bmatrix: 'brace',
                    cases: 'cases',
                    aligned: 'none',
                    align: 'none',
                    matrix: 'none',
                    array: 'none'
                };

                nodes.push({
                    type: 'matrix',
                    env: envName,
                    bracket: bracketMap[envName] || 'square',
                    colAlign,
                    rows: rows.length > 0 ? rows : [[[]]]
                });
                continue;
            }
        }

        // 4. Stretchy \left ... \right Delimiters
        if (s.startsWith('\\left', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
            const leftD = extractDelimiterToken(s, i + 5);
            let scanIdx = leftD.nextIdx;
            let depth = 1;
            let rightPos = -1;
            let rightD = { delim: '.', nextIdx: s.length };

            while (scanIdx < s.length) {
                if (s.startsWith('\\left', scanIdx) && !/[a-zA-Z]/.test(s[scanIdx + 5] || '')) {
                    depth++;
                    scanIdx += 5;
                } else if (s.startsWith('\\right', scanIdx) && !/[a-zA-Z]/.test(s[scanIdx + 6] || '')) {
                    depth--;
                    if (depth === 0) {
                        rightPos = scanIdx;
                        rightD = extractDelimiterToken(s, scanIdx + 6);
                        break;
                    }
                    scanIdx += 6;
                } else {
                    scanIdx++;
                }
            }

            const innerContent = rightPos !== -1
                ? s.slice(leftD.nextIdx, rightPos)
                : s.slice(leftD.nextIdx);
            i = rightPos !== -1 ? rightD.nextIdx : s.length;

            // Replace any inner \middle| with a stretcher bar node
            const cleanedInner = innerContent.replace(/\\middle\s*(\S)/g, ' $1 ');
            nodes.push({
                type: 'delim',
                left: leftD.delim,
                right: rightD.delim,
                body: parseLatexToAST(cleanedInner)
            });
            continue;
        }

        // Ignore stray \right or \middle if encountered unbalanced
        if (s.startsWith('\\right', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
            const d = extractDelimiterToken(s, i + 6);
            if (d.delim !== '.') nodes.push({ type: 'text', val: d.delim });
            i = d.nextIdx;
            continue;
        }

        // 5. Fractions: \frac, \dfrac, \tfrac, \cfrac
        const fracMatch = s.slice(i).match(/^\\(d?frac|tfrac|cfrac)(?![a-zA-Z])/);
        if (fracMatch) {
            const cmdLen = fracMatch[0].length;
            const isDisplay = fracMatch[1] === 'dfrac' || fracMatch[1] === 'cfrac';
            i += cmdLen;
            const num = extractBracedGroup(s, i);
            const den = extractBracedGroup(s, num.nextIdx);
            i = den.nextIdx;
            nodes.push({
                type: 'frac',
                display: isDisplay,
                num: parseLatexToAST(num.content),
                den: parseLatexToAST(den.content)
            });
            continue;
        }

        // 6. Binomials: \binom, \dbinom, \tbinom
        const binomMatch = s.slice(i).match(/^\\(d?binom|tbinom)(?![a-zA-Z])/);
        if (binomMatch) {
            i += binomMatch[0].length;
            const top = extractBracedGroup(s, i);
            const bot = extractBracedGroup(s, top.nextIdx);
            i = bot.nextIdx;
            nodes.push({
                type: 'binom',
                num: parseLatexToAST(top.content),
                den: parseLatexToAST(bot.content)
            });
            continue;
        }

        // 7. Radicals: \sqrt[n]{body} or \sqrt{body}
        if (s.startsWith('\\sqrt', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
            i += 5;
            const optRoot = extractOptionalBracketGroup(s, i);
            const rad = extractBracedGroup(s, optRoot.nextIdx);
            i = rad.nextIdx;
            nodes.push({
                type: 'sqrt',
                index: optRoot.content ? parseLatexToAST(optRoot.content) : null,
                body: parseLatexToAST(rad.content)
            });
            continue;
        }

        // 8. Accents, Bars, Vectors & Over/Underbraces
        let matchedAccent = null;
        for (const [cmd, kind] of Object.entries(ACCENT_COMMANDS)) {
            if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
                matchedAccent = { cmd, kind };
                break;
            }
        }
        if (matchedAccent) {
            i += matchedAccent.cmd.length;
            const grp = extractBracedGroup(s, i);
            i = grp.nextIdx;
            let note = null;
            // Support \underbrace{body}_{note} and \overbrace{body}^{note}
            while (i < s.length && s[i] === ' ') i++;
            if ((matchedAccent.kind === 'underbrace' && s[i] === '_') ||
                (matchedAccent.kind === 'overbrace' && s[i] === '^')) {
                const noteGrp = extractBracedGroup(s, i + 1);
                note = parseLatexToAST(noteGrp.content);
                i = noteGrp.nextIdx;
            }
            nodes.push({
                type: 'accent',
                kind: matchedAccent.kind,
                body: parseLatexToAST(grp.content),
                note
            });
            continue;
        }

        // 9. Big Operators (\int, \oint, \iint, \sum, \prod, \lim, \bigcup, \bigcap...)
        let matchedBigOp = null;
        for (const [cmd, spec] of Object.entries(BIG_OPERATORS)) {
            if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
                matchedBigOp = { cmd, ...spec };
                break;
            }
        }
        if (matchedBigOp) {
            i += matchedBigOp.cmd.length;
            let sub = null;
            let sup = null;
            while (i < s.length) {
                while (i < s.length && s[i] === ' ') i++;
                if (s.startsWith('\\limits', i)) {
                    i += 7;
                    continue;
                }
                if (s.startsWith('\\nolimits', i)) {
                    i += 9;
                    continue;
                }
                if (s[i] === '_') {
                    const g = extractBracedGroup(s, i + 1);
                    sub = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else if (s[i] === '^') {
                    const g = extractBracedGroup(s, i + 1);
                    sup = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else {
                    break;
                }
            }
            nodes.push({
                type: 'bigop',
                op: matchedBigOp.op,
                symbol: matchedBigOp.symbol,
                limitsMode: matchedBigOp.limitsDefault,
                sub,
                sup
            });
            continue;
        }

        // 10. Text / Font Style Wrappers (\text{...}, \mathbb{R}, \mathcal{O}, \mathbf{x})
        let matchedTextCmd = null;
        for (const cmd of TEXT_WRAP_COMMANDS) {
            if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
                matchedTextCmd = cmd;
                break;
            }
        }
        if (matchedTextCmd) {
            i += matchedTextCmd.length;
            const grp = extractBracedGroup(s, i);
            i = grp.nextIdx;
            if (matchedTextCmd === '\\text' || matchedTextCmd === '\\textrm' || matchedTextCmd === '\\mbox') {
                nodes.push({ type: 'text', val: grp.content, isProse: true });
            } else {
                const innerNodes = parseLatexToAST(grp.content);
                innerNodes.forEach(n => { n.fontStyle = matchedTextCmd.slice(1); });
                nodes.push(...innerNodes);
            }
            continue;
        }

        // 11. Braced Group `{ ... }` at top level (e.g., `{n \choose k}` or grouping base for `^` / `_`)
        if (s[i] === '{') {
            const grp = extractBracedGroup(s, i);
            i = grp.nextIdx;
            const chooseIdx = grp.content.indexOf('\\choose');
            if (chooseIdx !== -1) {
                const topStr = grp.content.slice(0, chooseIdx);
                const botStr = grp.content.slice(chooseIdx + 7);
                nodes.push({
                    type: 'binom',
                    num: parseLatexToAST(topStr),
                    den: parseLatexToAST(botStr)
                });
            } else {
                const inner = parseLatexToAST(grp.content);
                if (inner.length === 1) {
                    nodes.push(inner[0]);
                } else if (inner.length > 1) {
                    nodes.push({ type: 'group', body: inner });
                }
            }
            continue;
        }

        // 12. Superscripts (`^`) and Subscripts (`_`)
        if (s[i] === '^' || s[i] === '_') {
            let sup = null;
            let sub = null;
            while (i < s.length) {
                if (s[i] === '^') {
                    const g = extractBracedGroup(s, i + 1);
                    sup = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else if (s[i] === '_') {
                    const g = extractBracedGroup(s, i + 1);
                    sub = parseLatexToAST(g.content);
                    i = g.nextIdx;
                } else if (s[i] === '\'') {
                    // Prime notation f'(x)
                    const primeAst = [{ type: 'text', val: '′' }];
                    sup = sup ? [...sup, ...primeAst] : primeAst;
                    i++;
                } else {
                    break;
                }
            }

            // Attach to previous node if applicable, or emit standalone supsub
            const prev = nodes.length > 0 ? nodes[nodes.length - 1] : null;
            if (prev && prev.type !== 'space' && prev.type !== 'supsub') {
                const baseNode = nodes.pop();
                nodes.push({
                    type: 'supsub',
                    base: [baseNode],
                    sup,
                    sub
                });
            } else {
                if (sup) nodes.push({ type: 'sup', body: sup });
                if (sub) nodes.push({ type: 'sub', body: sub });
            }
            continue;
        }

        // 13. Other Backslash Commands (Greek letters, operators, trig/log functions)
        if (s[i] === '\\') {
            if (i + 1 < s.length && !/[a-zA-Z]/.test(s[i + 1])) {
                const esc = s[i + 1];
                if (esc === '{' || esc === '}' || esc === '%' || esc === '$' || esc === '&' || esc === '#') {
                    nodes.push({ type: 'text', val: esc });
                }
                i += 2;
                continue;
            }

            let j = i + 1;
            while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
            const cmd = s.slice(i, j);
            const bareName = cmd.slice(1);

            if (GREEK_MAP[cmd]) {
                nodes.push({ type: 'text', val: GREEK_MAP[cmd], isSymbol: true });
                i = j;
                continue;
            }

            if (NAMED_FUNCTIONS.has(bareName)) {
                nodes.push({ type: 'func', val: bareName });
                i = j;
                continue;
            }

            // Graceful fallback for unknown LaTeX commands: strip backslash or skip formatting macro
            if (bareName === 'displaystyle' || bareName === 'textstyle' || bareName === 'scriptstyle' || bareName === 'noindent') {
                i = j;
                continue;
            }

            nodes.push({ type: 'text', val: bareName });
            i = j;
            continue;
        }

        // 14. Regular Character (Numbers, Variables, Operators `+ - = ( ) [ ] , . / |`)
        nodes.push({ type: 'text', val: s[i] });
        i++;
    }

    return nodes;
}

export default parseLatexToAST;
