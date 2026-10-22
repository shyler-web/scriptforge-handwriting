# Design — ScriptForge Discrete Mathematics Notebook

**Date:** 2026-10-22
**Status:** Approved for planning
**Author:** design session with the project owner

---

## 1. Problem

The owner has a 4.5-hour Discrete Mathematics exam (graph-theory heavy) and a course
pack at `/home//Discrete Mathematics/` containing:

| Source | Size | Content |
|---|---|---|
| `Lessons/01..10-*.md` | ~596 KB | 10 teaching lessons, 123 practice questions with solutions |
| `notes/16..29, T9-*.md` | ~784 KB | Lecture-derived notes + the T9 20-problem model paper with full model solutions |
| `Lecture_slides/*.pdf` | ~40 MB | 13 slide decks; `corpus_text/*.txt` holds their extracted text |
| `Cheatsheets/00..11-*.md` | ~120 KB | Recall drills + a T9 per-problem attack plan |
| `Diagrams/*.html` | ~300 KB | Four interactive labs (Hasse builder, matching lab, connectivity lab, graph explorer) |

That pack is thorough and was audited (`AUDIT_REPORT.md`: 6 defects fixed, 12 open), but it
is **Markdown for a screen**. It is not:

- prioritised by exam weight and difficulty (ordering is textbook, not exam-driven);
- diagram-rich (graph theory figures live only in the slide images);
- rendered as something you can actually *study from* or print and work through;
- corrected against first principles — the audit fixed mechanical defects only.

Meanwhile the owner has **ScriptForge**: a browser studio that renders a small markup
language into hand-written notebook pages with hand-drawn diagrams, 2D math, automatic
pagination and client-side multi-page PDF export.

**Goal.** Use ScriptForge to produce a complete, exam-weighted, corrected, diagram-rich
Discrete Mathematics study notebook that can be read on screen and printed as a PDF.

---

## 2. Decisions taken (owner-confirmed)

| # | Decision | Rationale |
|---|---|---|
| D1 | Cover all 10 topics, ordered by exam priority | Completeness plus efficiency; ordering is the only thing that changes |
| D2 | New `notes.html` entry point | One notebook reader, no new content buried in `presets.js` |
| D3 | Extend ScriptForge with a `graph` grammar | Regenerable figures beat one-off hand-plotted SVGs |
| D4 | Tiered chapters: exam core + full reference | The 8–12 page core is what you read the night before; the full lesson text stays as reference |
| D5 | Curated problems: existing + new gap-fillers | Nothing wasted, coverage gaps closed |
| D6 | Notes in English | Course material, slides and exam are English |

---

## 3. Deliverable shape

### 3.1 ScriptForge additions

```
notes.html                          NEW   the notebook reader
src/render/diagrams/graph.js        NEW   6th grammar: general-graph layout engine
src/render/diagrams/index.js        EDIT  +1 route line
src/render/page.js                  EDIT  +bullet/callout rendering, +graph height estimate
src/notes/manifest.js               NEW   chapter index (path, priority, difficulty, minutes, T9 links)
src/core/state.js                   EDIT  +diagramStats counter for QA
scripts/serve.mjs                   EDIT  +optional root argument
scripts/qa/graph.assertions.js      NEW   QA for the graph grammar
scripts/qa/notes.assertions.js      NEW   QA for the notes shell
assets/styles/notes.css             NEW   notes-shell chrome (sidebar, badges)
```

### 3.2 Course-folder additions

```
/home//Discrete Mathematics/Notes/
  00-exam-map-and-priority.md          front matter: priority order, T9 map, time budget
  01-marks-and-algorithm-proofs.md      L18  the rubric: how marks are actually awarded
  02-graph-fundamentals.md              L22
  03-trees.md                           L28
  04-connectivity.md                    L25
  05-matching-and-hall.md               L24
  06-hamilton-and-isomorphism.md        L27
  07-induction.md                       L16/17
  08-relations.md                       L19
  09-partial-orders-hasse-lattices.md   L20/21
  10-safety-net-euler-planarity.md      L23/26
  CORRECTIONS.md                        every correction, original -> corrected
```

