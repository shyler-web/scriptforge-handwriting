# ScriptForge Graph Grammar & Notes Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `graph` diagram grammar to ScriptForge (general graphs, Hasse diagrams, spanning trees, Hamilton cycles) and build a `notes.html` reader that renders an ordered set of Markdown chapters as hand-written notebook pages with PDF export.

**Architecture:** A new pure-function module `src/render/diagrams/graph.js` parses a graph spec and computes node positions with six layout algorithms, then a renderer draws them with the existing Rough.js hand-drawn primitives. `notes.html` provides the same DOM contract `src/render/page.js` already expects (`#docInput`, `#pagesContainer`, `#notebookCanvas`), so the existing multi-page compositor and PDF writer are reused unchanged; only the shell around them is new.

**Tech Stack:** Native ES modules (no build step), Rough.js 4.6.6 (vendored), Tailwind (pre-compiled), plain Node verifiers (no test framework), headless-Chrome CDP QA harness.

**Spec:** `docs/superpowers/specs/2026-10-22-discrete-math-notebook-design.md`

**Content plan (separate):** `docs/superpowers/plans/2026-10-22-discrete-math-content-authoring.md`

### Deviation from the spec (deliberate)

Spec §5.4 originally proposed giving `scripts/serve.mjs` an optional **root** argument and serving the reader from `/home/`. This plan implements **both**: an optional root argument *and* a path mount (`/notes`) declared in `notes.config.json`, with the mount always resolved relative to the repository root.

Reason: the QA harness imports project modules by absolute path (`/src/render/...`). A server root of `/home/` would break that convention for every existing assertion suite. The path mount keeps `notes.html` at `/notes.html` and every module import uniform under the default root, while the alternate root still gives the `/ScriptForge/notes.html` URL from the spec's Definition of Done.

## Global Constraints

- **Zero new dependencies.** No npm install, no CDN, no network at runtime or test time. Everything offline.
- **Node >= 18.** Verifiers use `node:fs`/`node:path`/`node:url` only.
- **Native ES modules only.** `src/` files are loaded directly by the browser; no bundler, no transpile.
- **The existing five grammars must not regress.** `node scripts/verify-waves.mjs` stays green (35 checks) and the four existing QA suites keep passing.
- **Pure logic lives in pure modules.** `graph.js` exports pure functions that take plain data and return plain data, so they are testable in plain Node without a DOM.
- **All drawing reuses `src/render/diagrams/primitives.js`** (`drawArrowLine`, `drawSharpArrowhead`, `drawLabelOrMath`, `drawSolderDot`) and the active `INK_PROFILES` colour. No new drawing primitives.
- **Ink and styling follow the existing app.** Tailwind utility classes plus `assets/styles/app.css`; no inline `<style>` blocks beyond a new `assets/styles/notes.css`.
- **Comments explain *why*, not *what*.** Match the surrounding code's density — the existing modules carry a file header explaining the grammar they implement.
- **Every task ends with a commit.** Commit message style follows the repo: `feat(scope): …`, `fix(scope): …`, `docs(scope): …`, `test(scope): …`.

### Chapter DSL constraints (binding on all authored content)

1. Display math must fit on **one line**: `$$ … $$` is matched per-line by `/^\$\$(.+)\$\$$/`.
2. Inline math may not contain a nested `$`.
3. **No Markdown tables** — pipes print literally. Use `[DIAGRAM: grid | cols=… | rows=…]`.
4. Headings are `#` … `######`.
5. Each `[DIAGRAM: …]` block occupies one source line.
6. `---PAGE---` forces a page break; pagination is otherwise automatic.
7. **No `|` inside any `[DIAGRAM: …]` parameter value.** `src/render/diagrams/index.js` splits the whole spec on `|`, so a pipe inside a value silently truncates that value and starts a new parameter. The engine sanitises `caption=`; every other value must be authored pipe-free.

### Graph grammar spec (fixed by the design doc)

```
[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A,A-C | layout=auto
           | highlight=C-D,D-A | highlightNodes=C | showDegrees=true
           | directed=false | caption=…]
```

`nodes=` accepts `id:label` and a `|` group separator (`nodes=A,B,C|D,E,F`) for bipartite graphs.
`edges=` accepts `u-v`, `u->v`, `u-v:label`.
`levels=` accepts `id:level,…` and forces `layout=hasse`.

## Review Focus

Ten input classes the design implies that no happy-path test would catch:

1. **An edge naming an undeclared node** (`edges=A-Z` when only `A,B` are declared) must be dropped with a recorded warning — never drawn as a phantom node.
2. **A chapter file that is missing, empty, or not valid Markdown** must produce an explicit error state in the reader, never a blank notebook page.
3. **A graph figure whose estimated height is smaller than its drawn height** would overlap the following text line. The height estimate must be an upper bound for every spec.
4. **A `[DIAGRAM: graph]` spec with no `nodes=` parameter** must degrade to a labelled "no nodes" placeholder rather than throwing inside the compositor.
5. **`nodes=` containing a duplicate id** must keep one node and record a warning, not draw two overlapping circles.
6. **A self-loop `A-A`** must draw as a visible loop above the vertex, not as a zero-length line that vanishes.
7. **A single vertex with no edges** must produce one finite position — the circular layout must not divide by zero or emit `NaN`.
8. **A `caption=` containing a `|`** — `src/render/diagrams/index.js` splits the whole spec on `|`, so the caption truncates and a stray parameter appears. The engine must sanitise the caption, not trust the author.
9. **Duplicate undirected edges `A-B,B-A`** must be drawn once, not twice.
10. **`highlight=` naming an edge that does not exist, and `levels=` naming a vertex that does not exist** must be ignored, not crash the layout.

---

### Task 1: Graph spec parser

**Files:**
- Create: `src/render/diagrams/graph.js`
- Create: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseGraphSpec(params: object) -> GraphSpec` from `src/render/diagrams/graph.js`
  - `GraphSpec = { nodes: Array<{id:string,label:string}>, edges: Array<{u:string,v:string,directed:boolean,label:string}>, layout: 'layered'|'hasse'|'bipartite'|'tree'|'circular', levels: Record<string,number>, highlight: string[], highlightNodes: string[], showDegrees: boolean, directed: boolean, caption: string, groups: Array<string[]>|null, warnings: string[] }`

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-graph.mjs` with this exact structure: copy `installHeadlessDOMStub()` verbatim from `scripts/verify-waves.mjs` (lines 34–91), then a dynamic `await import('../src/render/diagrams/graph.js')` guarded by a local `importProjectModule(specifier)` helper copied from the same file (lines 95–103), then an `assert(condition, message)` helper that prints `[PASS]`/`[FAIL]` and increments counters, and a final `process.exit(failed > 0 ? 1 : 0)`.

