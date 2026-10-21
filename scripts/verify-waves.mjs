/**
 * ScriptForge Automated Quantitative Exit-Criteria Verifier (`scripts/verify-waves.mjs` - Wave 5)
 * Run via: `node scripts/verify-waves.mjs`
 *
 * Verifies:
 * 1. Native ES Module import graph integrity across `src/`
 * 2. 2D Math AST Parser & Measurer Invariant (0 NaN, 0 negative boxes, valid linesAbove/linesBelow)
 * 3. Universal Diagram Spec Dispatcher coverage across all 5 Spatial Grammars
 * 4. Multi-Allograph Anti-Clone Invariant (adjacent identical letters never share the same variant A0..A3)
 * 5. Security & Secret Scan (verifies no API keys or credentials exist in tracked files)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// HEADLESS BOOTSTRAP (Wave 5 integration requirement: plain Node, no DOM)
// ---------------------------------------------------------------------------
// Some project modules touch the DOM at module scope in certain builds:
//   * `src/render/glyph.js`                -> allocates an offscreen <canvas> at import time
//   * `src/render/diagrams/index.js`       -> imports `glyph.js` transitively
//   * `src/render/diagrams/canvas2d.js`    -> imports `glyph.js` transitively
//   * `src/render/diagrams/grid.js` / `schematic.js` -> same chain
// Static top-level `import` statements are HOISTED and evaluated before any
// statement of this file runs, so they would throw "document is not defined"
// under plain Node. Therefore this verifier:
//   1) installs a minimal headless `document` / `window` stub SYNCHRONOUSLY
//      before touching the project graph, and
//   2) loads every project module through a DYNAMIC `await import(...)`.
// No browser, no DOM, no CDN, no npm dependency is required.
// ---------------------------------------------------------------------------

function installHeadlessDOMStub() {
    if (typeof globalThis.document !== 'undefined') return;

    const noop = () => {};
    const baseCtx = {
        canvas: null,
        font: '16px sans-serif',
        measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0))) }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0))) }),
        putImageData: noop
    };
    const ctx2d = new Proxy(baseCtx, {
        get(target, prop) {
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            if (prop in target) return target[prop];
            return noop;
        },
        set(target, prop, value) { target[prop] = value; return true; }
    });

    const makeCanvas = () => ({
        width: 0,
        height: 0,
        style: {},
        getContext: () => ctx2d,
        toDataURL: () => 'data:image/png;base64,',
        getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        addEventListener: noop,
        removeEventListener: noop
    });

    const makeElement = (tag) => {
        const name = String(tag || '').toLowerCase();
        if (name === 'canvas') return makeCanvas();
        return { tagName: name, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    };

    globalThis.document = {
        createElement: makeElement,
        createElementNS: (_ns, tag) => makeElement(tag),
        createTextNode: (t) => ({ textContent: String(t) }),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        body: makeElement('body'),
        documentElement: makeElement('html')
    };

    if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
    if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'scriptforge-headless' };
    if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    if (typeof globalThis.cancelAnimationFrame !== 'function') globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

/**
 * Dynamic (non-hoisted) loader for a project module. Never throws: a broken
 * module is reported as a failed exit criterion instead of aborting the run.
 */
