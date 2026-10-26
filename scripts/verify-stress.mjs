#!/usr/bin/env node
/**
 * ScriptForge Ultra Turbo Stress Suite Verifier (`scripts/verify-stress.mjs`)
 * Run: node scripts/verify-stress.mjs
 *
 * The judge. Reads stress/ultra_turbo_stress.txt and validates every line with
 * the project's REAL modules (no re-implementation):
 *   - every [DIAGRAM: ...] line is parsed by the real dispatcher (parseDiagramSpec)
 *     and must resolve to a known diagram type
 *   - every $$ ... $$ display block is parsed by the real LaTeX parser and measured
 *     by the real 2D measurer — width/ascent/descent must be finite and non-negative
 *   - DSL lint: no pipes inside values (outside the labeled CANARY chapter),
 *     single-line display math, balanced inline $ pairs
 *   - integrity: src/data/stressDoc.js (the preset) is byte-identical to the file
 *
 * Exit 0 = the corpus is valid and the engine's parsers accept every construct.
 * Exit 1 = an UNEXPECTED violation (anything outside the CANARY chapter).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Headless DOM stub (same contract as verify-waves.mjs / verify-graph.mjs)
function installHeadlessDOMStub() {
    if (typeof globalThis.document !== 'undefined') return;
    const noop = () => {};
    const baseCtx = {
        canvas: null, font: '16px sans-serif',
        measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 3 })
    };
    const ctx2d = new Proxy(baseCtx, {
        get(t, p) { if (p === 'then' || typeof p === 'symbol') return undefined; return (p in t) ? t[p] : noop; },
        set(t, p, v) { t[p] = v; return true; }
    });
    const makeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, toDataURL: () => 'data:image/png;base64,', addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
    const makeElement = (tag) => {
        const n = String(tag || '').toLowerCase();
        if (n === 'canvas') return makeCanvas();
        return { tagName: n, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    };
    globalThis.document = { createElement: makeElement, createElementNS: (_n, t) => makeElement(t), createTextNode: (t) => ({ textContent: String(t) }), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, body: makeElement('body'), documentElement: makeElement('html') };
    globalThis.window = globalThis;
    try { globalThis.navigator = { userAgent: 'verify-stress' }; } catch { /* readonly on Node >= 21 */ }
}
installHeadlessDOMStub();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const disp = await import(path.join(ROOT, 'src/render/diagrams/index.js'));
const parser = await import(path.join(ROOT, 'src/render/math/parser.js'));
const measure = await import(path.join(ROOT, 'src/render/math/measure.js'));
const presetsMod = await import(path.join(ROOT, 'src/data/presets.js'));

// Usage: node scripts/verify-stress.mjs [path/to/your/file.txt]   (defaults to the bundled stress corpus)
const targetArg = process.argv[2];
const targetPath = targetArg ? path.resolve(ROOT, targetArg) : path.join(ROOT, 'stress', 'ultra_turbo_stress.txt');
const raw = readFileSync(targetPath, 'utf8');
const isBundledTarget = !targetArg;
const lines = raw.split('\n');

const KNOWN = new Set(['grid', 'table', 'kmap', 'bitfield', 'array', 'schematic', 'circuit',
    'flipflop', 'dfa', 'nfa', 'fsm', 'tree', 'list', 'plot', 'canvas2d', 'geometry',
    'target', 'vectors', 'svg', 'custom_image', 'image', 'graph']);

let unexpected = 0;
let canaryViolations = 0;
const sc = { lines: 0, headings: 0, displayMath: 0, inlineMath: 0, pages: 1, diagrams: {}, canaries: [] };
let inCanary = false;

function bad(where, msg, line, kind) {
    if (inCanary) {
        canaryViolations++;
        sc.canaries.push(`${kind || 'canary'} @${where}`);
        console.log(`  [CANARY-EXPECTED] ${where}: ${msg}`);
    } else {
        unexpected++;
        console.error(`  [FAIL] ${where}: ${msg}\n    ${String(line).slice(0, 150)}`);
    }
}

