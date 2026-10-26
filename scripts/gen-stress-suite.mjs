#!/usr/bin/env node
/**
 * ScriptForge Ultra Turbo Stress Suite Generator (`scripts/gen-stress-suite.mjs`)
 * Run: node scripts/gen-stress-suite.mjs
 *
 * Deterministically emits a ~2000-line ScriptForge DSL document containing 200+
 * diagrams across 15 chapters (mathematics, electronics, PCS, analog, DSP, control,
 * aerospace, thermodynamics, chemistry, biology/animals, networking, bitcoin,
 * ESP32-S3, system design, astronomy) plus a clearly-marked CANARY chapter that
 * deliberately hits the engine's known limits.
 *
 * Every emitted line is linted against the DSL rules at generation time — the
 * corpus is valid by construction everywhere except the labeled canaries.
 *
 * Outputs:
 *   stress/ultra_turbo_stress.txt   the document
 *   stress/MANIFEST.md              chapter map + counts
 *   src/data/stressDoc.js           the document as an ES module string
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Seeded PRNG (deterministic output on every machine)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(20261024);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// ---------------------------------------------------------------------------
// DSL rules (mirror of what src/ actually supports on main)
// ---------------------------------------------------------------------------
const KNOWN_TYPES = new Set([
    'grid', 'table', 'kmap', 'bitfield', 'array',
    'schematic', 'circuit', 'flipflop', 'dfa', 'nfa', 'fsm', 'tree', 'list',
    'plot', 'canvas2d', 'geometry', 'target', 'vectors',
    'svg', 'custom_image', 'image', 'graph' // 'graph' known-but-unwired: canary only
]);
const FN_IDENTS = new Set([
    'x', 'pi', 'e', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'log10', 'sqrt', 'cbrt',
    'abs', 'sign', 'floor', 'ceil', 'round', 'pow', 'min', 'max', 'hypot'
]);

const stats = {
    lines: 0, headings: 0, displayMath: 0, inlineMath: 0, pages: 1,
    diagrams: {}, byChapter: {}, canaries: []
};
let canaryMode = false;

function fail(msg, line) {
    throw new Error(`STRESS-LINT: ${msg}\n  offending line: ${line.slice(0, 160)}`);
}

function cleanCell(s) {
    // Grid cells may not contain the row/cell separators or a pipe.
    return String(s).replace(/[~;|]/g, ' ').trim();
}

function lintDiagram(line) {
    const m = line.match(/^\[DIAGRAM:\s*(.+)\]$/);
    if (!m) fail('diagram line must be [DIAGRAM: ... ] on one line', line);
    const payload = m[1];

    if (payload.includes('<svg')) {
        // Raw-SVG grammar: exactly one pipe (type + payload), no pipe inside the SVG.
        if (payload.split('|').length !== 2) fail('svg diagram must be "svg | <svg…>" with no extra pipes', line);
        return 'svg';
    }

    const parts = payload.split('|').map(p => p.trim()).filter(Boolean);
    const type = (parts[0] || '').toLowerCase().split(/\s+/)[0];
    if (!KNOWN_TYPES.has(type)) fail(`unknown diagram type "${type}"`, line);

    const params = {};
    for (let i = 1; i < parts.length; i++) {
        const eq = parts[i].indexOf('=');
        if (eq === -1) {
            if (canaryMode) continue; // canaries may carry pipe-broken values on purpose
            fail(`parameter "${parts[i]}" has no key=value (usually a pipe inside a value)`, line);
        }
        const k = parts[i].slice(0, eq).trim().toLowerCase();
        const v = parts[i].slice(eq + 1).trim();
        params[k] = v;
    }

    // fn= must be expressible in the whitelist evaluator
    if (params.fn) {
        const idents = params.fn.match(/[A-Za-z_][A-Za-z_0-9]*/g) || [];
        for (const id of idents) {
            if (!FN_IDENTS.has(id.toLowerCase())) fail(`fn= uses non-whitelisted identifier "${id}"`, line);
        }
    }

    // Engine caps that are NOT bugs-to-trip in the valid corpus
    if (params.states && !canaryMode) {
        const n = params.states.split(',').filter(Boolean).length;
        if (n > 5) fail(`dfa has ${n} states (engine caps at 5) — canary only`, line);
    }
    if (params.rows) {
        for (const row of params.rows.split(';')) {
            if (row.split('~').length > 12 && !canaryMode) fail('grid row wider than 12 cells — canary only', line);
        }
    }
    if (params.cells && !canaryMode && params.cells.split(',').length > 24) {
        fail('array strip longer than 24 cells — canary only', line);
    }
    if ((params.label || params.caption || '').includes('|') && !canaryMode) {
        fail('label/caption contains a pipe — canary only', line);
    }
    return type;
}

