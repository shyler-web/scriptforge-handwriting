/**
 * ScriptForge DSL validator.
 *
 * The grammar below is deliberately grounded in the real renderers:
 * - `src/render/page.js`        single-line `$$...$$`, `^[DIAGRAM: ...]$`, `#` headings,
 *                               `~~strike~~`, `$inline$`, `---PAGE---`.
 * - `src/render/diagrams/index.js` the exact diagram route/alias list.
 * - `src/render/math/parser.js` the exact LaTeX commands, environments and operators.
 *
 * It is intentionally strict enough to catch agent mistakes before a note reaches
 * the canvas, and it always returns line numbers plus a short correction example.
 */

import {
    GREEK_MAP,
    NAMED_FUNCTIONS,
    BIG_OPERATORS,
    ACCENT_COMMANDS,
    TEXT_WRAP_COMMANDS,
    SPACE_COMMANDS
} from '../src/render/math/parser.js';
import {
    splitFrontmatter,
    deriveTitle,
    SUPPORTED_FONTS,
    SUPPORTED_INKS,
    SUPPORTED_PAPERS
} from '../shared/note-format.mjs';

export {
    splitFrontmatter,
    deriveTitle,
    SUPPORTED_FONTS,
    SUPPORTED_INKS,
    SUPPORTED_PAPERS
};

/** Mirrors the route table in `src/render/diagrams/index.js`. */
export const SUPPORTED_DIAGRAM_TYPES = new Set([
    'svg',
    'grid', 'table', 'kmap', 'bitfield', 'array',
    'schematic', 'circuit', 'flipflop', 'dfa', 'nfa', 'fsm', 'tree', 'list', 'graph',
    'plot', 'canvas2d', 'geometry', 'target', 'vectors', 'sketch',
    'custom_image', 'image'
]);

const SUPPORTED_ENVIRONMENTS = new Set([
    'bmatrix', 'pmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix',
    'cases', 'aligned', 'align', 'matrix', 'array'
]);

const EXTRA_COMMANDS = [
    'frac', 'dfrac', 'tfrac', 'cfrac',
    'binom', 'dbinom', 'tbinom',
    'sqrt', 'left', 'right', 'middle',
    'begin', 'end', 'limits', 'nolimits', 'hline'
];

function stripSlash(cmd) {
    return String(cmd).replace(/^\\/, '');
}

/** Exact command allowlist derived from the parser's own tables. */
export const SUPPORTED_LATEX_COMMANDS = new Set([
    ...Object.keys(GREEK_MAP).map(stripSlash),
    ...Object.keys(BIG_OPERATORS).map(stripSlash),
    ...Array.from(NAMED_FUNCTIONS).map(stripSlash),
    ...Object.keys(ACCENT_COMMANDS).map(stripSlash),
    ...Array.from(TEXT_WRAP_COMMANDS).map(stripSlash),
    ...Object.keys(SPACE_COMMANDS).map(stripSlash),
    ...EXTRA_COMMANDS
]);

export const DIAGRAM_EXAMPLE =
    '[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C | layout=circular]';

export const MATH_EXAMPLE =
    '$$ \\frac{\\partial f}{\\partial x} = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h} $$';

export const SKETCH_EXAMPLE =
    '[sketch:\n  point O = (0, 0) label="$O$"\n  point A = O + polar(60, 40) label="$A$"\n  arrow O -> A\n]';

function countUnescaped(text, char) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\\') {
            i++;
            continue;
        }
        if (text[i] === char) count++;
    }
    return count;
}

function findMathSegments(bodyLines) {
    const segments = [];
    bodyLines.forEach((line, index) => {
        const lineNo = index + 1;
        const trimmed = line.trim();

        const display = trimmed.match(/^\$\$(.+)\$\$$/);
        if (display) {
            segments.push({ latex: display[1], line: lineNo, inline: false });
            return;
        }

        if (trimmed.includes('$$')) {
            segments.push({ latex: '', line: lineNo, inline: false, broken: 'display' });
        }

        const withoutEscaped = line.replace(/\\\$/g, '');
        const inlineMatches = withoutEscaped.match(/\$([^$]+)\$/g) || [];
        for (const raw of inlineMatches) {
            segments.push({ latex: raw.slice(1, -1), line: lineNo, inline: true });
        }
    });
    return segments;
}