The first assertion block must be:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `graph.js FAILED to load` and every `parseGraphSpec` assertion fails (`s1` is `null`).

- [ ] **Step 3: Implement `parseGraphSpec` in `src/render/diagrams/graph.js`**

Create the file with a header comment stating that this is the Universal Engine #6 general-graph grammar and listing its parameters.

```js
export function parseGraphSpec(params = {}) { /* returns GraphSpec */ }
```

Behaviour the tests pin:
- `nodes` — split on `,`; trim each entry; split each on the **first** `:` into `{ id, label }`; `label` defaults to `id`. A `|` anywhere in the raw value splits the list into two groups (each side split on `,` as above) and sets `groups`. Duplicate ids keep the first occurrence and push a warning.
- `edges` — split on `,`; each entry split on the **first** `:` into `pair` and `label`; `pair` split on `->` (directed) or `-` (undirected). Global `directed=true` forces every edge directed. An edge whose endpoint is not a declared node is dropped and pushes a warning.
- `layout` — explicit `layout=` wins. Otherwise: `levels` present → `hasse`; `groups` present → `bipartite`; the edge set is acyclic → `layered`; otherwise → `circular`.
- `levels` — split on `,`; each entry `id:level`; `level` parsed with `parseInt`.
- `highlight` / `highlightNodes` — comma lists, trimmed, empties dropped.
- `showDegrees` — `true` when the string is exactly `true` (case-insensitive).
- `caption` — trimmed string, default `''`.
- `warnings` — array of human-readable strings, always present.

Acyclicity check: build an adjacency map and run a DFS with a visited/in-stack colouring; a back edge means a cycle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: every `[PASS]` line printed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/diagrams/graph.js scripts/verify-graph.mjs
git commit -m "feat(diagrams): add graph grammar spec parser"
```

---

### Task 2: Graph layout engine

**Files:**
- Modify: `src/render/diagrams/graph.js`
- Modify: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: `parseGraphSpec` (Task 1), `GraphSpec`.
- Produces:
  - `computeGraphLayout(spec: GraphSpec, opts: { availWidth: number }) -> GraphLayout`
  - `GraphLayout = { positions: Record<string,{x:number,y:number}>, width: number, height: number }`

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-graph.mjs`:

```js
const computeGraphLayout = mod && mod.computeGraphLayout ? mod.computeGraphLayout : () => null;
const WIDTH = 680;

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `computeGraphLayout` is missing, so the nine new assertions fail.

- [ ] **Step 3: Implement `computeGraphLayout` in `src/render/diagrams/graph.js`**

```js
export function computeGraphLayout(spec, opts = {}) { /* returns GraphLayout */ }
```

Implementation requirements:
- `availWidth` defaults to 680. All positions are relative to the figure's own origin `(0, 0)` — the renderer offsets them by `startX`/`startY`.
- Node box is 34 px wide × 34 px tall; the minimum centre-to-centre separation is 30 px.
- **layered**: compute a layer index per node by longest path over the DAG of undirected edges treated as undirected-for-layering (use BFS from the node with the smallest degree, then refine with a second pass from every node, keeping the maximum depth). Order nodes within a layer by the barycenter of their neighbours' positions from the previous layer, two sweeps. Layer pitch 74 px vertically; nodes in a layer are spread horizontally across `availWidth` with equal gaps.
- **hasse**: `levels` gives the level per node; `y = (maxLevel - level) * 74 + 17` so level 0 is lowest. Nodes in a level are spread horizontally.
- **bipartite**: group 0 in the left half, group 1 in the right half; each group is spread vertically, centred against the other.
- **tree**: root = the node with in-degree 0 (or the first node); children are laid out in depth order, parents above children, siblings spread horizontally.
- **circular**: nodes evenly spaced on a circle whose radius is chosen so the circle fits inside `availWidth × 260`.
- After any layout, run a **separation pass**: while any two nodes are closer than 30 px, push them apart along their connecting vector. Cap the pass at 40 iterations so it always terminates.
- `width` is the bounding-box width of all positions plus the node radius on each side; `height` is the bounding-box height plus the node radius on each side. If `width` exceeds `availWidth`, scale every x coordinate by `availWidth / width` — but never scale below a 30 px separation, in which case leave the layout at its natural width and report the true `width`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: all assertions pass, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/diagrams/graph.js scripts/verify-graph.mjs
git commit -m "feat(diagrams): add graph layout engine with six layouts"
```

---

### Task 3: Graph renderer and height estimator

**Files:**
- Modify: `src/render/diagrams/graph.js`
- Modify: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: `parseGraphSpec`, `computeGraphLayout` (Tasks 1–2).
- Produces:
  - `estimateGraphHeight(params: object, availWidth: number) -> number`
  - `renderGraphDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) -> number` — returns the height consumed, in px.

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-graph.mjs`, after the DOM stub is installed:

```js
function makeRecordingRC() {
  const ops = [];
  const rec = (name) => (...args) => { ops.push({ name, args }); };
  const rc = { ops };
  for (const n of ['line','circle','curve','linearPath','rectangle','ellipse','polygon','path','arc','fill','stroke']) rc[n] = rec(n);
  return rc;
}
const ctxStub = globalThis.document.createElement('canvas').getContext('2d');
const counter = { count: 1 };
const inkStub = { color: '#1b3b8c', secondary: '#2952b3', accent: '#b91c1c', alpha: 0.94, widthScale: 1.0 };
const roughStub = { stroke: '#1b3b8c', strokeWidth: 1.65, roughness: 0.55, bowing: 0.6, disableMultiStroke: true, seed: 1 };

