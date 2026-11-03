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
| `$$ display math $$` | Display 2D math; can be one line or a `$$` block |
| `~~wrong term~~` | Multi-pass pen scratch-out |
| `---PAGE---` or `[PAGEBREAK]` | Forced page break |
| `[DIAGRAM: type \| key=value \| ...]` | Hand-sketched figure, alone on its line |
| `[sketch: ...]` | Multi-line declarative math/geometry scene (see below) |

### Hard rules

1. Display math may be one line (`$$ ... $$`) or a block opened and closed by
   `$$` lines; block content is collapsed before rendering.
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

### Universal mathematical sketches (`[sketch: ...]`)

A sketch is a small declarative scene. Statements are separated by newlines or `;`.
Points can use tuples, variables, `polar(r, deg)`, `p3d(x, y, z)`, node anchors
(`A.ne`, `B.s`, `C.angle(30)`), `mid(A, B)`, and arithmetic.

```markdown
[sketch:
  title "Free-body diagram"
  point O = (0, 0) label="$O$" pos=sw
  point A = O + polar(70, 35) label="$A$"
  arrow O -> A label="$F$"
  angle (1, 0) O A label="$\theta$"
  support (-40, 30) -- (150, 30) side=below
]
```

```markdown
[sketch:
  axes at=(0, 0) xrange=-1,3 yrange=-1,2 w=220 h=150 grid=true
  plot fn=sin(x) domain=0,3 label="$f(x)=\sin x$"
  shade fn=sin(x) f2=0 domain=0,3
]
```

```markdown
[sketch:
  row at=(0, 0) nodes="Client,API,DB" gap=110
  arrow Client -> API
  arrow API -> DB
]
```

Common statements: `point`, `node`/`box`/`state`, `row`/`col`/`ring`, `line`,
`arrow`, `vector`, `spring`, `wave`, `resistor`, `brace`, `support`, `angle`,
`circle`/`pulley`, `polygon`/`spline`, `axes`, `plot`, `parametric`, `shade`,
`tape`/`array`, `ring6`/`benzene`, `camera3d`, `p3d`, `label`/`text`, plus the
layout, physics and systems commands below.

Labels support native 2D math: `label="$m_1$"`, `label="$\int_0^1 f(x)\,dx$"`.
A sketch block may be multi-line and must end with `]`. Values may not contain a
literal `|`; use the trailer notes or separate statements instead.

#### Compact layouts and smart routing (Drop #2)

```markdown
[sketch:
  tree edges="10->5, 10->15, 5->2, 5->7, 15->_, 15->20" costs="0:cn, 1:2c(n/2), 2:$\Theta(n)$"
  dag dir=LR edges="Lexer->Parser->AST->Codegen"
  graph layout=force edges="A--B, B--C, C--A"
  node A at=(0, 180) "Source"
  node Block right="of A" gap=45 "Obstacle"
  node B right="of Block" gap=45 "Target"
  arrow A -> B route=ortho label="bypass"
  arrow A -> A loop=n label="self"
]
```

- `tree` / `bst` — Reingold-Tilford layout. `_` (or `null`) is a phantom child,
  so a single left/right binary child keeps its geometric side. `costs="level:label,..."`
  adds recursion-tree callouts.
- `dag` / `flowchart` — Sugiyama layers, barycentric crossing reduction, and
  automatic back-edge loop bends; `dir=TB` or `dir=LR`.
- `graph` / `network` — `layout=force`, `circle`, or `bipartite`; deterministic
  seeded force layout; `directed=true` for arrowheads.
- Relative placement — `node B right="of A" gap=50`, also `left`, `above`,
  `below`, `ne`, `nw`, `se`, `sw`, `between="A,B"`, `alignX=`, `alignY=`.
- Routing — `route=ortho` is an obstacle-avoiding Manhattan A* router;
  `route=avoid` or `route=auto` deflects a curved spline around nodes. Ports use
  `A.n`, `B.e`, etc. Self-loops use `arrow A -> A loop=n`; parallel edges receive
  symmetric bends automatically.
- Arrow syntax — both ASCII (`A -> B`, `A -- B`, `A <-> B`, `A |-> B`) and
  typographic arrows (`→`, `⇒`, `↔`, `⇔`, `↦`, `—`, `–`) are normalised
  automatically; non-breaking spaces are converted to ordinary spaces.

#### Physics, optics and fields (Drop #3)

```markdown
[sketch:
  incline at=(0, 0) angle=30 mass="$m$" friction="$f_k$" components=true
  atwood r=28 m1="$m_1$" m2="$m_2$"
  optics at=(0, 180) kind=convex f=65 u=125 h=40
  charges at=(0, 360) q1=1 q2=-1 rays=10
  vectorfield at=(0, 540) fx="-y" fy="x"
]
```