### 3.3 Chapter order (exam-weighted)

Derived from the T9 problem index's own lecture attribution and difficulty column:

| Ch | Topic | Lectures | T9 problems | Priority |
|---|---|---|---|---|
| 00 | Exam map & priority order | — | — | front matter |
| 01 | Marks and algorithm correctness | L18 | — (supplies the mark scheme) | P1 |
| 02 | Graph fundamentals | L22 | P3, P4, P5, P6, P8, P11, P14 | P1 |
| 03 | Trees | L28 | P2, P5, P9, P10, P12, P13, P20 | P1 |
| 04 | Connectivity | L25 | P1, P12, P14 | P1 |
| 05 | Matching and Hall | L24 | P15, P16, P17, P18, P19 | P1 |
| 06 | Hamilton paths and isomorphism | L27 | P1, P7, P10 | P2 |
| 07 | Induction and strong induction | L16/17 | P13 | P2 |
| 08 | Relations | L19 | — | P3 |
| 09 | Partial orders, Hasse, lattices | L20/21 | — | P3 |
| 10 | Safety net: Euler, planarity, colouring, spanning trees | L23/26 | — | P4 (insurance) |

Chapter 01 sits at position 1 because `Lessons/02` carries the only published mark values —
it tells the reader exactly how each answer is scored, which changes how every other
chapter should be written.

---

## 4. The `graph` grammar (Grammar 6)

### 4.1 Spec surface

```
[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A,A-C | layout=auto
           | highlight=C-D,D-A | highlightNodes=C | showDegrees=true
           | directed=false | caption=…]
```

| Parameter | Meaning |
|---|---|
| `nodes=` | comma list; `id:label` sets a custom label (`A:1,B:2`). A `|` splits the list into the two sides of a bipartite graph (`nodes=A,B,C|D,E,F`) |
| `edges=` | comma list; `u-v` undirected, `u->v` directed, `u-v:label` carries an edge label |
| `layout=` | `auto` · `layered` · `circular` · `bipartite` · `tree` · `hasse` |
| `levels=` | `id:level,…` explicit vertical placement; used with `layout=hasse` |
| `highlight=` | edges to emphasise (spanning tree, Hamilton cycle, matching) |
| `highlightNodes=` | nodes to emphasise (cut vertex, matched vertex) |
| `showDegrees=` | `true` writes `deg(v)` beside each node |
| `directed=` | `true` draws arrowheads |
| `caption=` | a hand-written caption line beneath the figure |

### 4.2 Layout algorithms

- **layered** — longest-path layering over the DAG of edges, then two barycenter sweeps to
  reduce edge crossings; orthogonal wire routing between layers.
- **hasse** — explicit `levels=`, smallest level at the bottom, edges drawn upward with no
  arrowheads, no transitive edges implied.
- **bipartite** — two columns, barycenter ordering inside each column.
- **tree** — hierarchical, root chosen as the in-degree-0 node.
- **circular** — nodes on a circle, useful for small dense graphs.
- **auto** — picks `hasse` if `levels=` is present, `bipartite` if `nodes=` contains a `|`
  group separator, `layered` for acyclic graphs, `circular` otherwise.

### 4.3 Rendering

Uses the existing `Rough.js` canvas (`rc`) so figures match the rest of the app's
hand-drawn look, and reuses `src/render/diagrams/primitives.js` (`drawArrowLine`,
`drawSharpArrowhead`, `drawLabelOrMath`, `drawSolderDot`) and `src/render/glyph.js` for
labels. Ink colour comes from the active `INK_PROFILES` entry, exactly like every other
grammar.

### 4.4 Height estimation