function validateMathSegment(segment, errors, warnings) {
    const { latex, line } = segment;
    if (!latex) return;

    const openBraces = countUnescaped(latex, '{');
    const closeBraces = countUnescaped(latex, '}');
    if (openBraces !== closeBraces) {
        errors.push({
            line,
            message: `Unbalanced braces in math (${openBraces} "{" vs ${closeBraces} "}").`,
            example: MATH_EXAMPLE
        });
    }

    const commandRegex = /\\([a-zA-Z]+)/g;
    let match;
    while ((match = commandRegex.exec(latex)) !== null) {
        const cmd = match[1];
        if (!SUPPORTED_LATEX_COMMANDS.has(cmd)) {
            errors.push({
                line,
                message: `Unsupported LaTeX command "\\${cmd}". The ScriptForge math renderer is a fixed allowlist, not full LaTeX.`,
                example: 'Supported examples: \\frac, \\sqrt, \\sum, \\int, \\overline, \\alpha, \\begin{bmatrix}, \\text{...}'
            });
        }
    }

    const envRegex = /\\(?:begin|end)\{([^}]+)\}/g;
    while ((match = envRegex.exec(latex)) !== null) {
        const env = match[1].trim();
        if (!SUPPORTED_ENVIRONMENTS.has(env)) {
            errors.push({
                line,
                message: `Unsupported math environment "${env}".`,
                example: 'Use one of: bmatrix, pmatrix, vmatrix, Vmatrix, Bmatrix, matrix, cases, aligned, align, array.'
            });
        }
    }

    if (segment.inline && /\\\\/.test(latex)) {
        warnings.push({
            line,
            message: 'Inline math contains a "\\\\" row break; use display math $$...$$ for multi-row structures.'
        });
    }
}


function validateSketchBody(body, startLine, errors) {
    const text = String(body || '').trim();
    if (!text) {
        errors.push({
            line: startLine,
            message: 'A [sketch: ...] block needs at least one statement.',
            example: SKETCH_EXAMPLE
        });
        return;
    }

    let parens = 0;
    let brackets = 0;
    let braces = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' && text[i - 1] !== '\\') {
            inQuotes = !inQuotes;
            continue;
        }
        if (inQuotes) continue;
        if (ch === '(') parens++;
        else if (ch === ')') parens--;
        else if (ch === '[') brackets++;
        else if (ch === ']') brackets--;
        else if (ch === '{') braces++;
        else if (ch === '}') braces--;
    }

    if (inQuotes) {
        errors.push({ line: startLine, message: 'Unclosed quote in [sketch: ...] block.', example: SKETCH_EXAMPLE });
    }
    if (parens !== 0 || brackets !== 0 || braces !== 0) {
        errors.push({
            line: startLine,
            message: 'Unbalanced parentheses, brackets or braces in [sketch: ...] block.',
            example: SKETCH_EXAMPLE
        });
    }
}

function validateDiagramLine(trimmed, lineNo, errors) {
    if (!trimmed.startsWith('[DIAGRAM:')) return false;

    const match = trimmed.match(/^\[DIAGRAM:\s*(.+)\]$/i);
    if (!match) {
        errors.push({
            line: lineNo,
            message: 'A diagram block must be alone on its own line and end with "]".',
            example: DIAGRAM_EXAMPLE
        });
        return true;
    }

    const spec = match[1].trim();
    const isSvg = /<svg[\s>]/i.test(spec);
    const type = isSvg ? 'svg' : (spec.split('|')[0].trim().toLowerCase() || 'grid');

    if (!SUPPORTED_DIAGRAM_TYPES.has(type)) {
        errors.push({
            line: lineNo,
            message: `Unknown diagram type "${type}".`,
            example: `Supported types: ${Array.from(SUPPORTED_DIAGRAM_TYPES).join(', ')}. Example: ${DIAGRAM_EXAMPLE}`
        });
    }

    if (type === 'svg') {
        if (!/<\/svg\s*>/i.test(spec)) {
            errors.push({
                line: lineNo,
                message: 'SVG diagram is missing a closing </svg> tag.',
                example: '[DIAGRAM: svg | <svg viewBox="0 0 200 120"><rect x="10" y="10" width="80" height="40"/></svg>]'
            });
        }
    } else {
        const parts = spec.split('|').map(p => p.trim());
        for (let i = 1; i < parts.length; i++) {
            if (parts[i] && !parts[i].includes('=')) {
                errors.push({
                    line: lineNo,
                    message: `Diagram parameter "${parts[i]}" is missing "=". Use key=value pairs separated by "|".`,
                    example: DIAGRAM_EXAMPLE
                });
            }
        }
    }

    return true;
}

/**
 * Validates a full note (frontmatter + body) against the ScriptForge DSL.
 * @returns {{ok:boolean, errors:Array, warnings:Array, meta:object, title:string, body:string, hasFrontmatter:boolean}}
 */
