# ScriptForge Notebook Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general-graph diagram grammar to ScriptForge, add bullet/callout markup to the page renderer, and build a `notes.html` reader that renders the Discrete Mathematics study chapters into hand-written notebook pages and exports them as PDF.

**Architecture:** The `graph` grammar is a new diagram engine (`src/render/diagrams/graph.js`) split into a pure spec parser, a pure layout engine, and a drawing routine, so the layout can be unit-tested in plain Node. The reader (`notes.html` + `src/notes/reader.js`) provides the same DOM contract the existing compositor already expects (`#docInput`, `#pagesContainer`, `#notebookCanvas`), so `renderFullPage()` and `pdfExport.js` are reused unchanged.

**Tech Stack:** Vanilla ES modules, no build step, no runtime dependencies. Rough.js 4.6.6 (vendored) for hand-drawn strokes. Node 24 for the verifier. Headless Chrome via the existing CDP harness for browser QA.

**Spec:** `docs/superpowers/specs/2026-10-22-discrete-math-notebook-design.md`

**Plan scope:** This plan covers **Phase 0 + Phase 1** of the spec — the ScriptForge capability. The 11 study chapters (spec Phase 2) and the corrections log (Phase 3) are a separate plan, written once this plan lands, because chapter authoring depends on the exact `graph` spec surface and the reader's file conventions established here.

## Global Constraints

- **Zero new runtime dependencies.** No npm installs, no CDN additions. Rough.js is already vendored at `assets/vendor/rough.js`.
- **Every figure is a ScriptForge diagram engine.** No hand-written HTML canvas, no pasted raster image.
- **No `|` inside any `[DIAGRAM: …]` parameter value.** `src/render/diagrams/index.js:44` splits the whole spec on `|`; a pipe inside a value silently truncates that value and starts a new parameter.
- **Display math stays on one physical line.** `src/render/page.js:240` matches `/^\$\$(.+)\$\$$/` against a single trimmed line.
- **Inline math contains no `$`.** Matched by `/\$[^$]+\$/` at `src/render/page.js:273`.
- **Markdown tables are unsupported.** A table becomes `[DIAGRAM: grid | cols=… | rows=…]`.
- **Existing Studio behaviour is unchanged.** `node scripts/verify-waves.mjs` and the four existing QA suites must pass after every task.
- **Plain-Node importability.** Any module imported by `scripts/verify-waves.mjs` must not touch `document` at module scope. Use the existing `installHeadlessDOMStub()` pattern (see `scripts/verify-waves.mjs:34`).
- **File paths are exact.** The chapter directory is `/home//Discrete Mathematics/Notes/` — it contains a space and must be quoted in every shell command.

## Review Focus

The spec is a vision document; these are the inputs it implies but does not enumerate. Each line is pinned by a test in the task that owns the code.

1. **An edge naming a vertex absent from `nodes=`.** The edge must be dropped silently and the render must still succeed — a typo in one chapter must not blank the whole page.
2. **A `nodes=` list with one vertex and no edges.** Must render one node and one page. A `circular` layout must not divide by zero.
3. **A self-loop `A-A`.** Must draw as a visible loop, not a zero-length line that vanishes.
4. **A `caption=` containing a `|`** — the dispatcher splits on `|`, so the caption truncates and a stray parameter appears. Captions must be sanitised by the engine, not trusted from the author.
5. **A chapter file whose body is empty or contains only a diagram.** Must still produce at least one page and must not throw.
6. **`highlight=` naming an edge that does not exist in `edges=`, and `levels=` naming a vertex not in `nodes=`.** Both must be ignored, not crash.
7. **Duplicate edges `A-B,B-A` in an undirected graph.** Must be drawn once, not twice.

---

### Task 1: `graph` grammar — spec parser and layout engine

**Files:**
- Create: `src/render/diagrams/graph.js`
- Modify: `scripts/verify-waves.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseGraphSpec(params: object) -> GraphSpec` — pure.
  - `computeLayout(spec: GraphSpec, availWidth: number) -> GraphLayout` — pure.
  - `GraphSpec = { nodes: Array<{id:string,label:string,side:0|1}>, edges: Array<{u:string,v:string,label:string,directed:boolean,highlight:boolean}>, highlightNodes: Set<string>, levels: Map<string,number>, layout: string, showDegrees: boolean, directed: boolean, caption: string }`
  - `GraphLayout = { positions: Map<string,{x:number,y:number}>, width: number, height: number, routedEdges: Array<{u,v,label,directed,highlight,points:Array<[number,number]>}> }`