function lintLine(line) {
    if (line.trim() === '') return;

    if (/^#{1,6}\s/.test(line)) { stats.headings++; return; }

    if (line.trim() === '---PAGE---') { stats.pages++; return; }

    if (/^\$\$(.+)\$\$$/.test(line.trim())) {
        stats.displayMath++;
        if (/\$\$/.test(line.trim().slice(2, -2))) fail('nested $$ inside display math', line);
        return;
    }

    if (line.trim().startsWith('[DIAGRAM:')) {
        const type = lintDiagram(line.trim());
        stats.diagrams[type] = (stats.diagrams[type] || 0) + 1;
        stats.byChapter[currentChapter] = (stats.byChapter[currentChapter] || 0) + 1;
        if (canaryMode) stats.canaries.push(type);
        return;
    }

    // Prose: balanced inline $...$ pairs, no stray display math inside prose
    const dollars = (line.match(/\$/g) || []).length;
    if (dollars % 2 !== 0) fail('odd number of $ in a prose line (unbalanced inline math)', line);
    if (dollars > 0) stats.inlineMath += dollars / 2;
    if (line.includes('$$')) fail('$$ display math must sit alone on its line', line);
    if (/^- /.test(line)) fail('bullet syntax is not supported on main', line);
}

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------
let currentChapter = 'front';
const doc = [];
function emit(line) {
    lintLine(line);
    doc.push(line);
    stats.lines++;
}
function chapter(title) {
    currentChapter = title.replace(/^Chapter \d+[—-]\s*/, '').slice(0, 40);
    stats.byChapter[currentChapter] = 0;
    emit(`# ${title}`);
    emit('');
}
function pageBreak() { emit('---PAGE---'); emit(''); }

// Diagram emitters (thin, validated wrappers) -------------------------------
const D = {
    kmap: (vars, ones, extra = '') =>
        emit(`[DIAGRAM: kmap | vars=${vars} | ones=${ones}${extra ? ' | ' + extra : ''}]`),
    bitfield: (bits, fields) =>
        emit(`[DIAGRAM: bitfield | bits=${bits} | fields=${fields}]`),
    table: (cols, rows, height) =>
        emit(`[DIAGRAM: grid | cols=${cols} | rows=${rows.map(r => r.map(cleanCell).join('~')).join(';')}${height ? ' | height=' + height : ''}]`),
    timing: (cols, rows) =>
        emit(`[DIAGRAM: grid | cols=${cols} | rows=${rows.join(';')}]`),
    dfa: (states, accept, edges) =>
        emit(`[DIAGRAM: dfa | states=${states} | accept=${accept} | edges=${edges}]`),
    tree: (edges) =>
        emit(`[DIAGRAM: tree | edges=${edges}]`),
    list: (items) =>
        emit(`[DIAGRAM: list | nodes=${items}]`),
    flipflop: (ff, target) =>
        emit(`[DIAGRAM: schematic | type=flipflop | ff=${ff} | target=${target}]`),
    circuit: (expr) =>
        emit(`[DIAGRAM: circuit | expr=${expr}]`),
    plot: (fn, domain, shade, label) =>
        emit(`[DIAGRAM: canvas2d | fn=${fn} | domain=${domain}${shade ? ' | shade=' + shade : ''}${label ? ' | label=' + label : ''}]`),
    circles: (spec, label) =>
        emit(`[DIAGRAM: canvas2d | circles=${spec}${label ? ' | label=' + label : ''}]`),
    triangle: (angle, labels) =>
        emit(`[DIAGRAM: canvas2d | triangle=0,0,1,0,1,0.72 | angle=${angle} | labels=${labels}]`),
    vectors: (spec, label) =>
        emit(`[DIAGRAM: canvas2d | vectors=${spec}${label ? ' | label=' + label : ''}]`),
    svg: (inner) =>
        emit(`[DIAGRAM: svg | <svg viewBox="${inner.vb}">${inner.body}</svg>]`),
    arrayStrip: (cells, pointers) =>
        emit(`[DIAGRAM: grid | cells=${cells}${pointers ? ' | pointers=' + pointers : ''}]`)
};

// Compact single-line SVG figure library (no pipes anywhere) ----------------
const SVG = {
    cell: () => D.svg({
        vb: '0 0 420 190',
        body: `<ellipse cx="210" cy="95" rx="190" ry="80" stroke="#1b3b8c" fill="none"/><circle cx="210" cy="95" r="42" stroke="#b91c1c" fill="none"/><circle cx="140" cy="70" r="20" stroke="#1b3b8c" fill="none"/><circle cx="290" cy="120" r="16" stroke="#1b3b8c" fill="none"/><circle cx="275" cy="55" r="10" stroke="#1b3b8c" fill="none"/><text x="200" y="100" font-size="15">nucleus</text><text x="112" y="48" font-size="13">mitochondrion</text><text x="262" y="152" font-size="13">vesicle</text><text x="252" y="42" font-size="13">ribosome</text><text x="60" y="180" font-size="14">animal cell</text>`
    }),
    benzene: () => D.svg({
        vb: '0 0 300 170',
        body: `<polygon points="150,20 235,68 235,130 150,178 65,130 65,68" stroke="#1b3b8c" fill="none"/><circle cx="150" cy="99" r="44" stroke="#b91c1c" fill="none"/><text x="138" y="105" font-size="14">pi ring</text><text x="20" y="30" font-size="13">C6H6 benzene</text><text x="140" y="14" font-size="12">H</text><text x="238" y="52" font-size="12">H</text><text x="238" y="150" font-size="12">H</text>`
    }),
    water: () => D.svg({
        vb: '0 0 260 150',
        body: `<circle cx="130" cy="55" r="26" stroke="#1b3b8c" fill="none"/><circle cx="85" cy="105" r="16" stroke="#1b3b8c" fill="none"/><circle cx="175" cy="105" r="16" stroke="#1b3b8c" fill="none"/><line x1="112" y1="72" x2="97" y2="92" stroke="#1b3b8c"/><line x1="148" y1="72" x2="163" y2="92" stroke="#1b3b8c"/><text x="124" y="60" font-size="14">O</text><text x="80" y="110" font-size="13">H</text><text x="170" y="110" font-size="13">H</text><text x="40" y="140" font-size="13">104.5 deg bond angle</text>`
    }),
    microservices: () => D.svg({
        vb: '0 0 520 170',
        body: `<rect x="10" y="60" width="70" height="44" stroke="#1b3b8c" fill="none"/><text x="18" y="86" font-size="12">gateway</text><rect x="130" y="18" width="66" height="38" stroke="#1b3b8c" fill="none"/><text x="136" y="40" font-size="11">auth-svc</text><rect x="130" y="120" width="66" height="38" stroke="#1b3b8c" fill="none"/><text x="134" y="142" font-size="11">orders-svc</text><rect x="250" y="66" width="180" height="40" stroke="#b91c1c" fill="none"/><text x="288" y="90" font-size="12">Kafka event bus</text><rect x="460" y="30" width="52" height="36" stroke="#1b3b8c" fill="none"/><text x="462" y="52" font-size="11">redis</text><rect x="460" y="108" width="52" height="36" stroke="#1b3b8c" fill="none"/><text x="464" y="130" font-size="11">pgSQL</text><line x1="80" y1="80" x2="130" y2="38" stroke="#1b3b8c"/><line x1="80" y1="84" x2="130" y2="138" stroke="#1b3b8c"/><line x1="196" y1="38" x2="250" y2="78" stroke="#1b3b8c"/><line x1="196" y1="138" x2="250" y2="94" stroke="#1b3b8c"/><line x1="430" y1="84" x2="460" y2="50" stroke="#1b3b8c"/><line x1="430" y1="90" x2="460" y2="124" stroke="#1b3b8c"/>`
    }),
    esp32pinout: () => D.svg({
        vb: '0 0 520 170',
        body: `<rect x="200" y="20" width="120" height="130" stroke="#1b3b8c" fill="none"/><text x="216" y="88" font-size="13">ESP32-S3</text><line x1="160" y1="35" x2="200" y2="35" stroke="#1b3b8c"/><text x="118" y="39" font-size="11">GPIO0</text><line x1="160" y1="55" x2="200" y2="55" stroke="#1b3b8c"/><text x="118" y="59" font-size="11">TXD0</text><line x1="160" y1="75" x2="200" y2="75" stroke="#1b3b8c"/><text x="112" y="79" font-size="11">GPIO19</text><line x1="160" y1="95" x2="200" y2="95" stroke="#b91c1c"/><text x="112" y="99" font-size="11">GPIO46</text><line x1="160" y1="115" x2="200" y2="115" stroke="#1b3b8c"/><text x="112" y="119" font-size="11">GPIO45</text><line x1="320" y1="40" x2="360" y2="40" stroke="#1b3b8c"/><text x="364" y="44" font-size="11">GPIO13</text><line x1="320" y1="62" x2="360" y2="62" stroke="#1b3b8c"/><text x="364" y="66" font-size="11">GPIO14</text><line x1="320" y1="84" x2="360" y2="84" stroke="#b91c1c"/><text x="364" y="88" font-size="11">GPIO3 strapping</text><line x1="320" y1="106" x2="360" y2="106" stroke="#1b3b8c"/><text x="364" y="110" font-size="11">GPIO4 ADC1</text><text x="30" y="160" font-size="12">left: strapping and boot pins</text>`
    }),
    orbit: () => D.svg({
        vb: '0 0 420 180',
        body: `<ellipse cx="210" cy="90" rx="170" ry="62" stroke="#1b3b8c" fill="none"/><circle cx="210" cy="90" r="14" stroke="#b91c1c" fill="none"/><circle cx="380" cy="90" r="7" stroke="#1b3b8c" fill="none"/><text x="200" y="95" font-size="13">Earth</text><text x="372" y="78" font-size="12">sat</text><circle cx="40" cy="90" r="4" stroke="#555" fill="none"/><text x="46" y="82" font-size="11">focus 2</text><text x="120" y="30" font-size="13">Kepler orbit a=170 e=0.36</text>`
    }),
    hr: () => D.svg({
        vb: '0 0 380 190',
        body: `<line x1="50" y1="20" x2="50" y2="160" stroke="#1b3b8c"/><line x1="50" y1="160" x2="360" y2="160" stroke="#1b3b8c"/><text x="14" y="95" font-size="12" >Luminosity</text><text x="180" y="178" font-size="12">Temperature</text><circle cx="300" cy="40" r="4" stroke="#b91c1c"/><circle cx="285" cy="55" r="4" stroke="#b91c1c"/><circle cx="315" cy="60" r="4" stroke="#b91c1c"/><text x="270" y="28" font-size="11">main sequence</text><circle cx="90" cy="35" r="9" stroke="#1b3b8c"/><circle cx="110" cy="30" r="11" stroke="#1b3b8c"/><text x="80" y="16" font-size="11">supergiants</text><circle cx="110" cy="140" r="5" stroke="#1b3b8c"/><circle cx="130" cy="145" r="5" stroke="#1b3b8c"/><text x="90" y="132" font-size="11">white dwarfs</text>`
    }),
    heatExchanger: () => D.svg({
        vb: '0 0 420 160',
        body: `<rect x="60" y="40" width="300" height="80" stroke="#1b3b8c" fill="none"/><polyline points="70,55 110,105 150,55 190,105 230,55 270,105 310,55 350,105" stroke="#b91c1c" fill="none"/><line x1="20" y1="55" x2="60" y2="55" stroke="#1b3b8c"/><line x1="360" y1="105" x2="400" y2="105" stroke="#1b3b8c"/><line x1="20" y1="110" x2="60" y2="110" stroke="#1b3b8c"/><line x1="360" y1="52" x2="400" y2="52" stroke="#1b3b8c"/><text x="14" y="48" font-size="12">hot in</text><text x="14" y="128" font-size="12">cold in</text><text x="368" y="44" font-size="11">cold out</text><text x="368" y="122" font-size="11">hot out</text><text x="150" y="140" font-size="12">counterflow shell and tube</text>`
    }),
    utxo: () => D.svg({
        vb: '0 0 460 160',
        body: `<rect x="20" y="30" width="90" height="36" stroke="#1b3b8c" fill="none"/><text x="28" y="52" font-size="11">coinbase 50</text><rect x="20" y="100" width="90" height="36" stroke="#1b3b8c" fill="none"/><text x="28" y="122" font-size="11">fee change</text><rect x="200" y="62" width="90" height="40" stroke="#b91c1c" fill="none"/><text x="214" y="86" font-size="12">TX spend</text><rect x="370" y="26" width="80" height="34" stroke="#1b3b8c" fill="none"/><text x="376" y="48" font-size="11">out 25 to A</text><rect x="370" y="104" width="80" height="34" stroke="#1b3b8c" fill="none"/><text x="376" y="126" font-size="11">out 24.9 to B</text><line x1="110" y1="48" x2="200" y2="76" stroke="#1b3b8c"/><line x1="110" y1="118" x2="200" y2="88" stroke="#1b3b8c"/><line x1="290" y1="76" x2="370" y2="46" stroke="#1b3b8c"/><line x1="290" y1="88" x2="370" y2="118" stroke="#1b3b8c"/>`
    }),
    topology: () => D.svg({
        vb: '0 0 400 170',
        body: `<circle cx="200" cy="85" r="18" stroke="#b91c1c" fill="none"/><text x="186" y="90" font-size="12">router</text><circle cx="70" cy="40" r="12" stroke="#1b3b8c" fill="none"/><circle cx="330" cy="40" r="12" stroke="#1b3b8c" fill="none"/><circle cx="70" cy="130" r="12" stroke="#1b3b8c" fill="none"/><circle cx="330" cy="130" r="12" stroke="#1b3b8c" fill="none"/><line x1="82" y1="48" x2="184" y2="76" stroke="#1b3b8c"/><line x1="318" y1="48" x2="216" y2="76" stroke="#1b3b8c"/><line x1="82" y1="122" x2="184" y2="94" stroke="#1b3b8c"/><line x1="318" y1="122" x2="216" y2="94" stroke="#1b3b8c"/><line x1="70" y1="52" x2="70" y2="118" stroke="#555"/><line x1="330" y1="52" x2="330" y2="118" stroke="#555"/><text x="34" y="24" font-size="11">LAN A</text><text x="300" y="24" font-size="11">LAN B</text>`
    }),
    controlLoop: () => D.svg({
        vb: '0 0 500 150',
        body: `<circle cx="30" cy="60" r="10" stroke="#1b3b8c" fill="none"/><rect x="70" y="42" width="80" height="36" stroke="#1b3b8c" fill="none"/><text x="82" y="64" font-size="12">PID</text><rect x="200" y="42" width="80" height="36" stroke="#1b3b8c" fill="none"/><text x="212" y="64" font-size="12">plant</text><circle cx="330" cy="60" r="10" stroke="#1b3b8c" fill="none"/><line x1="40" y1="60" x2="70" y2="60" stroke="#1b3b8c"/><line x1="150" y1="60" x2="200" y2="60" stroke="#1b3b8c"/><line x1="280" y1="60" x2="320" y2="60" stroke="#1b3b8c"/><polyline points="340,60 340,120 110,120 110,78" stroke="#b91c1c" fill="none"/><text x="14" y="38" font-size="11">r(t)</text><text x="334" y="38" font-size="11">y(t)</text><text x="150" y="140" font-size="11">feedback H(s)</text>`
    }),
    rc: () => D.svg({
        vb: '0 0 380 150',
        body: `<line x1="20" y1="60" x2="90" y2="60" stroke="#1b3b8c"/><polyline points="90,48 110,72 130,48 150,72 170,48" stroke="#1b3b8c" fill="none"/><line x1="170" y1="60" x2="250" y2="60" stroke="#1b3b8c"/><line x1="250" y1="34" x2="250" y2="86" stroke="#1b3b8c"/><line x1="266" y1="34" x2="266" y2="86" stroke="#1b3b8c"/><line x1="266" y1="60" x2="340" y2="60" stroke="#1b3b8c"/><line x1="340" y1="60" x2="340" y2="110" stroke="#1b3b8c"/><line x1="20" y1="60" x2="20" y2="110" stroke="#1b3b8c"/><line x1="20" y1="110" x2="340" y2="110" stroke="#1b3b8c"/><text x="96" y="34" font-size="12">R = 10k</text><text x="238" y="106" font-size="12">C = 100nF</text><text x="40" y="132" font-size="12">low-pass cutoff 159 Hz</text>`
    }),
    heart: () => D.svg({
        vb: '0 0 400 160',
        body: `<circle cx="130" cy="80" r="40" stroke="#b91c1c" fill="none"/><text x="106" y="86" font-size="12">RA</text><circle cx="270" cy="80" r="40" stroke="#b91c1c" fill="none"/><text x="248" y="86" font-size="12">RV</text><path d="M 90 30 Q 130 6 170 30" stroke="#1b3b8c" fill="none"/><path d="M 230 130 Q 270 156 310 130" stroke="#1b3b8c" fill="none"/><line x1="170" y1="80" x2="230" y2="80" stroke="#1b3b8c"/><text x="30" y="24" font-size="12">to lungs</text><text x="290" y="150" font-size="12">to body</text><text x="120" y="150" font-size="11">double circulation</text>`
    }),
    neuron: () => D.svg({
        vb: '0 0 420 150',
        body: `<circle cx="60" cy="75" r="26" stroke="#1b3b8c" fill="none"/><text x="44" y="80" font-size="12">soma</text><line x1="86" y1="75" x2="220" y2="75" stroke="#1b3b8c"/><polyline points="220,75 260,40 300,75 340,45 380,75" stroke="#1b3b8c" fill="none"/><line x1="20" y1="45" x2="38" y2="62" stroke="#b91c1c"/><line x1="20" y1="105" x2="38" y2="88" stroke="#b91c1c"/><text x="150" y="62" font-size="12">axon</text><text x="300" y="28" font-size="12">dendrites</text><text x="30" y="132" font-size="11">myelin sheath</text>`
    }),
    plates: () => D.svg({
        vb: '0 0 380 150',
        body: `<rect x="20" y="70" width="150" height="50" stroke="#1b3b8c" fill="none"/><rect x="210" y="70" width="150" height="50" stroke="#1b3b8c" fill="none"/><line x1="185" y1="60" x2="185" y2="130" stroke="#b91c1c"/><polyline points="40,40 90,40 80,30" stroke="#1b3b8c" fill="none"/><polyline points="340,40 290,40 300,30" stroke="#1b3b8c" fill="none"/><text x="60" y="100" font-size="13">plate A</text><text x="260" y="100" font-size="13">plate B</text><text x="130" y="146" font-size="12">transform boundary</text>`
    }),
    eventSourcing: () => D.svg({
        vb: '0 0 480 150',
        body: `<rect x="16" y="55" width="70" height="40" stroke="#1b3b8c" fill="none"/><text x="24" y="79" font-size="11">command</text><rect x="130" y="55" width="70" height="40" stroke="#b91c1c" fill="none"/><text x="146" y="79" font-size="11">event 1..n</text><rect x="250" y="55" width="80" height="40" stroke="#1b3b8c" fill="none"/><text x="258" y="79" font-size="11">log store</text><rect x="390" y="20" width="76" height="34" stroke="#1b3b8c" fill="none"/><text x="394" y="42" font-size="11">projection</text><rect x="390" y="96" width="76" height="34" stroke="#1b3b8c" fill="none"/><text x="398" y="118" font-size="11">audit</text><line x1="86" y1="75" x2="130" y2="75" stroke="#1b3b8c"/><line x1="200" y1="75" x2="250" y2="75" stroke="#1b3b8c"/><line x1="330" y1="70" x2="390" y2="40" stroke="#1b3b8c"/><line x1="330" y1="80" x2="390" y2="112" stroke="#1b3b8c"/>`
    }),
    cdn: () => D.svg({
        vb: '0 0 460 150',
        body: `<circle cx="40" cy="75" r="12" stroke="#1b3b8c" fill="none"/><text x="28" y="98" font-size="11">user</text><circle cx="160" cy="75" r="16" stroke="#b91c1c" fill="none"/><text x="140" y="98" font-size="11">edge POP</text><circle cx="300" cy="45" r="14" stroke="#1b3b8c" fill="none"/><circle cx="300" cy="105" r="14" stroke="#1b3b8c" fill="none"/><rect x="390" y="55" width="60" height="40" stroke="#1b3b8c" fill="none"/><text x="398" y="79" font-size="11">origin</text><line x1="52" y1="75" x2="144" y2="75" stroke="#1b3b8c"/><line x1="176" y1="68" x2="286" y2="48" stroke="#1b3b8c"/><line x1="176" y1="82" x2="286" y2="102" stroke="#1b3b8c"/><line x1="314" y1="50" x2="390" y2="68" stroke="#1b3b8c"/><line x1="314" y1="100" x2="390" y2="82" stroke="#1b3b8c"/>`
    }),
    lattice: () => D.svg({
        vb: '0 0 300 150',
        body: `<circle cx="60" cy="40" r="10" stroke="#1b3b8c" fill="none"/><circle cx="160" cy="40" r="10" stroke="#b91c1c" fill="none"/><circle cx="260" cy="40" r="10" stroke="#1b3b8c" fill="none"/><circle cx="60" cy="110" r="10" stroke="#b91c1c" fill="none"/><circle cx="160" cy="110" r="10" stroke="#1b3b8c" fill="none"/><circle cx="260" cy="110" r="10" stroke="#b91c1c" fill="none"/><line x1="70" y1="40" x2="150" y2="40" stroke="#1b3b8c"/><line x1="170" y1="40" x2="250" y2="40" stroke="#1b3b8c"/><line x1="70" y1="110" x2="150" y2="110" stroke="#1b3b8c"/><line x1="170" y1="110" x2="250" y2="110" stroke="#1b3b8c"/><line x1="60" y1="50" x2="60" y2="100" stroke="#1b3b8c"/><line x1="160" y1="50" x2="160" y2="100" stroke="#1b3b8c"/><line x1="260" y1="50" x2="260" y2="100" stroke="#1b3b8c"/><text x="120" y="140" font-size="12">NaCl ionic lattice</text>`
    })
};

// ---------------------------------------------------------------------------
// CHAPTERS
// ---------------------------------------------------------------------------
emit('# ScriptForge Ultra Turbo Stress Suite');
emit('');
emit('Purpose: measure what the engine can actually render. 15 chapters, hundreds of');
emit('diagrams, every grammar pushed to its realistic limit. Chapter 15 is a labeled');
emit('CANARY chapter that deliberately breaks known limits to document them.');
emit('');
pageBreak();

// --- Chapter 1: Mathematics -------------------------------------------------
chapter('Chapter 1 — Mathematics: Algebra, Combinatorics, Probability');
emit('Nested 2D structures first — fractions inside matrices inside cases:');
emit('$$ A = \\begin{bmatrix} \\lambda_1 & -\\omega \\\\ \\omega & \\lambda_2 \\end{bmatrix}, \\quad f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases} $$');
emit('$$ \\int_{1/\\sqrt{3}}^{\\sqrt{3}} \\frac{2}{\\pi(1+r^2)} \\, dr = \\frac{2}{\\pi}\\left[\\arctan r\\right]_{1/\\sqrt{3}}^{\\sqrt{3}} = \\frac{1}{3} $$');
emit('$$ \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e, \\qquad \\sum_{k=0}^{n} \\binom{n}{k} = 2^n $$');
emit('The Vandermonde identity and a Stirling boundary, both single-line displays:');
emit('$$ \\binom{m+n}{r} = \\sum_{k=0}^{r} \\binom{m}{k}\\binom{n}{r-k} $$');
emit('Karnaugh maps across all supported sizes, with and without dont-cares:');
D.kmap('A,B', '1,3');
D.kmap('A,B,C', '0,2,4,6');
D.kmap('A,B,C,D', '0,2,5,7,8,10,13,15');
D.kmap('A,B,C,D', '1,3,7,9,11,15', 'dcares=5,13');
D.kmap('A,B,C', '1,3,5');
D.kmap('A,B,C,D', '0,1,2,3,4,5,6,7');
emit('Combinatorics and number theory tables:');
D.table(['n', 'n!', 'C(n,2)', 'Fib'], [
    ['1', '1', '0', '1'], ['2', '2', '1', '1'], ['3', '6', '3', '2'],
    ['4', '24', '6', '3'], ['5', '120', '10', '5'], ['6', '720', '15', '8'],
    ['7', '5040', '21', '13'], ['8', '40320', '28', '21']
]);
D.table(['Prime', 'Gap', 'Twin'], [
    ['2', '1', 'no'], ['3', '2', 'yes(3,5)'], ['5', '2', 'yes'],
    ['7', '4', 'no'], ['11', '2', 'yes(11,13)'], ['13', '4', 'no'],
    ['17', '2', 'yes(17,19)'], ['19', '4', 'no'], ['23', '6', 'no']
]);
emit('Calculus and probability curves, all through the whitelist evaluator:');
D.plot('4*x^3', '0,1', '0.33,0.67', 'f(x)=4x^3 density');
D.plot('exp(-0.5*((x-3)/1.15)^2)', '0,8', '', 'normal pdf mu=3');
D.plot('(8/pi)*sqrt(x*(1-x))', '0,1', '0.25,0.75', 'semicircle pdf');
D.plot('2/(pi*(1+x^2))', '0,3', '', 'cauchy radial');
D.plot('sin(x)/x', '0.5,12', '', 'sinc-like envelope');
D.plot('abs(sin(x))', '0,6.5', '', 'rectified sine');
D.plot('sqrt(x)*exp(-0.3*x)', '0,10', '1,4', 'gamma-like shape');
emit('Graph-theory shapes through the schematic grammar:');
D.tree('1->2,1->3,2->4,2->5,3->6,3->7');
D.tree('100->50,100->150,50->25,50->75,150->125,150->175');
D.dfa('q0,q1,q2', 'q2', 'q0->q1:1,q1->q2:0,q0->q0:0,q1->q1:1,q2->q0:1');
D.dfa('s0,s1,s2,s3', 's3', 's0->s1:a,s1->s2:b,s2->s3:c,s0->s0:b,s1->s1:a,s3->s3:a');
emit('The IEEE 754 single-precision word as a bitfield stress:');
D.bitfield(32, 'Sign:1,Exponent:8,Mantissa:23');
emit('Array strips with pointer annotations:');
D.arrayStrip('12,25,38,44,71,90', '0:low,2:mid,5:high');
D.arrayStrip('7,14,21,28,35,42,49,56', '3:pivot');
D.list('3,7,11,19,37,73,NULL');
emit('Geometry: unit-circle target rings and a right-triangle construction:');
D.circles('0.58:3 pts,1.0:2 pts,1.73:1 pt', 'scoring zones');
D.triangle('\\theta', '(0,0);(1,0);(1,tan theta)');
emit('A scratch-out for the common mistake section: the harmonic series ~~converges~~ diverges.');
emit('');
pageBreak();

// --- Chapter 2: Digital Electronics & PCS ------------------------------------
chapter('Chapter 2 — Digital Electronics and Computer Architecture');
emit('Instruction encodings from three ISAs:');
D.bitfield(32, 'funct7:5,rs2:5,rs1:5,funct3:3,rd:5,opcode:7');
D.bitfield(32, 'Opcode:6,R1:4,R2:4,R3:4,Unused:14');
D.bitfield(16, 'Mode:2,Reg:3,RM:3,Opcode:8');
emit('Pipeline timing, hazards and forwarding as tight grids:');
D.timing('Cycle,1,2,3,4,5,6,7,8', ['I1~IF~ID~EX~MEM~WB~~~', 'I2~~IF~ID~EX~MEM~WB~~', 'I3~~~IF~ID~EX~MEM~WB~', 'I4~~~~IF~ID~EX~MEM~WB']);
D.timing('Cycle,1,2,3,4,5,6,7,8,9', ['LW~~IF~ID~EX~MEM~WB~~', 'ADD~~~IF~ID~stall~~EX~MEM~WB', 'SUB~~~~IF~stall~ID~EX~MEM~WB']);
D.timing('Step,Fetch,Decode,Exec,Mem,Write', ['ALU~1~2~3~-~5', 'LOAD~1~2~3~4~5', 'BRANCH~1~2~3~-~-']);
emit('Excitation and truth tables:');
D.table(['T', 'Q_n', 'Q_n+1', 'S', 'R'], [['0', '0', '0', '0', 'X'], ['0', '1', '1', 'X', '0'], ['1', '0', '1', '1', '0'], ['1', '1', '0', '0', '1']]);
D.table(['A', 'B', 'A XOR B', 'A NAND B'], [['0', '0', '0', '1'], ['0', '1', '1', '1'], ['1', '0', '1', '1'], ['1', '1', '0', '0']]);
D.table(['JK', 'Q_n', 'Q_n+1', 'Mode'], [['00', '0', '0', 'hold'], ['00', '1', '1', 'hold'], ['01', 'X', '0', 'reset'], ['10', 'X', '1', 'set'], ['11', '0', '1', 'toggle'], ['11', '1', '0', 'toggle']]);
emit('Sequential conversion schematics with orthogonal feedback buses:');
D.flipflop('SR', 'T');
D.flipflop('SR', 'D');
D.flipflop('JK', 'T');
emit('Two-level combinational circuits from boolean expressions:');
D.circuit("(B' AND D') OR (B AND D)");
D.circuit("(A AND B) OR (C AND D)");
D.circuit("(X NAND Y) OR (Z AND W)");
D.circuit("(P OR Q) AND (R OR S)");
emit('Control-unit and protocol automata:');
D.dfa('q0,q1,q2', 'q2', 'q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0');
D.dfa('T0,T1,T2,T3,T4', 'T4', 'T0->T1:clk,T1->T2:clk,T2->T3:clk,T3->T4:clk,T4->T0:clk');
emit('RTL microoperations as aligned display math:');
emit('$$ \\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\quad PC \\leftarrow PC + 1 \\\\ T_2 &: AR \\leftarrow IR(0..11), \\quad I \\leftarrow IR(15) \\end{aligned} $$');
emit('Decode tree for the 3-bit opcode space:');
D.tree('op->000,op->001,op->010,op->011,op->100,op->101,op->110,op->111');
emit('Cache and DRAM organizations:');
D.table(['Level', 'Size', 'Latency', 'Policy'], [['L1 I', '32 KB', '4 cyc', 'wt'], ['L1 D', '32 KB', '4 cyc', 'wb'], ['L2', '512 KB', '12 cyc', 'wb'], ['L3', '8 MB', '40 cyc', 'wb'], ['DRAM', '16 GB', '220 cyc', '-']]);
D.table(['Mapping', 'Tag bits', 'Index', 'Offset'], [['direct', '10', '8', '4'], ['2-way', '11', '7', '4'], ['4-way', '12', '6', '4'], ['fully', '18', '0', '4']]);
emit('');
pageBreak();

// --- Chapter 3: Analog & Power -----------------------------------------------
chapter('Chapter 3 — Analog and Power Electronics');
emit('First-order RC network re-inked from raw SVG:');
SVG.rc();
emit('Step responses through the whitelist evaluator:');
D.plot('1-exp(-x)', '0,8', '', 'RC step charge');
D.plot('exp(-0.32*x)*cos(2.85*x)', '0,8', '', 'underdamped ring');
D.plot('exp(-1.4*x)', '0,6', '1,3', 'overdamped decay');
D.plot('1/(1+x^2)', '0,6', '', 'low-pass magnitude');
D.plot('1/(sqrt(1+(x/2)^2))', '0.1,8', '', '2nd order LPF');
D.plot('x/(1+x)', '0,10', '', 'lead response');
emit('Component value tables:');
D.table(['Band', 'Digit 1', 'Digit 2', 'Multiplier'], [['brown', '1', '0', 'x10'], ['red', '2', '2', 'x100'], ['orange', '3', '3', 'x1k'], ['yellow', '4', '4', 'x10k'], ['green', '5', '5', 'x100k'], ['blue', '6', '6', 'x1M']]);
D.table(['Marking', 'Capacitance', 'Tol', 'Dielectric'], [['104', '100 nF', '20%', 'X7R'], ['223', '22 nF', '10%', 'NP0'], ['105', '1 uF', '20%', 'X5R'], ['471', '470 pF', '5%', 'C0G']]);
D.table(['Device', 'Vgs(th)', 'Rds(on)', 'Package'], [['IRF540', '4 V', '44 mOhm', 'TO-220'], ['AO3400', '1.7 V', '35 mOhm', 'SOT-23'], ['Si2302', '1.2 V', '65 mOhm', 'SOT-23'], ['IRLZ44', '2 V', '22 mOhm', 'TO-220']]);
emit('Operating-point math:');
emit('$$ V_{out} = V_{in}\\left(1 - e^{-t/RC}\\right), \\qquad \\tau = RC = 10^4 \\cdot 10^{-7} = 1\\,\\text{ms} $$');
emit('$$ f_c = \\frac{1}{2\\pi RC} = \\frac{1}{2\\pi \\cdot 10^4 \\cdot 10^{-7}} \\approx 159\\,\\text{Hz} $$');
emit('Forces on a heatsink-mounted device, as vector geometry:');
D.vectors('0:F_sink,90:N,-90:mg,180:F_conv', 'm');
emit('Diode and regulation tables:');
D.table(['Regulator', 'Vout', 'Iq', 'Dropout'], [['7805', '5 V', '5 mA', '2 V'], ['LM317', '1.25-37 V', '10 mA', '3 V'], ['AMS1117', '3.3 V', '5 mA', '1.1 V'], ['TPS7A02', '1.2 V', '25 nA', '60 mV']]);
emit('');
pageBreak();

// --- Chapter 4: Signals & DSP -------------------------------------------------
chapter('Chapter 4 — Signals and DSP');
emit('Aliasing comparison — the same sine sampled at falling rates:');
D.plot('sin(x)', '0,12', '', 'f = 1 Hz');
D.plot('sin(3*x)', '0,12', '', 'f = 3 Hz');
D.plot('sin(8*x)', '0,12', '', 'f = 8 Hz near Nyquist');
D.plot('sin(11*x)', '0,12', '', 'aliased to 1 Hz');
D.plot('sin(x)+0.5*sin(3*x)', '0,12', '2,6', 'harmonic sum');
D.plot('sin(x)*exp(-0.2*x)', '0,15', '', 'windowed tone');
emit('8-point DFT magnitude tables:');
D.table(['k', 'X(k) re', 'X(k) im', 'mag'], [['0', '4.0', '0.0', '4.00'], ['1', '1.0', '-2.41', '2.61'], ['2', '0.0', '0.0', '0.00'], ['3', '0.0', '-0.41', '0.41'], ['4', '0.0', '0.0', '0.00'], ['5', '0.0', '0.41', '0.41'], ['6', '0.0', '0.0', '0.00'], ['7', '1.0', '2.41', '2.61']]);
D.table(['Window', 'Main lobe', 'Sidelobe', 'Coherent gain'], [['rect', '2 bins', '-13 dB', '1.000'], ['hann', '4 bins', '-32 dB', '0.500'], ['hamming', '4 bins', '-43 dB', '0.540'], ['blackman', '6 bins', '-58 dB', '0.420']]);
emit('Circular buffers as array strips with read and write pointers:');
D.arrayStrip('0.2,0.4,0.6,0.8,1.0,0.9,0.7,0.5', '0:rd,4:wr');
D.arrayStrip('1011,0010,1100,0110,1001', '2:head');
emit('Convolution growth of two 4-tap kernels:');
D.table(['n', 'h1*h2 out', 'scale'], [['0', '1', 'x1'], ['1', '4', 'x4'], ['2', '10', 'x10'], ['3', '20', 'x20'], ['4', '31', 'x31'], ['5', '40', 'x40'], ['6', '44', 'x44'], ['7', '40', 'x40'], ['8', '31', 'x31']]);
emit('Sampling theorem math:');
emit('$$ f_s > 2 f_{max}, \\qquad X_s(f) = \\sum_{n=-\\infty}^{\\infty} x(nT)\\, e^{-j2\\pi f n T} $$');
emit('$$ \\text{SNR}_{quant} = 6.02N + 1.76\\,\\text{dB} \\implies 12\\,\\text{bit} \\to 74\\,\\text{dB} $$');
emit('Quantizer staircase and sample-and-hold, re-inked from SVG:');
D.svg({ vb: '0 0 360 150', body: '<line x1="30" y1="10" x2="30" y2="120" stroke="#1b3b8c"/><line x1="30" y1="120" x2="340" y2="120" stroke="#1b3b8c"/><polyline points="40,110 80,110 80,90 120,90 120,70 160,70 160,50 200,50 200,40 260,40 260,60 320,60" stroke="#b91c1c" fill="none"/><text x="40" y="140" font-size="12">3-bit quantizer staircase</text>' });
D.svg({ vb: '0 0 360 150', body: '<line x1="30" y1="10" x2="30" y2="120" stroke="#1b3b8c"/><line x1="30" y1="120" x2="340" y2="120" stroke="#1b3b8c"/><polyline points="40,100 70,100 70,60 100,60 100,110 130,110 130,30 170,30 170,90 210,90 210,50 250,50 250,100 300,100" stroke="#1b3b8c" fill="none"/><text x="34" y="140" font-size="12">sample and hold output</text>' });
emit('');
pageBreak();

// --- Chapter 5: Control Systems ----------------------------------------------
chapter('Chapter 5 — Control Systems');
emit('Canonical feedback loop re-inked from SVG:');
SVG.controlLoop();
emit('The three damping regimes, side by side as plots:');
D.plot('exp(-0.15*x)*cos(2*x)', '0,12', '', 'zeta = 0.075');
D.plot('exp(-0.7*x)*cos(2*x)', '0,12', '', 'zeta = 0.35');
D.plot('exp(-2.2*x)', '0,6', '', 'zeta = 1.1');
D.plot('1-exp(-1.2*x)*cos(2.4*x)', '0,10', '', 'step with overshoot');
D.plot('1/(1+0.5*x+0.25*x^2)', '0,8', '', '2nd order magnitude');
emit('State-space and transfer math:');
emit('$$ G(s) = \\frac{\\omega_n^2}{s^2 + 2\\zeta\\omega_n s + \\omega_n^2}, \\qquad \\omega_n = 3.2, \\; \\zeta = 0.42 $$');
emit('$$ \\dot{x} = A x + B u, \\quad A = \\begin{bmatrix} 0 & 1 \\\\ -10.24 & -2.69 \\end{bmatrix}, \\quad B = \\begin{bmatrix} 0 \\\\ 10.24 \\end{bmatrix} $$');
emit('$$ M_p = e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}} \\times 100\\% \\approx 21\\% $$');
emit('PID tuning and pole locations:');
D.table(['Controller', 'Kp', 'Ki', 'Kd', 'Effect'], [['P', '2.1', '0', '0', 'steady err'], ['PI', '1.8', '0.6', '0', 'err zero'], ['PD', '2.4', '0', '0.3', 'damp'], ['PID', '2.2', '0.8', '0.25', 'best']]);
D.table(['Pole pair', 'Location', 'Response'], [['s1,s2', '-1.35 ± j2.96', 'underdamped'], ['s1,s2', '-3.2 ± j0', 'critically damped'], ['s1', '-0.8', 'slow mode'], ['s2', '-4.1', 'fast mode']]);
emit('Gain and phase margins from measured points:');
D.table(['Freq rad/s', 'Mag dB', 'Phase deg'], [['0.1', '19.8', '-91'], ['0.5', '13.9', '-96'], ['1.0', '7.9', '-104'], ['2.0', '1.2', '-121'], ['3.4', '-3.0', '-137'], ['5.0', '-7.1', '-152']]);
emit('');
pageBreak();

// --- Chapter 6: Aerospace ----------------------------------------------------
chapter('Chapter 6 — Aerospace and Orbital Mechanics');
emit('Kepler geometry re-inked from SVG:');
SVG.orbit();
emit('Ascent and staging profiles:');
D.plot('100*sqrt(x)', '0,9', '', 'altitude vs time');
D.plot('x^1.8/40', '0,9', '', 'velocity ramp');
D.plot('exp(-x/4)*sin(x)', '0,16', '', 'buffet zone');
D.plot('7.8*sqrt(1/(0.1*x+0.02))', '0.2,10', '', 'orbital speed vs alt');
D.plot('exp(-0.05*x)*x^2/8', '0,14', '4,9', 'aerodynamic heating');
emit('Forces on a climbing aircraft as vector geometry:');
D.vectors('0:T,90:L,-90:mg,165:D', 'm');
D.vectors('45:F_thrust,-90:W,180:qS', 'wing');
emit('Mission events as a timing table:');
D.table(['Phase', 'T+ s', 'Event', 'State'], [['liftoff', '0', 'ignition', 'nominal'], ['max-q', '62', 'throttle bucket', 'nominal'], ['MECO', '162', 'stage sep', 'nominal'], ['SES-1', '168', '2nd engine', 'nominal'], ['SECO', '540', 'orbit insert', 'nominal'], ['deploy', '1800', 'payload sep', 'complete']]);
emit('Orbital element math:');
emit('$$ v_{circ} = \\sqrt{\\frac{\\mu}{r}} = \\sqrt{\\frac{3.986 \\times 10^{14}}{6.928 \\times 10^6}} \\approx 7.58\\,\\text{km/s} $$');
emit('$$ \\epsilon = -\\frac{\\mu}{2a} = -\\frac{3.986\\times10^{14}}{2 \\cdot 7.028\\times10^6} \\approx -28.4\\,\\text{MJ/kg} $$');
emit('Hohmann transfer budget:');
D.table(['Burn', 'Delta-v m/s', 'T+ min', 'Result'], [['TMI', '3.6', '0', 'escape'], ['MOI', '0.9', '7', 'capture'], ['TEI', '1.0', '260', 'return'], ['EDI', '0.03', '290', 'entry']]);
emit('A reentry flight-path construction:');
D.triangle('\\gamma', '(0,0);(entry);(interface)');
emit('Telemetry packet layout:');
D.bitfield(32, 'Sync:8,Frame:2,Temp:10,AccX:10,Gyro:2');
emit('');
pageBreak();

// --- Chapter 7: Thermodynamics -----------------------------------------------
chapter('Chapter 7 — Thermodynamics and Heat Transfer');
emit('Counterflow heat exchanger re-inked from SVG:');
SVG.heatExchanger();
emit('Cycle curves with shaded work and heat regions:');
D.plot('log(x)', '1,8', '2,6', 'isothermal work');
D.plot('x^1.3/6', '0.5,6', '1,4', 'polytropic');
D.plot('1-exp(-2*x)', '0,4', '0.5,2', 'heating curve');
D.plot('exp(-0.4*x)', '0,8', '2,6', 'cooling to ambient');
emit('Steam and property tables:');
D.table(['T C', 'p kPa', 'v_g m3/kg', 'h_g kJ/kg'], [['50', '12.3', '12.03', '2592'], ['100', '101.3', '1.673', '2676'], ['150', '475.8', '0.393', '2746'], ['200', '1554.9', '0.127', '2792'], ['250', '3977', '0.050', '2801']]);
D.table(['Refrigerant', 'Tb C', 'Pcrit MPa', 'ODP'], [['R-134a', '-26.1', '4.06', '0'], ['R-410A', '-51.7', '4.90', '0'], ['R-717', '-33.3', '11.3', '0'], ['R-290', '-42.1', '4.25', '0']]);
D.table(['Gas', 'R J/kgK', 'k', 'M g/mol'], [['air', '287', '1.400', '28.97'], ['He', '2077', '1.667', '4.00'], ['CO2', '189', '1.289', '44.01'], ['Ar', '208', '1.667', '39.95']]);
emit('Cycle math:');
emit('$$ \\eta_{carnot} = 1 - \\frac{T_L}{T_H} = 1 - \\frac{300}{800} = 62.5\\% $$');
emit('$$ COP_{ref} = \\frac{T_L}{T_H - T_L} = \\frac{280}{40} = 7.0 $$');
emit('$$ \\dot{Q} = \\dot{m} c_p \\Delta T = 0.4 \\cdot 4.186 \\cdot 25 \\approx 41.9\\,\\text{kW} $$');
emit('Isotherm family as concentric scoring zones:');
D.circles('0.5:T1,1.0:T2,1.6:T3', 'isotherm family');
emit('Fourier and Biot numbers in a wall:');
D.table(['Layer', 'k W/mK', 'L mm', 'R m2K/W'], [['brick', '0.72', '100', '0.139'], ['insulation', '0.035', '80', '2.286'], ['plaster', '0.25', '12', '0.048']]);
emit('');
pageBreak();

// --- Chapter 8: Chemistry -----------------------------------------------------
chapter('Chapter 8 — Chemistry');
emit('Molecular geometry re-inked from SVG:');
SVG.benzene();
SVG.water();
SVG.lattice();
emit('Kinetics and equilibrium curves:');
D.plot('exp(-x^2/8)', '0,6', '', 'Maxwell-Boltzmann');
D.plot('exp(-0.8*x)', '0,6', '', '1st order decay');
D.plot('1/(1+exp(-2*(x-3)))', '0,6', '2,4', 'titration sigmoid');
D.plot('x*exp(-x)', '0,6', '1,3', 'rate vs T peak');
emit('Stoichiometry and periodic tables:');
D.table(['Reaction', 'Type', 'dH kJ/mol'], [['2H2 + O2 -> 2H2O', 'combustion', '-572'], ['N2 + 3H2 -> 2NH3', 'haber', '-92'], ['CaCO3 -> CaO + CO2', 'decomp', '+178'], ['CH4 + 2O2 -> CO2 + 2H2O', 'combustion', '-890']]);
D.table(['Element', 'Z', 'Group', 'e config'], [['Na', '11', '1', 'Ne 3s1'], ['Fe', '26', '8', 'Ar 3d6 4s2'], ['Cu', '29', '11', 'Ar 3d10 4s1'], ['Au', '79', '11', 'Xe 4f14 5d10 6s1'], ['U', '92', 'actinide', 'Rn 5f3 6d1 7s2']]);
D.table(['Bond', 'Energy kJ/mol', 'Length pm'], [['C-C', '347', '154'], ['C=C', '614', '134'], ['C-H', '413', '109'], ['O-H', '463', '96'], ['N=N', '945', '110']]);
emit('Equilibrium math:');
emit('$$ K_c = \\frac{[NH_3]^2}{[N_2][H_2]^3} = 0.159 \\;\\text{at 450 C}, \\qquad K_w = [H^+][OH^-] = 10^{-14} $$');
emit('$$ pH = -\\log[H^+] = 7.0 \\implies [H^+] = 10^{-7}\\,\\text{M} $$');
emit('Isotope notation as a bitfield-style strip:');
D.bitfield(16, 'Mass:6,Atomic:6,Charge:4');
emit('Electron shells as concentric rings:');
D.circles('0.45:K=2,0.9:L=8,1.5:M=8', 'shell occupancy');
emit('');
pageBreak();

// --- Chapter 9: Biology & Animals ---------------------------------------------
chapter('Chapter 9 — Biology and the Animal Kingdom');
emit('The animal cell, a heart loop and a neuron, all re-inked from SVG:');
SVG.cell();
SVG.heart();
SVG.neuron();
emit('Taxonomy as trees:');
D.tree('Chordata->Mammalia,Aves;Mammalia->Carnivora,Primates;Aves->Raptors,Passerines');
D.tree('Canidae->Canis,Vulpes;Canis->lupus,latrans;Vulpes->vulpes');
emit('Lifecycle automata:');
D.dfa('egg,larva,pupa,adult', 'adult', 'egg->larva:molt,larva->pupa:metamorph,pupa->adult:eclose,adult->egg:reproduce');
D.dfa('active,torpor,hibernate,arousal', 'active', 'active->torpor:cold,torpor->hibernate:deep,hibernate->arousal:warm,arousal->active:feed');
emit('Population and gait curves:');
D.plot('1/(1+exp(-1.2*(x-4)))', '0,10', '3,6', 'logistic growth');
D.plot('sin(2*x)*exp(-0.05*x)', '0,14', '', 'predator-prey cycle');
D.plot('abs(sin(x*2.2))*3', '0,6', '1,3', 'stride frequency');
emit('Kingdom and vital-sign tables:');
D.table(['Kingdom', 'Cell type', 'Nutrition', 'Example'], [['Animalia', 'eukaryote', 'heterotroph', 'tiger'], ['Plantae', 'eukaryote', 'autotroph', 'oak'], ['Fungi', 'eukaryote', 'absorptive', 'amanita'], ['Protista', 'eukaryote', 'mixed', 'amoeba'], ['Monera', 'prokaryote', 'mixed', 'E. coli']]);
D.table(['Animal', 'Top km/h', 'Heart bpm', 'Lifespan y'], [['peregrine', '389', '600', '15'], ['cheetah', '120', '150', '12'], ['sailfish', '110', '80', '15'], ['pronghorn', '88', '100', '10'], ['human', '45', '70', '80'], ['snail', '0.05', '40', '5']]);
D.table(['Organ', 'System', 'Mass g', 'Role'], [['heart', 'circulatory', '310', 'pump'], ['lungs', 'respiratory', '1100', 'gas exchange'], ['liver', 'digestive', '1500', 'metabolism'], ['brain', 'nervous', '1350', 'control'], ['kidneys', 'excretory', '300', 'filter']]);
emit('Food chain as a linked list:');
D.list('grass,grasshopper,frog,snake,eagle,NULL');
emit('Iris rings and pupil zones as a target diagram:');
D.circles('0.4:iris,0.8:pupil rim,1.2:sclera', 'eye zones');
emit('Hardy-Weinberg math:');
emit('$$ p^2 + 2pq + q^2 = 1, \\qquad p = 0.7,\\; q = 0.3 \\implies 2pq = 0.42 $$');
emit('');
pageBreak();

// --- Chapter 10: Networking ---------------------------------------------------
chapter('Chapter 10 — Networking and Protocols');
emit('Header encodings as bitfields:');
D.bitfield(32, 'Ver:4,IHL:4,DSCP:6,ECN:2,TotalLen:16');
D.bitfield(32, 'SrcPort:16,DstPort:16');
D.bitfield(64, 'Preamble:56,SFD:8');
emit('The TCP connection lifecycle as a 5-state automaton:');
D.dfa('CLOSED,SYN_SENT,ESTABLISHED,FIN_WAIT,CLOSED2', 'ESTABLISHED', 'CLOSED->SYN_SENT:connect,SYN_SENT->ESTABLISHED:syn-ack,ESTABLISHED->FIN_WAIT:fin,FIN_WAIT->CLOSED2:ack,CLOSED2->CLOSED:timeout');
emit('Layered models as tables:');
D.table(['OSI layer', 'PDU', 'Example'], [['7 application', 'data', 'HTTP'], ['6 presentation', 'data', 'TLS'], ['5 session', 'data', 'SIP'], ['4 transport', 'segment', 'TCP'], ['3 network', 'packet', 'IP'], ['2 data link', 'frame', 'Ethernet'], ['1 physical', 'bit', '802.3']]);
D.table(['CIDR', 'Mask', 'Hosts', 'Usable'], [['/24', '255.255.255.0', '256', '254'], ['/25', '255.255.255.128', '128', '126'], ['/26', '255.255.255.192', '64', '62'], ['/27', '255.255.255.224', '32', '30'], ['/30', '255.255.255.252', '4', '2']]);
emit('Topology re-inked from SVG:');
SVG.topology();
emit('Latency, throughput and congestion behaviour:');
D.plot('2+0.4*x', '0,10', '3,7', 'rtt vs hops');
D.plot('10*x/(1+0.15*x)', '0,20', '', 'throughput saturation');
D.plot('abs(2*sin(0.9*x))+1', '0,12', '', 'cwnd sawtooth');
D.plot('exp(-0.3*x)*3+x/4', '0,10', '2,6', 'bufferbloat drain');
emit('DNS hierarchy as a tree:');
D.tree('root->com,org,net,in;com->example,google;in->ac,co;ac->iit');
emit('Routing table:');
D.table(['Prefix', 'Next hop', 'Metric', 'Iface'], [['10.0.0.0/8', '10.0.0.1', '1', 'eth0'], ['192.168.1.0/24', 'direct', '0', 'wlan0'], ['0.0.0.0/0', '192.168.1.1', '10', 'wlan0'], ['172.16.0.0/12', '10.0.0.2', '5', 'tun0']]);
emit('Shannon math:');
emit('$$ C = B \\log_2\\left(1 + \\frac{S}{N}\\right) = 20\\times10^6 \\log_2(1 + 1023) = 200\\,\\text{Mbps} $$');
emit('');
pageBreak();

// --- Chapter 11: Bitcoin & Blockchain ----------------------------------------
chapter('Chapter 11 — Bitcoin and Blockchain Networks');
emit('The 80-byte block header as one wide bitfield:');
D.bitfield(640, 'Version:32,PrevHash:256,MerkleRoot:256,Time:32,Bits:32,Nonce:32');
emit('Merkle tree over 8 transactions:');
D.tree('root->h01,h23;h01->tx0,tx1;h23->tx2,tx3');
D.tree('root->L,R;L->LL,LR;R->RL,RR');
emit('UTXO flow re-inked from SVG:');
SVG.utxo();
emit('Economic curves:');
D.plot('exp(0.158*x)', '0,9', '', 'difficulty growth');
D.plot('50/(2^floor(x/2))', '0,1', '', 'placeholder');
D.plot('exp(-0.35*x)*40+2', '0,10', '2,6', 'fee market');
D.plot('3+8/(1+exp(1.5*(x-5)))', '0,10', '4,7', 'fee spike decay');
D.plot('abs(sin(0.7*x))*4+0.5', '0,14', '', 'hashrate variance');
emit('Halving and block economics:');
D.table(['Era', 'Height', 'Reward BTC', 'Supply %'], [['1', '0', '50', '0'], ['2', '210000', '25', '50'], ['3', '420000', '12.5', '75'], ['4', '630000', '6.25', '87.5'], ['5', '840000', '3.125', '93.75']]);
D.table(['Fee tier', 'sat/vB', 'Blocks', 'Use case'], [['high', '80+', '1', 'consolidate'], ['normal', '25', '2', 'spend'], ['economy', '8', '6', 'batch']]);
D.table(['Metric', 'Value', 'Unit'], [['block interval', '600', 's'], ['max block', '4,000,000', 'WU'], ['difficulty epoch', '2016', 'blocks'], ['coin cap', '21,000,000', 'BTC']]);
emit('Consensus and sync automata (5 states max):');
D.dfa('headers,blocks,headers2,blocktree,active', 'active', 'headers->blocks:getdata,blocks->headers2:more,headers2->blocktree:validate,blocktree->active:connect,active->active:listen');
emit('Mining math:');
emit('$$ T = \\text{target} = \\frac{2^{256}}{D}, \\qquad P(\\text{block}) = 1 - e^{-\\frac{h\\,\\Delta t}{D\\,2^{32}}} $$');
emit('$$ \\text{stock-to-flow} = \\frac{\\text{supply}}{\\text{annual issuance}} \\approx 59 \\;(2026) $$');
emit('');
pageBreak();

// --- Chapter 12: ESP32-S3 -----------------------------------------------------
chapter('Chapter 12 — ESP32-S3 Embedded Systems');
emit('Module pinout re-inked from SVG:');
SVG.esp32pinout();
emit('Peripheral configuration as bitfields:');
D.bitfield(32, 'Pin:6,Signal:10,Invert:1,OE:1,IE:1,PullUp:1,PullDn:1,Sleep:11');
D.bitfield(16, 'ADC1_CH0:4,ADC1_CH1:4,ADC2_CH0:4,DAC:2,Reserved:2');
emit('Strapping pins — the classic ESP32-S3 footgun table:');
D.table(['Pin', 'Default', 'Must be', 'Affects'], [['GPIO0', 'pull-up', 'HIGH at reset', 'boot mode'], ['GPIO46', 'pull-up', 'HIGH at reset', 'boot mode'], ['GPIO45', 'pull-up', 'sets VDD_SPI', 'flash voltage'], ['GPIO3', 'pull-up', 'JTAG source', 'debug'], ['GPIO0+46', 'both LOW', 'download mode', 'flashing']]);
emit('Boot decision as an automaton:');
D.dfa('reset,download,flash_run,app,jtag', 'app', 'reset->download:0+46low,reset->flash_run:spi,flash_run->app:jump,app->jtag:3high,jtag->app:reset');
emit('Memory map as a tall table:');
D.table(['Region', 'Start', 'Size', 'Use'], [['ROM', '0x3FF1_0000', '64 KB', 'bootloader'], ['SRAM', '0x3FC8_8000', '384 KB', 'data+bss'], ['RTC FAST', '0x600F_E000', '8 KB', 'deep sleep'], ['Flash MM', '0x3C00_0000', '4 MB', 'rodata+text'], ['USB OTG', '0x6003_8000', '4 KB', 'CDC serial']]);
emit('ADC and power curves:');
D.plot('3.3*x^1.6', '0,1', '0.4,0.7', 'ADC nonlinearity');
D.plot('exp(-8*x)*160+0.01', '0,0.6', '', 'deep sleep floor');
D.plot('-2.2*x-30', '-90,-30', '', 'RSSI vs distance dBm');
D.plot('x/(x+0.05)', '0,0.6', '', 'PWM duty vs throttle');
emit('Task graph as a tree and boot sequence as a list:');
D.tree('main->core0,core1;core0->wifi,ble;core1->motor,sensors');
D.list('reset,rom_boot,2nd_boot,app_start,mount_fs,wifi_init,NULL');
emit('Touch-sensor rings:');
D.circles('0.6:T0,1.1:T1,1.7:T2', 'touch channels');
emit('Power math:');
emit('$$ I_{avg} = d_{active} I_{active} + (1-d_{active}) I_{sleep} = 0.01(240) + 0.99(0.02) \\approx 2.6\\,\\text{mA} $$');
emit('');
pageBreak();

// --- Chapter 13: System Design ------------------------------------------------
chapter('Chapter 13 — System Design and Architecture');
emit('Reference architectures re-inked from SVG:');
SVG.microservices();
SVG.eventSourcing();
SVG.cdn();
emit('Growth and queueing curves:');
D.plot('exp(0.22*x)', '0,10', '4,8', 'traffic growth');
D.plot('x/(1-0.09*x)', '0,10', '6,9', 'M/M/1 latency blowup');
D.plot('1-exp(-0.5*x)', '0,8', '2,5', 'cache warmup hit rate');
D.plot('min(1,x/8)', '0,12', '', 'saturation');
emit('Trade-off tables:');
D.table(['System', 'C choice', 'A choice', 'P choice'], [['MongoDB', 'eventual', 'high', 'yes'], ['Postgres', 'strong', 'medium', 'partial'], ['Cassandra', 'tunable', 'high', 'yes'], ['etcd', 'linearizable', 'low', 'leader']]);
D.table(['Model', 'Read stale', 'Use case'], [['linearizable', 'never', 'leader election'], ['sequential', 'monotonic', 'feeds'], ['eventual', 'seconds', 'CDN'], ['read-your-writes', 'own writes', 'user profile']]);
D.table(['SLO', 'Target', 'Budget/wk', 'Alert'], [['availability', '99.95%', '21.6 min', 'page'], ['p99 latency', '250 ms', '-', 'ticket'], ['error rate', '0.1%', '-', 'page'], ['RPO', '5 min', '-', 'drill']]);
emit('Order and payment state machines (5 states each):');
D.dfa('new,paid,packed,shipped,done', 'done', 'new->paid:pay,paid->packed:pick,packed->shipped:label,shipped->done:deliver,done->new:refund');
D.dfa('auth,captured,settled,refunded,disputed', 'settled', 'auth->captured:capture,captured->settled:settle,settled->refunded:refund,refunded->disputed:chargeback,disputed->settled:win');
emit('Ownership as trees:');
D.tree('platform->payments,identity;payments->checkout,risk;identity->auth,profiles');
emit('Capacity math:');
emit('$$ Q = \\lambda W, \\qquad \\rho = \\frac{\\lambda}{\\mu} = \\frac{4200}{5000} = 0.84 $$');
emit('$$ \\text{read replicas} = \\left\\lceil \\frac{R_{max}}{R_{replica}} \\right\\rceil = \\lceil 7.2 \\rceil = 8 $$');
emit('');
pageBreak();

// --- Chapter 14: Astronomy & Geoscience --------------------------------------
chapter('Chapter 14 — Astronomy and Geoscience');
emit('The Hertzsprung-Russell diagram and plate tectonics, re-inked from SVG:');
SVG.hr();
SVG.plates();
emit('Convection and wind as vector geometry:');
D.vectors('0:flow,90:rise,-90:sink,180:return', 'cell');
D.vectors('30:trade,150:westerly,-90:hadley', 'winds');
emit('Cosmic and seismic curves:');
D.plot('70*x', '0,2.5', '1.4,2.2', 'Hubble redshift');
D.plot('exp(-0.8*x)*sin(6*x)', '0,8', '', 'P-wave train');
D.plot('exp(-0.15*x)', '0,10', '3,8', 'geothermal gradient');
D.plot('x^0.4', '0,8', '', 'crater depth scaling');
emit('Planetary and mineral tables:');
D.table(['Body', 'R km', 'g m/s2', 'v_esc km/s'], [['Mercury', '2440', '3.7', '4.3'], ['Venus', '6052', '8.9', '10.4'], ['Earth', '6371', '9.8', '11.2'], ['Moon', '1737', '1.6', '2.4'], ['Mars', '3390', '3.7', '5.0'], ['Jupiter', '69911', '24.8', '59.5']]);
D.table(['Mineral', 'Mohs', 'Formula'], [['talc', '1', 'Mg3Si4O10(OH)2'], ['gypsum', '2', 'CaSO4 2H2O'], ['calcite', '3', 'CaCO3'], ['quartz', '7', 'SiO2'], ['corundum', '9', 'Al2O3'], ['diamond', '10', 'C']]);
D.table(['Moon', 'Planet', 'Period d', 'R km'], [['Io', 'Jupiter', '1.77', '1821'], ['Europa', 'Jupiter', '3.55', '1561'], ['Titan', 'Saturn', '15.9', '2575'], ['Triton', 'Neptune', '-5.9', '1353'], ['Luna', 'Earth', '27.3', '1737']]);
emit('Galaxy classification as a tree:');
D.tree('galaxy->spiral,elliptical,irregular;spiral->Sa,Sb,Sc;elliptical->E0,E5,E7');
emit('Stefan-Boltzmann and escape math:');
emit('$$ L = 4\\pi R^2 \\sigma T^4, \\qquad \\lambda_{max} T = 2.898\\times10^{-3}\\,\\text{m K} $$');
emit('Kepler as a timing table:');
D.table(['Planet', 'a AU', 'T yr', 'T^2/a^3'], [['Mercury', '0.387', '0.241', '1.001'], ['Earth', '1.000', '1.000', '1.000'], ['Mars', '1.524', '1.881', '1.000'], ['Jupiter', '5.203', '11.86', '0.999']]);
emit('A photometry packet layout:');
D.bitfield(32, 'JD:14,Filter:3,Counts:12,Error:3');
emit('');
pageBreak();

// --- Chapter 15: CANARY -------------------------------------------------------
canaryMode = true;
chapter('Chapter 15 — CANARY: Known Limits, Expect Breakage');
emit('Everything below this heading deliberately violates a known engine limit.');
emit('These are measurements, not mistakes.');
emit('');
emit('CANARY 1 — DFA with 7 states (engine caps at 5, states 6-7 vanish silently):');
D.dfa('q0,q1,q2,q3,q4,q5,q6', 'q6', 'q0->q1:0,q1->q2:1,q2->q3:0,q3->q4:1,q4->q5:0,q5->q6:1');
emit('CANARY 2 — Tree with 6 levels (engine caps at 5 levels, deepest level drops):');
D.tree('1->2,3;2->4,5;4->8,9;8->16,17;16->32,33;32->64,65');
emit('CANARY 3 — Grid row wider than the declared columns (extra cells vanish silently):');
emit('[DIAGRAM: grid | cols=A,B,C | rows=1~2~3~4]');
stats.diagrams.grid = (stats.diagrams.grid || 0) + 1; stats.byChapter[currentChapter]++;
stats.canaries.push('grid-wide-row');
emit('CANARY 4 — Pipe inside a quoted caption (dispatcher is not quote-aware on main):');
emit('[DIAGRAM: canvas2d | circles=0.58:4pts,1.0:3pts | caption="left | right"]');
stats.diagrams.canvas2d = (stats.diagrams.canvas2d || 0) + 1; stats.byChapter[currentChapter]++;
stats.canaries.push('pipe-in-caption');
emit('CANARY 5 — The graph grammar exists on the feature branch but is unwired on main');
emit('(a graph spec today falls through to the default demo table):');
emit('[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A]');
stats.diagrams.graph = (stats.diagrams.graph || 0) + 1; stats.byChapter[currentChapter]++;
stats.canaries.push('graph-unwired');
emit('CANARY 6 — Table cell that wraps heavily near a page bottom can overflow its reserve:');
D.table(['Term', 'Definition'], [
    ['alpha', 'This definition is deliberately long enough to wrap across several lines inside a narrow column so the row grows taller than the height estimator reserves for it and the following content can collide'],
    ['beta', 'Another long wrapping definition to double the effect and push the total drawn height further past the estimate so any clipping or overlap becomes clearly visible on the rendered page']
]);
emit('CANARY 7 — One unbroken 130-character word cannot wrap and will overflow the margin:');
emit('SupercalifragilisticexpialidociousDonaudampfschifffahrtsgesellschaftskapitaenAntidisestablishmentarianismPneumonoultramicroscopicsilicovolcanoconiosisFloccinaucinihilipilification');
emit('CANARY 8 — Boolean expression with three groups (engine parses only two):');
D.circuit("(A AND B) OR (C AND D) OR (E AND F)");
canaryMode = false;
emit('');
emit('End of stress suite. If chapters 1-14 rendered clean and only this chapter broke,');
emit('the engine passed everything it claims to support.');

// ---------------------------------------------------------------------------
// Auto-widen if under target (deterministic extra practice sections)
// ---------------------------------------------------------------------------
function extraMath() {
    const onesPool = ['0,2,5,7', '1,3,5,7', '0,4,5,7,12,14', '2,6,10,14', '1,2,4,8,16', '3,7,11,15'];
    const fnPool = [
        ['sin(2*x)+0.4*sin(5*x)', '0,12'], ['exp(-0.4*x)*cos(4*x)', '0,10'],
        ['sqrt(x)*2', '0,9'], ['x^2/9', '0,9'], ['log(x+1)', '0,10'],
        ['3/(1+exp(-(x-4)))', '0,10'], ['abs(cos(x))', '0,9'], ['x*exp(-0.3*x)', '0,12']
    ];
    const prosePool = [
        (r) => `Round ${r}: the implicant cover of this map satisfies $F = \\sum m(\\cdot)$ with all groups power-of-two sized.`,
        (r) => `For the curve below, the sample at $x = ${r}$ gives $y \\approx ${(Math.sin(r) + 1).toFixed(3)}$ by the whitelist evaluator.`,
        (r) => `Note the pair $\\left( a_{${r}}, b_{${r + 1}} \\right)$ and the bound $|x| < \\frac{${r}}{10}$ before the next figure.`,
        (r) => `The recurrence $T(n) = 2T(n/2) + n$ solves to $O(n \\log n)$; round ${r} draws it as a balanced tree.`
    ];
    let added = 0;
    let round = 0;
    while ((stats.lines < 2000 || Object.values(stats.diagrams).reduce((a, b) => a + b, 0) < 200) && round < 100) {
        round++;
        emit('');
        emit(`## Extended practice round ${round}`);
        emit(prosePool[round % prosePool.length](round));
        D.kmap('A,B,C,D', pick(onesPool));
        emit(`Prime implicants above share the adjacency $m_{i} + m_{i+2^{k}}$ wrapping rule from round ${round}.`);
        D.kmap('A,B,C', pick(onesPool));
        const [fn, dom] = fnPool[round % fnPool.length];
        D.plot(fn, dom, '', `variant ${round}`);
        emit(`Sampled at ${dom.split(',').length} endpoints over $x \\in [${dom.replace(',', ',\\; ')}]$.`);
        D.table(['k', 'value', 'note'], [[String(round * 3), String(rint(2, 99)), 'generated'], [String(round * 3 + 1), String(rint(2, 99)), 'generated'], [String(round * 3 + 2), String(rint(2, 99)), 'generated']]);
        D.tree(`r${round}->a${round},b${round};a${round}->c${round},d${round}`);
        D.list(`${round},${round * 2},${round * 4},${round * 8},NULL`);
        D.arrayStrip(`${rint(1, 99)},${rint(1, 99)},${rint(1, 99)},${rint(1, 99)},${rint(1, 99)},${rint(1, 99)}`, '1:mid');
        emit(`$$ \\int_{0}^{${round}} x^{${(round % 4) + 1}} \\, dx = \\frac{${round}^{${(round % 4) + 2}}}{${(round % 4) + 2}} $$`);
        emit(`$$ \\sum_{k=1}^{${round + 2}} k = \\frac{${round + 2}(${round + 3})}{2}, \\qquad \\binom{${round + 2}}{2} = \\frac{${round + 2}(${round + 1})}{2} $$`);
        added += 8;
    }
    return added;
}
extraMath();

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
const OUT_DIR = path.join(ROOT, 'stress');
mkdirSync(OUT_DIR, { recursive: true });
const document = doc.join('\n') + '\n';
writeFileSync(path.join(OUT_DIR, 'ultra_turbo_stress.txt'), document);

const totalDiagrams = Object.values(stats.diagrams).reduce((a, b) => a + b, 0);
const manifest = [
    '# Ultra Turbo Stress Suite — Manifest', '',
    'Generated by scripts/gen-stress-suite.mjs (seeded: 20261024).', '',
    '## Scorecard', '',
    `| Metric | Value |`, `|---|---|`,
    `| Lines | ${stats.lines} |`,
    `| Diagrams | ${totalDiagrams} |`,
    `| Display math blocks | ${stats.displayMath} |`,
    `| Inline math spans | ${stats.inlineMath} |`,
    `| Headings | ${stats.headings} |`,
    `| Pages (---PAGE--- + 1) | ${stats.pages} |`, '',
    '## Diagrams by grammar', '',
    ...Object.entries(stats.diagrams).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), '',
    '## Chapters', '',
    ...Object.entries(stats.byChapter).map(([k, v]) => `- ${k}: ${v} diagrams`), '',
    '## Canaries (expected breakage)', '',
    ...stats.canaries.map(c => `- ${c}`), '',
    'Load: open the studio, click the Turbo Stress preset, or paste stress/ultra_turbo_stress.txt.'
].join('\n');
writeFileSync(path.join(OUT_DIR, 'MANIFEST.md'), manifest);

const stressDocJs =
    '/**\n' +
    ' * Generated by scripts/gen-stress-suite.mjs — do not edit by hand.\n' +
    ' * Source of truth: stress/ultra_turbo_stress.txt\n' +
    ' */\n' +
    'export const STRESS_DOC = ' + JSON.stringify(document) + ';\n' +
    'export default STRESS_DOC;\n';
writeFileSync(path.join(ROOT, 'src', 'data', 'stressDoc.js'), stressDocJs);

console.log('==========================================================');
console.log(' Ultra Turbo Stress Suite generated');
console.log('==========================================================');
console.log(`  lines         : ${stats.lines}`);
console.log(`  diagrams      : ${totalDiagrams}`);
console.log(`  display math  : ${stats.displayMath}`);
console.log(`  inline math   : ${stats.inlineMath}`);
console.log(`  pages         : ${stats.pages}`);
console.log(`  canaries      : ${stats.canaries.length}`);
console.log('==========================================================');
console.log('  stress/ultra_turbo_stress.txt');
console.log('  stress/MANIFEST.md');
console.log('  src/data/stressDoc.js');
