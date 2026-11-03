# ScriptForge note authoring guide

This is the contract between an AI coding agent and the ScriptForge renderer.
Read it before calling `create_note`, `update_note` or `append_to_note`, then run
`validate_note` on the result.

A note is a plain UTF-8 Markdown-like document. Optional YAML-style frontmatter is
read by the note library and stripped before rendering; the body is compiled into
hand-written notebook pages and a PDF.

---

## 1. Scopes and storage

| Scope | File | Index | Git |
|---|---|---|---|
| `public` (default) | `notes/<slug>.md` | `notes/index.json` | tracked |
| `private` | `notes/private/<slug>.md` | `notes/private/index.json` | ignored |

A slug beginning with `private/` selects private scope automatically. Private
metadata is never written into the tracked public index.

---

## 2. Frontmatter

```markdown
---
title: Graph Theory Revision
tags: dsa, graphs, exam
font: Kalam
ink: ballpoint_blue
paper: ruled_margin
seed: 4219
---
```

| Key | Values | Effect |
|---|---|---|
| `title` | text | Index/dropdown title. Falls back to the first `# Heading`, then the slug. |
| `tags` | comma list | Stored in the index only. |
| `font` | `Caveat`, `Kalam`, `Indie Flower`, `Patrick Hand`, `Shadows Into Light` | Selects the hand archetype. |
| `ink` | `ballpoint_blue`, `gel_navy`, `pilot_black`, `graphite`, `crimson` | Selects the ink profile. |
| `paper` | `ruled_margin`, `engineering_grid`, `cornell`, `blank_a4` | Selects the stationery. |
| `seed` | integer | Reproducible variation; same seed = same page. |

Unknown keys are ignored with a warning. Invalid `font`, `ink` or `paper` values
fail validation.

---

## 3. Body grammar

| Syntax | Result |
|---|---|
| `# Heading` … `###### Heading` | Hand-underlined heading |
| Plain prose | Handwritten words with automatic wrapping |
| `$inline math$` | Inline 2D math |
| `$$ display math $$` | Display 2D math, **one line only** |
| `~~wrong term~~` | Multi-pass pen scratch-out |
| `---PAGE---` or `[PAGEBREAK]` | Forced page break |
| `[DIAGRAM: type \| key=value \| ...]` | Hand-sketched figure, alone on its line |

### Hard rules

1. Display math must fit on one line: `$$ ... $$`.
2. Every inline `$` needs a matching `$` on the same line.
3. A `[DIAGRAM: ...]` block must start at the beginning of its own line and end with `]`.
4. A diagram value may not contain a literal `|`; it is the parameter separator.
5. Math is an allowlist, not full LaTeX. Unsupported commands fail validation.

---

## 4. Diagram types

### Tables and registers

```markdown
[DIAGRAM: grid | cols=Cycle,1,2,3 | rows=I1~IF~ID;I2~~IF]
[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]
[DIAGRAM: array | cells=10,20,30 | pointers=0:p,2:q]
```

- `grid`: `cols=` comma list; `rows=` semicolon-separated rows, `~` separates cells.
- `bitfield`: `bits=`, `fields=Name:width,...`.
- `array`: `cells=`, optional `pointers=index:label,...`.

### Karnaugh maps

```markdown
[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15 | dcares=3,11]
```

`vars=` supports 2–4 variables. `ones=` and `dcares=` are minterm indices.

### Logic, automata, trees and lists

```markdown
[DIAGRAM: circuit | expr=(A AND B) OR (NOT C)]
[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]
[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q2->q2:0]
[DIAGRAM: tree | nodes=50,30,70 | edges=50-30,50-70]
[DIAGRAM: list | nodes=A,B,C | edges=A->B,B->C]
```

Aliases: `circuit`, `schematic`, `flipflop`, `dfa`, `nfa`, `fsm`, `tree`, `list`.

### Graphs (general, Hasse, spanning trees, matchings)