- [ ] **Step 1: Write the failing Node checks in `scripts/verify-waves.mjs`**

  Append a new section before the summary block. The verifier's own convention is `assert(condition, message)` (`scripts/verify-waves.mjs:112`); use it, and load the new module through the existing dynamic-import helper so the DOM stub is installed first.

  ```js
  // ---------------------------------------------------------------------------
  // 6. UNIVERSAL GRAPH GRAMMAR - spec parser & layout engine (Node-pure)
  // ---------------------------------------------------------------------------
  const graphMod = await import('../src/render/diagrams/graph.js');
  const { parseGraphSpec, computeLayout } = graphMod;

  const gSpec = parseGraphSpec({
      nodes: 'A,B,C,D',
      edges: 'A-B,B-C,C-D,D-A,A-C',
      layout: 'circular',
      showDegrees: 'true',
      highlight: 'C-D,D-A',
      highlightNodes: 'C'
  });

  assert(gSpec.nodes.length === 4, 'graph: nodes= parses 4 vertices');
  assert(gSpec.nodes[0].id === 'A' && gSpec.nodes[0].label === 'A', 'graph: node id defaults to label');
  assert(gSpec.edges.length === 5, 'graph: edges= parses 5 edges');
  assert(gSpec.edges.find(e => e.u === 'A' && e.v === 'C').highlight === false, 'graph: unlisted edge is not highlighted');
  assert(gSpec.edges.find(e => e.u === 'C' && e.v === 'D').highlight === true, 'graph: listed edge is highlighted');
  assert(gSpec.highlightNodes.has('C'), 'graph: highlightNodes= parses to a Set');
  assert(gSpec.showDegrees === true, 'graph: showDegrees=true parses as boolean');

  const gLayout = computeLayout(gSpec, 640);
  assert(gLayout.positions.size === 4, 'graph: layout positions every vertex');
  assert(gLayout.height > 0 && gLayout.width > 0, 'graph: layout reports a positive box');
  for (const p of gLayout.positions.values()) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'graph: layout coordinates are finite');
  }

  // bipartite split
  const bSpec = parseGraphSpec({ nodes: 'A,B|C,D', edges: 'A-C,A-D,B-C', layout: 'bipartite' });
  assert(bSpec.nodes.filter(n => n.side === 0).length === 2, 'graph: nodes= pipe splits into two sides');
  assert(bSpec.nodes.filter(n => n.side === 1).length === 2, 'graph: pipe side counts balance');
  const bLayout = computeLayout(bSpec, 640);
  const xs = [...bLayout.positions.values()].map(p => p.x);
  assert(Math.max(...xs) - Math.min(...xs) > 40, 'graph: bipartite layout uses two distinct columns');

  // hasse levels
  const hSpec = parseGraphSpec({ nodes: '1,2,4', edges: '1-2,1-4,2-4', layout: 'hasse', levels: '1:0,2:1,4:2' });
  assert(hSpec.levels.get('4') === 2, 'graph: levels= parses explicit level');
  const hLayout = computeLayout(hSpec, 640);
  const y1 = hLayout.positions.get('1').y, y4 = hLayout.positions.get('4').y;
  assert(y4 < y1, 'graph: hasse layout puts the highest level at the top');

  // REVIEW FOCUS 1: edge naming an unknown vertex is dropped, not fatal
  const dSpec = parseGraphSpec({ nodes: 'A,B', edges: 'A-B,A-Z,B-Z' });
  assert(dSpec.edges.length === 1, 'graph: edge with an undeclared vertex is dropped');

  // REVIEW FOCUS 6: highlight / levels naming unknown vertices are ignored
  const iSpec = parseGraphSpec({ nodes: 'A,B', edges: 'A-B', highlight: 'A-Z', highlightNodes: 'Q', levels: 'Z:5' });
  assert(iSpec.highlightNodes.size === 0, 'graph: highlightNodes= with an unknown id is ignored');
  assert(iSpec.levels.size === 0, 'graph: levels= with an unknown id is ignored');

  // REVIEW FOCUS 2: a single vertex with no edges must not divide by zero
  const sSpec = parseGraphSpec({ nodes: 'A', edges: '' });
  const sLayout = computeLayout(sSpec, 640);
  assert(sLayout.positions.size === 1, 'graph: single-vertex layout places one vertex');
  assert(Number.isFinite(sLayout.positions.get('A').x), 'graph: single-vertex x is finite');
  assert(Number.isFinite(sLayout.positions.get('A').y), 'graph: single-vertex y is finite');

  // REVIEW FOCUS 3: a self-loop is preserved as an edge
  const lSpec = parseGraphSpec({ nodes: 'A,B', edges: 'A-A,A-B' });
  assert(lSpec.edges.some(e => e.u === 'A' && e.v === 'A'), 'graph: self-loop survives parsing');

  // REVIEW FOCUS 4: a pipe inside a caption is sanitised
  const cSpec = parseGraphSpec({ caption: 'Figure 3 | the G graph' });
  assert(!cSpec.caption.includes('|'), 'graph: caption never contains a pipe');

  // REVIEW FOCUS 7: duplicate undirected edges collapse to one
  const dupSpec = parseGraphSpec({ nodes: 'A,B', edges: 'A-B,B-A' });
  assert(dupSpec.edges.length === 1, 'graph: duplicate undirected edge is collapsed');

  // every layout mode returns a usable box
  for (const mode of ['auto', 'layered', 'circular', 'bipartite', 'tree', 'hasse']) {
      const spec = parseGraphSpec({ nodes: 'A,B,C', edges: 'A-B,B-C', layout: mode });
      const lay = computeLayout(spec, 640);
      assert(lay.positions.size === 3 && lay.height > 0, `graph: layout=${mode} produces a usable box`);
  }
  ```

- [ ] **Step 2: Run the verifier and confirm it fails**

  Run: `node scripts/verify-waves.mjs`
  Expected: FAIL — the module `src/render/diagrams/graph.js` does not exist, so the dynamic import throws and the verifier exits non-zero.

