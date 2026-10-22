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

const computeGraphLayout = mod && mod.computeGraphLayout ? mod.computeGraphLayout : () => null;
const WIDTH = 680;

if (mod && mod.computeGraphLayout) {
    const l1 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D' }), { availWidth: WIDTH });
    assert(l1 && Object.keys(l1.positions).length === 4, 'layered layout positions every node');
    assert(l1 && l1.width <= WIDTH, `layered layout fits the available width (${l1 && l1.width} <= ${WIDTH})`);
    assert(l1 && l1.height > 0, 'layered layout reports a positive height');

    const l2 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C' }), { availWidth: WIDTH });
    const layerY = new Set(Object.values(l2.positions).map(p => p.y));
    assert(layerY.size === 3, `layered layout puts each node of a path on its own layer (${layerY.size} distinct y)`);

    const l3 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B,C', levels: 'A:0,B:1,C:2' }), { availWidth: WIDTH });
    assert(l3 && l3.positions.A.y > l3.positions.B.y && l3.positions.B.y > l3.positions.C.y,
      'hasse layout places level 0 at the bottom and higher levels above it');

    const l4 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B|C,D' }), { availWidth: WIDTH });
    assert(l4 && l4.positions.A.x !== l4.positions.C.x, 'bipartite layout separates the two groups horizontally');
    assert(l4 && Math.abs(l4.positions.A.x - l4.positions.B.x) < Math.abs(l4.positions.A.x - l4.positions.C.x),
      'bipartite layout groups same-side nodes closer together than opposite-side nodes');

    const l5 = computeGraphLayout(parseGraphSpec({ nodes: 'R,A,B', edges: 'R-A,R-B' }), { availWidth: WIDTH });
    assert(l5 && l5.positions.R.y < l5.positions.A.y && l5.positions.R.y < l5.positions.B.y,
      'tree layout puts the root above its children');

    const l6 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A' }), { availWidth: WIDTH });
    const cx = Object.values(l6.positions).reduce((s,p) => s + p.x, 0) / 4;
    const cy = Object.values(l6.positions).reduce((s,p) => s + p.y, 0) / 4;
    const radii = Object.values(l6.positions).map(p => Math.hypot(p.x - cx, p.y - cy));
    assert(Math.max(...radii) - Math.min(...radii) < 1, 'circular layout places every node at the same radius');

    const sep = (lay) => {
      const pts = Object.values(lay.positions);
      let min = Infinity;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      }
      return min;
    };
    const l7 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B,C,D,E,F', edges: 'A-B,B-C,C-D,D-E,E-F,A-F' }), { availWidth: WIDTH });
    assert(sep(l7) >= 30, `no two nodes overlap (min separation ${sep(l7).toFixed(1)} >= 30)`);

    const l8 = computeGraphLayout(parseGraphSpec({ nodes: '' }), { availWidth: WIDTH });
    assert(l8 && Object.keys(l8.positions).length === 0, 'an empty node list yields an empty layout');

    const l9 = computeGraphLayout(parseGraphSpec({ nodes: 'A' }), { availWidth: WIDTH });
    const p9 = l9 && l9.positions.A;
    assert(p9 && Number.isFinite(p9.x) && Number.isFinite(p9.y), 'a single vertex gets one finite position (no NaN, no divide-by-zero)');

    const l10 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B', highlight: 'A-Z', highlightNodes: 'Q', levels: 'X:0' }), { availWidth: WIDTH });
    assert(l10 && Object.keys(l10.positions).length === 2, 'unknown highlight/levels names are ignored rather than crashing the layout');

    // REVIEW FOCUS 10: unknown levels= entries are ignored, not treated as positions
    const l11 = computeGraphLayout(parseGraphSpec({ nodes: 'A,B', layout: 'hasse', levels: 'Z:9' }), { availWidth: WIDTH });
    assert(l11 && Object.keys(l11.positions).length === 2, 'a levels= entry for an undeclared node is ignored');
    assert(l11 && l11.positions.A.y === l11.positions.B.y, 'vertices with no declared level share one row');

    // REVIEW FOCUS 7: a lone vertex is placed, not divided by zero
    const l12 = computeGraphLayout(parseGraphSpec({ nodes: 'A', layout: 'circular' }), { availWidth: WIDTH });
    assert(l12 && Number.isFinite(l12.positions.A.x) && Number.isFinite(l12.positions.A.y),
      'a lone vertex in a circular layout is finite');
} else {
    assert(false, 'computeGraphLayout is exported from graph.js');
}

console.log('\n====================================================================');
console.log(` SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('====================================================================');
if (failed > 0) process.exit(1);