```markdown
[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A,A-C | layout=auto]
[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C | layout=circular | highlight=B-C | showDegrees=true]
[DIAGRAM: graph | left=A,B | right=C,D | edges=A-C,B-C | layout=bipartite]
[DIAGRAM: graph | nodes=a,b,c,d | edges=a-b,b-c,c-d | levels=a:0,b:1,c:2,d:3 | layout=hasse]
```

| Parameter | Meaning |
|---|---|
| `nodes=` | `id` or `id:label`, comma-separated. |
| `left=` / `right=` | The two sides of a bipartite graph. Use these instead of a `|` inside `nodes=`. |
| `edges=` | `u-v` undirected, `u->v` directed, optional `:label`. |
| `layout=` | `auto`, `layered`, `circular`, `bipartite`, `tree`, `hasse`. |
| `levels=` | `id:level,...` for `hasse`. |
| `highlight=` | Edges to emphasise. |
| `highlightNodes=` | Nodes to emphasise. |
| `showDegrees=true` | Writes `deg(v)` beside each node. |
| `directed=true` | Arrowheads for all edges. |
| `caption=` | Caption below the figure. |

### Plots, geometry and raw SVG

```markdown
[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | label=f(x)=4x^3]
[DIAGRAM: plot | fn=sin(x)*exp(-0.2*x) | domain=0,12]
[DIAGRAM: canvas2d | circles=0.58:4pts,1.0:3pts,1.73:2pts]
[DIAGRAM: svg | <svg viewBox="0 0 200 120"><rect x="10" y="10" width="80" height="40"/></svg>]
[DIAGRAM: custom_image]
```

- `fn=` accepts numbers, `x`, `pi`, `e`, `+ - * / % ^`, parentheses and the
  allowlisted functions `sin cos tan asin acos atan atan2 exp ln log sqrt cbrt
  abs sign floor ceil round pow min max hypot`.
- `svg` is re-inked by ScriptForge; it is not pasted as a raster image.
- `custom_image` only renders after an image has been uploaded in the studio.

---

## 5. Math allowlist

Supported constructs:

- Greek letters, relations, arrows, set/logic symbols and binary operators.
- `\frac`, `\dfrac`, `\tfrac`, `\cfrac`, `\binom`, `\dbinom`, `\tbinom`.
- `\sqrt{x}` and `\sqrt[n]{x}`.
- `\overline`, `\underline`, `\bar`, `\vec`, `\hat`, `\widehat`, `\tilde`,
  `\widetilde`, `\dot`, `\ddot`, `\overbrace`, `\underbrace`.
- `\int`, `\iint`, `\iiint`, `\oint`, `\sum`, `\prod`, `\coprod`, `\bigcup`,
  `\bigcap`, `\bigoplus`, `\lim`, `\limsup`, `\liminf`, `\max`, `\min`, `\sup`, `\inf`.
- `\left ... \middle ... \right`.
- Environments: `bmatrix`, `pmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`, `matrix`,
  `cases`, `aligned`, `align`, `array`.
- Named functions: `sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh
  log ln lg exp det dim ker hom arg deg gcd Pr mod`.
- Spacing: `\, \: \; \! \quad \qquad` and `\ `.
- Text wrappers: `\text`, `\textrm`, `\textbf`, `\textit`, `\texttt`, `\mathrm`,
  `\mathbf`, `\mathbb`, `\mathcal`, `\mathfrak`, `\mathsf`, `\operatorname`, `\mbox`.

Anything else is rejected with a line number and an example.

---

## 6. Agent workflow

1. `get_authoring_guide` — load this contract.
2. `list_notes` / `read_note` — inspect what already exists.
3. `create_note` / `update_note` / `append_to_note` — write validated DSL.
4. `validate_note` — confirm before finishing. If it fails, fix every reported line.
5. In the browser, open `/?note=<slug>` and press **Reload** (or wait for the poll)
   to see the agent's write immediately.

Example tool arguments:

```json
{
  "slug": "dsa/graphs/traversal",
  "title": "Graph Traversal",
  "tags": ["dsa", "graphs", "bfs", "dfs"],
  "content": "# Graph Traversal\n\nBFS visits vertices in layers.\n\n[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,A-C,B-D,C-D | layout=layered]\n\n$$ O(V + E) $$\n"
}
```