- [ ] **Step 3: Create `src/render/diagrams/graph.js`**

  Write the module with this exact public surface. The file header comment must follow the convention of the sibling engines (`src/render/diagrams/schematic.js:1`).

  ```js
  /**
   * ScriptForge Universal Graph Engine (`src/render/diagrams/graph.js`)
   * Renders general undirected/directed graphs, Hasse diagrams, bipartite
   * graphs, layered graphs and trees with hand-drawn strokes.
   *
   * Spec: `[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C | layout=auto]`
   */
  ```

  Exports:

  ```js
  export function parseGraphSpec(params) { /* -> GraphSpec */ }
  export function computeLayout(spec, availWidth) { /* -> GraphLayout */ }
  export function estimateGraphHeight(params, availWidth) { /* -> number */ }
  export function renderGraph(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) { /* -> height used */ }
  ```

  **Parsing rules:**

  - `params.nodes` — comma-separated. Split the raw string on `|` first: text before the first `|` is side 0, text after is side 1. Each side is split on `,`. Within a side, an entry may be `id:label` — the id is the part before the first `:`, the label is the rest; if there is no `:`, label = id. Trim whitespace. Empty entries are dropped. A node with no `:` in a `nodes=` list gets `label = id`.
  - `params.edges` — comma-separated. An entry is `u-v` (undirected), `u->v` (directed), optionally followed by `:label`. The pair split must handle both `-` and `->`: split on `->` first (directed), else split on the first `-`. `u-v:label` → edge label is `label`. An edge whose `u` or `v` is not a declared node is **dropped**.
  - Undirected duplicate edges (`A-B` and `B-A`) collapse to one, keyed by the sorted pair. Directed duplicates (`A->B` and `B->A`) stay distinct.
  - A self-loop (`u === v`) is kept.
  - `params.layout` — one of `auto`, `layered`, `circular`, `bipartite`, `tree`, `hasse`; unknown values fall back to `auto`. `auto` resolves to: `hasse` if `levels` is non-empty; `bipartite` if any node has `side === 1`; `tree` if the graph has `n - 1` edges and is connected; `layered` if the edge set is acyclic after ignoring direction; otherwise `circular`.
  - `params.levels` — comma-separated `id:level`, parsed to a `Map`. An id not in `nodes` is ignored.
  - `params.highlight` — comma-separated edge tokens. A token matches an edge when its endpoint pair matches, in either order, ignoring direction. Edges that match become `highlight: true`.
  - `params.highlightNodes` — comma-separated ids → a `Set`. Ids not in `nodes` are ignored.
  - `params.showDegrees` — `true` (case-insensitive) → boolean `true`; anything else → `false`.
  - `params.directed` — `true` (case-insensitive) → boolean `true`; anything else → `false`. When true, every edge draws an arrowhead regardless of its `-`/`->` spelling.
  - `params.caption` — trimmed; **every `|` is replaced with a space** (REVIEW FOCUS 4).

  **Layout rules (`computeLayout`):**

  Work in a local coordinate space where `(0, 0)` is the top-left of the figure box; `renderGraph` translates by `startX`/`startY`.

  - Node radius `NODE_R = 20`. Level gap `LEVEL_GAP = 92`. Side gap `SIDE_GAP = 220`.
  - **`circular`** — place the `n` nodes on a circle of radius `R = max(70, n * 26)`, centred at `(W/2, R + 24)`, angle `2πi/n`. `W = min(availWidth, 660)`.
  - **`bipartite`** — side 0 in a column at `x = 0`, side 1 at `x = SIDE_GAP`. Within each column, order the vertices by the barycentre of their neighbours' indices in the opposite column; ties broken by original order. Vertices are spaced `COL_GAP = 74` apart vertically, centred on the column's midpoint.
  - **`tree`** — root = the vertex with in-degree 0 (ties → first declared). BFS from the root assigns depth. Children of a vertex are placed evenly across their parent's slot. Depth gap `LEVEL_GAP`.
  - **`layered`** — assign each vertex a layer: for a directed graph, longest-path layering over the DAG (a vertex's layer is `1 + max(layer of predecessors)`, sources are layer 0; if the digraph has a cycle, fall back to BFS distance). For an undirected graph, BFS distance from the highest-degree vertex (ties → first declared). Then run **two barycentre sweeps** — one top-down, one bottom-up — to order vertices within each layer, minimising edge crossings; keep the better of the two orders by counting crossings. Vertices in a layer are evenly spaced horizontally and centred.
  - **`hasse`** — uses `spec.levels`. A vertex's level is `levels.get(id)`, defaulting to 0. **Level 0 is at the bottom** and higher levels are drawn above it, so `y` decreases as the level increases. Vertices within a level are evenly spaced horizontally and centred.
  - **`auto`** — resolve as described in parsing, then delegate to that layout.
  - Every layout must produce finite coordinates for every vertex, including the single-vertex case. All widths are clamped to `min(availWidth, 660)` and the returned `height` must be at least `NODE_R * 2 + 24`.

  **Routing:**

  - `routedEdges` entries carry a `points` array of `[x, y]` pairs in the same local space.
  - For `circular` and `tree`, a straight two-point route `[p(u), p(v)]` is enough.
  - For `bipartite`, route as an orthogonal 3-point path: `[p(u), midX, p(v)]` where `midX = (p(u).x + p(v).x) / 2`.
  - For `layered` and `hasse`, route as an orthogonal 3-point path when the endpoints are in different layers: `[p(u), {x: p(u).x, y: midY}, {x: p(v).x, y: midY}, p(v)]` where `midY = (p(u).y + p(v).y) / 2`. When both endpoints are in the same layer, use a straight route.
  - A self-loop's `points` is `[[p(u).x, p(u).y - NODE_R - 14], [p(u).x + NODE_R + 16, p(u).y - NODE_R - 4], [p(u).x, p(u).y - NODE_R]]` — a small arc above the vertex.

- [ ] **Step 4: Run the verifier and confirm it passes**

  Run: `node scripts/verify-waves.mjs`
  Expected: PASS — the new section's assertions all pass and the summary reports 0 failed.

- [ ] **Step 5: Commit**

  ```bash
  git add src/render/diagrams/graph.js scripts/verify-waves.mjs
  git commit -m "feat(diagrams): add universal graph grammar - spec parser and layout engine"
  ```

---

### Task 2: `graph` grammar — renderer, dispatcher route, height estimate, stats counter

**Files:**
- Modify: `src/render/diagrams/graph.js` (add `renderGraph`, `estimateGraphHeight`)
- Modify: `src/render/diagrams/index.js` (route `graph`)
- Modify: `src/render/page.js` (height estimate for the `graph` type)
- Modify: `src/core/state.js` (`diagramStats`)
- Create: `scripts/qa/graph.assertions.js`

**Interfaces:**
- Consumes: `parseGraphSpec`, `computeLayout` from Task 1.
- Produces:
  - `renderGraph(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) -> number` — returns the vertical space consumed.
  - `estimateGraphHeight(params, availWidth) -> number`.
  - `state.diagramStats = { rendered: number, failed: number }` — reset at the start of every `renderFullPage()` call, incremented by the dispatcher.
  - The dispatcher accepts the diagram type `graph` (alias `generalgraph`).

- [ ] **Step 1: Write the failing browser QA suite `scripts/qa/graph.assertions.js`**

  The harness evaluates the file as an async IIFE that `return`s a `results` object of `{pass, detail}` entries (`scripts/qa/wave1.assertions.js:1` shows the `R()` helper; `scripts/qa/warness` style is `scripts/qa/harness.mjs:141`).

  ```js
  const results = {};
  const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

  try {
      const { parseGraphSpec, computeLayout, renderGraph, estimateGraphHeight } =
          await import('/src/render/diagrams/graph.js');

      // --- layout correctness, exercised in the browser ---
      const spec = parseGraphSpec({
          nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A,A-C', layout: 'circular', showDegrees: 'true'
      });
      const lay = computeLayout(spec, 640);
      R('layout.positionsComplete', lay.positions.size === 4, `size=${lay.positions.size}`);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of lay.positions.values()) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      R('layout.withinWidth', maxX - minX <= 660, `span=${maxX - minX}`);

      const est = estimateGraphHeight({ nodes: 'A,B,C', edges: 'A-B,B-C', layout: 'tree' }, 640);
      R('height.estimatePositive', est > 0 && Number.isFinite(est), `estimate=${est}`);

      // --- drawing on a real canvas ---
      const cv = document.createElement('canvas');
      cv.width = 820 * 2; cv.height = 600 * 2;
      const ctx = cv.getContext('2d');
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const rc = rough.canvas(cv);
      const counter = { count: 1 };
      const ink = { color: '#1b3b8c', secondary: '#2952b3', accent: '#b91c1c', alpha: 0.94, widthScale: 1.0 };
      const roughOpts = { stroke: ink.color, strokeWidth: 1.65, roughness: 0.55, bowing: 0.6, disableMultiStroke: true, seed: 7 };

      const used = renderGraph(ctx, rc,
          { nodes: 'A,B,C,D', edges: 'A-B,B-C,C-D,D-A,A-C', layout: 'circular', showDegrees: 'true', caption: 'Test figure' },
          40, 40, 640, counter, { glyphWarp: 0.65, diagRoughness: 0.55, diagBowing: 0.6, singlePassStroke: true },
          ink, roughOpts);

      R('render.returnsHeight', used > 0 && Number.isFinite(used), `used=${used}`);
      const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let painted = 0;
      for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 8) painted++;
      R('render.paintsInk', painted > 20, `sampled opaque pixels=${painted}`);

      // hasse: highest level must be drawn above the lowest
      const hSpec = parseGraphSpec({ nodes: '1,2,4', edges: '1-2,1-4,2-4', layout: 'hasse', levels: '1:0,2:1,4:2' });
      const hLay = computeLayout(hSpec, 640);
      R('hasse.higherLevelIsAbove', hLay.positions.get('4').y < hLay.positions.get('1').y,
          `y4=${hLay.positions.get('4').y} y1=${hLay.positions.get('1').y}`);

      // self-loop renders without throwing and still paints
      const lUsed = renderGraph(ctx, rc, { nodes: 'A,B', edges: 'A-A,A-B', layout: 'circular' },
          40, 400, 640, counter, {}, ink, roughOpts);
      R('render.selfLoopOk', lUsed > 0, `used=${lUsed}`);
  } catch (err) {
      results.error = { pass: false, detail: err.message };
  }

  return results;
  ```

- [ ] **Step 2: Run the QA suite and confirm it fails**

  Run: `node scripts/qa/harness.mjs scripts/qa/graph.assertions.js`
  Expected: FAIL — `renderGraph` / `estimateGraphHeight` are not exported yet, so the import yields `undefined` and the assertions fail.

  The harness needs the server running. Start it first: `npm run dev` (background), then run the harness.

- [ ] **Step 3: Implement `renderGraph` and `estimateGraphHeight` in `src/render/diagrams/graph.js`**

  `estimateGraphHeight(params, availWidth)` — parse the spec, compute the layout, return `layout.height + (spec.caption ? 30 : 0) + 24`.

  `renderGraph(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts)`:

  1. `const spec = parseGraphSpec(params); const layout = computeLayout(spec, availWidth);`
  2. Draw the **edges first**, so nodes sit on top of the wires:
     - Convert each edge's local `points` to absolute by adding `startX`/`startY`.
     - Draw with `rc.line(...)` per segment, or `rc.polyline(...)` for the whole path. Use `roughOpts` with `strokeWidth: 1.65 * (ink.widthScale || 1.0)`; for a highlighted edge use `1.9 * (ink.widthScale || 1.0)` and `ink.accent` as the stroke colour so the emphasis is visible against the base ink.
     - A directed edge (or any edge when `spec.directed` is true) gets an arrowhead: call `drawSharpArrowhead(ctx, rc, lastX, lastY, angle, 9, { ...roughOpts, stroke: strokeColour })` where `angle` is `Math.atan2(lastY - prevY, lastX - prevX)`.
     - A self-loop's three points are drawn as a curve: `rc.curve(points, roughOpts)`.
     - An edge label is drawn with `drawLabelOrMath(ctx, rc, edge.label, midX, midY, 17, charCounterRef, opts)` at the path's midpoint.
  3. Draw the **vertices**: `rc.circle(x, y, NODE_R, { ...roughOpts, strokeWidth: 1.8 * (ink.widthScale || 1.0), seed: charCounterRef.count++ })`. A highlighted vertex uses `ink.accent` as its stroke colour.
  4. Draw the **vertex labels** with `drawLabelOrMath(ctx, rc, node.label, x - labelWidth / 2, y + 6, 19, charCounterRef, opts)`, where `labelWidth ≈ node.label.length * 9`.
  5. When `spec.showDegrees` is true, draw `deg(v)` beside each vertex with `drawLabelOrMath(ctx, rc, `d(${node.id})`, x + NODE_R + 6, y - 6, 15, charCounterRef, opts)`. The degree is the number of **distinct** incident edges (a self-loop counts twice).
  6. When `spec.caption` is non-empty, draw it with `drawLabelOrMath(ctx, rc, spec.caption, startX + 8, startY + layout.height + 20, 17, charCounterRef, opts)`.
  7. Return `layout.height + (spec.caption ? 30 : 0) + 24`.

  Import the primitives at the top of `graph.js`:
  `import { drawSharpArrowhead, drawLabelOrMath } from './primitives.js';`

  Do **not** import `glyph.js` directly — `primitives.js` already depends on it, and `verify-waves.mjs` imports `graph.js`, so the import chain must stay DOM-safe at module scope.

- [ ] **Step 4: Add `diagramStats` to `src/core/state.js`**

  Add to the `state` object literal:

  ```js
  diagramStats: { rendered: 0, failed: 0 },
  ```

  This must land **before** the dispatcher change in Step 5, because the dispatcher increments the counter unguarded.

- [ ] **Step 5: Route the `graph` type in `src/render/diagrams/index.js`**

  Add the import at the top: `import { renderGraph } from './graph.js';`

  Add to the dispatcher, after the `schematic` branch and before the `canvas2d` branch:

  ```js
  } else if (diagType === 'graph' || diagType === 'generalgraph') {
      usedHeight = renderGraph(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
  }
  ```

  Also add the **stats counter** in the same file. `stateMod` is already imported as
  `import * as stateMod from '../../core/state.js';`.

  Inside the `try` block, immediately after the dispatch chain assigns `usedHeight`, add:

  ```js
  stateMod.state.diagramStats.rendered++;
  ```

  Inside the existing `catch` block, **before** the `console.warn`, add:

  ```js
  stateMod.state.diagramStats.failed++;
  ```

- [ ] **Step 6: Reset the counter at the start of each render and use the graph height estimate in `src/render/page.js`**

  In `renderFullPage()`, immediately after `const opts = getRenderOptions();` add:

  ```js
  if (state.diagramStats) { state.diagramStats.rendered = 0; state.diagramStats.failed = 0; }
  ```

  In `estimateDiagramHeight(specStr, lineSpacing = 34, availWidth = 640)`, add a branch before the `svg` branch:

  ```js
  if (diagType === 'graph' || diagType === 'generalgraph') return estimateGraphHeight(params, availWidth);
  ```

  and add the import: `import { estimateGraphHeight } from './diagrams/graph.js';`

  Change the call site in `renderFullPage()` from
  `estimateDiagramHeight(spec, lineSpacing)` to
  `estimateDiagramHeight(spec, lineSpacing, rightMargin - leftMargin - 16)`.

  `rightMargin` and `leftMargin` are already defined above that call.

- [ ] **Step 7: Run the QA suite and confirm it passes**

  Run: `node scripts/qa/harness.mjs scripts/qa/graph.assertions.js`
  Expected: PASS — all checks report `PASS` and the summary line reads `N/N checks passed`, with `CONSOLE_ERRORS []`.

- [ ] **Step 8: Confirm the existing gates still pass**

  Run: `node scripts/verify-waves.mjs`
  Expected: PASS, 0 failed.

  Run: `node scripts/qa/harness.mjs scripts/qa/wave1.assertions.js` and `node scripts/qa/harness.mjs scripts/qa/wave2.assertions.js`
  Expected: PASS — the Studio is unchanged.

- [ ] **Step 9: Commit**

  ```bash
  git add src/render/diagrams/graph.js src/render/diagrams/index.js src/render/page.js src/core/state.js scripts/qa/graph.assertions.js
  git commit -m "feat(diagrams): wire the graph grammar into the dispatcher and compositor"
  ```

---

### Task 3: Page markup — bullets and callouts

**Files:**
- Modify: `src/render/page.js`
- Create: `scripts/qa/notes.assertions.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: two new line prefixes in the renderer:
  - A line whose trimmed text starts with `- ` or `* ` renders as a bullet dot plus the remaining text, indented 26 px past the normal left margin, with the wrapped continuation lines aligned to the text.
  - A line whose trimmed text starts with `> ` renders as the remaining text indented 22 px past the normal left margin, preceded by a short vertical accent rule at the left margin.
  - Both are additive: any line not starting with those prefixes renders exactly as before.

- [ ] **Step 1: Write the failing QA suite `scripts/qa/notes.assertions.js`**

  ```js
  const results = {};
  const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

  const LEFT_MARGIN = 92;

  function inkBounds(canvas) {
      const ctx = canvas.getContext('2d');
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0;
      for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
              if (d[(y * canvas.width + x) * 4 + 3] > 8) {
                  count++;
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
              }
          }
      }
      return { minX, maxX, minY, maxY, count };
  }

  const editor = document.getElementById('docInput');
  R('dom.editorPresent', !!editor, editor ? 'present' : 'MISSING');

  const before = editor.value;

  try {
      // --- bullets ---
      editor.value = '- First bullet item\n- Second bullet item\nPlain paragraph line';
      const { scheduleRender } = await import('/src/ui/controls.js');
      scheduleRender();
      await new Promise(r => setTimeout(r, 400));
      const b = inkBounds(document.getElementById('notebookCanvas'));
      R('bullets.renderInk', b.count > 200, `pixels=${b.count}`);
      R('bullets.indentedPastMargin', b.minX > LEFT_MARGIN * 2 - 20,
          `minX=${b.minX} expected > ${LEFT_MARGIN * 2 - 20}`);

      // --- callouts ---
      editor.value = '> Exam tip: this line is indented and ruled.';
      scheduleRender();
      await new Promise(r => setTimeout(r, 400));
      const c = inkBounds(document.getElementById('notebookCanvas'));
      R('callouts.renderInk', c.count > 100, `pixels=${c.count}`);
      R('callouts.indentedPastMargin', c.minX > LEFT_MARGIN * 2 - 20, `minX=${c.minX}`);

      // --- plain text is unaffected: a hyphen mid-line must NOT become a bullet ---
      editor.value = 'a value of 3 - 4 = -1 is written inline';
      scheduleRender();
      await new Promise(r => setTimeout(r, 400));
      const p = inkBounds(document.getElementById('notebookCanvas'));
      R('plain.hyphenNotBulleted', p.minX <= LEFT_MARGIN * 2 + 30, `minX=${p.minX}`);

      // --- page break still works ---
      editor.value = 'page one\n---PAGE---\npage two';
      scheduleRender();
      await new Promise(r => setTimeout(r, 500));
      const pages = document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)');
      R('pagebreak.twoPages', pages.length >= 2, `pages=${pages.length}`);
  } catch (err) {
      results.error = { pass: false, detail: err.message };
  } finally {
      editor.value = before;
      const { scheduleRender } = await import('/src/ui/controls.js');
      scheduleRender();
  }

  return results;
  ```

- [ ] **Step 2: Run the QA suite and confirm it fails**

  Run: `node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
  Expected: FAIL — `bullets.indentedPastMargin` and `callouts.indentedPastMargin` fail, because a `- ` line currently renders the literal hyphen at the normal left margin.