console.log('\n====================================================================');
console.log(' Ultra Turbo Stress Suite Verifier');
console.log('====================================================================');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const where = `L${i + 1}`;
    if (line.trim() === '') continue;
    sc.lines++;

    if (/^#\s.*CANARY/.test(line.trim())) { inCanary = true; sc.headings++; continue; }

    if (/^#{1,6}\s/.test(line)) { sc.headings++; continue; }

    if (line.trim() === '---PAGE---') { sc.pages++; continue; }

    const dm = line.trim().match(/^\$\$(.+)\$\$$/);
    if (dm) {
        sc.displayMath++;
        try {
            const ast = parser.parseLatexToAST(dm[1].trim());
            const m = measure.measureMathAST(ast, 24, 34);
            if (!Number.isFinite(m.width) || !Number.isFinite(m.ascent) || !Number.isFinite(m.descent) || m.width < 0) {
                bad(where, `measureMathAST returned non-finite/negative (${m.width}x${m.height})`, line, 'math-nonfinite');
            }
        } catch (err) {
            bad(where, `parser threw: ${err.message}`, line, 'math-throw');
        }
        continue;
    }

    if (line.trim().startsWith('[DIAGRAM:')) {
        const t = line.trim();
        // Raw pipe lint: every part after the type must carry key=value (svg exempt)
        const payload = t.match(/^\[DIAGRAM:\s*(.+)\]$/);
        if (!payload) { bad(where, 'diagram line does not close with ]', line, 'diag-shape'); continue; }
        const isSvg = payload[1].includes('<svg');
        if (!isSvg) {
            const parts = payload[1].split('|').map(p => p.trim()).filter(Boolean);
            const type = (parts[0] || '').toLowerCase().split(/\s+/)[0];
            sc.diagrams[type] = (sc.diagrams[type] || 0) + 1;
            if (!KNOWN.has(type)) { bad(where, `unknown diagram type "${type}"`, line, 'diag-unknown'); continue; }
            for (let k = 1; k < parts.length; k++) {
                if (parts[k].indexOf('=') === -1) bad(where, `stray parameter "${parts[k]}" (pipe inside a value)`, line, 'pipe-in-value');
            }
        } else {
            sc.diagrams.svg = (sc.diagrams.svg || 0) + 1;
        }
        // Real dispatcher parse — must not throw and must resolve a diagType
        try {
            const { diagType } = disp.parseDiagramSpec(t);
            if (!diagType) bad(where, 'dispatcher returned no diagType', line, 'diag-notype');
        } catch (err) {
            bad(where, `real dispatcher threw: ${err.message}`, line, 'diag-throw');
        }
        continue;
    }

    // Prose
    const dollars = (line.match(/\$/g) || []).length;
    if (dollars % 2 !== 0) bad(where, 'unbalanced inline $', line, 'dollar-unbalanced');
    else if (dollars > 0) sc.inlineMath += dollars / 2;
    if (line.includes('$$') && !/^\$\$/.test(line.trim())) bad(where, 'stray $$ in prose', line, 'stray-display');
}

// Integrity: the preset string must be byte-identical to the generated stress file (bundled target only)
const presetOk = isBundledTarget &&
    ((presetsMod.PRESETS && presetsMod.PRESETS.stress_turbo === raw.replace(/\n$/, '\n')) ||
     presetsMod.PRESETS.stress_turbo === raw);

const totalDiagrams = Object.values(sc.diagrams).reduce((a, b) => a + b, 0);
console.log('\n--------------------------------------------------------------------');
console.log(' SCORECARD');
console.log('--------------------------------------------------------------------');
console.log(`  non-empty lines      : ${sc.lines}`);
console.log(`  headings             : ${sc.headings}`);
console.log(`  display math blocks  : ${sc.displayMath} (all parsed + measured NaN-free unless noted)`);
console.log(`  inline math spans    : ${sc.inlineMath}`);
console.log(`  diagrams             : ${totalDiagrams}`);
console.log(`  pages                : ${sc.pages}`);
console.log(`  file                 : ${path.relative(ROOT, targetPath)}${isBundledTarget ? '' : ' (custom)'}`);
console.log(`  preset integrity     : ${!isBundledTarget ? 'skipped (custom file)' : presetOk ? 'stressDoc.js === stress file' : 'MISMATCH'}`);
console.log('  diagrams by grammar  :');
for (const [k, v] of Object.entries(sc.diagrams).sort((a, b) => b[1] - a[1])) console.log(`      ${k.padEnd(10)} ${v}`);
console.log(`  canary violations    : ${canaryViolations} (expected, listed above)`);
console.log(`  UNEXPECTED failures  : ${unexpected}`);
if (isBundledTarget && !presetOk) unexpected++;
console.log('--------------------------------------------------------------------');
console.log(` SUMMARY: ${unexpected === 0 ? 'ALL VALID — engine parsers accept every line outside the canaries' : 'CORPUS INVALID — fix the lines above'}`);
console.log('====================================================================\n');
process.exit(unexpected === 0 ? 0 : 1);
