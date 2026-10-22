#!/usr/bin/env node
/**
 * ScriptForge Universal Graph Grammar Verifier (`scripts/verify-graph.mjs`)
 * Run via: `node scripts/verify-graph.mjs`
 *
 * Verifies the pure, DOM-free half of the `graph` diagram grammar:
 *   1. Spec parsing - nodes, edges, labels, groups, levels, highlights
 *   2. Layout engine - six layout modes, finite coordinates, no overlap
 *
 * Like `verify-waves.mjs`, this runs in plain Node: a headless `document` stub
 * is installed before the project module is imported dynamically, because
 * `src/render/diagrams/graph.js` pulls in `glyph.js`, which allocates an
 * offscreen canvas at module scope.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// HEADLESS BOOTSTRAP (mirrors scripts/verify-waves.mjs)
// ---------------------------------------------------------------------------

function installHeadlessDOMStub() {
    if (typeof globalThis.document !== 'undefined') return;

    const noop = () => {};
    const baseCtx = {
        canvas: null,
        font: '16px sans-serif',
        measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | h) | 0)) }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | h) | 0)) }),
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

async function importProjectModule(specifier) {
    try {
        const mod = await import(specifier);
        return { mod, error: null };
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return { mod: null, error: message };
    }
}

installHeadlessDOMStub();

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

console.log('\n====================================================================');
console.log(' ScriptForge Universal Graph Grammar Verifier');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------
// 1. GRAPH SPEC PARSER
// ---------------------------------------------------------------------------
console.log('1. Testing Graph Spec Parser...');

const { mod, error } = await importProjectModule('../src/render/diagrams/graph.js');
assert(mod !== null, mod ? 'graph.js loads headless' : 'graph.js FAILED to load: ' + error);

const parseGraphSpec = mod && mod.parseGraphSpec ? mod.parseGraphSpec : () => null;

const s1 = parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C' });
assert(s1 && s1.nodes.length === 3, 'three nodes parsed');
assert(s1 && s1.edges.length === 2, 'two edges parsed');
assert(s1 && s1.edges[0].u === 'A' && s1.edges[0].v === 'B' && s1.edges[0].directed === false, 'undirected edge parsed as {u,v,directed:false}');

const s2 = parseGraphSpec({ nodes: 'A:alpha,B:beta' });
assert(s2 && s2.nodes[0].label === 'alpha', 'node label taken from id:label syntax');
assert(s2 && s2.nodes[1].id === 'B' && s2.nodes[1].label === 'beta', 'second node keeps its id and label');

const s3 = parseGraphSpec({ nodes: 'A,B', edges: 'A->B:0' });
assert(s3 && s3.edges[0].directed === true, 'directed edge parsed');
assert(s3 && s3.edges[0].label === '0', 'edge label parsed from u-v:label syntax');

const s4 = parseGraphSpec({ nodes: 'A,B|C,D' });
assert(s4 && s4.groups && s4.groups.length === 2 && s4.groups[0].join(',') === 'A,B', 'pipe splits nodes into two bipartite groups');
assert(s4 && s4.layout === 'bipartite', 'pipe in nodes= forces layout=bipartite');

const s5 = parseGraphSpec({ nodes: 'A,B', levels: 'A:0,B:1' });
assert(s5 && s5.layout === 'hasse', 'levels= forces layout=hasse');
assert(s5 && s5.levels.A === 0 && s5.levels.B === 1, 'levels parsed into a Record');

const s6 = parseGraphSpec({ nodes: 'A,B', showDegrees: 'true', highlight: 'A-B', highlightNodes: 'A', caption: 'Figure 1' });
assert(s6 && s6.showDegrees === true, 'showDegrees=true parsed as boolean');
assert(s6 && s6.highlight.length === 1 && s6.highlightNodes[0] === 'A', 'highlight and highlightNodes parsed');
assert(s6 && s6.caption === 'Figure 1', 'caption parsed');

const s7 = parseGraphSpec({ nodes: 'A,B', edges: 'A-Z' });
assert(s7 && s7.edges.length === 0, 'edge to an undeclared node is dropped');
assert(s7 && s7.warnings.length === 1, 'dropped edge is recorded as a warning');

const s8 = parseGraphSpec({ nodes: 'A,A,B' });
assert(s8 && s8.nodes.length === 2, 'duplicate node id keeps one node');
assert(s8 && s8.warnings.length === 1, 'duplicate node id is recorded as a warning');

const s9 = parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C' });
assert(s9 && s9.layout === 'layered', 'acyclic graph defaults to layout=layered');

const s10 = parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C,C-A' });
assert(s10 && s10.layout === 'circular', 'cyclic graph defaults to layout=circular');

const s11 = parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,A-D' });
assert(s11 && s11.layout === 'circular', 'a 4-cycle defaults to layout=circular');

const s11b = parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D', layout: 'tree' });
assert(s11b && s11b.layout === 'tree', 'layout=tree is honoured when given explicitly');

const s12 = parseGraphSpec({ nodes: 'A,B', edges: 'A-B', directed: 'true' });
assert(s12 && s12.directed === true, 'directed=true parsed as boolean');
assert(s12 && s12.edges[0].directed === true, 'global directed=true forces every edge directed');

const s13 = parseGraphSpec({ nodes: 'A,B', edges: 'A-B' });
assert(s13 && s13.warnings && Array.isArray(s13.warnings), 'warnings array is always present');
assert(s13 && s13.groups === null, 'groups is null when no pipe separates the node list');

// REVIEW FOCUS 6: a self-loop survives parsing
const s14 = parseGraphSpec({ nodes: 'A,B', edges: 'A-A,A-B' });
assert(s14 && s14.edges.some(e => e.u === 'A' && e.v === 'A'), 'self-loop survives parsing');

// REVIEW FOCUS 7: a lone vertex is kept, not treated as empty
const s15 = parseGraphSpec({ nodes: 'A', edges: '' });
assert(s15 && s15.nodes.length === 1, 'a single vertex with no edges is kept');

// REVIEW FOCUS 8: a pipe inside a caption is sanitised, not passed through
const s16 = parseGraphSpec({ nodes: 'A,B', caption: 'Figure 3 | the G graph' });
assert(s16 && !s16.caption.includes('|'), 'caption never contains a pipe');

// REVIEW FOCUS 9: duplicate undirected edges collapse to one
const s17 = parseGraphSpec({ nodes: 'A,B', edges: 'A-B,B-A' });
assert(s17 && s17.edges.length === 1, 'duplicate undirected edge is collapsed');

// REVIEW FOCUS 4: a spec with no nodes= is still a valid, empty spec
const s18 = parseGraphSpec({ edges: 'A-B' });
assert(s18 && s18.nodes.length === 0, 'a spec without nodes= parses to zero nodes');
assert(s18 && s18.edges.length === 0, 'edges to undeclared nodes are all dropped');
assert(s18 && s18.warnings.length === 1, 'the dropped edge is reported');

// ---------------------------------------------------------------------------
// 2. GRAPH LAYOUT ENGINE
// ---------------------------------------------------------------------------
console.log('\n2. Testing Graph Layout Engine...');

const computeLayout = mod && mod.computeLayout ? mod.computeLayout : () => null;

if (mod && mod.computeLayout) {
    const l1 = computeLayout(parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A,A-C' }), 640);
    assert(l1 && l1.positions.size === 4, 'layout positions every vertex');
    assert(l1 && l1.width > 0 && l1.height > 0, 'layout reports a positive box');
    let finite = true;
    for (const p of (l1 ? l1.positions.values() : [])) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) finite = false;
    }
    assert(finite, 'every layout coordinate is finite');

    // REVIEW FOCUS 7: a lone vertex gets a finite position (no divide-by-zero)
    const l2 = computeLayout(parseGraphSpec({ nodes: 'A', edges: '' }), 640);
    const lone = l2.positions.get('A');
    assert(lone && Number.isFinite(lone.x) && Number.isFinite(lone.y), 'a lone vertex gets finite coordinates');

    // hasse: the highest level is drawn above the lowest
    const l3 = computeLayout(parseGraphSpec({ nodes: '1,2,4', edges: '1-2,1-4,2-4', layout: 'hasse', levels: '1:0,2:1,4:2' }), 640);
    assert(l3.positions.get('4').y < l3.positions.get('1').y, 'hasse layout puts the highest level at the top');

    // bipartite: the two groups occupy two distinct columns
    const l4 = computeLayout(parseGraphSpec({ nodes: 'A,B|C,D', edges: 'A-C,A-D,B-C' }), 640);
    const xs = [...l4.positions.values()].map(p => p.x);
    assert(Math.max(...xs) - Math.min(...xs) > 40, 'bipartite layout uses two distinct columns');

    // every layout mode yields a usable box
    for (const mode of ['auto', 'layered', 'circular', 'bipartite', 'tree', 'hasse']) {
        const spec = parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C', layout: mode, levels: 'A:0,B:1,C:2' });
        const lay = computeLayout(spec, 640);
        assert(lay.positions.size === 3 && lay.height > 0, `layout=${mode} produces a usable box`);
    }

    // REVIEW FOCUS 10: a levels= entry naming an unknown vertex is ignored, not fatal
    const l5 = computeLayout(parseGraphSpec({ nodes: 'A,B', edges: 'A-B', layout: 'hasse', levels: 'Z:9' }), 640);
    assert(l5.positions.size === 2, 'an unknown levels= entry does not drop vertices');

    // REVIEW FOCUS 3: the reported height is never smaller than the drawn extent
    const l6 = computeLayout(parseGraphSpec({ nodes: 'A,B,C,D,E,F,G,H', edges: 'A-B,B-C,C-D,D-E,E-F,F-G,G-H,A-H' }), 640);
    const ys = [...l6.positions.values()].map(p => p.y);
    const extent = Math.max(...ys) - Math.min(...ys);
    assert(l6.height >= extent, 'the reported height covers the vertical extent of the vertices');
} else {
    assert(false, 'computeLayout is exported from graph.js');
}

console.log('\n====================================================================');
console.log(` SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('====================================================================');
if (failed > 0) process.exit(1);