- [ ] **Step 3: Implement bullets in `src/render/page.js`**

  In `renderFullPage()`, insert bullet/callout detection at the **top of section C**, before the `headingMatch` is computed, so a `-` line is never treated as prose and never matched as a heading:

  ```js
  const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
  const calloutMatch = line.match(/^(\s*)>\s+(.*)$/);
  let indentPx = 0;
  let isBullet = false;
  let isCallout = false;
  if (calloutMatch) {
      indentPx = 22;
      isCallout = true;
      line = calloutMatch[2];
  } else if (bulletMatch) {
      indentPx = 26;
      isBullet = true;
      line = bulletMatch[2];
  }
  ```

  A `- ` line must be detected **before** the heading match, but a heading that begins with `>` or `-` in its text (for example `- **not** a heading`) must still be checked for `#` first. The simplest correct order is: run the heading match first, and only when it does **not** match, run the bullet/callout detection. A heading line never reaches the bullet branch, and a bullet line never reaches the heading branch, because a heading must begin with `#` and a bullet must begin with `-`, `*` or `>`.

  So the exact placement is: keep the existing `const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);` as it is; **inside its `else` branch**, insert the bullet/callout detection block above. `indentPx`, `isBullet` and `isCallout` must be declared before the `if (headingMatch)` so the heading branch can also see them (they stay `0`/`false` there).

  Apply `indentPx` to the horizontal origin. The origin is computed as:

  ```js
  let curX = leftMargin + 10 + (noise.hash(curLineIdx * 31.7 + opts.handSeed) - 0.3) * 8 * opts.baselineDrift;
  ```

  Change it to:

  ```js
  let curX = leftMargin + 10 + indentPx + (noise.hash(curLineIdx * 31.7 + opts.handSeed) - 0.3) * 8 * opts.baselineDrift;
  ```

  and change the wrap reset so continuation lines keep the same indent:

  ```js
  curX = leftMargin + 12 + indentPx + (noise.hash(curLineIdx * 19.3) - 0.5) * 6;
  ```

  **Bullet dot.** Draw it before the token loop, using the same `ink` the function already resolves
  (`const ink = INK_PROFILES[opts.inkKey] || INK_PROFILES.ballpoint_blue;` — add this line if it is
  not already in scope):

  ```js
  if (isBullet) {
      const bulletY = getBaselineY(curLineIdx);
      surface.rc.circle(leftMargin + 4 + indentPx - 8, bulletY - 5, 2.6, {
          stroke: ink.color, strokeWidth: 1.5, roughness: 0.5, seed: charCounterRef.count++
      });
      curX += 16;
  }
  ```

  **Callout rule.** Draw a short vertical accent rule to the left of the text, at `x = leftMargin + 4`:

  ```js
  if (isCallout) {
      const ruleY = getBaselineY(curLineIdx);
      surface.rc.line(leftMargin + 4, ruleY - 11, leftMargin + 4, ruleY + 11, {
          stroke: ink.accent, strokeWidth: 1.8, roughness: 0.5, seed: charCounterRef.count++
      });
  }
  ```

  Both blocks go immediately after `curX` is computed and before the `for (let t = 0; ...)` token loop.

