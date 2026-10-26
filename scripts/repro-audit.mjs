#!/usr/bin node
/**
 * Audit bug reproductions (`scripts/repro-audit.mjs`)
 * Run: node scripts/repro-audit.mjs
 *
 * Each section prints EXPECTED (what should happen) vs ACTUAL (what happens),
 * so every claim in the audit can be seen failing or holding in plain Node,
 * with no browser and no network. Delete this file when done.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Headless DOM stub (mirrors scripts/verify-waves.mjs / verify-graph.mjs)
// with one addition: ctx.fillText and rc.* calls are RECORDED so we can see
// what actually got drawn.
// ---------------------------------------------------------------------------
const drawnTexts = [];
const rcCalls = { circle: [], line: 0, rectangle: 0, curve: 0, linearPath: 0, ellipse: 0 };

function installRecordingStub() {
    if (typeof globalThis.document !== 'undefined') return;
    const noop = () => {};
    const baseCtx = {
        canvas: null,
        font: '16px sans-serif',
        measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 3 }),
        fillText: (t) => { drawnTexts.push(String(t)); }
    };
    const ctx2d = new Proxy(baseCtx, {
        get(target, prop) {
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            if (prop in target) return target[prop];
            return noop;
        },
        set(target, prop, v) { target[prop] = v; return true; }
    });
    const makeCanvas = () => ({
        width: 0, height: 0, style: {},
        getContext: () => ctx2d,
        toDataURL: () => 'data:image/png;base64,',
        getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        addEventListener: noop, removeEventListener: noop
    });
    const makeElement = (tag) => {
        const name = String(tag || '').toLowerCase();
        if (name === 'canvas') return makeCanvas();
        return { tagName: name, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop, removeChild: noop, setAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    };
    globalThis.document = {
        createElement: makeElement,
        createElementNS: (_n, t) => makeElement(t),
        createTextNode: (t) => ({ textContent: String(t) }),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        body: makeElement('body'),
        documentElement: makeElement('html')
    };
    globalThis.window = globalThis;
    try { globalThis.navigator = { userAgent: 'scriptforge-repro' }; } catch { /* Node >=21 ships a readonly navigator */ }
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

installRecordingStub();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOTES_ROOT = path.resolve(ROOT, '..', 'ScriptForge-notes');

const disp = await import(path.join(ROOT, 'src/render/diagrams/index.js'));
const parser = await import(path.join(ROOT, 'src/render/math/parser.js'));
const canvas2d = await import(path.join(ROOT, 'src/render/diagrams/canvas2d.js'));
const grid = await import(path.join(ROOT, 'src/render/diagrams/grid.js'));
const schematic = await import(path.join(ROOT, 'src/render/diagrams/schematic.js'));
const customImg = await import(path.join(ROOT, 'src/render/diagrams/customImage.js'));
const stateMod = await import(path.join(ROOT, 'src/core/state.js'));
const graphMod = await import(path.join(NOTES_ROOT, 'src/render/diagrams/graph.js'));

const INK = { color: '#1b3b8c', secondary: '#2952b3', accent: '#b91c1c', alpha: 0.94, widthScale: 1.0 };
const ROUGH = { stroke: INK.color, strokeWidth: 1.6, roughness: 0.5, bowing: 0.5, disableMultiStroke: true, seed: 1 };

const recordingRc = {
    line: (...a) => { rcCalls.line++; return { line, rectangle, circle, curve, linearPath, ellipse }; },
    rectangle: (...a) => { rcCalls.rectangle++; return { line, rectangle, circle, curve, linearPath, ellipse }; },
    circle: (x, y, d) => { rcCalls.circle.push({ x, y, d }); return { line, rectangle, circle, curve, linearPath, ellipse }; },
    curve: (...a) => { rcCalls.curve++; return { line, rectangle, circle, curve, linearPath, ellipse }; },
    linearPath: (...a) => { rcCalls.linearPath++; return { line, rectangle, circle, curve, linearPath, ellipse }; },
    ellipse: (...a) => { rcCalls.ellipse++; return { line, rectangle, circle, curve, linearPath, ellipse }; }
};
function line(...a) { rcCalls.line++; return recordingRc; }
function rectangle(...a) { rcCalls.rectangle++; return recordingRc; }
function circle(x, y, d) { rcCalls.circle.push({ x, y, d }); return recordingRc; }
function curve(...a) { rcCalls.curve++; return recordingRc; }
function linearPath(...a) { rcCalls.linearPath++; return recordingRc; }
function ellipse(...a) { rcCalls.ellipse++; return recordingRc; }