`graph.js` exports `estimateGraphHeight(params, availWidth)`. `page.js` imports it so the
compositor reserves the right vertical space before drawing, preventing a figure from being
sliced across a page break.

### 4.5 Error surfacing

The dispatcher currently swallows per-diagram failures with a `console.warn`. `state.js`
grows a `diagramStats = { rendered, failed }` counter, incremented by the dispatcher on both
paths, so the QA harness can assert `failed === 0` across every chapter.

---

## 5. `notes.html` — the notebook reader

### 5.1 Reuse contract

`src/render/page.js` reads the document from `#docInput` and writes page canvases into
`#pagesContainer` (falling back to `#notebookCanvas`'s parent).
`src/render/pdfExport.js` collects `canvas.notebook-page-canvas:not(.hidden)`.

`notes.html` therefore provides the same DOM ids and **reuses `renderFullPage()` and the
PDF writer unchanged**.

### 5.2 Layout

- **Left rail (280 px)** — search box, chapter list. Each row: order number, title,
  priority badge (P1–P4), difficulty stars, estimated minutes, and the T9 problem numbers
  it covers. Two sort modes: *Exam priority* (default) and *Textbook order*.
- **Centre** — the notebook page stack, identical rendering to the main studio.
- **Right rail** — ink profile, hand seed, paper style, export actions.

### 5.3 Chapter manifest

`src/notes/manifest.js` exports:

```js
export const CHAPTERS = [
  {
    id: 'trees',
    order: 3,
    title: 'Trees & Binary Trees',
    file: '../Discrete Mathematics/Notes/03-trees.md',
    priority: 'P1',
    difficulty: 3,
    minutes: 42,
    lectures: ['L28'],
    t9: ['P2', 'P5', 'P9', 'P10', 'P12', 'P13', 'P20']
  },
  // …
];
```

`priority` is `P1` (learn first, highest exam weight) through `P4` (insurance material).
`difficulty` is an integer 1–3, rendered as 1–3 stars. `minutes` is the estimated study time
for the exam-core section only.

### 5.4 Serving

The chapters live outside the ScriptForge repo, so `scripts/serve.mjs` gains an optional
root argument:

```
node scripts/serve.mjs [port] [root]
```

`package.json` gains `"notes": "node scripts/serve.mjs 8000 ../.."`, so the server root
becomes `/home/`, and the reader is reachable at
`http://localhost:8000/ScriptForge/notes.html` while fetching chapters from
`/Discrete Mathematics/Notes/*.md`.

### 5.5 Export

| Action | Mechanism |
|---|---|
| Current chapter -> PDF | `exportMultiPagePdf()` (unchanged) |
| All chapters -> one PDF | render each chapter in turn, collect canvases, one `buildMultiPagePdfBlob(allCanvases)` call |
| PNG | `exportCurrentPagePng()` (unchanged) |

---

## 6. Renderer enhancements in `page.js`

Two additions, both required for the notes to read as notes rather than as source files:

1. **Bullets** — a line beginning `- ` or `* ` renders a bullet glyph with a hanging indent.
2. **Callouts** — a line beginning `> ` renders indented with a left rule, used for exam
   tips, traps and warnings.

Both are additive; existing documents are unaffected.

---

## 7. Authoring constraints (imposed by the renderer)

These are hard limits of `page.js` that the chapter authoring must respect:

1. **Display math must be on one line.** The matcher is `/^\$\$(.+)\$\$$/` against a single
   trimmed line, so a `$$ … $$` block may not wrap.
2. **No nested `$`.** Inline math is matched by `/\$[^$]+\$/`.
3. **No Markdown tables.** Pipes would print literally. Tables become
   `[DIAGRAM: grid | cols=… | rows=…]` blocks.
4. **Headings** are `#` through `######`, always underlined by hand.
5. **Diagrams** occupy one source line each: `[DIAGRAM: …]`.
6. `---PAGE---` forces a page break; auto-pagination handles the rest.

---

## 8. Chapter template

Every chapter follows the same skeleton so the notebook is predictable under time pressure:

```
# Chapter NN — Title
P1 · Difficulty ★★★ · 42 min · Lectures L28 · T9 P2, P5, P9, P10, P12, P13, P20

## Why this chapter matters
## 1. Definitions you must know
## 2. Core theorems (statement + proof route)
## 3. Worked examples
## 4. Traps and shortcuts
## 5. Practice: problems with full solutions
## 6. Self-check
---PAGE---
## Reference: full lesson text
```

### 8.1 What the reference section contains

The reference section carries the **full substance of the source Lesson**, *reformatted into
the DSL* — not a verbatim paste of the Markdown file. A verbatim paste is impossible to
render faithfully: the lessons use multi-line display math, Markdown tables and nested list
syntax, none of which the renderer supports (§7). So the reference section:

- keeps every theorem, worked example, extra practice question and trap from the Lesson;
- re-expresses tables as `[DIAGRAM: grid]` blocks and lists as bullet lines;
- splits long display equations into several single-line aligned display equations;
- gains a `[DIAGRAM: graph]` figure wherever the Lesson described a graph in prose or ASCII.

The result is materially more readable than the source Markdown, and it is still complete.

### 8.2 Chapter size budget

| Part | Notebook pages | Content |
|---|---|---|
| Exam core (§1–§6 above) | 8–12 | the revision path |
| Reference | 15–30 | the full lesson substance |
| Total | 25–40 | |

Figures are counted inside these budgets; a figure costs roughly one page of vertical space.

---

## 9. Correctness strategy

Three independent passes, because "read the answer" is how exam marks are lost:

1. **Authoring pass** — a chapter is written from its Lesson, the matching `notes/` file,
   the `corpus_text/` lecture transcript and the T9 problem index.
2. **Independent verification pass** — a separate pass re-derives every theorem statement,
   formula and worked solution from first principles and the slides, without the draft's
   reasoning, and reports discrepancies. Findings are applied to the chapter and logged in
   `Notes/CORRECTIONS.md` as *original -> corrected*.
3. **Render verification pass** — headless-Chrome QA renders every chapter and asserts:
   no console errors, `diagramStats.failed === 0`, display-math delimiter balance, no
   figure clipped at a page boundary, and every chapter's page count within budget.

Existing open audit findings are treated as inputs to pass 2, not as blockers.

---

## 10. Phasing

| Phase | Work | Exit criterion |
|---|---|---|
| 0 | `graph` grammar, `page.js` enhancements, `diagramStats`, QA suites | `node scripts/verify-waves.mjs` still passes; new QA suites pass |
| 1 | `notes.html`, `manifest.js`, `serve.mjs` root arg, `notes.css` | Shell boots, a sample chapter renders, PDF export works |
| 2 | Chapters 00–10 authored in priority order, each with verification | Every chapter passes the render-verification pass |
| 3 | `CORRECTIONS.md`, cross-links, final merged-PDF export test | One merged PDF builds; index matches the pack |

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Chapter volume (~1 MB of DSL) exceeds one session | Author in priority order so value is delivered incrementally; chapters are independently shippable |
| A graph layout algorithm produces overlapping nodes | Barycenter sweeps plus a bounding-box overlap check in the engine; QA renders a corpus of the pack's own graphs |
| Display-math one-line limit truncates long derivations | Break long derivations across aligned display lines, or move them into the reference section |
| Merged all-chapters PDF is large (hundreds of pages) | Export is per-chapter by default; merged export is opt-in |

---

## 12. Out of scope

- Rewriting the existing `Lessons/`, `Cheatsheets/` or `notes/` files.
- Changing the main studio's behaviour beyond the two additive `page.js` features.
- Audio/lecture transcription — `corpus_text/` already provides the text layer.
- Any network dependency; everything stays offline.