- [ ] **Step 4: Run the QA suite and confirm it passes**

  Run: `node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
  Expected: PASS — `N/N checks passed`, `CONSOLE_ERRORS []`.

- [ ] **Step 5: Confirm the existing gates still pass**

  Run: `node scripts/verify-waves.mjs`
  Expected: PASS.

  Run: `node scripts/qa/harness.mjs scripts/qa/wave1.assertions.js`, `wave2`, `wave3`, `mobile`
  Expected: PASS for all four — the Studio's presets and layout are unaffected.

- [ ] **Step 6: Commit**

  ```bash
  git add src/render/page.js scripts/qa/notes.assertions.js
  git commit -m "feat(render): add bullet and callout line styles to the page compositor"
  ```

---

### Task 4: Static server root argument

**Files:**
- Modify: `scripts/serve.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `node scripts/serve.mjs [port] [root]` — the second argument overrides the served root. Default stays `resolve(import.meta.dirname, '..')`.
  - `npm run notes` — starts the server with the root two levels above the repo, so `http://localhost:8000/ScriptForge/notes.html` and `http://localhost:8000/Discrete%20Mathematics/Notes/*.md` are both reachable.
  - `npm run dev` — unchanged.

- [ ] **Step 1: Write the failing shell check**

  Run: `node scripts/serve.mjs 8899 /tmp/opencode` then, in a second shell, `curl -s -o /dev/null -w "%{http_code}" http://localhost:8899/anything.txt`
  Expected: `404` — the current server ignores the second argument and serves the repo root, so a path outside it is forbidden (`403`) or not found. The check to pin the behaviour is: a file under the requested root **is** reachable.

  Concretely:
  ```bash
  mkdir -p /tmp/opencode/serve-root-probe
  printf 'probe' > /tmp/opencode/serve-root-probe/probe.txt
  node scripts/serve.mjs 8899 /tmp/opencode/serve-root-probe &
  sleep 1
  curl -s -w "\nHTTP:%{http_code}\n" http://localhost:8899/probe.txt
  kill %1
  ```
  Expected before the change: `HTTP:404` (the probe file is outside the repo root). Expected after: the body `probe` and `HTTP:200`.