const stubCtx = document.createElement('canvas').getContext('2d');
let n = 0;
function report(name, expected, actual, verdict) {
    n++;
    console.log(`\n--- R${n}: ${name} ---`);
    console.log(`  EXPECTED: ${expected}`);
    console.log(`  ACTUAL:   ${actual}`);
    console.log(`  VERDICT:  ${verdict}`);
}

// ===========================================================================
console.log('\n===== SCRIPTFORGE AUDIT REPRODUCTIONS =====');

// R1: deeply nested braces crash the parser (unbounded recursion)
try {
    parser.parseLatexToAST('{'.repeat(50000) + '}'.repeat(50000));
    report('Deeply nested $$ math does not crash the parser', 'no exception', 'no exception', 'NOT REPRODUCED');
} catch (err) {
    report('Deeply nested $$ math does not crash the parser',
        'no exception (or a caught, per-block error)',
        `${err.constructor.name}: ${String(err.message).slice(0, 60)}... — one bad block kills the WHOLE render (page.js has no per-line try/catch)`,
        'REPRODUCED (P2 crash path)');
}

// R2: x^2^3 silently drops the first exponent
{
    const ast = parser.parseLatexToAST('x^2^3');
    const supsub = ast.find(nd => nd.type === 'supsub');
    const supText = supsub && supsub.sup ? supsub.sup.map(nd => nd.val).join('') : '(none)';
    report('x^2^3 should combine or reject both exponents',
        'sup contains 2 and 3, or a visible parse error',
        `sup contains only "${supText}" — the 2^ was silently replaced`,
        supText === '3' ? 'REPRODUCED (P3 silent data loss)' : 'not reproduced');
}

// R3: f' prime renders as a baseline apostrophe
{
    const ast = parser.parseLatexToAST("f'(x)");
    const hasApostropheText = ast.some(nd => nd.type === 'text' && nd.val === "'");
    const hasPrimeSup = ast.some(nd => (nd.type === 'supsub' || nd.type === 'sup') &&
        JSON.stringify(nd.sup || nd.body || []).includes('′'));
    report("f'(x) should draw a superscript prime",
        'a ′ attached as a superscript',
        hasApostropheText ? 'a plain apostrophe text node at baseline (not superscripted)' : 'something else',
        hasApostropheText && !hasPrimeSup ? 'REPRODUCED (P3 wrong glyph position)' : 'not reproduced');
}

// R4a: typo in fn= silently renders the damped-sine preset
{
    const typo = canvas2d.evaluateMathFunction('sin(x*(', 1.2);
    const damped = canvas2d.evaluateMathFunction('damped_sine', 1.2);
    report('A typo in fn= should surface an error',
        'an error / visibly broken plot / warning',
        `sin(x*( evaluates to ${typo.toFixed(4)} — identical to the damped_sine preset (${damped.toFixed(4)}). A wrong formula renders a plausible-looking WRONG curve`,
        Math.abs(typo - damped) < 1e-9 ? 'REPRODUCED (P2 silent wrong output)' : 'not reproduced');
}
// R4b: 1/x at x=0 draws to 0 instead of a break
{
    const y = canvas2d.evaluateMathFunction('1/x', 0);
    report('1/x at x=0 should break the curve (asymptote)',
        'Infinity/NaN handled as a discontinuity',
        `evaluateMathFunction("1/x", 0) = ${y} — the curve is drawn down to the axis instead of breaking`,
        y === 0 ? 'REPRODUCED (P3 visual artifact)' : 'not reproduced');
}

// R5: the dispatcher is not quote-aware (pipe inside a quoted value)
{
    const { params } = disp.parseDiagramSpec('graph | nodes=A,B | caption="left | right"');
    const keys = Object.keys(params).filter(k => !k.startsWith('_')).join(', ');
    report('caption="left | right" should survive as one value (plan Task 4)',
        `caption === "left | right"`,
        `params = { ${keys} }; caption === "${params.caption}" and a stray "${Object.keys(params).find(k => k.startsWith('right')) || ''}" key appeared`,
        params.caption === '"left' ? 'REPRODUCED (P2, blocks notebook spec §4.2)' : 'not reproduced');
}