- `incline` / `ramp` / `fbd` — ramp triangle, rotated block, `mg`, `N`, optional
  `friction`, and dashed `mg sin theta` / `mg cos theta` components.
- `atwood` / `pulleys` — exact external or crossed (`crossed=true`) tangents
  between two pulleys, with hanging masses (`p2=`, `r1=`, `r2=`).
- `optics` / `lens` — thin-lens principal rays and focal markers;
  `kind=convex` or `concave`, `f`, `u`, `h`.
- `charges` / `dipole` — RK4 electrostatic streamlines; `q1`, `q2`, `sep`, `rays`.
- `vectorfield` / `quiver` — quiver grid for arbitrary `fx` and `fy` expressions.

#### Computer systems, memory, waveforms and pipelines (Drop #4)

Keep large systems figures in separate sketch blocks so each fits one notebook page.

```markdown
[sketch:
  waveform at=(0, 0) signals="CLK:P......., D:0.1..0.., Q:x.01..0., BUS:=A0..=FF.."
  linkedlist at=(0, 120) values="10, 20, 35, 50" head="head" pointers="1:slow, 3:fast"
  memframe id=Stack at=(-100, 240) title="Stack (main)" fields="argc: 2, ptr: ->Heap.0"
  memframe id=Heap at=(100, 240) title="Heap (0x7f00)" fields="val: 42, next: NULL"
]
```

```markdown
[sketch:
  btree at=(0, 0) edges="20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55"
  pipeline at=(0, 140) rows="ADD R1,R2: IF ID EX MEM WB | SUB R3,R1: _ IF ID STALL EX MEM"
  gantt at=(0, 240) tasks="P1:0..4, P2:4..7, P3:7..11"
  packet at=(0, 340) bits=32 fields="Src Port:16, Dst Port:16, Seq Num:32"
]
```