- [ ] **Step 2: Implement the root argument in `scripts/serve.mjs`**

  Replace the `ROOT` constant:

  ```js
  const DEFAULT_ROOT = resolve(import.meta.dirname, '..');
  const ROOT = resolve(process.argv[3] || process.env.SERVE_ROOT || DEFAULT_ROOT);
  ```

  Everything else — the path-traversal guard, the content types, the 404 handler — stays as it is. The guard already compares against `ROOT`, so it now protects the new root.

  Update the header comment to document the new usage:

  ```
   *   node scripts/serve.mjs [port] [root]
   *
   * The optional root argument overrides the served directory. It defaults to
   * the repository root; `npm run notes` passes a parent so that both the app
   * and the study-chapter folder are reachable from one server.
  ```

- [ ] **Step 3: Add the npm scripts in `package.json`**

  Read the existing `scripts` object first and keep its shape. Add:

  ```json
  "notes": "node scripts/serve.mjs 8000 ../.."
  ```

  Do not change the existing `dev` or `start` entries.

- [ ] **Step 4: Re-run the shell check and confirm it passes**

  Re-run the probe block from Step 1.
  Expected: body `probe`, `HTTP:200`.

  Then confirm the default root still works:
  ```bash
  node scripts/serve.mjs 8898 &
  sleep 1
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8898/index.html
  kill %1
  ```
  Expected: `200`.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/serve.mjs package.json
  git commit -m "feat(dev): allow the static server to serve a chosen root"
  ```

---

### Task 5: The notebook reader — manifest, shell, styles, chapter navigation

**Files:**
- Create: `src/notes/manifest.js`
- Create: `src/notes/reader.js`
- Create: `notes.html`
- Create: `assets/styles/notes.css`
- Modify: `scripts/qa/notes.assertions.js`

**Interfaces:**
- Consumes: `renderFullPage` from `src/render/page.js`; `exportMultiPagePdf`, `exportCurrentPagePng`, `buildMultiPagePdfBlob` from `src/render/pdfExport.js`; `setHandSeed`, `setInkKey`, `state` from `src/core/state.js`.
- Produces:
  - `src/notes/manifest.js` exports `CHAPTERS`, an array of:
    `{ id: string, order: number, file: string, title: string, priority: 'P1'|'P2'|'P3'|'P4', difficulty: 1|2|3, minutes: number, lectures: string[], t9: string[], summary: string }`
    `file` is a URL relative to `notes.html` — `'../Discrete Mathematics/Notes/03-trees.md'`.
  - `src/notes/reader.js` exports:
    - `loadChapter(index: number) -> Promise<string>` — fetches the chapter text, writes it into `#docInput`, calls `renderFullPage()`.
    - `exportAllChapters() -> Promise<Blob>` — renders every chapter in order and returns one merged PDF blob.
    - `initReader() -> void` — wires the DOM.
  - The reader page must expose these DOM ids so the existing compositor and QA harness work: `docInput`, `pagesContainer`, `notebookCanvas`, `canvasWrapper`, `pageCountBadge`, `renderTimer`, `charStats`.

- [ ] **Step 1: Write the failing QA additions to `scripts/qa/notes.assertions.js`**

  The reader is a separate page, so these assertions run against `notes.html`, not the Studio. Extend the harness **first** so it can target a page: add a `QA_PAGE` environment variable that is appended to `BASE` for `Page.navigate`, defaulting to `''`.

  In `scripts/qa/harness.mjs`, change:

  ```js
  await S('Page.navigate', { url: BASE });
  ```

  to:

  ```js
  const PAGE = process.env.QA_PAGE || '';
  await S('Page.navigate', { url: BASE + PAGE });
  ```

  and make the readiness wait tolerant of the reader's DOM: the reader must still provide `#notebookCanvas` and a `#charStats` whose text matches `/\d+\s+glyphs/`, so **no change to `READY_EXPR` is needed** — the reader contract requires it.

  Then append to `scripts/qa/notes.assertions.js`:

  ```js
  // ---------- reader-specific checks (run when loaded from notes.html) ----------
  const isReader = !!document.getElementById('chapterList');
  R('reader.detected', isReader, `isReader=${isReader}`);

  if (isReader) {
      R('reader.manifestLoaded', (document.querySelectorAll('#chapterList button[data-chapter]').length) >= 11,
          `entries=${document.querySelectorAll('#chapterList button[data-chapter]').length}`);
      R('reader.priorityBadges', document.querySelectorAll('#chapterList .badge-priority').length >= 11,
          `badges=${document.querySelectorAll('#chapterList .badge-priority').length}`);
      R('reader.sortModes', !!document.getElementById('sortMode'), 'sortMode select present');
      R('reader.filterBox', !!document.getElementById('chapterFilter'), 'filter input present');
      R('reader.exportButtons', !!document.getElementById('exportAllBtn') && !!document.getElementById('exportChapterBtn'),
          'export buttons present');

      const first = document.querySelector('#chapterList button[data-chapter]');
      if (first) {
          first.click();
          await new Promise(r => setTimeout(r, 900));
          const stats = document.getElementById('charStats');
          R('reader.chapterRenders', !!stats && /\d+\s+glyphs/.test(stats.textContent || ''),
              stats ? stats.textContent : 'no charStats');
          const pages = document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)');
          R('reader.pagesProduced', pages.length >= 1, `pages=${pages.length}`);
      }

      // REVIEW FOCUS 5: an empty chapter body must still produce a page
      try {
          const { loadChapter } = await import('/src/notes/reader.js');
          const editor = document.getElementById('docInput');
          editor.value = '';
          const { renderFullPage } = await import('/src/render/page.js');
          renderFullPage();
          await new Promise(r => setTimeout(r, 300));
          const pages = document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)');
          R('reader.emptyBodyStillRenders', pages.length >= 1, `pages=${pages.length}`);
      } catch (err) {
          R('reader.emptyBodyStillRenders', false, err.message);
      }
  }
  ```