const spec = 'nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A | showDegrees=true | caption=A cycle';
const gspec = parseGraphSpec({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A', showDegrees: 'true', caption: 'A cycle' });
const rc1 = makeRecordingRC();
const usedH = mod.renderGraphDiagram(ctxStub, rc1, gspec, 0, 0, WIDTH, counter, {}, inkStub, roughStub);
assert(usedH > 0, `renderGraphDiagram reports a consumed height (${usedH})`);

const circles = rc1.ops.filter(o => o.name === 'circle');
assert(circles.length >= 4, `four node outlines drawn (${circles.length} circle ops)`);

const lineOrCurve = rc1.ops.filter(o => o.name === 'line' || o.name === 'curve');
assert(lineOrCurve.length >= 4, `four edges drawn (${lineOrCurve.length} line/curve ops)`);

const est = mod.estimateGraphHeight({ nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A' }, WIDTH);
assert(est >= usedH, `height estimate is an upper bound (estimate ${est} >= drawn ${usedH})`);

const estWide = mod.estimateGraphHeight({ nodes: 'A,B,C,D,E,F,G,H', edges: 'A-B,B-C,C-D,D-E,E-F,F-G,G-H' }, WIDTH);
assert(estWide > 0, 'height estimate is positive for a long chain');

const rc2 = makeRecordingRC();
const usedEmpty = mod.renderGraphDiagram(ctxStub, rc2, parseGraphSpec({ nodes: '' }), 0, 0, WIDTH, counter, {}, inkStub, roughStub);
assert(usedEmpty > 0, 'an empty spec still reports a height instead of throwing');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `renderGraphDiagram` and `estimateGraphHeight` are missing.

- [ ] **Step 3: Implement `renderGraphDiagram` and `estimateGraphHeight`**

```js
export function estimateGraphHeight(params, availWidth = 680) { /* number */ }
export function renderGraphDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) { /* number */ }
```

Rendering rules:
- Compute `spec = parseGraphSpec(params)` and `layout = computeGraphLayout(spec, { availWidth })`.
- **Nodes**: for each node draw a hand-drawn circle of radius 17 centred at `(startX + p.x, startY + p.y)` via `rc.circle(...)`, with `strokeWidth` scaled by `ink.widthScale`. Draw the node label with `drawLabelOrMath(ctx, rc, node.label, x - estimatedHalfWidth, y + 6, 19, charCounterRef, opts)`; estimate the half width as `label.length * 5.2`.
- When `spec.showDegrees` is true, draw `deg(v)` as a small label at `(x + 20, y - 14)` in font size 15.
- **Edges**: for each edge, draw a straight `rc.line` from the source circle boundary to the target circle boundary — shorten both ends by the node radius so the line does not cross a node. Use `drawArrowLine` when the edge is directed, `rc.line` otherwise. A highlighted edge uses `strokeWidth * 1.8` and the ink accent colour; a highlighted node's circle uses the accent colour and radius 19.
- **Degree label**: `deg(v)` is the number of edges incident on `v`, counting an edge once even if it is a self-loop.
- **Caption**: if `spec.caption` is non-empty, draw it centred under the figure with `drawLabelOrMath` at font size 16, in the ink secondary colour.
- Return the consumed height: `layout.height + (caption ? 26 : 0) + 8`.
- An empty spec returns 34 (a single blank ruled line) and draws nothing.

`estimateGraphHeight(params, availWidth)` computes the same layout and returns `layout.height + (caption ? 26 : 0) + 8`, so it is an upper bound of the drawn height by construction. It must never throw for a malformed spec — wrap `parseGraphSpec` in a try/catch and return 60 on failure.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: all assertions pass, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/diagrams/graph.js scripts/verify-graph.mjs
git commit -m "feat(diagrams): render hand-drawn graph figures with height estimation"
```

---

### Task 4: Dispatcher routing, diagram stats, and compositor integration

**Files:**
- Modify: `src/render/diagrams/index.js`
- Modify: `src/core/state.js`
- Modify: `src/render/page.js`
- Modify: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: `renderGraphDiagram`, `estimateGraphHeight` (Task 3).
- Produces:
  - `state.diagramStats: { rendered: number, failed: number }` from `src/core/state.js`
  - `estimateDiagramHeight(specStr: string, lineSpacing?: number) -> number` — now exported from `src/render/page.js`

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-graph.mjs`:

```js
const dispMod = (await importProjectModule('../src/render/diagrams/index.js')).mod;
const stateMod = (await importProjectModule('../src/core/state.js')).mod;
const pageMod = (await importProjectModule('../src/render/page.js')).mod;

const st = stateMod.state || stateMod.default;
assert(st && st.diagramStats && typeof st.diagramStats.rendered === 'number' && typeof st.diagramStats.failed === 'number',
  'state exposes diagramStats counters');

const beforeRendered = st.diagramStats.rendered;
const rc3 = makeRecordingRC();
dispMod.renderHandSketchedDiagram(ctxStub, rc3, 'graph | nodes=A,B | edges=A-B', 0, 0, WIDTH, { count: 1 }, {}, inkStub, roughStub);
assert(st.diagramStats.rendered === beforeRendered + 1, 'a graph diagram increments diagramStats.rendered');

const beforeFailed = st.diagramStats.failed;
dispMod.renderHandSketchedDiagram(ctxStub, makeRecordingRC(), 'graph | nodes=A,B | edges=A-B', 0, 0, WIDTH, { count: 1 }, {}, inkStub, null);
assert(st.diagramStats.failed >= beforeFailed, 'a failing diagram does not crash the dispatcher');

assert(typeof pageMod.estimateDiagramHeight === 'function', 'page.js exports estimateDiagramHeight');
const estGraph = pageMod.estimateDiagramHeight('graph | nodes=A,B,C | edges=A-B,B-C', 34);
assert(estGraph > 0, `estimateDiagramHeight handles a graph spec (${estGraph})`);

const estOther = pageMod.estimateDiagramHeight('grid | cols=A,B | rows=1~2', 34);
assert(estOther > 0, `estimateDiagramHeight still handles the grid grammar (${estOther})`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `state.diagramStats` is undefined, `estimateDiagramHeight` is not exported.

- [ ] **Step 3: Implement the wiring**

`src/core/state.js` — add to the `state` object literal:
```js
diagramStats: { rendered: 0, failed: 0 },
```

`src/render/diagrams/index.js`:
- import `renderGraphDiagram` and `estimateGraphHeight` from `./graph.js`.
- In `renderHandSketchedDiagram`, add a branch before the grid branch:
  `else if (diagType === 'graph') { usedHeight = renderGraphDiagram(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts); }`
- In the existing `try` block, increment `stateMod.state.diagramStats.rendered` after a successful dispatch; in the existing `catch` block, increment `stateMod.state.diagramStats.failed` before the `console.warn`. Use optional chaining (`stateMod.state?.diagramStats?.rendered`) so the counters never throw.

`src/render/page.js`:
- import `{ estimateGraphHeight }` from `./diagrams/graph.js`.
- add to `estimateDiagramHeight`, before the final `return 175`:
  `if (diagType === 'graph') return estimateGraphHeight(params, 680);`
- change `function estimateDiagramHeight(...)` to `export function estimateDiagramHeight(...)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: all assertions pass, exit code 0.

Then run the existing suite to confirm no regression:

Run: `node scripts/verify-waves.mjs`
Expected: `SUMMARY: 35 Passed, 0 Failed`.

- [ ] **Step 5: Commit**

```bash
git add src/render/diagrams/index.js src/core/state.js src/render/page.js scripts/verify-graph.mjs
git commit -m "feat(diagrams): route the graph grammar and track diagram render stats"
```

---

### Task 5: Bullet and callout line styles

**Files:**
- Create: `src/render/lineStyle.js`
- Modify: `src/render/page.js`
- Modify: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `classifyLine(rawLine: string) -> { kind: 'bullet'|'callout'|'plain', text: string, indent: number }` from `src/render/lineStyle.js`

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-graph.mjs`:

```js
const lsMod = (await importProjectModule('../src/render/lineStyle.js')).mod;
const classifyLine = lsMod && lsMod.classifyLine ? lsMod.classifyLine : () => ({ kind: 'plain', text: '', indent: 0 });

assert(classifyLine('- a bullet').kind === 'bullet', 'dash prefix is a bullet');
assert(classifyLine('- a bullet').text === 'a bullet', 'bullet text has the marker stripped');
assert(classifyLine('* a bullet').kind === 'bullet', 'asterisk prefix is a bullet');
assert(classifyLine('> a tip').kind === 'callout', 'angle-bracket prefix is a callout');
assert(classifyLine('> a tip').text === 'a tip', 'callout text has the marker stripped');
assert(classifyLine('plain text').kind === 'plain', 'a plain line is plain');
assert(classifyLine('-').kind === 'plain', 'a bare dash is not a bullet');
assert(classifyLine('>').kind === 'plain', 'a bare angle bracket is not a callout');
assert(classifyLine('  - indented').kind === 'bullet', 'leading whitespace does not defeat the bullet marker');
assert(classifyLine('  - indented').indent === 2, 'leading whitespace is reported as the indent');
assert(classifyLine('-n').kind === 'plain', 'a dash with no space after it is not a bullet');
assert(classifyLine('- ').kind === 'bullet', 'a dash with an empty body is still a bullet');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `lineStyle.js` does not exist.

- [ ] **Step 3: Implement `classifyLine` and wire it into the compositor**

`src/render/lineStyle.js`:

```js
export function classifyLine(rawLine) { /* returns { kind, text, indent } */ }
```

Rules: count leading spaces into `indent` (capped at 40); a tab counts as 4 spaces. After stripping the indent, if the remainder starts with `- ` or `* ` → `{ kind: 'bullet', text: remainder.slice(2).trim(), indent }`. If it starts with `> ` → `{ kind: 'callout', text: remainder.slice(2).trim(), indent }`. Otherwise `{ kind: 'plain', text: remainder, indent }`. A marker with nothing after it (`-` alone, `>` alone) is `plain`.

`src/render/page.js`:
- import `{ classifyLine }` from `./lineStyle.js`.
- In `renderFullPage`, after the heading match and before tokenizing, call `classifyLine(line)` and use its result:
  - `bullet` → set the line's start X to `leftMargin + 10 + 20` and prefix the drawn content with a hand-drawn bullet dot (a small `rc.circle` of radius 3.5 at the start X, vertically centred on the baseline).
  - `callout` → set the start X to `leftMargin + 10 + 28`, and draw a hand-drawn vertical rule (a `rc.line`) at `leftMargin + 10 + 12` spanning the line's height, in the ink accent colour at 40 % opacity.
  - `plain` → the current behaviour (start X at `leftMargin + 10` plus the existing noise drift).
- The heading detection must run **before** `classifyLine`, so a heading that begins with `-` is still a heading. A bullet or callout line may not also be a heading.
- The existing noise drift term must still be applied to the bullet and callout start positions.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: all assertions pass, exit code 0.

Run: `node scripts/verify-waves.mjs`
Expected: `SUMMARY: 35 Passed, 0 Failed`.

- [ ] **Step 5: Commit**

```bash
git add src/render/lineStyle.js src/render/page.js scripts/verify-graph.mjs
git commit -m "feat(render): render bullet and callout line styles in the compositor"
```

---

### Task 6: Chapter mount in the dev server

**Files:**
- Create: `notes.config.json`
- Create: `scripts/serve-paths.mjs`
- Modify: `scripts/serve.mjs`
- Modify: `package.json`
- Modify: `scripts/verify-graph.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveMountPath(mount: string, chaptersDir: string, relativePath: string) -> string|null` from `scripts/serve-paths.mjs`
  - `stripRootPrefix(pathname: string, rootPrefix: string) -> string` from `scripts/serve-paths.mjs`
  - `notes.config.json` at the repo root: `{ "mount": "/notes", "chaptersDir": "../../Discrete Mathematics/Notes" }`

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-graph.mjs`:

```js
const spMod = (await importProjectModule('../scripts/serve-paths.mjs')).mod;
const resolveMountPath = spMod && spMod.resolveMountPath ? spMod.resolveMountPath : () => null;
const stripRootPrefix = spMod && spMod.stripRootPrefix ? spMod.stripRootPrefix : (p) => p;

const cfg = JSON.parse(fs.readFileSync(new URL('../notes.config.json', import.meta.url), 'utf8'));
assert(cfg.mount === '/notes', 'notes.config.json declares the /notes mount');
assert(typeof cfg.chaptersDir === 'string' && cfg.chaptersDir.length > 0, 'notes.config.json declares chaptersDir');

const resolved = resolveMountPath('/notes', cfg.chaptersDir, '03-trees.md');
assert(resolved && resolved.endsWith('03-trees.md'), 'resolveMountPath resolves a chapter file');
assert(resolved && resolved.includes('Discrete Mathematics'), 'resolveMountPath points into the chapters directory');

const escaped = resolveMountPath('/notes', cfg.chaptersDir, '../../etc/passwd');
assert(escaped === null, 'resolveMountPath refuses a path that escapes the chapters directory');

const notUnder = resolveMountPath('/other', cfg.chaptersDir, '03-trees.md');
assert(notUnder === null, 'resolveMountPath refuses a request outside the mount');

assert(stripRootPrefix('/ScriptForge/notes/x.md', '/ScriptForge') === '/notes/x.md',
  'stripRootPrefix removes the repository prefix used by the alternate server root');
assert(stripRootPrefix('/notes/x.md', '/ScriptForge') === '/notes/x.md',
  'stripRootPrefix leaves a path alone when the prefix is absent');
```

Also add `import fs from 'node:fs';` to the top of `scripts/verify-graph.mjs` if it is not already present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-graph.mjs`
Expected: FAIL — `serve-paths.mjs` and `notes.config.json` do not exist.

- [ ] **Step 3: Implement the mount**

`notes.config.json`:
```json
{
  "mount": "/notes",
  "chaptersDir": "../../Discrete Mathematics/Notes"
}
```

`scripts/serve-paths.mjs`:
```js
import path from 'node:path';

export function resolveMountPath(mount, chaptersDir, relativePath) {
  // returns an absolute path inside chaptersDir, or null
}

export function stripRootPrefix(pathname, rootPrefix) {
  // returns pathname without rootPrefix, or pathname unchanged
}
```

`resolveMountPath` rules: the mount must match exactly (`mount` normalised to start with `/` and not end with `/`); the relative path must not contain `..` segments after normalisation; the resolved path must stay inside the resolved `chaptersDir`; anything else returns `null`.

`stripRootPrefix` rules: when `rootPrefix` is `''` or `'/'`, return `pathname` unchanged. Otherwise, when `pathname` equals `rootPrefix` or starts with `rootPrefix + '/'`, return the remainder (prefixed with `/`, or `/` when empty); otherwise return `pathname` unchanged.

`scripts/serve.mjs`:
- keep `REPO_ROOT = resolve(import.meta.dirname, '..')`; change `ROOT` to `resolve(process.argv[3] || REPO_ROOT)` so the second CLI argument overrides the server root.
- compute `ROOT_PREFIX`: when `ROOT` is not inside `REPO_ROOT`'s parent chain, derive it from the path segment between the server root and the repo root (e.g. `ROOT=/home/`, `REPO_ROOT=/home//projects/ScriptForge` → prefix `/ScriptForge`). When `ROOT === REPO_ROOT`, the prefix is `''`.
- read `notes.config.json` from `REPO_ROOT` at startup, tolerating its absence (then no mount is served).
- in the request handler, strip `ROOT_PREFIX` from the pathname first; then, if the stripped path starts with `${mount}/`, compute `resolveMountPath(mount, path.resolve(REPO_ROOT, chaptersDir), rest)`; when it returns a path, serve that file with `Content-Type: text/markdown; charset=utf-8`; when it returns `null`, fall through to the existing 403/404 handling.
- add `'.md': 'text/markdown; charset=utf-8'` to `CONTENT_TYPES`.

`package.json` — add scripts:
```json
"verify": "node scripts/verify-waves.mjs && node scripts/verify-graph.mjs && node scripts/verify-notes.mjs",
"notes": "node scripts/serve.mjs 8000 ../..",
"qa:graph": "node scripts/qa/harness.mjs scripts/qa/graph.assertions.js",
"qa:notes": "node scripts/qa/harness.mjs scripts/qa/notes.assertions.js"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-graph.mjs`
Expected: all assertions pass, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add notes.config.json scripts/serve-paths.mjs scripts/serve.mjs package.json scripts/verify-graph.mjs
git commit -m "feat(dev): serve study chapters from a mounted directory"
```

---

### Task 7: Chapter manifest and manifest verifier

**Files:**
- Create: `src/notes/manifest.js`
- Create: `scripts/verify-notes.mjs`
- Create: `../../Discrete Mathematics/Notes/.gitkeep`

**Interfaces:**
- Consumes: `notes.config.json` (Task 6).
- Produces:
  - `CHAPTERS: Array<Chapter>` and `CHAPTER_BY_ID: Record<string, Chapter>` from `src/notes/manifest.js`
  - `Chapter = { id: string, order: number, title: string, file: string, priority: 'P1'|'P2'|'P3'|'P4', difficulty: 1|2|3, minutes: number, lectures: string[], t9: string[] }`

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-notes.mjs` with the same headless-bootstrap pattern as `scripts/verify-graph.mjs` (copy `installHeadlessDOMStub`, `importProjectModule`, `assert`), then:

```js
const mod = (await importProjectModule('../src/notes/manifest.js')).mod;
const CHAPTERS = mod && mod.CHAPTERS ? mod.CHAPTERS : [];
const CHAPTER_BY_ID = mod && mod.CHAPTER_BY_ID ? mod.CHAPTER_BY_ID : {};

assert(CHAPTERS.length === 11, `manifest lists 11 chapters (${CHAPTERS.length})`);

const ids = CHAPTERS.map(c => c.id);
assert(new Set(ids).size === ids.length, 'chapter ids are unique');

const orders = CHAPTERS.map(c => c.order).sort((a, b) => a - b);
assert(JSON.stringify(orders) === JSON.stringify([0,1,2,3,4,5,6,7,8,9,10]), 'chapter orders are 0..10 with no gaps');

const bad = CHAPTERS.filter(c => !c.id || !c.title || !c.file || !['P1','P2','P3','P4'].includes(c.priority) || !Number.isInteger(c.difficulty) || c.difficulty < 1 || c.difficulty > 3 || !Number.isFinite(c.minutes) || !Array.isArray(c.lectures) || !Array.isArray(c.t9));
assert(bad.length === 0, `every chapter has a valid shape (${bad.map(c => c.id).join(',')})`);

assert(CHAPTER_BY_ID['trees'] !== undefined, 'CHAPTER_BY_ID indexes chapters by id');
assert(CHAPTER_BY_ID['trees'] && CHAPTER_BY_ID['trees'].t9.length >= 5, 'the trees chapter lists its T9 problems');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/verify-notes.mjs`
Expected: FAIL — `src/notes/manifest.js` does not exist.

- [ ] **Step 3: Implement the manifest**

`src/notes/manifest.js` — export `CHAPTERS` and `CHAPTER_BY_ID` with exactly these 11 entries, in exam-priority order:

| order | id | title | file | priority | difficulty | minutes | lectures | t9 |
|---|---|---|---|---|---|---|---|---|
| 0 | `exam-map` | Exam Map & Priority Order | `00-exam-map-and-priority.md` | P1 | 1 | 15 | — | all |
| 1 | `marks` | Marks & Algorithm Correctness | `01-marks-and-algorithm-proofs.md` | P1 | 2 | 25 | L18 | — |
| 2 | `graph-fundamentals` | Graph Fundamentals | `02-graph-fundamentals.md` | P1 | 2 | 35 | L22 | P3,P4,P5,P6,P8,P11,P14 |
| 3 | `trees` | Trees & Binary Trees | `03-trees.md` | P1 | 3 | 42 | L28 | P2,P5,P9,P10,P12,P13,P20 |
| 4 | `connectivity` | Connectivity, Cut Vertices & k-Connected | `04-connectivity.md` | P1 | 3 | 40 | L25 | P1,P12,P14 |
| 5 | `matching` | Matching & Hall's Theorem | `05-matching-and-hall.md` | P1 | 3 | 38 | L24 | P15,P16,P17,P18,P19 |
| 6 | `hamilton` | Hamiltonian Paths & Graph Isomorphism | `06-hamilton-and-isomorphism.md` | P2 | 3 | 32 | L27 | P1,P7,P10 |
| 7 | `induction` | Mathematical & Strong Induction | `07-induction.md` | P2 | 2 | 30 | L16,L17 | P13 |
| 8 | `relations` | Relations | `08-relations.md` | P3 | 2 | 28 | L19 | — |
| 9 | `partial-orders` | Partial Orders, Hasse Diagrams & Lattices | `09-partial-orders-hasse-lattices.md` | P3 | 3 | 36 | L20,L21 | — |
| 10 | `safety-net` | Safety Net: Euler, Planarity, Colouring, Spanning Trees | `10-safety-net-euler-planarity.md` | P4 | 3 | 30 | L23,L26 | — |

`file` is the bare filename; the reader prefixes it with the mount from `notes.config.json`.

Also create the chapters directory: `mkdir -p "../../Discrete Mathematics/Notes"` and add a `.gitkeep` so the directory exists before the content plan writes into it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/verify-notes.mjs`
Expected: all assertions pass, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/notes/manifest.js scripts/verify-notes.mjs
git commit -m "feat(notes): add the ordered chapter manifest"
```

---

### Task 8: The `notes.html` reader shell

**Files:**
- Create: `src/notes/reader.js`
- Create: `notes.html`
- Create: `assets/styles/notes.css`

**Interfaces:**
- Consumes: `CHAPTERS` (Task 7), `notes.config.json` (Task 6), `renderFullPage` from `src/render/page.js`.
- Produces:
  - `loadChapterText(chapterId: string, cfg: object) -> Promise<string>` from `src/notes/reader.js`
  - `renderChapterText(text: string) -> void` from `src/notes/reader.js`
  - a page at `/notes.html` exposing these DOM ids:
    `#notebookCanvas`, `#pagesContainer`, `#docInput`, `#charStats`, `#pageCountBadge`, `#renderTimer`, `#chapterList`, `#chapterSearch`, `#chapterTitle`, `#sortMode`, `#exportChapterPdf`, `#exportAllPdf`, `#exportPng`, `#chapterError`, `#notesStatus`

- [ ] **Step 1: Write the failing test**

Create `scripts/qa/notes.assertions.js`:

```js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

const ids = ['notebookCanvas', 'pagesContainer', 'docInput', 'charStats', 'pageCountBadge', 'renderTimer',
             'chapterList', 'chapterSearch', 'chapterTitle', 'sortMode', 'exportChapterPdf', 'exportAllPdf',
             'exportPng', 'chapterError', 'notesStatus'];
const missing = ids.filter(id => !document.getElementById(id));
R('dom.requiredIds', missing.length === 0, `missing=[${missing.join(',')}]`);

const canvas = document.getElementById('notebookCanvas');
R('dom.canvasSized', !!canvas && canvas.width > 0, canvas ? `${canvas.width}x${canvas.height}` : 'MISSING');

R('dom.roughGlobal', typeof rough !== 'undefined', `rough=${typeof rough}`);

try {
  const mod = await import('/src/notes/manifest.js');
  R('manifest.chapterCount', mod.CHAPTERS.length === 11, `count=${mod.CHAPTERS.length}`);
  const rows = document.querySelectorAll('#chapterList [data-chapter-id]');
  R('manifest.listRows', rows.length === mod.CHAPTERS.length, `rows=${rows.length}`);
  const first = rows[0];
  R('manifest.firstRowIsExamMap', first && first.getAttribute('data-chapter-id') === 'exam-map',
    first ? first.getAttribute('data-chapter-id') : 'NO ROWS');
} catch (err) { R('manifest.chapterCount', false, err.message); }

try {
  const cfg = await (await fetch('/notes.config.json')).json();
  R('config.mount', cfg.mount === '/notes', `mount=${cfg.mount}`);
} catch (err) { R('config.mount', false, err.message); }

try {
  const reader = await import('/src/notes/reader.js');
  R('reader.exports', typeof reader.loadChapterText === 'function' && typeof reader.renderChapterText === 'function',
    Object.keys(reader).join(','));

  const doc = document.getElementById('docInput');
  const original = doc.value;
  doc.value = '# Probe heading\n\n- a bullet\n\n> a callout\n\n$$ x^2 + 1 $$\n';
  reader.renderChapterText(doc.value);
  const stats = document.getElementById('charStats').textContent || '';
  R('render.probeRenders', /\d+\s+glyphs/.test(stats), `charStats="${stats}"`);
  const pages = document.querySelectorAll('canvas.notebook-page-canvas').length;
  R('render.probePages', pages >= 1, `pages=${pages}`);
  doc.value = original;
} catch (err) { R('reader.exports', false, err.message); }

return results;
```

- [ ] **Step 2: Run the test to verify it fails**

Run (with the server running): `node scripts/serve.mjs 8000 &` then `QA_BASE=http://localhost:8000/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
Expected: FAIL — `notes.html` does not exist, so every DOM assertion fails.

- [ ] **Step 3: Implement `src/notes/reader.js`, `notes.html` and `assets/styles/notes.css`**

`src/notes/reader.js`:

```js
import { renderFullPage } from '../render/page.js';
import { CHAPTER_BY_ID } from './manifest.js';

export async function loadChapterText(chapterId, cfg) { /* -> string */ }
export function renderChapterText(text) { /* -> void */ }
```

- `loadChapterText(chapterId, cfg)`: look the chapter up in `CHAPTER_BY_ID`; if it is absent, throw `new Error('Unknown chapter: ' + chapterId)`. Fetch the chapter at `new URL('.' + cfg.mount + '/' + chapter.file, document.baseURI)` — the mount is resolved **relative to the repository root**, so the reader works under either server root; if the response is not OK, throw `new Error('Chapter ' + chapterId + ' could not be loaded (HTTP ' + response.status + ')')`; return the response text.
- `renderChapterText(text)`: set `#docInput`.value to `text` and call `renderFullPage()`.

`notes.html` must:
- load `assets/vendor/rough.js`, `assets/styles/fonts.css`, `assets/styles/tailwind.css`, `assets/styles/app.css`, `assets/styles/notes.css`;
- render the three-pane layout: a left rail (`#chapterList` inside a scroll container, `#chapterSearch`, `#sortMode`), a centre pane containing `#pagesContainer` with `#notebookCanvas` inside it exactly as `index.html` does, and a right rail with the export buttons;
- contain `#docInput` as a `hidden` textarea (the compositor reads `.value`);
- contain `#chapterError` (hidden by default) and `#notesStatus`;
- import `CHAPTERS` from `./src/notes/manifest.js`, `loadChapterText` and `renderChapterText` from `./src/notes/reader.js`, and `exportMultiPagePdf`, `exportCurrentPagePng` from `./src/render/pdfExport.js`;
- on boot: fetch the config with `new URL('notes.config.json', document.baseURI)`, build the chapter list rows from `CHAPTERS`, load the first chapter, put its text into `#docInput`, and call `renderFullPage()`;
- each row carries `data-chapter-id` and shows the priority badge, the difficulty as `★` repeated `difficulty` times, the minutes, and the T9 problem numbers;
- `#sortMode` is a `<select>` with `exam` (default) and `textbook` options; changing it re-orders the list (exam = `order`; textbook = the same order, which is the textbook order for the shipped manifest — keep the handler generic so a later manifest can differ);
- when a chapter fails to load, show `#chapterError` with the error message and leave the previously rendered chapter on screen.

`assets/styles/notes.css` — a small stylesheet for the rail widths, the priority badge colours (P1 rose, P2 amber, P3 sky, P4 slate), the difficulty stars, and the chapter row states. Use the same slate/indigo palette as `app.css`; no new colour families.

- [ ] **Step 4: Run the test to verify it passes**

Run: `QA_BASE=http://localhost:8000/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
Expected: every check passes and the harness exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/notes/reader.js notes.html assets/styles/notes.css scripts/qa/notes.assertions.js
git commit -m "feat(notes): add the notebook reader shell"
```

---

### Task 9: Merged export and chapter switching

**Files:**
- Modify: `src/notes/reader.js`
- Modify: `notes.html`
- Modify: `scripts/qa/notes.assertions.js`

**Interfaces:**
- Consumes: `loadChapterText`, `renderChapterText` (Task 8), `buildMultiPagePdfBlob` and `exportCurrentPagePng` from `src/render/pdfExport.js`.
- Produces:
  - `buildAllChaptersPdf(chapters: Chapter[], loadText: (id: string, cfg: object) => Promise<string>, render: (text: string) => void, cfg: object) -> Promise<Blob>` from `src/notes/reader.js`

- [ ] **Step 1: Write the failing test**

Append to `scripts/qa/notes.assertions.js`:

```js
try {
  const reader = await import('/src/notes/reader.js');
  R('reader.allExport', typeof reader.buildAllChaptersPdf === 'function', Object.keys(reader).join(','));

  const cfg = await (await fetch('/notes.config.json')).json();
  let threw = null;
  try { await reader.loadChapterText('no-such-chapter', cfg); } catch (e) { threw = e.message; }
  R('reader.unknownChapterThrows', threw !== null, `threw=${threw}`);
} catch (err) { R('reader.allExport', false, err.message); }

try {
  const pdfMod = await import('/src/render/pdfExport.js');
  const cv = document.getElementById('notebookCanvas');
  const blob = pdfMod.buildMultiPagePdfBlob([cv]);
  R('export.buildBlob', blob && blob.size > 1000, `size=${blob && blob.size}`);
} catch (err) { R('export.buildBlob', false, err.message); }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `QA_BASE=http://localhost:8000/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
Expected: FAIL — `buildAllChaptersPdf` is missing and `loadChapterText` does not yet throw for an unknown chapter.

- [ ] **Step 3: Implement `buildAllChaptersPdf` and wire the shell**

`src/notes/reader.js` — add:

```js
export async function buildAllChaptersPdf(chapters, loadText, render, cfg) { /* -> Blob */ }
```

- For each chapter in order: `await loadText(chapter.id, cfg)`, `render(text)`, then collect `document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)')` and **copy each canvas into a detached snapshot canvas** — the next render reuses and resizes the live canvases, so the snapshots must be taken before the next chapter renders.
- After the loop, return `buildMultiPagePdfBlob(snapshots)`.

`notes.html`:
- `#exportChapterPdf` calls `exportMultiPagePdf()` (unchanged module function);
- `#exportAllPdf` calls `buildAllChaptersPdf(CHAPTERS, loadChapterText, renderChapterText, cfg)` and downloads the returned blob with the filename `DiscreteMath_Notebook_AllChapters.pdf`;
- `#exportPng` calls `exportCurrentPagePng()`;
- clicking a chapter row loads that chapter, renders it, sets `#chapterTitle` to the chapter title, and updates `#notesStatus` with `chapter N of 11 · X pages`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `QA_BASE=http://localhost:8000/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
Expected: every check passes and the harness exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/notes/reader.js notes.html scripts/qa/notes.assertions.js
git commit -m "feat(notes): export every chapter as one merged PDF"
```

---

### Task 10: Browser QA for the graph grammar, plus docs

**Files:**
- Create: `scripts/qa/graph.assertions.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a browser QA suite for the graph grammar and a README section.

- [ ] **Step 1: Write the failing test**

Create `scripts/qa/graph.assertions.js`, following the pattern of `scripts/qa/wave1.assertions.js`:

```js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

const W = 820, H = 1100, HI = 2;
const RIGHT_MARGIN = W - 42, LEFT_MARGIN = 92, MAX_DIAGRAM_WIDTH = 680;

try {
  const { renderHandSketchedDiagram } = await import('/src/render/diagrams/index.js');
  const { readOptions } = await import('/src/core/options.js');
  const { getInk, state } = await import('/src/core/state.js');
  const opts = readOptions();
  const ink = getInk();

  const specs = [
    ['graph/layered', 'graph | nodes=A,B,C,D,E | edges=A-B,B-C,C-D,D-E,A-E'],
    ['graph/hasse',   'graph | nodes=1,2,3,4,6 | edges=1-2,1-3,2-4,2-6,3-6 | levels=1:0,2:1,3:1,4:2,6:2'],
    ['graph/bipartite','graph | nodes=L1,L2,R1,R2 | edges=L1-R1,L1-R2,L2-R1'],
    ['graph/tree',    'graph | nodes=R,A,B,C | edges=R-A,R-B,B-C'],
    ['graph/degrees', 'graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A | showDegrees=true'],
    ['graph/highlight','graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A | highlight=A-B,B-C | highlightNodes=B'],
    // --- the figure-coverage acceptance list from spec section 4.6 ---
    ['coverage/degreeLabels', 'graph | nodes=A,B,C,D,E | edges=A-B,B-C,C-D,D-E,E-A | layout=circular | showDegrees=true'],
    ['coverage/bipartite',    'graph | nodes=A,B,C|D,E,F | edges=A-D,A-E,B-D,B-F,C-E,C-F | layout=bipartite'],
    ['coverage/tree',         'graph | nodes=50,30,70,20,40 | edges=50-30,50-70,30-20,30-40 | layout=tree'],
    ['coverage/spanningTree', 'graph | nodes=A,B,C,D,E | edges=A-B,B-C,C-D,D-E,A-E | highlight=A-B,B-C,C-D'],
    ['coverage/hasse',        'graph | nodes=1,2,3,4,6,12 | edges=1-2,1-3,2-4,2-6,3-6,4-12,6-12 | layout=hasse | levels=1:0,2:1,4:2,6:2,3:1,12:3'],
    ['coverage/cutVertex',    'graph | nodes=c,a,b,e | edges=c-a,c-b,c-e | highlightNodes=c'],
    ['coverage/cutEdge',      'graph | nodes=c,a,b,e | edges=c-a,c-b,c-e | highlight=c-e'],
    ['coverage/hamilton',     'graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A | highlight=A-B,B-C,C-D,D-A'],
    ['coverage/layeredDir',   'graph | nodes=A,B,C,D | edges=A->B,B->C,C->D | layout=layered | directed=true'],
    ['coverage/twoPaths',     'graph | nodes=a,b,c,d,x,y | edges=a-x,b-x,c-y,d-y,a-b,c-d | layout=layered | highlight=a-x,b-x,c-y,d-y']
  ];

  const off = document.createElement('canvas');
  off.width = W * HI; off.height = H * HI;
  const octx = off.getContext('2d');
  const orc = rough.canvas(off);

  const scan = () => {
    const d = octx.getImageData(0, 0, off.width, off.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, inkPx = 0;
    for (let y = 0; y < off.height; y++) {
      for (let x = 0; x < off.width; x++) {
        const a = d[(off.width * y + x) * 4 + 3];
        if (a > 12) { inkPx++; const lx = x / HI, ly = y / HI;
          if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
          if (ly < minY) minY = ly; if (ly > maxY) maxY = ly; }
      }
    }
    return { minX, minY, maxX, maxY, inkPx, width: maxX - minX };
  };

  const per = [];
  const failures = [];
  for (const [name, spec] of specs) {
    octx.setTransform(HI, 0, 0, HI, 0, 0);
    octx.clearRect(0, 0, W, H);
    const counter = { count: 1 };
    let usedH = null, err = null;
    try { usedH = renderHandSketchedDiagram(octx, orc, spec, LEFT_MARGIN + 12, 100, RIGHT_MARGIN - LEFT_MARGIN, counter, opts); }
    catch (e) { err = e.message; }
    const b = scan();
    const within = b.inkPx ? (b.maxX <= RIGHT_MARGIN + 0.5 && b.minX >= LEFT_MARGIN - 0.5 && b.width <= MAX_DIAGRAM_WIDTH + 0.5) : true;
    per.push({ name, usedH, inkPx: b.inkPx, width: +b.width.toFixed(1), within, err });
    if (err || !b.inkPx || !within) failures.push(name);
  }
  results.graph = { pass: failures.length === 0, detail: { failures, per } };
  results.graphNoBlank = { pass: per.every(d => d.inkPx > 0), detail: per.filter(d => !d.inkPx).map(d => d.name) };
} catch (err) { results.graph = { pass: false, detail: err.message }; }

try {
  const { estimateGraphHeight } = await import('/src/render/diagrams/graph.js');
  const { parseGraphSpec } = await import('/src/render/diagrams/graph.js');
  const { state } = await import('/src/core/state.js');
  const before = state.diagramStats.failed;
  const off = document.createElement('canvas');
  off.width = 820 * 2; off.height = 1100 * 2;
  const octx = off.getContext('2d');
  const orc = rough.canvas(off);
  renderHandSketchedDiagram(octx, orc, 'graph | nodes=A,B | edges=A-Z', 100, 100, 600, { count: 1 }, {});
  results.graphStats = { pass: state.diagramStats.failed === before, detail: { failed: state.diagramStats.failed, before } };
} catch (err) { results.graphStats = { pass: false, detail: err.message }; }

return results;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/serve.mjs 8000 &` then `node scripts/qa/harness.mjs scripts/qa/graph.assertions.js`
Expected: FAIL — the suite must not pass on the first run because `results.graph` will report failures for any spec that draws nothing or overflows. Fix the engine until it passes.

- [ ] **Step 3: Fix the engine until the suite passes**

Run the suite and, for each failing spec, adjust `src/render/diagrams/graph.js` (layout spacing, radius, label offsets) until every spec draws ink inside the margins. Do not weaken the assertions.

- [ ] **Step 4: Run the full verification set**

Run:
```bash
node scripts/verify-waves.mjs
node scripts/verify-graph.mjs
node scripts/verify-notes.mjs
node scripts/qa/harness.mjs scripts/qa/graph.assertions.js
node scripts/qa/harness.mjs scripts/qa/notes.assertions.js
node scripts/build-tailwind.mjs
```
Expected: all verifiers report 0 failures, both QA suites exit 0, and the Tailwind build completes (it walks the repo root, so `notes.html` is scanned automatically — re-run it whenever a new utility class is added to the reader).

Then confirm the pre-existing suites still pass:
```bash
node scripts/qa/harness.mjs scripts/qa/wave1.assertions.js
node scripts/qa/harness.mjs scripts/qa/wave2.assertions.js
node scripts/qa/harness.mjs scripts/qa/wave3.assertions.js
node scripts/qa/harness.mjs scripts/qa/mobile.assertions.js
```
Expected: each exits 0.

- [ ] **Step 5: Document the new grammar**

Add to `README.md`, in the "Document markup" table, a row:
`| `[DIAGRAM: graph \| nodes=A,B,C \| edges=A-B,B-C \| layout=layered]` | A hand-drawn general graph (also Hasse, bipartite, tree, circular) |`

Add a new section `## The graph grammar` after the module map, listing the six layouts, the `nodes=`/`edges=`/`levels=`/`highlight=`/`highlightNodes=`/`showDegrees=`/`directed=`/`caption=` parameters, and the `graph` module in the module map.

Add the two new verifiers to the "Verification" section:
```
node scripts/verify-graph.mjs           # headless graph-grammar checks
node scripts/verify-notes.mjs           # headless chapter-manifest checks
```

- [ ] **Step 6: Commit**

```bash
git add scripts/qa/graph.assertions.js README.md src/render/diagrams/graph.js
git commit -m "test(diagrams): add browser QA for the graph grammar and document it"
```

---

## Appendix: graph spec quick reference

| Need | Spec |
|---|---|
| A general graph | `graph \| nodes=A,B,C,D \| edges=A-B,B-C,C-D,D-A` |
| A Hasse diagram | `graph \| nodes=1,2,3,4,6 \| edges=1-2,1-3,2-4,2-6,3-6 \| levels=1:0,2:1,3:1,4:2,6:2` |
| A bipartite graph | `graph \| nodes=L1,L2,R1,R2 \| edges=L1-R1,L1-R2,L2-R1` |
| A tree | `graph \| nodes=R,A,B,C \| edges=R-A,R-B,B-C` |
| Degrees labelled | `graph \| nodes=A,B,C,D \| edges=A-B,B-C,C-D,D-A \| showDegrees=true` |
| A spanning tree inside a graph | `graph \| nodes=A,B,C,D \| edges=A-B,B-C,C-D,D-A \| highlight=A-B,B-C` |
| A cut vertex | `graph \| nodes=A,B,C,D \| edges=A-B,B-C,B-D,C-D \| highlightNodes=B` |
| A directed graph | `graph \| nodes=A,B,C \| edges=A->B,B->C \| directed=true` |
| An edge label | `graph \| nodes=A,B \| edges=A-B:7` |