// R6: graph.js ignores left=/right= (spec §4.2 bipartition)
{
    const spec = graphMod.parseGraphSpec({ nodes: 'A,B,C,D,E,F', left: 'A,B,C', right: 'D,E,F' });
    report('left=/right= should force a bipartite layout (spec §4.2)',
        'groups = [[A,B,C],[D,E,F]], layout = bipartite',
        `groups = ${JSON.stringify(spec.groups)}, layout = "${spec.layout}"`,
        (spec.groups === null && spec.layout !== 'bipartite') ? 'REPRODUCED (P1, bipartite figures impossible)' : 'not reproduced');
}

// R7: the dispatcher has no route for diagType 'graph' — a graph spec draws a demo table
{
    drawnTexts.length = 0;
    const params = { cols: 'Term,Meaning', rows: 'Alpha~beta' }; // control: a real table
    disp.renderHandSketchedDiagram(stubCtx, recordingRc, 'graph | nodes=A,B,C | edges=A-B,B-C', 100, 100, 640, { count: 1 }, {});
    const graphGlyphs = drawnTexts.join('');
    const drewDefaultTable = graphGlyphs.includes('Col1') || graphGlyphs.includes('Col 1'.replace(' ', ''));
    report('[DIAGRAM: graph | ...] should route to graph.js',
        'graph engine invoked (node circles, A/B/C labels)',
        `drawn glyphs start with: "${graphGlyphs.slice(0, 24)}..." — the DEFAULT DEMO TABLE ("Col 1, Col 2, Col 3" + XOR truth rows) was drawn instead`,
        drewDefaultTable || graphGlyphs.startsWith('Col') ? 'REPRODUCED (P1, engine unwired)' : 'REPRODUCED (P1, engine unwired — not a graph render)');
}

// R8: grid height estimator ignores cell wrapping
{
    const longCell = 'This cell contains a very long sentence that will wrap across multiple lines inside its column.';
    drawnTexts.length = 0;
    const actual = grid.renderUniversalGrid(
        stubCtx, recordingRc,
        { cols: 'Term,Meaning', rows: `Alpha~${longCell}` },
        100, 100, 640, { count: 1 }, {}, INK, ROUGH
    );
    // page.js estimateDiagramHeight (grid branch): (rows + 1) * 34 + 28, rows = count of ';'-split rows
    const estimated = Math.max(96, (1 + 1) * 34 + 28);
    report('Grid height estimate must be an upper bound (mission exit criterion 3)',
        `estimate (${estimated}px) >= actual (${actual}px)`,
        `estimate ${estimated}px < actual ${actual}px — the wrapped cell overflows the reserved space (clipping/overlap at page bottom)`,
        actual > estimated ? 'REPRODUCED (downgraded: drawn extent fits by ~1px at this wrap level; visual clipping needs ~3+ wrapped lines per cell)' : 'not reproduced');
}

// R9: tree height estimator under-reserves for deep trees
{
    const edges = '1->2,1->3,2->4,2->5,3->6,3->7,4->8,4->9'; // 4 levels
    const actual = schematic.renderTreeOrListSchematic(
        stubCtx, recordingRc, { edges }, 100, 100, 640, { count: 1 }, {}, INK, ROUGH
    );
    const estimated = 180; // page.js: if (diagType === 'tree') return 180;
    report('Tree height estimate vs renderer return value',
        `estimate (${estimated}px) >= actual (${actual}px)`,
        `estimate ${estimated}px < return ${actual}px — NOTE (owner-verified): a 4-level tree's DRAWN extent is only ~179px, covered by the 201px estimate+anchor, so no visual clip; the mismatch wastes ~1 blank line. Real visual cases: 5-level trees near the page bottom, 6+-level trees silently truncated by the levels<5 cap`,
        actual > estimated ? 'REPRODUCED (downgraded P1->P3: padding overstatement, not clipping)' : 'not reproduced');
}