- [ ] **Step 2: Run the reader QA and confirm it fails**

  Run: `QA_BASE=http://localhost:8000/ScriptForge QA_PAGE=/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
  Expected: FAIL — `notes.html` does not exist, so the page 404s and `reader.detected` is false.

- [ ] **Step 3: Create `src/notes/manifest.js`**

  Export the chapter list. Use these exact values (they come from the spec's exam-weighted order):

  ```js
  export const CHAPTERS = [
      { id: '00', order: 0, file: '../Discrete Mathematics/Notes/00-exam-map-and-priority.md',
        title: 'Exam map & priority order', priority: 'P1', difficulty: 1, minutes: 10,
        lectures: [], t9: [], summary: 'Which topic to revise first, and how the marks are distributed.' },
      { id: '01', order: 1, file: '../Discrete Mathematics/Notes/01-marks-and-algorithm-proofs.md',
        title: 'How marks are awarded & proving algorithms correct', priority: 'P1', difficulty: 2, minutes: 25,
        lectures: ['L18'], t9: [], summary: 'The rubric: what each part of an answer must contain.' },
      { id: '02', order: 2, file: '../Discrete Mathematics/Notes/02-graph-fundamentals.md',
        title: 'Graph fundamentals', priority: 'P1', difficulty: 2, minutes: 40,
        lectures: ['L22'], t9: ['P3', 'P4', 'P5', 'P6', 'P8', 'P11', 'P14'],
        summary: 'Degrees, the handshaking lemma, bipartite graphs, complement.' },
      { id: '03', order: 3, file: '../Discrete Mathematics/Notes/03-trees.md',
        title: 'Trees & binary trees', priority: 'P1', difficulty: 3, minutes: 55,
        lectures: ['L28'], t9: ['P2', 'P5', 'P9', 'P10', 'P12', 'P13', 'P20'],
        summary: 'n-1 edges, leaves, longest path, spanning trees, degree sequences.' },
      { id: '04', order: 4, file: '../Discrete Mathematics/Notes/04-connectivity.md',
        title: 'Connectivity, cut vertices & cut edges', priority: 'P1', difficulty: 3, minutes: 45,
        lectures: ['L25'], t9: ['P1', 'P12', 'P14'],
        summary: 'Components, cut vertices, bridges, k-connectedness, strong vs weak.' },
      { id: '05', order: 5, file: '../Discrete Mathematics/Notes/05-matching-and-hall.md',
        title: 'Matching & Hall’s theorem', priority: 'P1', difficulty: 3, minutes: 45,
        lectures: ['L24'], t9: ['P15', 'P16', 'P17', 'P18', 'P19'],
        summary: 'Maximal vs maximum, perfect matching, Hall’s condition and its corollaries.' },
      { id: '06', order: 6, file: '../Discrete Mathematics/Notes/06-hamilton-and-isomorphism.md',
        title: 'Hamiltonian paths & graph isomorphism', priority: 'P2', difficulty: 3, minutes: 40,
        lectures: ['L27'], t9: ['P1', 'P7', 'P10'],
        summary: 'Dirac, Ore, the complement, and the isomorphism checklist.' },
      { id: '07', order: 7, file: '../Discrete Mathematics/Notes/07-induction.md',
        title: 'Mathematical induction & strong induction', priority: 'P2', difficulty: 2, minutes: 35,
        lectures: ['L16', 'L17'], t9: ['P13'],
        summary: 'The weak and strong templates, and the stronger-statement trick.' },
      { id: '08', order: 8, file: '../Discrete Mathematics/Notes/08-relations.md',
        title: 'Relations', priority: 'P3', difficulty: 2, minutes: 30,
        lectures: ['L19'], t9: [], summary: 'The five property tests and the two class theorems.' },
      { id: '09', order: 9, file: '../Discrete Mathematics/Notes/09-partial-orders-hasse-lattices.md',
        title: 'Partial orders, Hasse diagrams & lattices', priority: 'P3', difficulty: 3, minutes: 45,
        lectures: ['L20', 'L21'], t9: [],
        summary: 'The 3-step Hasse recipe, maximal vs greatest, join and meet.' },
      { id: '10', order: 10, file: '../Discrete Mathematics/Notes/10-safety-net-euler-planarity.md',
        title: 'Safety net: Euler, planarity, colouring, spanning trees', priority: 'P4', difficulty: 3, minutes: 25,
        lectures: ['L23', 'L26'], t9: [],
        summary: 'Insurance material: one-line answers for the questions that might appear.' }
  ];
  ```

  Also export `export const CHAPTERS_BY_ID = Object.fromEntries(CHAPTERS.map(c => [c.id, c]));`

- [ ] **Step 4: Create `notes.html`**

  A standalone page that mirrors the Studio's DOM contract. It must contain, with these exact ids:

  - `<textarea id="docInput">` — hidden (`class="hidden"`), holds the current chapter text.
  - `<div id="canvasWrapper"><div id="pagesContainer"><canvas id="notebookCanvas"></canvas></div></div>`
  - `<span id="pageCountBadge">`, `<span id="renderTimer">`, `<span id="charStats">`
  - `<div id="chapterList">` — populated by the reader.
  - `<select id="sortMode">` with options `exam` and `textbook`.
  - `<input id="chapterFilter">`
  - `<button id="exportChapterBtn">` and `<button id="exportAllBtn">`
  - `<div id="chapterTitle">`

  Head: load `assets/vendor/rough.js` (not the Lucide CDN — the reader must work fully offline), `assets/styles/fonts.css`, `assets/styles/tailwind.css`, `assets/styles/app.css`, `assets/styles/notes.css`.

  Body script tag: `<script type="module" src="src/notes/reader.js"></script>`.

  Give the reader a two-column layout: a fixed 280 px left rail (`#chapterList`, filter, sort select) and the page stack on the right. The reader must be usable at 375 px width too: below 1024 px the rail becomes a collapsible drawer above the pages.

  Include `<div id="notebookCanvas">` — no: it must be a `<canvas id="notebookCanvas">`.

- [ ] **Step 5: Create `src/notes/reader.js`**

  ```js
  import { CHAPTERS } from './manifest.js';
  import { renderFullPage } from '../render/page.js';
  import { exportMultiPagePdf, exportCurrentPagePng, buildMultiPagePdfBlob } from '../render/pdfExport.js';
  import { setHandSeed, setInkKey, state } from '../core/state.js';
  ```

  - `buildChapterList()` — render one `<button data-chapter="{id}">` per chapter into `#chapterList`, each containing: the order number, the title, a `<span class="badge-priority badge-{priority}">` with the priority text, a `<span class="badge-difficulty">` with `difficulty` stars, the minutes, and the T9 problem numbers.
  - `applyFilter()` — read `#chapterFilter` and `#sortMode`; hide non-matching buttons; reorder the buttons by `order` (textbook) or by `priority` then `order` (exam).
  - `loadChapter(index)` — `const text = await (await fetch(CHAPTERS[index].file)).text();` then `document.getElementById('docInput').value = text;` then `renderFullPage();` then update `#chapterTitle` and the active button state. Catch a fetch failure and show the error in `#chapterTitle` rather than throwing.
  - `exportAllChapters()` — for each chapter in order: `await loadChapter(i)`, then collect `document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)')` and push those canvases into an array. Then `buildMultiPagePdfBlob(allCanvases)` and return the blob. Because `renderFullPage` reuses the same canvases, **snapshot each chapter's canvases into a detached copy before moving on**: for each canvas, create a new canvas of the same pixel size, `drawImage` the source onto it, and push the copy. That preserves every chapter's pages for the merged PDF.
  - `initReader()` — build the list, wire the filter, the sort select, the chapter buttons, the export buttons, and load chapter 0. Also wire the ink buttons and the seed input if present.

- [ ] **Step 6: Create `assets/styles/notes.css`**

  Styles for the reader chrome only: the left rail, the chapter rows, the priority badges (one colour per priority band), the difficulty stars, and the mobile drawer. Reuse the CSS variables already defined in `assets/styles/app.css` — read that file first and use its variable names; do not introduce a second palette.