async function importProjectModule(specifier) {
    try {
        const mod = await import(specifier);
        return { mod, error: null };
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return { mod: null, error: message };
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  [PASS] ${message}`);
    } else {
        failed++;
        console.error(`  [FAIL] ${message}`);
    }
}

console.log('====================================================================');
console.log(' ScriptForge Studio — Wave 1-5 Quantitative Exit Criteria Verifier');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------
// TEST 0: Headless Native ES Module Import Graph Integrity
// ---------------------------------------------------------------------------
console.log('0. Verifying Headless Native ES Module Import Graph Integrity...');

installHeadlessDOMStub();

const PROJECT_MODULES = [
    { specifier: '../src/render/math/parser.js', symbols: ['parseLatexToAST'] },
    { specifier: '../src/render/math/measure.js', symbols: ['measureMathAST'] },
    { specifier: '../src/render/diagrams/index.js', symbols: ['parseDiagramSpec'] },
    { specifier: '../src/render/diagrams/canvas2d.js', symbols: ['evaluateMathFunction'] },
    { specifier: '../src/render/diagrams/svgAdapter.js', symbols: ['flattenSvgPathD'] },
    { specifier: '../src/pipeline/vectorize.js', symbols: ['simplifyPolylineRDP', 'zhangSuenThinning'] },
    { specifier: '../src/render/glyph.js', symbols: ['selectAllographVariant', 'computeStrokeVelocityProfile'] },
    { specifier: '../src/core/noise.js', symbols: ['noise'] }
];

const MODULE_REGISTRY = new Map();
for (const entry of PROJECT_MODULES) {
    const { mod, error } = await importProjectModule(entry.specifier);
    const missing = error ? entry.symbols.slice() : entry.symbols.filter((s) => !(s in mod) || mod[s] === undefined);
    MODULE_REGISTRY.set(entry.specifier, { mod, error, missing });
}

for (const entry of PROJECT_MODULES) {
    const { mod, error, missing } = MODULE_REGISTRY.get(entry.specifier);
    const ok = mod !== null && missing.length === 0;
    assert(ok, ok
        ? `Module ${entry.specifier} loads headless and exports [${entry.symbols.join(', ')}]`
        : `Module ${entry.specifier} FAILED headless load — ${error ? `import error: ${error}` : `missing export(s): ${missing.join(', ')}`}`);
}

/**
 * Resolve a symbol from the dynamically loaded module graph. When the module or
 * the export is unavailable a neutral fallback is returned so that every
 * downstream exit criterion still executes and reports an honest FAIL
 * instead of crashing the whole verification run.
 */
function resolveSymbol(specifier, symbol, fallback) {
    const entry = MODULE_REGISTRY.get(specifier);
    if (entry && entry.mod && symbol in entry.mod && entry.mod[symbol] !== undefined) return entry.mod[symbol];
    return fallback;
}

const parseLatexToAST = resolveSymbol('../src/render/math/parser.js', 'parseLatexToAST', () => []);
const measureMathAST = resolveSymbol('../src/render/math/measure.js', 'measureMathAST', () => ({ width: 0, ascent: 0, descent: 0, height: 0, linesAbove: 0, linesBelow: 0 }));
const parseDiagramSpec = resolveSymbol('../src/render/diagrams/index.js', 'parseDiagramSpec', () => ({ diagType: '', params: null }));
const evaluateMathFunction = resolveSymbol('../src/render/diagrams/canvas2d.js', 'evaluateMathFunction', () => NaN);
const flattenSvgPathD = resolveSymbol('../src/render/diagrams/svgAdapter.js', 'flattenSvgPathD', () => []);
const simplifyPolylineRDP = resolveSymbol('../src/pipeline/vectorize.js', 'simplifyPolylineRDP', () => []);
const zhangSuenThinning = resolveSymbol('../src/pipeline/vectorize.js', 'zhangSuenThinning', () => {});
const selectAllographVariant = resolveSymbol('../src/render/glyph.js', 'selectAllographVariant', () => ({ variantId: -1 }));
const computeStrokeVelocityProfile = resolveSymbol('../src/render/glyph.js', 'computeStrokeVelocityProfile', () => ({ velocity: 0 }));
const noise = resolveSymbol('../src/core/noise.js', 'noise', { setSeed() {}, hash: () => 0.5, noise1D: () => 0.5 });

// ---------------------------------------------------------------------------
// TEST 1: 2D Math AST Completeness & Ruled-Line Snapping Invariant
// ---------------------------------------------------------------------------
console.log('1. Testing Universal 2D Math AST & Line-Snapping Invariant...');

const mathTortureTests = [
    '\\frac{a}{b}',
    '\\dfrac{\\sin(x) + \\sqrt[3]{x^2 + 1}}{2\\alpha_0}',
    '\\int_{1/\\sqrt{3}}^{\\sqrt{3}} \\frac{2}{\\pi(1+r^2)} dr',
    '\\oint_C \\vec{F} \\cdot d\\vec{r} = \\iint_S (\\nabla \\times \\vec{F}) \\cdot d\\vec{S}',
    'E\\left[\\frac{1}{X+1}\\right] = \\sum_{k=0}^{n} \\frac{1}{k+1} \\binom{n}{k} p^k (1-p)^{n-k}',
    '\\begin{bmatrix} \\frac{\\partial f_1}{\\partial x} & -\\omega_0^2 \\\\ \\gamma & \\frac{\\partial f_2}{\\partial y} \\end{bmatrix}',
    'f(x) = \\begin{cases} 4x^3 & 0 < x < 1 \\\\ 0 & \\text{otherwise} \\end{cases}',
    '\\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\; PC \\leftarrow PC + 1 \\end{aligned}',
    '\\underbrace{Opcode}_{6\\text{ bits}} + \\overbrace{R_1, R_2, R_3}^{12\\text{ bits}}',
    '\\lim_{n \\to \\infty} \\left( 1 + \\frac{1}{n} \\right)^n = e'
];

for (const latex of mathTortureTests) {
    const ast = parseLatexToAST(latex);
    const m = measureMathAST(ast, 24, 34);
    const valid =
        Array.isArray(ast) &&
        ast.length > 0 &&
        Number.isFinite(m.width) && m.width > 0 &&
        Number.isFinite(m.ascent) && m.ascent > 0 &&
        Number.isFinite(m.descent) && m.descent > 0 &&
        Number.isFinite(m.height) && m.height > 0 &&
        Number.isInteger(m.linesAbove) && m.linesAbove >= 0 &&
        Number.isInteger(m.linesBelow) && m.linesBelow >= 1;

    assert(valid, `Math AST valid & NaN-free: ${latex.slice(0, 52)}... -> (${Math.round(m.width)}x${Math.round(m.height)}px, +${m.linesAbove}/+${m.linesBelow} lines)`);
}

// ---------------------------------------------------------------------------
// TEST 2: Universal Diagram Parser & Safe Function Evaluator
// ---------------------------------------------------------------------------
console.log('\n2. Testing 5 Universal Spatial Diagram Grammars...');

const diagramSpecs = [
    'bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14',
    'kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15',
    'grid | cols=Cycle,1,2,3,4 | rows=I1~IF~ID~EX~MEM;I2~~IF~ID~EX',
    'schematic | type=flipflop | ff=SR | target=T',
    'circuit | expr=(B\' AND D\') OR (B AND D)',
    'dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1',
    'tree | edges=50->30,50->70,30->20,30->40',
    'canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67',
    'canvas2d | circles=0.58:4pts,1.0:3pts,1.73:2pts',
    'svg | <svg viewBox="0 0 200 80"><path d="M 10 10 C 40 20, 60 20, 90 10 L 120 40 Z"/><text x="20" y="50">Node</text></svg>'
];

for (const spec of diagramSpecs) {
    const parsed = parseDiagramSpec(spec);
    assert(parsed && typeof parsed.diagType === 'string' && parsed.params, `Parsed [${parsed.diagType}] spec cleanly`);
}

const valCubic = evaluateMathFunction('4*x^3', 0.5);
assert(Math.abs(valCubic - 0.5) < 1e-6, `Safe math evaluator: 4*(0.5)^3 = ${valCubic}`);

const svgPolys = flattenSvgPathD('M 10 10 C 40 20 60 20 90 10 L 120 40 Z');
assert(svgPolys.length === 1 && svgPolys[0].length > 5, `SVG <path> cubic Bézier flattener produced ${svgPolys[0]?.length} vertices`);

// ---------------------------------------------------------------------------
// TEST 3: Pipeline A Zhang-Suen 1px Skeletonizer & RDP Simplifier
// ---------------------------------------------------------------------------
console.log('\n3. Testing Pipeline A 1px Zhang-Suen Skeletonizer & RDP...');

const dummyGrid = new Uint8Array(20 * 20);
for (let y = 6; y <= 10; y++) {
    for (let x = 3; x <= 16; x++) {
        dummyGrid[y * 20 + x] = 1; // 5px thick bar
    }
}
zhangSuenThinning(dummyGrid, 20, 20, 15);
let remainingPixels = 0;
for (let i = 0; i < dummyGrid.length; i++) remainingPixels += dummyGrid[i];
assert(remainingPixels > 0 && remainingPixels <= 16, `Zhang-Suen thinned 70px thick bar down to ${remainingPixels}px 1px centerline`);

const rdpOut = simplifyPolylineRDP([[0, 0], [1, 0.1], [2, -0.1], [3, 0.05], [10, 0]], 0.5);
assert(rdpOut.length === 2, `RDP simplified near-collinear 5-point chain to ${rdpOut.length} endpoints`);

// ---------------------------------------------------------------------------
// TEST 4: Wave 4 Multi-Allograph Anti-Clone & Kinematic Velocity Physics
// ---------------------------------------------------------------------------
console.log('\n4. Testing Wave 4 Multi-Allograph Anti-Clone & Velocity Physics...');

noise.setSeed(4219);
const doubleWords = ['speed', 'book', 'roll', 'letter', '1001', 'success'];
let duplicateAdjacentFound = false;

let cIdx = 1;
for (const w of doubleWords) {
    let prevCh = '';
    let prevVar = -1;
    for (const ch of w) {
        const res = selectAllographVariant(ch, cIdx++, 'Caveat', 4219, noise);
        if (ch === prevCh && res.variantId === prevVar) {
            duplicateAdjacentFound = true;
        }
        prevCh = ch;
        prevVar = res.variantId;
    }
}
assert(!duplicateAdjacentFound, 'Zero adjacent identical characters share the same structural Allograph ID (A0..A3)');

const velStart = computeStrokeVelocityProfile('S', 1, 0.0, { pressureVar: 0.6 }, { viscosity: 0.8 }, noise);
const velMid = computeStrokeVelocityProfile('i', 2, 0.5, { pressureVar: 0.6 }, { viscosity: 0.8 }, noise);
assert(velMid.velocity > velStart.velocity, `Kinematic pen speed increases from uppercase word start (v=${velStart.velocity.toFixed(2)}) to mid-word 'i' (v=${velMid.velocity.toFixed(2)})`);

// ---------------------------------------------------------------------------
// TEST 5: Workspace Security & Secret Leak Check
// ---------------------------------------------------------------------------
console.log('\n5. Running Security & Secret Leak Check...');

function scanDirForSecrets(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let leaks = 0;
    for (const ent of entries) {
        if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === '.graphify') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            leaks += scanDirForSecrets(full);
        } else if (/\.(js|mjs|html|json|md|css)$/i.test(ent.name)) {
            const content = fs.readFileSync(full, 'utf8');
            if (/AIzaSy[A-Za-z0-9_-]{30,}/.test(content) || /sk-[A-Za-z0-9]{30,}/.test(content)) {
                console.error(`  [SECURITY ALERT] Potential API key pattern found in ${full}`);
                leaks++;
            }
        }
    }
    return leaks;
}

const secretLeaks = scanDirForSecrets(ROOT);
assert(secretLeaks === 0, 'Zero hardcoded API keys or secret tokens found in workspace files');

console.log('\n====================================================================');
console.log(` SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('====================================================================');
if (failed > 0) process.exit(1);