export function validateNote(text, { slug = '' } = {}) {
    const source = String(text ?? '');
    const front = splitFrontmatter(source);
    const errors = front.errors.map(e => ({ ...e, example: 'Frontmatter must be: ---\\ntitle: My note\\n---' }));
    const warnings = [];

    const meta = front.meta || {};
    if (meta.font && !SUPPORTED_FONTS.includes(meta.font)) {
        errors.push({
            line: 2,
            message: `Unknown font "${meta.font}".`,
            example: `Use one of: ${SUPPORTED_FONTS.map(f => `"${f}"`).join(', ')}.`
        });
    }
    if (meta.ink && !SUPPORTED_INKS.includes(meta.ink)) {
        errors.push({
            line: 2,
            message: `Unknown ink "${meta.ink}".`,
            example: `Use one of: ${SUPPORTED_INKS.join(', ')}.`
        });
    }
    if (meta.paper && !SUPPORTED_PAPERS.includes(meta.paper)) {
        errors.push({
            line: 2,
            message: `Unknown paper style "${meta.paper}".`,
            example: `Use one of: ${SUPPORTED_PAPERS.join(', ')}.`
        });
    }
    if (meta.seed !== undefined && typeof meta.seed !== 'number') {
        warnings.push({ line: 2, message: `Frontmatter seed "${meta.seed}" is not a number and will be ignored.` });
    }
    for (const key of Object.keys(meta)) {
        if (!['title', 'tags', 'font', 'ink', 'paper', 'seed'].includes(key)) {
            warnings.push({ line: 2, message: `Unknown frontmatter key "${key}" is ignored.` });
        }
    }

    const body = front.body;
    const bodyLines = body.split(/\r?\n/);
    const lineOffset = source.slice(0, source.length - body.length).split(/\r?\n/).length - 1;

    if (!body.trim()) {
        warnings.push({ line: 1, message: 'The note body is empty.' });
    }

    let sketchStart = -1;
    let sketchBody = [];

    bodyLines.forEach((rawLine, index) => {
        const lineNo = index + 1 + lineOffset;
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (sketchStart !== -1) {
            if (trimmed.endsWith(']')) {
                sketchBody.push(trimmed.slice(0, -1));
                validateSketchBody(sketchBody.join('\n'), sketchStart, errors);
                sketchStart = -1;
                sketchBody = [];
            } else {
                sketchBody.push(rawLine);
            }
            return;
        }

        if (/^\[sketch:/i.test(trimmed)) {
            const rest = trimmed.replace(/^\[sketch:\s*/i, '');
            if (rest.trimEnd().endsWith(']')) {
                validateSketchBody(rest.trimEnd().slice(0, -1), lineNo, errors);
            } else {
                sketchStart = lineNo;
                sketchBody = [rest];
            }
            return;
        }

        if (trimmed.startsWith('[DIAGRAM:') || /\[DIAGRAM:/i.test(trimmed)) {
            if (trimmed !== line.trim() || !/^\[DIAGRAM:/i.test(trimmed)) {
                errors.push({
                    line: lineNo,
                    message: 'A diagram block must start at the beginning of its own line.',
                    example: DIAGRAM_EXAMPLE
                });
            } else {
                validateDiagramLine(trimmed, lineNo, errors);
            }
            return;
        }

        if (trimmed.includes('$$')) {
            const isSingleLineDisplay = /^\$\$.+\$\$$/.test(trimmed);
            if (!isSingleLineDisplay) {
                errors.push({
                    line: lineNo,
                    message: 'Display math must be a single line: "$$ ... $$". Multi-line equations are not supported by the paginator.',
                    example: MATH_EXAMPLE
                });
                return;
            }
        }

        const withoutEscaped = line.replace(/\\\$/g, '').replace(/\$\$.+\$\$/g, '');
        if (countUnescaped(withoutEscaped, '$') % 2 !== 0) {
            errors.push({
                line: lineNo,
                message: 'Unclosed inline math: every "$" needs a matching "$" on the same line.',
                example: 'The function $f(x) = x^2$ is continuous.'
            });
        }

        if (/^#{7,}\s/.test(trimmed)) {
            errors.push({
                line: lineNo,
                message: 'Headings support at most six "#" characters.',
                example: '## Section title'
            });
        }
    });

    if (sketchStart !== -1) {
        errors.push({
            line: sketchStart,
            message: 'Unclosed [sketch: ...] block; add a closing "]".',
            example: SKETCH_EXAMPLE
        });
    }

    for (const segment of findMathSegments(bodyLines)) {
        const lineNo = segment.line + lineOffset;
        if (segment.broken) {
            errors.push({
                line: lineNo,
                message: 'Display math must be a single line: "$$ ... $$".',
                example: MATH_EXAMPLE
            });
            continue;
        }
        validateMathSegment({ ...segment, line: lineNo }, errors, warnings);
    }

    const title = deriveTitle(meta, body, slug);

    errors.sort((a, b) => a.line - b.line);
    warnings.sort((a, b) => a.line - b.line);

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        meta,
        title,
        body,
        hasFrontmatter: front.hasFrontmatter
    };
}

export function formatValidation(result) {
    const lines = [];
    if (result.ok) {
        lines.push(`VALID: "${result.title}"`);
    } else {
        lines.push(`INVALID: "${result.title}" — ${result.errors.length} error(s)`);
    }
    for (const e of result.errors) {
        lines.push(`  line ${e.line}: ${e.message}`);
        if (e.example) lines.push(`    example: ${e.example}`);
    }
    for (const w of result.warnings) {
        lines.push(`  warning line ${w.line}: ${w.message}`);
    }
    return lines.join('\n');
}

export default validateNote;