- [ ] **Step 7: Run the reader QA and confirm it passes**

  Start the server with the notes root and run the harness:
  ```bash
  npm run notes &
  sleep 1
  QA_BASE=http://localhost:8000/ScriptForge QA_PAGE=/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js
  ```
  Expected: PASS — `N/N checks passed`, `CONSOLE_ERRORS []`, `FAILED_REQUESTS []`.

  Note: the chapter files do not exist yet (they are the next plan). `loadChapter` must therefore **not** throw on a 404 — the reader shows the error in `#chapterTitle`. The QA suite's `reader.chapterRenders` check depends on a real chapter, so this task creates the **first real chapter** at
  `/home//Discrete Mathematics/Notes/00-exam-map-and-priority.md` with actual content — the
  exam map: the priority order of the topics, the T9 problem-to-topic mapping, and the time budget.
  It must be written in ScriptForge DSL, not filler, because the content plan will overwrite it with
  the full chapter and because a placeholder chapter would make the QA check meaningless.

  Write it with this shape:

  ```
  # Exam map & priority order
  P1 · Difficulty ★ · 10 min · Front matter

  ## Which topic to revise first
  ...
  ## How the 20 T9 problems map to the topics
  [DIAGRAM: grid | cols=T9,Topic,Difficulty | rows=P1~Graph fundamentals~Medium;P13~Trees~Easy;P17~Matching~Medium]
  ## Time budget
  ...
  ```

  The exact content is authored in the next plan; this task only needs enough real content to make
  the chapter render at least one page with real ink.

  Create the directory first:
  ```bash
  mkdir -p "/home//Discrete Mathematics/Notes"
  ```

- [ ] **Step 8: Confirm the existing gates still pass**

  Run: `node scripts/verify-waves.mjs` and the four existing QA suites.
  Expected: PASS for all.

- [ ] **Step 9: Commit**

  ```bash
  git add src/notes/manifest.js src/notes/reader.js notes.html assets/styles/notes.css scripts/qa/notes.assertions.js scripts/qa/harness.mjs
  git commit -m "feat(notes): add the notebook reader shell with chapter navigation and PDF export"
  ```

---

### Task 6: Merged all-chapters PDF export

**Files:**
- Modify: `src/notes/reader.js`
- Modify: `scripts/qa/notes.assertions.js`

**Interfaces:**
- Consumes: `buildMultiPagePdfBlob` from `src/render/pdfExport.js`; `CHAPTERS` from `src/notes/manifest.js`.
- Produces: `exportAllChapters() -> Promise<Blob>` returns a single PDF containing every chapter's pages, in exam-priority order.

- [ ] **Step 1: Write the failing QA check**

  Append to `scripts/qa/notes.assertions.js`, inside the `if (isReader)` block:

  ```js
  // ---------- merged all-chapters export ----------
  try {
      const { exportAllChapters } = await import('/src/notes/reader.js');
      const blob = await exportAllChapters();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const head = String.fromCharCode(...bytes.slice(0, 8));
      const tail = String.fromCharCode(...bytes.slice(-8));
      R('merged.isPdf', head.startsWith('%PDF-'), `head=${head}`);
      R('merged.terminated', tail.includes('%%EOF'), `tail=${tail}`);
      R('merged.nonTrivial', bytes.length > 20000, `bytes=${bytes.length}`);
      // page count: count "/Type /Page" occurrences
      const text = new TextDecoder('latin1').decode(bytes);
      const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
      R('merged.hasManyPages', pageCount >= 11, `pages=${pageCount}`);
  } catch (err) {
      R('merged.isPdf', false, err.message);
  }
  ```

  `pageCount >= 11` is the floor: one page per chapter.

- [ ] **Step 2: Run the QA suite and confirm it fails**

  Run: `QA_BASE=http://localhost:8000/ScriptForge QA_PAGE=/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
  Expected: FAIL — `exportAllChapters` does not exist yet, or the merged blob has fewer than 11 pages.

- [ ] **Step 3: Implement `exportAllChapters` in `src/notes/reader.js`**

  ```js
  export async function exportAllChapters() {
      const snapshots = [];
      for (let i = 0; i < CHAPTERS.length; i++) {
          await loadChapter(i);
          const canvases = Array.from(document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)'));
          for (const cv of canvases) {
              const copy = document.createElement('canvas');
              copy.width = cv.width;
              copy.height = cv.height;
              copy.getContext('2d').drawImage(cv, 0, 0);
              snapshots.push(copy);
          }
      }
      return buildMultiPagePdfBlob(snapshots);
  }
  ```

  Wire it to `#exportAllBtn` so the click handler builds the blob and downloads it as `ScriptForge_Notebook_All_<timestamp>.pdf`, using the same anchor-and-`revokeObjectURL` pattern as `exportMultiPagePdf` (`src/render/pdfExport.js:139`).

  `#exportChapterBtn` calls the existing `exportMultiPagePdf()`.

  `loadChapter` must await the render completing before the canvases are snapshotted. `renderFullPage()` is synchronous, but the chapter fetch is not — `await` the fetch, then call `renderFullPage()`, then `await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))` so the browser has painted before the snapshot.

- [ ] **Step 4: Run the QA suite and confirm it passes**

  Run: `QA_BASE=http://localhost:8000/ScriptForge QA_PAGE=/notes.html node scripts/qa/harness.mjs scripts/qa/notes.assertions.js`
  Expected: PASS — `N/N checks passed`, and the merged-PDF checks report `pages >= 11`.

- [ ] **Step 5: Confirm the existing gates still pass**

  Run: `node scripts/verify-waves.mjs` and the four existing QA suites.
  Expected: PASS for all.

- [ ] **Step 6: Commit**

  ```bash
  git add src/notes/reader.js scripts/qa/notes.assertions.js
  git commit -m "feat(notes): export every chapter as a single merged PDF"
  ```

---

## Definition of done for this plan

1. `node scripts/verify-waves.mjs` passes with the new graph-grammar section.
2. `scripts/qa/graph.assertions.js`, `scripts/qa/notes.assertions.js` and the four existing QA suites all pass.
3. `npm run notes` serves the reader at `http://localhost:8000/ScriptForge/notes.html`; the chapter list renders with priority badges, difficulty stars and minutes; clicking a chapter renders notebook pages.
4. `#exportAllBtn` produces one PDF whose page count is at least the number of chapters.
5. The Studio (`index.html`) is unchanged: the same demo presets, the same layout, the same QA results.
6. The next plan can author chapters against a stable `graph` spec surface and a stable `CHAPTERS` manifest.

## Known deviations from the spec

- **Added `src/notes/reader.js`.** The spec listed only `notes.html` for the reader. Putting ~250 lines of behaviour inline in the HTML would make the reader untestable by import and impossible to extend; a module beside `manifest.js` follows the project's existing `src/` layout.
- **`scripts/qa/harness.mjs` gains a `QA_PAGE` environment variable.** The harness hard-coded `BASE` for navigation, so it could only ever test the Studio. The reader is a second page and needs its own target.