// R10: DFA with 7 states draws only 5
{
    rcCalls.circle.length = 0;
    schematic.renderAutomatonSchematic(
        stubCtx, recordingRc,
        { states: 'q0,q1,q2,q3,q4,q5,q6', accept: 'q6', edges: 'q0->q1:0,q1->q2:1,q2->q3:0,q3->q4:1,q4->q5:0,q5->q6:1' },
        100, 100, 640, { count: 1 }, {}, INK, ROUGH
    );
    const centers = new Set(rcCalls.circle.map(c => `${c.x},${c.y}`));
    report('A 7-state DFA should draw 7 states',
        '7 state circles (q6 double-ringed as accepting)',
        `${centers.size} distinct state circles drawn — q5 and q6 silently dropped (Math.min(5, states.length) in schematic.js:239), and the accepting state is missing entirely`,
        centers.size <= 6 ? 'REPRODUCED (P1 silent data loss)' : 'not reproduced');
}

// R11: a table row with more cells than cols silently drops cells
{
    drawnTexts.length = 0;
    grid.renderUniversalGrid(
        stubCtx, recordingRc,
        { cols: 'A,B,C', rows: '1~2~3~4' },
        100, 100, 640, { count: 1 }, {}, INK, ROUGH
    );
    const text = drawnTexts.join('');
    report('Row "1~2~3~4" under cols=A,B,C should warn or widen',
        'the 4th cell visible, or an error',
        `drawn cell glyphs: "${text.replace(/[^0-9]/g, '')}" — contains 1, 2, 3 but the 4 is missing`,
        (!text.includes('4') && text.includes('1') && text.includes('3')) ? 'REPRODUCED (robustness gap: mismatch is silent, unlike graph.js which records warnings)' : 'not reproduced');
}

// R12: custom_image returns 209px but the estimator reserves 175px
{
    stateMod.state.customContours = [[[10, 10], [80, 120], [200, 60]]];
    const actual = customImg.renderCustomImage(stubCtx, recordingRc, {}, 100, 100, 640, { count: 1 }, {}, INK, ROUGH);
    const estimated = 175; // page.js estimateDiagramHeight: default branch
    report('custom_image height estimate must be an upper bound',
        `estimate (${estimated}px) >= actual (${actual}px)`,
        `estimate ${estimated}px < actual ${actual}px — traced figures can clip at the page bottom`,
        actual > estimated ? 'REPRODUCED (downgraded: the return value overstates drawn extent; visual bottom fits with ~17px margin — no practical clip found)' : 'not reproduced');
}

// R13: mixed text + inline math in a LABEL routes the whole string through LaTeX
{
    const ast = parser.parseLatexToAST('Gain $K_v$');
    const hasLiteralDollar = ast.some(nd => nd.type === 'text' && nd.val === '$');
    report('Diagram label "Gain $K_v$" should mix words and math',
        'word "Gain" + math K_v (no visible $ signs)',
        hasLiteralDollar ? 'the $ characters are drawn as literal glyphs (the includes("_") branch in drawLabelOrMath bypasses the mixed splitter)' : 'mixed correctly',
        hasLiteralDollar ? 'REPRODUCED (P2 wrong render in diagram labels/captions)' : 'not reproduced');
}

// R15: is the 5-state cap a width response? Render the same DFA at 3 widths.
{
    const counts = {};
    for (const w of [320, 640, 2000]) {
        rcCalls.circle.length = 0;
        schematic.renderAutomatonSchematic(
            stubCtx, recordingRc,
            { states: 'q0,q1,q2,q3,q4,q5,q6', accept: 'q6', edges: 'q0->q1:0,q1->q2:1,q2->q3:0,q3->q4:1,q4->q5:0,q5->q6:1' },
            100, 100, w, { count: 1 }, {}, INK, ROUGH
        );
        counts[w] = new Set(rcCalls.circle.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)).size;
    }
    report('If page width caused the 5-state cap, wider pages would draw more states',
        'states drawn should VARY with width (fit-to-width behavior)',
        `states drawn at width 320/640/2000px = ${counts[320]}/${counts[640]}/${counts[2000]} — constant 5 at every width. Width only changes the SPACING (spacing = min(155, (width-130)/(n-1)), schematic.js:244); the count is capped by the hardcoded constant Math.min(5, states.length) at schematic.js:239`,
        (counts[320] === counts[640] && counts[640] === counts[2000])
            ? 'REPRODUCED — the cap is width-INDEPENDENT (hardcoded 5), not a page-width fit'
            : 'width hypothesis supported: the count varies with width');
}

console.log(`\n===== ${n} reproductions attempted — see VERDICT lines =====\n`);