- `waveform` / `timing` — Wavedrom-style timing diagrams. Signal patterns use
  `P`/`p` (clock), `0`/`1`, `x` (don't care), `z` (high-Z), `=DATA` buses, and
  `.` repeats the previous cycle. Cycle guides and `T0..Tn` labels are automatic.
- `linkedlist` / `llist` — singly (`[data | next]`), doubly (`[prev | data | next]`)
  or circular linked lists; `head=`, `pointers="index:label,..."`, `null=false`.
- `memframe` / `struct` — stack/heap activation records with addressable slots.
  `id=Stack` registers `Stack.0`, `Stack.0.out`, `Stack.<field>` and
  `Stack.<field>.out`; a value like `ptr: ->Heap.0` draws an arrow to that slot.
- `btree` / `bplustree` — multi-key slotted B-tree nodes. Use `keys|keys -> children`
  edges; child pointers originate between separator slots.
- `pipeline` — CPU stage waterfall. Rows are `instruction: stage stage stage`;
  `_` is an empty cell, `STALL`/`BUBBLE`/`*` draws a hatched bubble.
- `gantt` — OS scheduling bars: `tasks="P1:0..4, P2:4..7, P3:7..11"`.
- `packet` / `bitfield` — byte-aligned header rows; `fields="Name:bits,..."`
  wraps across `bits`-wide rows.
- Typographic arrows (`→`) are accepted in `btree` edges and `memframe` pointer
  values as aliases for `->`.

#### Organic chemistry and discrete math (Drop #5)

```markdown
[sketch:
  chain at=(0, 0) carbons=6 bonds="2:=, 5:#" branches="3:^OH, 4:=O, 2:_Br"
  wedge C1 -> C2
  dash C2 -> C3
  chair at=(0, 140) axial="1:OH, 4:CH3" equatorial="2:Br"
  newman at=(220, 140) angle=60 front="CH3,H,H" back="Br,H,CH3"
  venn at=(0, 300) sets="A,B,C" shade="(A&B)-C"
  mapping at=(240, 300) domain="1,2,3" codomain="x,y" pairs="1->x, 2->y, 3->y"
  hasse at=(0, 480) edges="1->2, 1->3, 2->6, 3->6"
]
```

- `chain` / `alkane` / `molecule` — IUPAC 120-degree skeletal carbon chain.
  `bonds="index:=|#"` sets double/triple bonds; `branches="index:Group"` adds
  substituents. Prefix a branch group with `^` for a solid wedge, `_` for a
  dashed bond, or `=` for a double bond (`4:=O` for a carbonyl).
- `wedge A -> B` / `dash A -> B` — stereochemical wedge and dash bonds between
  any two points or registered atoms (`C1`, `C2`, ...).
- `chair` / `cyclohexane` — chair conformation with `axial="1:OH, 4:CH3"` and
  `equatorial="2:Br"` substituents; `flip=true` mirrors the chair.
- `newman` — Newman projection: `angle=60`, `front="CH3,H,H"`, `back="Br,H,CH3"`.
- `venn` — 2-set or 3-set Venn diagram. `shade=` accepts arbitrary boolean set
  expressions with `&` (intersection), `|` (union), `-` (difference),
  `^` (symmetric difference), and `!` (complement), e.g. `(A&B)-C`.
- `mapping` / `relation` — domain/codomain ovals with arrows from
  `pairs="1->a, 2->b, ..."`; `label=` sets the function label.
- `hasse` / `poset` / `lattice` — bottom-up Hasse diagram; minimal elements sit
  at the bottom, maximal elements at the top. `directed=true` adds arrowheads.

#### 3D surfaces, calculus, linear algebra and ODEs (Drop #6)

Keep each figure in its own `[sketch: ...]` block so it fits one notebook page.

```markdown
[sketch:
  title "3D saddle"
  surface3d at=(0, 0) fn="0.35*(x^2 - y^2)" xrange=(-2.5,2.5) yrange=(-2.5,2.5) steps=12
]
```

```markdown
[sketch:
  title "Midpoint Riemann sum"
  riemann at=(0, 0) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
]
```

```markdown
[sketch:
  title "2x2 matrix shear"
  matrixgrid at=(0, 0) matrix="1.4, 0.5, 0.3, 1.1" range=2 det=true
]
```

```markdown
[sketch:
  title "ODE slope field"
  slopefield at=(0, 0) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"
]
```

- `surface3d` / `plot3d` / `mesh3d` — plots `z = f(x, y)` over
  `xrange=(xmin,xmax)` and `yrange=(ymin,ymax)`. `steps=` controls mesh density
  (4–22); `azimuth=`/`elevation=` set the 3D view. Quads are depth-sorted and
  filled with paper colour, so hidden mesh lines disappear (Painter's algorithm).
- `riemann` — evaluates `fn` on `domain=(a,b)` with `n` partitions.
  `method=left`, `right`, `mid`, or `trap`. Rectangles/trapezoids are hatched,
  the curve is drawn on top, and sample dots mark the evaluation points.
- `matrixgrid` / `transform2d` — 2×2 matrix transformation grid.
  `matrix="a,b,c,d"` is row-major. It draws the dashed reference grid, the
  transformed lattice, the hatched determinant unit parallelogram, and the
  transformed basis vectors `i'`, `j'`. `det=false` hides the parallelogram.
- `slopefield` / `ode` — slope field for `dy/dx = f(x, y)`. `solutions` is a
  comma-separated list of initial points like `"(x0, y0), (x1, y1)"`; each one
  is integrated forward and backward with RK4 and drawn as a trajectory.

#### 2D page placement and cheat-sheet layouts (Drop #7)

Page size is selected at the top of a document:

```markdown
@page size=a4
@page size=a4-2col
@page size=a3-landscape cols=3
@page size=chart-xl cols=4
```

The same presets are available in the studio as **Canvas Size / Cheat-Sheet
Mode**. An explicit `@page` overrides the selector.

Any diagram can carry layout directives on its first lines:

```markdown
[sketch:
  @layout place=right w=44% scale=0.9
  title "Chair Conformation"
  chair axial="1:OH, 4:CH3" equatorial="2:Br"
]
```

Inline first-line form:

```markdown
[sketch:
  place=row w=46%
  title "Staggered Newman"
  newman angle=60 front="CH3,H,H" back="Br,H,CH3"
]
```

- `place=right` / `place=left` — floats beside the text; following text wraps
  in the remaining column width.
- `place=row` / `place=auto` — compact diagrams pack side-by-side on one shelf.
- `place=xy(x,y)` / `pin=(x,y)` — pins a diagram; the collision solver shifts it
  if the target overlaps another obstacle.
- `place=center` / `place=full` — centred or full-column diagram.
- `w=45%`, `w=260`, `size=xs|sm|md|lg|full`, `scale=0.5..2` — resize any diagram.
- `[DIAGRAM: ...]` tags accept the same keys inline, for example
  `[DIAGRAM: graph | place=right | w=45% | ...]`.

Text and diagrams are kept apart by a per-column exclusion manager, so floating
figures wrap text cleanly and pinned figures are automatically separated.

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
