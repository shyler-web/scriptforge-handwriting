# Discrete Mathematics Content Authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the 11 ordered chapters of the Discrete Mathematics study notebook as ScriptForge DSL, each independently verified for mathematical correctness, and consolidate every correction into `CORRECTIONS.md`.

**Architecture:** Each chapter is a single Markdown file in ScriptForge's markup language, living in `~/Discrete Mathematics/Notes/`. Every chapter is produced by two independent passes — an authoring pass that writes it from the source pack, and a verification pass that re-derives each theorem and solution from first principles and the slide transcripts without seeing the draft's reasoning. The reader (`notes.html`, built by the companion plan) renders the files directly.

**Tech Stack:** Markdown in ScriptForge DSL; headless-Chrome QA for render verification; plain Node for delimiter checks.

**Spec:** `docs/superpowers/specs/2026-10-22-discrete-math-notebook-design.md`

**Engine plan (prerequisite):** `docs/superpowers/plans/2026-10-22-graph-grammar-and-notes-reader.md` — must be complete before Task 1, because chapter authoring depends on the `graph` grammar and the reader.

## Global Constraints

- **Source of truth** — each chapter draws on: its `Lessons/NN-*.md`, the matching `notes/NN-*.md`, the `corpus_text/Lecture_*.txt` transcript of its slide deck, and the `notes/T9-tutorial-9-model-paper.md` problem index. Nothing else.
- **Language: English.** The exam, the slides and the pack are English.
- **Never copy a claim without checking it.** Where the Lesson, the notes and the slides disagree, the **slide images** are authoritative (the pack's own `T9` source-fidelity note documents a case where the text layer lost an overline that changed the meaning of the problem). Record every such decision in `CORRECTIONS.md`.
- **The DSL constraints below are binding.** A chapter that violates them renders as literal text.
- **A theorem is stated before it is used**, and every claim carries its attribution (slide number or lecture).
- **No invented facts.** If the slides do not support a theorem, the chapter says so explicitly (the T9 pack does this repeatedly, e.g. "not in slides") rather than presenting it as course material.
- **Chapter files are ScriptForge DSL** (headings, `$…$`, `$$…$$`, `~~strike~~`, `---PAGE---`, `[DIAGRAM: …]`).
- **Every figure is a `[DIAGRAM: …]` block** produced by a ScriptForge diagram engine — the `graph` grammar, or the existing `grid`, `schematic` and `canvas2d` grammars. No hand-written HTML canvas, no pasted raster image, no ASCII art. The raw `<svg>` grammar is the only escape hatch, and even then ScriptForge re-inks it rather than pasting a static image.
- **Chapter order is exam priority**, not textbook order. `order` in `src/notes/manifest.js` is authoritative.
- **Every chapter is independently verifiable.** After authoring, the verification pass must be able to re-derive every theorem and every worked solution.

### Chapter DSL constraints (binding)

1. Display math must fit on **one line**: `$$ … $$` is matched per-line. Long derivations are split into several aligned display lines.
2. Inline math may not contain a nested `$`.
3. **No Markdown tables.** Use `[DIAGRAM: grid | cols=… | rows=…]`, where cells within a row are separated by `~` and rows by `;`.
4. Headings are `#` … `######`. `#` is the chapter title.
5. Each `[DIAGRAM: …]` block occupies one source line.
6. `---PAGE---` forces a page break; pagination is otherwise automatic.
7. Bullets are `- ` at the start of a line; callouts are `> ` at the start of a line.
8. `~~text~~` renders a scratch-out and is used only for deliberate "common mistake" callouts.
9. **No `|` inside any `[DIAGRAM: …]` parameter value.** The whole spec is split on `|`; a pipe inside a value truncates it. Use `left=` / `right=` for bipartition, and double quotes (`caption="a | b"`) where a literal pipe is needed.

### Chapter template (every chapter, in this order)

```
# Chapter NN — <Title>
P1 · Difficulty ★★★ · <minutes> min · Lectures <L…> · T9 <P…>

## Why this chapter matters
## 1. Definitions you must know
## 2. Core theorems
## 3. Worked examples
## 4. Traps and shortcuts
## 5. Practice: problems with full solutions
## 6. Self-check
---PAGE---
## Reference: full lesson text
```

The exam core is sections 1–6 (8–12 pages). The reference section carries the full substance of the source Lesson, reformatted into the DSL — not a verbatim paste (a verbatim paste cannot render: see the DSL constraints).

### Mandatory figures (spec §4.7)

These figures are an acceptance list, not suggestions. Each named figure must exist as a `[DIAGRAM: …]` block in the stated chapter, in the stated spec shape.

| Figure | Chapter | Required spec shape |
|---|---|---|
| General graph with degree labels | 02 | `layout=circular  showDegrees=true` |
| Bipartite graph, two sides shown | 05 | `nodes=A,B,C,D,E,F  left=A,B,C  right=D,E,F  layout=bipartite` |
| A tree, and a spanning tree marked inside a graph | 03 | `layout=tree`; the spanning tree uses `highlight=` |
| Hasse diagram of a divisibility poset | 09 | `layout=hasse  levels=1:0,2:1,4:2,6:2,3:1,12:3` |
| Cut vertex and cut edge | 04 | `highlightNodes=c  highlight=ce` |
| Hamiltonian cycle | 06 | `highlight=` on exactly the cycle edges |
| Layered directed graph | 03, 04 | `layout=layered  directed=true` |
| Two vertex-disjoint paths meeting | 03 | `layout=layered  highlight=` on both paths |

Figures the existing `grid`, `schematic` and `canvas2d` grammars already cover are used as they are — truth tables and Karnaugh maps in the induction chapter, state-transition figures in the matching chapter, shade-region plots in the safety-net chapter. The `graph` grammar is only for what those three cannot express.

---

### Task 1: Chapter 00 — Exam Map & Priority Order

**Files:**
- Create: `~/Discrete Mathematics/Notes/00-exam-map-and-priority.md`

**Interfaces:**
- Consumes: `notes/T9-tutorial-9-model-paper.md` (problem index + traps), `START_HERE.md` (the schedule), `Lessons/02-*.md` (the rubric), `src/notes/manifest.js` (chapter list).
- Produces: the chapter file that `notes.html` loads first; the other ten chapters copy its shape.

- [ ] **Step 1: Read the four sources**

Read: `notes/T9-tutorial-9-model-paper.md` §1 (problem index table, including its Difficulty and lecture columns), §5 (pitfalls); `START_HERE.md` §1 (the 17-block schedule) and §5 (triage); `Lessons/02-proving-algorithm-correctness-and-marking.md` §2 (the rubric table).

- [ ] **Step 2: Write the chapter**

Produce a file with:

- The title line `# Chapter 00 — Exam Map & Priority Order` followed by the priority line.
- `## Why this chapter matters` — three paragraphs: the exam is a 4.5-hour graph-theory paper; the T9 model sheet is the closest thing to a model paper; the pack is complete but ordered by textbook, not by exam weight.
- `## 1. The exam at a glance` — the schedule table rendered as `[DIAGRAM: grid | cols=Block,Time,What,Output | rows=…]` using the 17 blocks from `START_HERE.md` §1, condensed to the 8 P1-relevant blocks. A grid row's cells are separated by `~` and rows by `;` — a cell must not contain `~` or `;`.
- `## 2. The T9 problem index, weighted` — one `[DIAGRAM: grid]` per topic group: Problem, Topic, Difficulty, Lecture, Your chapter. Group the 20 problems by the chapter that covers them, using the manifest's `t9` arrays.
- `## 3. Where the marks are` — the rubric table from `Lessons/02` §2 rendered as a grid, with a bullet per band explaining what the marker wants.
- `## 4. The three false-statement traps` — T9 Problem 1 (the missing overline), T9 Problem 7 (every tree has a Hamiltonian path — false), and the third trap named in the T9 §5 list. For each: the exact statement, why it is false, the counterexample, and the corrected theorem with its proof.
- `## 5. The six gates` — the exit criteria from `mission_security_exit_criteria.md` as bullets, each with the chapter that satisfies it.
- `## 6. Self-check` — ten questions with one-line answers, covering the plan, the traps and the rubric.

Every figure in this chapter must be a `[DIAGRAM: grid]` or a `[DIAGRAM: graph]`. No ASCII art.

- [ ] **Step 3: Verify the chapter**

Re-read the chapter against `START_HERE.md` §1 and the T9 problem index. Confirm: all 20 T9 problems appear exactly once; the block times match the schedule; the rubric bands match `Lessons/02` §2 verbatim in value. Fix any mismatch.

- [ ] **Step 4: Render-check the chapter**

Run:
```bash
node scripts/qa/harness.mjs scripts/qa/notes.assertions.js
```
with `QA_BASE=http://localhost:8000/notes.html` and the server running from the repo root. Then open `http://localhost:8000/notes.html`, confirm chapter 00 renders, and check that no grid row shows a literal `~` or `;`.

- [ ] **Step 5: Commit**

```bash
cd "~/Discrete Mathematics"
git add Notes/00-exam-map-and-priority.md 2>/dev/null || true
```
The course folder is **not** a git repository. Commit only the ScriptForge-side changes; the chapter files live outside version control. Record the chapter path in the commit message instead:
```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 00 exam map and priority order"
```

---

### Task 2: Chapter 01 — Marks & Algorithm Correctness (L18)

**Files:**
- Create: `~/Discrete Mathematics/Notes/01-marks-and-algorithm-proofs.md`

**Interfaces:**
- Consumes: `Lessons/02-proving-algorithm-correctness-and-marking.md` (all sections), `notes/18-minor-exam-rubrics-and-algorithm-correctness.md`, `corpus_text/Lecture_18__21_Sep_2026.txt`.
- Produces: the chapter covering rubric bands, the invariant loop proof skeleton, and the three model proofs.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/02`, the matching `notes/18` file, and the Lecture 18 transcript.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Include:
- The rubric table as a `[DIAGRAM: grid]` with the exact band values.
- The **algorithm-correctness proof skeleton** as a numbered bullet list: statement, invariant, base case, inductive step, conclusion — with the exact wording the marker expects at each step.
- The **model proof of Algorithm 1 (maximum)**, reproduced with every step named.
- At least two additional worked proofs drawn from `Lessons/02` §3.
- A traps section listing the three ways candidates lose the marks (missing invariant, missing base case, concluding without the invariant).

Add a `[DIAGRAM: graph]` figure for the loop-carrying structure of the algorithm's proof (the loop counter `i` and the invariant) only if it clarifies rather than decorates.

- [ ] **Step 3: Verify the chapter independently**

Re-derive the rubric bands and each model proof against `Lesson_18__21_Sep_2026.txt` and the slide images in `slides_img/Lecture_18_21_Sep_2026/`. For each band, confirm the mark value and the condition. For each proof, confirm every step is present and correctly ordered. Record any discrepancy.

- [ ] **Step 4: Apply corrections and record them**

Append every discrepancy to `Notes/CORRECTIONS.md` using the format defined in Task 12, Step 1. Fix the chapter.

- [ ] **Step 5: Render-check and commit**

Render-check as in Task 1, Step 4. Then:
```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 01 marks and algorithm correctness"
```

---

### Task 3: Chapter 02 — Graph Fundamentals (L22)

**Files:**
- Create: `~/Discrete Mathematics/Notes/02-graph-fundamentals.md`

**Interfaces:**
- Consumes: `Lessons/05-graph-fundamentals.md`, `notes/22-graphs-fundamentals.md`, `corpus_text/Lecture_22.txt`, T9 Problems 3, 4, 5, 6, 8, 11, 14.
- Produces: the chapter on handshaking, bipartite graphs, degree bounds, and connectivity criteria.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/05`, `notes/22-graphs-fundamentals.md`, `corpus_text/Lecture_22.txt`, and the T9 index rows for Problems 3, 4, 5, 6, 8, 11 and 14.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The Handshaking Lemma with its induction proof.
- The "odd-degree count is even" corollary, stated as the tool for killing an impossible graph.
- Bipartite graphs, the 2-colouring theorem, and the bipartite ⇔ 2-colourable equivalence.
- The degree-sum connectivity criterion (T9 Problem 3 — the theorem is *not* on the slides; say so).
- T9 Problem 4 (the bipartite degree sequence `3,3,3,3,3,5,6,6,6` — answer **No**) with the full argument that no subset sums to half of 38.
- T9 Problem 6 (no odd cycle ⇒ at most $\lfloor n^2/4\rfloor$ edges; Mantel's theorem is not on the slides — say so).

Add at least three `[DIAGRAM: graph]` figures: **a general graph with degree labels** (mandatory — `layout=circular  showDegrees=true`), a bipartite graph with its 2-colouring, and the graph that kills an impossible degree sequence.

- [ ] **Step 3: Verify the chapter independently**

Re-derive the Handshaking Lemma proof, the bipartite ⇔ 2-colouring equivalence, and every T9 solution against the T9 model solutions in `notes/T9-tutorial-9-model-paper.md` §2 **and** against first principles. Where the T9 model solution and your derivation disagree, re-derive from scratch and follow the derivation. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 02 graph fundamentals"
```

---

### Task 4: Chapter 03 — Trees & Binary Trees (L28, L29)

**Files:**
- Create: `~/Discrete Mathematics/Notes/03-trees.md`

**Interfaces:**
- Consumes: `Lessons/09-trees-and-binary-trees.md`, `notes/28-trees.md`, `notes/29-rooted-trees-and-binary-trees.md`, `corpus_text/Lecture_28.txt`, `corpus_text/Lecture_29.txt`, T9 Problems 2, 5, 9, 10, 12, 13, 20.
- Produces: the highest-weight chapter — trees carry 6–7 T9 problems.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/09`, `notes/28`, `notes/29`, both lecture transcripts, and the T9 index rows for Problems 2, 5, 9, 10, 12, 13 and 20.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The tree edge theorem ($n-1$ edges) with the induction proof, as T9 Problem 13 will set it.
- The leaf theorem (at least two leaves; a tree with exactly two leaves is a path).
- The forest formula.
- The longest-path technique behind T9 Problems 9 and 10.
- T9 Problem 20 (a tree with a prescribed ordered degree sequence — use the caterpillar construction; Prüfer codes are **not** on the slides, so say so).
- The rooted-tree terminology list and the full-binary-tree count table.

Add these `[DIAGRAM: graph]` figures, all four mandatory:

- **A tree** — `layout=tree` (the rooted-tree terminology figure).
- **A spanning tree marked inside a graph** — the same graph with the tree edges given in `highlight=` (mandatory).
- **A layered directed graph** — `layout=layered  directed=true` (mandatory; used for the walk-versus-path direction).
- **Two vertex-disjoint paths meeting** — `layout=layered  highlight=` on both paths (mandatory; this is the T9 Problem 9 figure).

Also add a path-versus-star contrast for the leaf theorem and a caterpillar for T9 Problem 20.

- [ ] **Step 3: Verify the chapter independently**

Re-derive every theorem proof and every T9 solution from first principles without consulting the T9 model solution first; only afterwards compare with the model solution. Check the caterpillar construction actually produces the prescribed degree sequence, node by node. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 03 trees and binary trees"
```

---

### Task 5: Chapter 04 — Connectivity (L25)

**Files:**
- Create: `~/Discrete Mathematics/Notes/04-connectivity.md`

**Interfaces:**
- Consumes: `Lessons/07-connectivity-cut-vertices-and-edges.md`, `notes/25-connectivity.md`, `corpus_text/Lecture_25.txt`, T9 Problems 1, 12, 14.
- Produces: the chapter on components, cut vertices, cut edges, $k$-connectedness, and digraph connectivity.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/07`, `notes/25-connectivity.md`, `corpus_text/Lecture_25.txt`, and the T9 index rows for Problems 1, 12 and 14.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The component-count test as an explicit procedure.
- The three shortcuts from `Lessons/07` §3.2.
- Cut vertex and cut edge definitions with the bridge criterion.
- $k$-connectedness and the three standard families.
- Strong versus weak connectivity, with the two slide-18/19 digraphs worked through.
- T9 Problem 12 (the *iff* trap — both directions; the backward direction carries the marks).
- T9 Problem 14 (round robin — bipartite 2-colouring, **not** Hall's theorem).

**Note the known slide defect:** `Lessons/07` T4 records that the "cut edges $\{ac,bc\}$" label on slide 13 is wrong. The chapter must state the correct cut edges and flag the slide's label as an error.

Add these `[DIAGRAM: graph]` figures, three of them mandatory:

- **Cut vertex and cut edge in one graph** — `highlightNodes=c  highlight=ce` (mandatory).
- **A layered directed graph** — `layout=layered  directed=true` (mandatory; the strong/weak connectivity digraph).
- Both slide-18/19 digraphs with the strong/weak colouring.

- [ ] **Step 3: Verify the chapter independently**

Re-derive the cut-vertex procedure, both directions of T9 Problem 12, and the T9 Problem 14 colouring. Verify the slide-13 cut-edge claim against the slide image in `slides_img/Lecture_25/`. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 04 connectivity"
```

---

### Task 6: Chapter 05 — Matching & Hall's Theorem (L24)

**Files:**
- Create: `~/Discrete Mathematics/Notes/05-matching-and-hall.md`

**Interfaces:**
- Consumes: `Lessons/06-matching-and-halls-theorem.md`, `notes/24-matching-and-hall-theorem.md`, `corpus_text/Lecture_24.txt`, `corpus_text/Lecture_24-1.txt`, T9 Problems 15, 16, 17, 18, 19.
- Produces: the chapter with five T9 problems — the highest single-chapter density.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/06`, `notes/24-matching-and-hall-theorem.md`, both Lecture 24 transcripts, and the T9 index rows for Problems 15, 16, 17, 18 and 19.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- Maximal vs maximum vs perfect — the distinction T9 Problem 19 turns on.
- Hall's Marriage Theorem stated verbatim, with the forward and backward proof skeletons.
- The five-step Hall check procedure.
- T9 Problem 17 ($k$-regular bipartite ⇒ perfect matching; first prove $\lvert A\rvert=\lvert B\rvert$ from $k\lvert A\rvert=\lvert E\rvert=k\lvert B\rvert$).
- T9 Problem 16 (a matching **covering $A$**, not a perfect matching).
- T9 Problem 19 (the 2-approximation bound: each edge of $M$ clashes with at most **two** edges of $M'$).
- T9 Problem 15 (a tree has at most one perfect matching) — Berge's lemma and augmenting paths are **not** covered in L24, so say so.

Add these `[DIAGRAM: graph]` figures, two of them mandatory:

- **A bipartite graph with the two sides shown** — `nodes=A,B,C,D,E,F  left=A,B,C  right=D,E,F  layout=bipartite` (mandatory).
- The $k$-regular bipartite graph of T9 Problem 17.
- A bipartite graph with a matching highlighted (the Hall-check walkthrough).

- [ ] **Step 3: Verify the chapter independently**

Re-derive Hall's Theorem proof skeletons, the degree-constrained theorem, and all five T9 solutions from first principles. For T9 Problem 17, confirm the counting chain $k\lvert S\rvert \le e(S,N(S)) \le k\lvert N(S)\rvert$ is stated in the right direction and the conclusion $\lvert N(S)\rvert \ge \lvert S\rvert$ follows. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 05 matching and hall's theorem"
```

---

### Task 7: Chapter 06 — Hamiltonian Paths & Graph Isomorphism (L27)

**Files:**
- Create: `~/Discrete Mathematics/Notes/06-hamilton-and-isomorphism.md`

**Interfaces:**
- Consumes: `Lessons/08-hamilton-paths-and-graph-isomorphism.md`, `notes/27-hamiltonian-paths-and-isomorphism.md`, `corpus_text/Lecture_27.txt`, T9 Problems 1, 7, 10.
- Produces: the chapter carrying the highest-value false-statement trap (T9 Problem 7).

- [ ] **Step 1: Read the sources**

Read all of `Lessons/08`, `notes/27-hamiltonian-paths-and-isomorphism.md`, `corpus_text/Lecture_27.txt`, and the T9 index rows for Problems 1, 7 and 10.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- Hamiltonian path and cycle definitions; the complement definition $\overline G = (V, [V]^2 \setminus E)$ used by T9 Problem 1.
- **Dirac's theorem** in full, with its hypothesis, and the proof sketch in five lines.
- **Ore's theorem**, and the explicit Dirac-vs-Ore comparison from `Lessons/08` §4.
- The graph-isomorphism checklist (the invariants that must match).
- T9 Problem 1 (the complement of a disconnected graph is connected) — including the note that the text layer loses the overline and the slide image is authoritative.
- T9 Problem 7 (the false statement) — counterexample $K_{1,3}$, then the corrected theorem: a tree has a Hamiltonian path $\iff$ it is a path graph $\iff$ it has at most two leaves.
- T9 Problem 10 ($\delta(G)$ gives a path of length $\delta(G)$ and a cycle of length $\ge \delta(G)+1$).

Add these `[DIAGRAM: graph]` figures, one of them mandatory:

- **A Hamiltonian cycle highlighted** — `highlight=` on exactly the cycle edges (mandatory).
- The $K_{1,3}$ counterexample (T9 Problem 7).
- A Dirac-satisfying graph, and a non-isomorphic pair with the failing invariant marked.

- [ ] **Step 3: Verify the chapter independently**

Re-derive Dirac's theorem hypothesis and conclusion, and all three T9 solutions. Check that the counterexample to T9 Problem 7 is a *tree* with three leaves and that the corrected theorem is stated in all three equivalent forms. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 06 hamiltonian paths and isomorphism"
```

---

### Task 8: Chapter 07 — Mathematical & Strong Induction (L16, L17)

**Files:**
- Create: `~/Discrete Mathematics/Notes/07-induction.md`

**Interfaces:**
- Consumes: `Lessons/01-mathematical-induction.md`, `notes/16-mathematical-induction.md`, `notes/17-strong-induction-and-proof-strategies.md`, `corpus_text/Lecture_16_17.txt`, T9 Problem 13.
- Produces: the chapter on the proof technique T9 Problem 13 is set in.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/01`, `notes/16`, `notes/17`, `corpus_text/Lecture_16_17.txt`, and the T9 index row for Problem 13.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The first principle of induction, with the weak template (basis / IH / step / close) written out verbatim.
- The second principle (strong induction) and the strong template.
- **When to use which** — the decision rule the candidate applies under exam pressure.
- The two tiling theorems.
- The three false theorems, each with its counterexample.
- The "stronger statement" trick (the L-tromino example).
- The T9 Problem 13 solution, which is the exam-facing application.

Add a `[DIAGRAM: graph]` figure for the induction structure only if it clarifies the weak/strong distinction; otherwise omit it.

- [ ] **Step 3: Verify the chapter independently**

Re-derive both induction principles and every worked example's arithmetic (the divisibility-by-57 example, the $2^n$ subsets example, the tennis tournament). Verify each of the three false theorems really is false by constructing the counterexample yourself. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 07 mathematical induction"
```

---

### Task 9: Chapter 08 — Relations (L19)

**Files:**
- Create: `~/Discrete Mathematics/Notes/08-relations.md`

**Interfaces:**
- Consumes: `Lessons/03-relations-and-equivalence.md`, `notes/19-relations.md`, `corpus_text/Lecture_19__1_.txt`.
- Produces: the chapter on the five relation properties and the two class theorems.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/03`, `notes/19-relations.md`, `corpus_text/Lecture_19__1_.txt`.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The five property tests (reflexive, symmetric, antisymmetric, transitive, and the derived irreflexivity) as a checklist a candidate can run on a pair list.
- The two class theorems with their proof routes.
- The trap relation worked through (the `Lessons/03` Example 3 relation), showing exactly which property fails.
- A `[DIAGRAM: grid]` of the five properties with their definitions and negations.

- [ ] **Step 3: Verify the chapter independently**

Re-derive each class theorem's proof route from the definitions. Re-run the five tests on the trap relation and confirm the chapter names the correct failing property. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 08 relations"
```

---

### Task 10: Chapter 09 — Partial Orders, Hasse Diagrams & Lattices (L20, L21)

**Files:**
- Create: `~/Discrete Mathematics/Notes/09-partial-orders-hasse-lattices.md`

**Interfaces:**
- Consumes: `Lessons/04-partial-orders-hasse-diagrams-lattices.md`, `notes/20-partial-orders-and-hasse-diagrams.md`, `corpus_text/Lecture_20_21.txt`.
- Produces: the chapter with T13 theorems and the eight lattice identities.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/04`, `notes/20-partial-orders-and-hasse-diagrams.md`, `corpus_text/Lecture_20_21.txt`.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- The three-step Hasse drawing procedure, verbatim from `Lessons/04` §2, plus the rules of the finished diagram.
- All thirteen theorems T1–T13 as statements, with proof routes where they exist.
- Maximal/minimal versus greatest/lowest — the distinction T3 and T4 turn on.
- LUB versus GLB, and the eight lattice identities.
- The non-distributive lattice caveat (T13).

Add `[DIAGRAM: graph]` figures for **the Hasse diagram of the divisibility poset** (mandatory — `layout=hasse  levels=1:0,2:1,4:2,6:2,3:1,12:3`), the divisibility poset on $\{1,2,3,4,5,6\}$, and the subset lattice on $2^S$.

- [ ] **Step 3: Verify the chapter independently**

Re-derive T3, T4, T9, T10 and T12 (the theorems `Lessons/04` marks as standard arguments rather than slide content). Confirm the divisibility Hasse figure has no transitive edge (3→6 is present, 1→6 is not, because 2 and 3 both divide 6). Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 09 partial orders and hasse diagrams"
```

---

### Task 11: Chapter 10 — Safety Net: Euler, Planarity, Colouring, Spanning Trees (L23, L26)

**Files:**
- Create: `~/Discrete Mathematics/Notes/10-safety-net-euler-planarity.md`

**Interfaces:**
- Consumes: `Lessons/10-safety-net-euler-planarity-colouring-spanning-trees.md`, `corpus_text/Lecture_20.txt` and `corpus_text/Lecture_20_21.txt` (for the material that overlaps), `notes/28-trees.md` (spanning-tree section).
- Produces: the insurance chapter.

**Important:** Lectures 23 and 26 were **never provided**. The chapter must be honest about its own provenance.

- [ ] **Step 1: Read the sources**

Read all of `Lessons/10` and note which claims the chapter can attribute to a slide and which it cannot.

- [ ] **Step 2: Write the chapter**

Sections 1–6 as in the template. Must include:
- Euler's criterion for an Euler trail.
- Euler's formula $v - e + f = 2$ for a connected planar graph, and the two edge bounds ($e \le 3v-6$ for $v \ge 3$, $e \le 2v-4$ for bipartite planar graphs).
- The four-colour theorem statement.
- Spanning trees and Cayley's formula.
- A clear statement that this material is **insurance**: Lectures 23 and 26 were not supplied, so the chapter is built from `Lessons/10` and standard statements, and should be studied last.

Add `[DIAGRAM: graph]` figures: a planar graph with its faces counted, and a spanning tree inside a non-tree graph.

- [ ] **Step 3: Verify the chapter independently**

Re-derive Euler's formula for the plane case, the two edge bounds, and the spanning-tree count. Confirm every attribution claim in the chapter is accurate — where a claim has no slide behind it, say so. Record every discrepancy.

- [ ] **Step 4: Apply corrections and record them**

- [ ] **Step 5: Render-check and commit**

```bash
cd ~/projects/ScriptForge
git commit --allow-empty -m "docs(notes): add chapter 10 safety net"
```

---

### Task 12: Corrections log, chapter index, and merged export

**Files:**
- Create: `~/Discrete Mathematics/Notes/CORRECTIONS.md`
- Create: `~/Discrete Mathematics/Notes/INDEX.md`
- Modify: `src/notes/manifest.js` (add the correction log and index to the reader's extras)

**Interfaces:**
- Consumes: every discrepancy recorded during Tasks 1–11.
- Produces: the audit trail and the reader's extras panel.

- [ ] **Step 1: Define the corrections log format**

`CORRECTIONS.md` uses one section per correction, in this order:

```markdown
## <Chapter> — <short title>

- **Where:** <file> §<section>
- **Original:** <the text as it appeared in the source pack>
- **Corrected:** <the text as it now appears in the chapter>
- **Why:** <the reason, with the source that settles it>
- **Type:** factual error | misleading phrasing | missing content | slide defect | extraction artefact
```

If a correction is not a change to existing text but an addition, use **Original:** *(nothing in the source pack — added for completeness)*.

- [ ] **Step 2: Collect every recorded discrepancy**

Gather the discrepancies recorded in Tasks 1–11 into `CORRECTIONS.md` using the format above, ordered by chapter. Where a defect was inherited from the source pack, name the source file so the reader can see the pack itself is not authoritative.

- [ ] **Step 3: Write `INDEX.md`**

A plain-Markdown index for readers who do not open the app: the chapter list with priority, difficulty, minutes, lectures and T9 problems; the reading order; and a link to `CORRECTIONS.md`.

- [ ] **Step 4: Wire the extras into the reader**

Add to `src/notes/manifest.js` an exported `EXTRAS = [{ id: 'corrections', title: 'Corrections Log', file: 'CORRECTIONS.md' }, { id: 'index', title: 'Chapter Index', file: 'INDEX.md' }]`, and render the extras as two extra rows at the bottom of the chapter list in `notes.html`, marked so they are not counted as exam chapters. A `.md` file that is not a chapter must still render — it uses the same DSL, so it will.

- [ ] **Step 5: Final verification**

Run:
```bash
node scripts/verify-waves.mjs
node scripts/verify-graph.mjs
node scripts/verify-notes.mjs
node scripts/qa/harness.mjs scripts/qa/notes.assertions.js
```
With the server running and all 13 files present, confirm in the browser that every chapter loads, renders at least one page, and exports.

Then produce the merged PDF:
```bash
# via the reader: Export All Chapters button
```
and confirm the resulting PDF's page count matches the sum of the per-chapter page counts.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/ScriptForge
git add src/notes/manifest.js notes.html
git commit -m "feat(notes): add corrections log and chapter index to the reader"
```

---

## Verification checklist for every chapter

Run before committing any chapter:

| Check | How | Pass condition |
|---|---|---|
| Math delimiter balance | Count `$` characters per line; even on every line | 0 odd lines |
| No Markdown tables | Grep for lines starting with `\|` | 0 matches |
| Display math on one line | Grep for `$$` — each occurrence pair on one line | no line with 4+ `$` |
| Figures parse | `state.diagramStats.failed === 0` after rendering the chapter | 0 failures |
| Every declared node is used | No `nodes=` entry missing from `edges=` or `levels=` unless intentional | reviewed |
| Chapter renders | Open in `notes.html`, confirm ≥ 1 page and no literal `~`/`;` in grids | confirmed |
| The chapter is the one the manifest names | File name matches `manifest.js` | matches |
| Mandatory figures present | Each figure from the spec §4.7 table for this chapter exists in the stated spec shape | all present |
| ScriptForge-only rule | Grep the chapter for `<canvas`, `<svg`, `<img`, `!\[` | 0 matches |

Full verification set before the final commit:

```bash
node scripts/verify-waves.mjs                                   # existing 35 checks must still pass
node scripts/verify-graph.mjs                                   # new: the graph grammar
node scripts/verify-notes.mjs                                   # new: the chapter manifest
node scripts/qa/harness.mjs scripts/qa/graph.assertions.js      # new: the graph grammar
node scripts/qa/harness.mjs scripts/qa/notes.assertions.js      # new: the reader + all chapters
node scripts/build-tailwind.mjs                                 # notes.html is auto-scanned by the walker
```
