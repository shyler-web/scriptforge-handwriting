---
name: scriptforge-notes
description: Author, validate, update and render ScriptForge Studio handwritten notes, diagrams and declarative sketch scenes.
version: 1.0.1
updated: 2026-11-04
maintainer: ScriptForge
---

# ScriptForge Notes — Complete Agent Skill

This is the operating manual for an AI agent that writes notes for **ScriptForge
Studio**. It covers the note format, every diagram family, the `[sketch]` DSL,
2D page placement, validation and the local maintenance contract.

**Source of truth:** `skills/scriptforge-notes/SKILL.md`.
The living authoring reference is `docs/notes-authoring.md`; keep both in sync.

This skill is portable: every path is relative to the ScriptForge project root.
It does not depend on a particular machine, user or operating system.

---

## 1. Non-negotiable workflow

1. Read this skill and, when available, call `get_authoring_guide`.
2. Inspect existing notes with `list_notes` / `read_note`.
3. Prefer **private** notes while drafting (`private/<slug>`).
4. Create or update the note, then call `validate_note`.
5. Fix every validation error and re-validate.
6. Open the note in the studio and confirm it renders.
7. Only then report success.

Never claim a note is correct without a passing `validate_note`.

Studio:

```bash
# from the ScriptForge project root
npm run dev          # http://localhost:8000
```

Any static server rooted at the project directory also works:

```bash
python3 -m http.server 8000
```

Open a saved note:

```text
http://localhost:8000/?note=<slug>
```

Hard-refresh the page after changing renderer code (`Ctrl+Shift+R`).

---

## 2. Notes, scopes and MCP tools

| Scope | File | Index | Git |
|---|---|---|---|
| `public` | `notes/<slug>.md` | `notes/index.json` | tracked |
| `private` | `notes/private/<slug>.md` | `notes/private/index.json` | ignored |

A slug beginning with `private/` selects private scope automatically.

### MCP tools

| Tool | Purpose |
|---|---|
| `get_authoring_guide` | Return the full `docs/notes-authoring.md` guide |
| `list_notes` | List notes in a scope (default public) |
| `read_note` | Read body, frontmatter and metadata |
| `create_note` | Create a note; refuses overwrite unless `overwrite:true` |
| `update_note` | Replace the whole note |
| `append_to_note` | Append a validated section |
| `validate_note` | Validate without writing; returns line-numbered errors |
| `delete_note` | Delete a note; requires `confirm:true` |

### Frontmatter

```yaml
---
title: Graph Theory Revision
tags: graphs, exam, discrete
font: Kalam
ink: ballpoint_blue
paper: engineering_grid
seed: 4219
---
```

| Key | Values |
|---|---|
| `title` | any text |
| `tags` | comma-separated |
| `font` | `Caveat`, `Kalam`, `Indie Flower`, `Patrick Hand`, `Shadows Into Light` |
| `ink` | `ballpoint_blue`, `gel_navy`, `pilot_black`, `graphite`, `crimson` |
| `paper` | `ruled_margin`, `engineering_grid`, `cornell`, `blank_a4` |
| `seed` | integer for deterministic variation |

Frontmatter is optional for private scratch notes, but useful for shared notes.

---

## 3. Base note format

A note is Markdown-like text. Supported constructs:

| Syntax | Result |
|---|---|
| `# Heading` … `###### Heading` | Hand-underlined heading |
| Plain prose | Handwritten words with automatic wrapping |
| `$inline math$` | Inline 2D math |
| `$$ display math $$` | Display 2D math on one line |
| a `$$` line … content … a `$$` line | Multi-line display math block; collapsed automatically |
| `~~wrong term~~` | Pen scratch-out |
| `---PAGE---` or `[PAGEBREAK]` | Forced page break |
| `[DIAGRAM: type \| key=value \| ...]` | Diagram block, alone on its line |
| `[sketch:` … `]` | Multi-line declarative sketch scene |

### Hard rules

1. A `[DIAGRAM: ...]` block must be alone on its line.
2. Every inline `$` needs a matching `$` on the same line.
3. In `[DIAGRAM]` parameters, `|` separates parameters. Inside a `[sketch]`
   block, quoted values may contain `|` (the b-tree syntax relies on it).
4. A `[sketch]` block must end with a `]` line.
5. Math uses the allowlist (section 8); unsupported commands are rejected.
6. Keep note blocks reasonably sized. Split giant scenes into several
   `[sketch]` blocks so they can paginate and place cleanly.

---

## 4. Diagram tags

General form:

```markdown
[DIAGRAM: type | key=value | key=value]
```

| Type / aliases | Purpose |
|---|---|
| `grid`, `table` | Compact hand-ruled tables, pipeline tables |
| `bitfield` | 32-bit / N-bit instruction fields |
| `kmap` | Karnaugh maps |
| `schematic`, `circuit`, `flipflop`, `dfa`, `nfa`, `fsm` | Logic, flip-flops, automata |
| `tree`, `list` | Trees and linked lists |
| `graph` | General graphs: `layout=auto|layered|circular|bipartite|tree|hasse` |
| `canvas2d`, `plot`, `geometry`, `target`, `vectors` | Plots, functions, geometry |
| `svg` | Raw SVG, re-inked as handwriting |
| `custom_image` | Offline traced image (one per note) |
| `sketch` | Multi-line declarative scene (preferred for rich figures) |

Useful graph parameters: `nodes=`, `edges=`, `layout=`, `levels=`,
`highlight=`, `highlightNodes=`, `showDegrees=true`, `directed=true`,
`caption=`.

Useful grid parameters: `cols=`, `rows=` (cells `~`, rows `;`), `cells=`,
`pointers=`, `fields=`, `bits=`.

---

## 5. `[sketch]` language

A sketch is a sequence of statements separated by newlines or `;`.
Comments use `//` outside quotes. Values may be quoted with `"..."`.

```markdown
[sketch:
  title "My figure"
  let R = 60
  point O = (0, 0) label="$O$" pos=sw
  point A = O + polar(R, 40) label="$A$"
  node M at (120, 0) shape=box label="$m$" fill=hatch
  spring O -> M coils=6 amp=7 label="$k$"
  support (-30, 25) -- (180, 25) side=below
]
```

### 5.1 Coordinates, variables, anchors

- Tuples: `(x, y)` or `(x, y, z)` (3D via projector).
- Arithmetic: `+ - * / ^`, parentheses, `pi`, `e`, user variables.
- `polar(r, deg)`, `mid(A, B)`, `midpoint(A, B)`, `lerp(A, B, t)`.
- `p3d(x, y, z)` with `camera3d azimuth= elevation= scale=`.
- Node anchors: `A.n`, `A.s`, `A.e`, `A.w`, `A.ne`, `A.nw`, `A.se`, `A.sw`,
  `A.c`, `A.angle(deg)`.
- Registered points can be referenced by name, including `C1..Cn` from chains
  and `S.0`, `S.0.out`, `S.<field>` from memory frames.

### 5.2 Nodes and placement

```markdown
node A at=(0, 0) "Source"
node B right="of A" gap=45 "Target"
box C below="of A" w=100 h=44 label="Block"
state q0 at=(0, 0) shape=circle "q0"
```

Relative attributes: `left`, `right`, `above`, `below`, `ne`, `nw`, `se`, `sw`,
`between="A,B"`, `alignX=`, `alignY=`, `gap=`.
Shape values: `box`, `rect`, `circle`, `doublecircle`, `ellipse`, `oval`,
`diamond`, `cylinder`, `db`, `point`, `none`, `text`.
Other attributes: `w=`, `h=`, `size=(w,h)`, `r=`, `label=`, `sub=`, `fill=`,
`hatchAngle=`, `color=`, `dashed=true`.

Containers:

```markdown
row at=(0,0) nodes="A,B,C" gap=110
col at=(0,0) nodes="X,Y" gap=80
ring at=(0,0) nodes="N,E,S,W" gap=95
```

### 5.3 Auto layouts

```markdown
tree edges="10->5, 10->15, 5->2, 5->7, 15->_, 15->20" costs="0:cn, 1:2c(n/2)"
dag dir=LR edges="Lexer->Parser->AST->Codegen"
graph layout=force edges="A--B, B--C, C--A"
graph layout=bipartite edges="A--B, B--C"
hasse edges="1->2, 1->3, 2->6, 3->6"
```

- `tree` / `bst`: Reingold–Tilford. `_`, `null`, `nil` create phantom children.
  `costs="level:label,..."` adds recursion-tree callouts.
- `dag` / `flowchart`: Sugiyama layers, crossing reduction, back-edge bends.
  `dir=TB|LR`; `rankGap=`, `nodeGap=`.
- `graph` / `network`: `layout=force|circle|bipartite`; `directed=true`.
- `hasse` / `poset` / `lattice`: bottom-up poset; `directed=true` for arrows.
- `cluster` / `group` / `subgraph`: `nodes="A,B,C" label="Group"`.

### 5.4 Connectors and routing

```markdown
arrow A -> B
line A -- B
vector O -> F label="$F$"
arrow A -> B route=ortho label="bypass"
arrow A -> B route=avoid label="curved"
arrow A.ne -> B.w
arrow q0 -> q0 loop=n label="0,1"
spring A -> B coils=6 amp=7
wave A -> B freq=5 amp=6
resistor A -> B freq=5 amp=6
brace A -> B amp=12 label="span"
support (-30, 25) -- (180, 25) side=below
dim (0, 0) -> (120, 0) offset=24 label="L"
wedge C1 -> C2
dash C2 -> C3
```

Connector attributes: `from=`, `to=`, `head=`, `bend=`, `route=`,
`label=`, `side=above|below|left|right`, `labelAt=tip|mid`,
`dashed=true`, `style=dashed`, `coils=`, `freq=`, `amp=`, `offset=`,
`flip=true`, `hatchSide=`, `color=`.
Ports use `.n`, `.s`, `.e`, `.w`; parallel edges between the same pair are
offset automatically.

### 5.5 Physics, optics and fields

```markdown
incline at=(0,0) angle=30 mass="$m$" friction="$f_k$" components=true
atwood at=(0,0) r=28 m1="$m_1$" m2="$m_2"
optics at=(0,0) kind=convex f=65 u=125 h=40
charges at=(0,0) q1=1 q2=-1 rays=10
vectorfield at=(0,0) fx="-y" fy="x"
```

- `incline` / `ramp` / `fbd`: ramp, rotated block, weight, normal, optional
  friction and dashed `mg sin/cos` components.
- `atwood` / `pulleys`: single pulley or two-pulley belt; `p2=`, `r1=`, `r2=`,
  `crossed=true`, `hangLeft=`, `hangRight=`.
- `optics` / `lens`: thin lens or mirror; `kind=convex|concave`, `f`, `u`, `h`.
- `charges` / `dipole`: RK4 field lines; `q1`, `q2`, `sep`, `rays`.
- `vectorfield` / `quiver`: grid of vectors from `fx` and `fy` expressions.

### 5.6 Chemistry

```markdown
chain at=(0,0) carbons=6 bonds="2:=, 5:#" branches="3:^OH, 4:=O, 2:_Br"
chair at=(0,0) axial="1:OH, 4:CH3" equatorial="2:Br"
newman at=(0,0) angle=60 front="CH3,H,H" back="Br,H,CH3"
```

- `chain` / `alkane` / `molecule`: 120° skeletal backbone. Bond orders:
  `index:=` (double) or `index:#` (triple). Branches: `index:Group`.
  A leading `^` draws a solid wedge, `_` a dashed bond, `=` a double bond.
- `chair` / `cyclohexane`: chair conformation; `axial`, `equatorial`, `flip=true`.
- `newman`: front Y-spokes and rear dihedral bonds.
- `wedge A -> B`, `dash A -> B`: standalone stereobonds.

### 5.7 Computer systems

```markdown
waveform at=(0,0) signals="CLK:P......., D:0.1..0.., Q:x.01..0., BUS:=A0..=FF.."
linkedlist at=(0,0) values="10,20,35,50" head="head" pointers="1:slow, 3:fast"
memframe id=Stack at=(-80,0) title="Stack" fields="n: 4, head: ->Heap.0"
memframe id=Heap at=(80,0) title="Heap" fields="val: 42, next: NULL"
btree at=(0,0) edges="20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55"
pipeline at=(0,0) rows="ADD R1,R2: IF ID EX MEM WB | SUB R3,R1: _ IF ID STALL EX MEM"
gantt at=(0,0) tasks="P1:0..4, P2:4..7, P3:7..11"
packet at=(0,0) bits=32 fields="Src Port:16, Dst Port:16, Seq Num:32"
```

- `waveform` / `timing`: `p`/`P` clock, `0`/`1`, `x` don't-care, `z` high-Z,
  `=DATA` bus, `.` repeats the previous cycle.
- `linkedlist` / `llist`: `doubly=true`, `circular=true`, `head=`,
  `pointers="index:label,..."`, `null=false`.
- `memframe` / `struct` / `activation`: registers `id.index`, `id.field`,
  `id.index.out`, `id.field.out`; values `->Target.index` draw pointer arrows.
- `btree` / `bplustree`: `keys|keys -> children`.
- `pipeline`: `_` empty, `STALL`/`BUBBLE`/`*` hatched bubble.
- `gantt`: `label:start..end`.
- `packet` / `bitfield`: `Name:bits` fields wrap across `bits`-wide rows.

### 5.8 Discrete mathematics

```markdown
venn at=(0,0) sets="A,B,C" shade="(A&B)-C"
mapping at=(0,0) domain="1,2,3,4" codomain="a,b,c" pairs="1->a, 2->b, 3->b, 4->c"
```

- `venn`: 2-set or 3-set; `shade=` supports `&`, `|`, `-`, `^`, `!`, parentheses.
- `mapping` / `relation`: domain/codomain ovals; `domainLabel=`,
  `codomainLabel=`, `label=` (function label).
- `hasse` (section 5.3) completes the discrete set.

### 5.9 3D, calculus and linear algebra

```markdown
surface3d at=(0,0) fn="0.35*(x^2 - y^2)" xrange=(-2.5,2.5) yrange=(-2.5,2.5) steps=12
riemann at=(0,0) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
matrixgrid at=(0,0) matrix="1.4, 0.5, 0.3, 1.1" range=2 det=true
slopefield at=(0,0) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"
```

- `surface3d` / `plot3d` / `mesh3d`: `fn`, `xrange`, `yrange`, `steps=4..22`,
  `azimuth`, `elevation`. Quads are depth-sorted; hidden lines are masked.
- `riemann`: `fn`, `domain=(a,b)`, `n`, `method=left|right|mid|trap`.
- `matrixgrid` / `transform2d`: `matrix="a,b,c,d"` row-major; `det=true|false`.
- `slopefield` / `ode`: `dy=`, `solutions="(x0,y0), (x1,y1)"`; RK4 curves.

### 5.10 General drawing primitives

```markdown
point P = (0,0) label="$P$" pos=ne
angle (1,0) O A label="$\\theta$"
circle at=(0,0) r=36 label="$O$"
pulley at=(0,0) r=28
polygon (0,0) (60,0) (30,50) fill=hatch
spline (0,0) (40,30) (80,0)
tape at=(0,0) cells="1,0,1,B,1" head=2 state="$q_0$"
ring6 at=(0,0) r=34 aromatic=true
axes at=(0,0) xrange=-4,4 yrange=-3,3 w=260 h=180 grid=true
plot fn=sin(x) domain=0,6.28 label="$\\sin x$"
parametric x="cos(t)" y="sin(t)" domain=(0,6.28)
shade fn="sin(x)" f2=0 domain=(0,3.14)
label at=(0,0) text="$E=mc^2$" align=center
axes3d size=85 xlabel="$x$" ylabel="$y$" zlabel="$z$"
```

---

## 6. Page layout and cheat sheets (Drop #7)

### 6.1 Document page preset

Put this on its own line anywhere in the document (the first `@page` wins):

```markdown
@page size=a4
@page size=a4-2col
@page size=a3-landscape cols=3
@page size=chart-xl cols=4
```

| Preset | Canvas | Columns |
|---|---|---|
| `a4` | 820 × 1100 | 1 |
| `a4-2col` | 820 × 1100 | 2 |
| `a3-landscape` | 1560 × 1100 | 3 |
| `chart-xl` | 1920 × 1360 | 4 |

Overrides: `cols=1..6`, `w=`, `h=` (pixels). The studio's **Canvas Size /
Cheat-Sheet Mode** selector provides the same presets; `@page` takes precedence.

### 6.2 Diagram placement

```markdown
[sketch:
  @layout place=right w=44% scale=0.9
  title "Chair"
  chair axial="1:OH, 4:CH3"
]
```

- `place=right|left` — float beside the text; following prose wraps.
- `place=row|auto` — compact diagrams pack side-by-side on a shelf.
- `place=xy(x,y)` or `pin=(x,y)` — pin; collision solver shifts if needed.
- `place=center` — centred block.
- `place=full` — full-column block.
- `w=45%`, `w=260`, `size=xs|sm|md|lg|full`, `scale=0.5..2`.
- `pad=12` — exclusion padding.
- Inline form is allowed on the first line: `place=row w=46%`.
- Non-sketch diagrams accept the same keys inline:
  `[DIAGRAM: graph | place=right | w=45% | ...]`.

### 6.3 Spatial behaviour

- Floating diagrams do not advance the text cursor; text is carved into the
  remaining horizontal interval.
- Row shelves pack until the next heading/paragraph, then flush below.
- Pinned diagrams are checked against all existing diagram obstacles and
  shifted to a free horizontal slot or below the lowest collision.
- Text and diagrams never intentionally overlap.

---

## 7. Math allowlist

Supported constructs:

- Greek letters, relations, arrows, set/logic symbols, binary operators.
- `\frac`, `\dfrac`, `\tfrac`, `\cfrac`, `\binom`, `\dbinom`, `\tbinom`.
- `\sqrt{x}`, `\sqrt[n]{x}`.
- `\overline`, `\underline`, `\bar`, `\vec`, `\hat`, `\widehat`, `\tilde`,
  `\widetilde`, `\dot`, `\ddot`, `\overbrace`, `\underbrace`.
- `\int`, `\iint`, `\iiint`, `\oint`, `\sum`, `\prod`, `\coprod`, `\bigcup`,
  `\bigcap`, `\bigoplus`, `\lim`, `\limsup`, `\liminf`, `\max`, `\min`, `\sup`,
  `\inf`.
- `\left ... \middle ... \right`.
- Environments: `bmatrix`, `pmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`,
  `matrix`, `cases`, `aligned`, `align`, `array`.
- Named functions: `sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh
  log ln lg exp det dim ker hom arg deg gcd Pr mod`.
- Spacing: `\, \: \; \! \quad \qquad` and `\ `.
- Text wrappers: `\text`, `\textrm`, `\textbf`, `\textit`, `\texttt`, `\mathrm`,
  `\mathbf`, `\mathbb`, `\mathcal`, `\mathfrak`, `\mathsf`, `\operatorname`,
  `\mbox`.

Anything else is rejected with a line number and an example.

---

## 8. Copy-paste recipes

### Floating figure with wrapped text

```markdown
## Cyclohexane and Newman

[sketch:
  @layout place=right w=42% scale=0.9
  title "Chair"
  chair at=(0, 0) axial="1:OH, 4:CH3" equatorial="2:Br"
]
The chair conformation removes angle strain and most torsional strain. Bulky
groups prefer the equatorial position, and this paragraph wraps on the left.

[sketch:
  @layout place=row w=46%
  title "Newman"
  newman at=(0, 0) angle=60 front="CH3,H,H" back="Br,H,CH3"
]
[sketch:
  @layout place=row w=46%
  title "Ketone"
  chain at=(0, 0) carbons=6 bonds="2:=" branches="4:=O, 3:^OH"
]
```

### Three-column cheat sheet

```markdown
@page size=a3-landscape cols=3

# Complete Chapter Cheat Sheet

[sketch:
  @layout place=full
  surface3d fn="0.35*(x^2 - y^2)" steps=10
]

[sketch:
  @layout place=right w=44%
  riemann fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
]
The Riemann partition approximates the area under the curve.
```

### Systems one-pager

```markdown
@page size=a4-2col

# Systems

[sketch:
  @layout place=full
  waveform signals="CLK:P......., D:0.1..0.., Q:x.01..0."
]

[sketch:
  @layout place=row w=46%
  linkedlist values="10, 20, 35, 50" pointers="1:slow, 3:fast"
]
[sketch:
  @layout place=row w=46%
  btree edges="20|40 -> 5|10|15, 20|40 -> 25|30"
]
```

---

## 9. Validation and troubleshooting

### Validate before finishing

```text
validate_note({ content: "..." })
```

The validator checks brackets, `[sketch]` blocks, frontmatter and note size.

### Common problems

| Symptom | Cause | Fix |
|---|---|---|
| Raw `$$` or LaTeX in output | Old multi-line math in a non-collapsed path | Use one-line `$$ ... $$`; the renderer also collapses `$$` blocks |
| Diagram is one giant node | Hyphen/U+2192 mismatch in an edge spec | Use `->` or `→`; both are supported |
| `bypass` label inside a node | Arrow endpoint was not recognized | Use `A -> B`; Unicode `→` also works |
| Diagram overlaps text | Layout directives missing or page preset too narrow | Use `@layout place=right/row` and `@page size=...` |
| Huge scene clipped | One sketch taller than the page | Split into multiple `[sketch]` blocks |
| `|` parameter error | `|` used as a separator inside `[DIAGRAM]` values | Quote values or use a `[sketch]` block |
| Validation error | Unbalanced `()`/`[]`/`$$` or unknown diagram | Read the line number and fix that line |

### Size guidance

- Keep each `[sketch]` block roughly under one page tall.
- Prefer `place=right` or `place=row` for compact figures.
- Use `place=full` for 3D, optics, vector fields and long timing diagrams.
- Split chapters into sections with headings; the compositor paginates.

---

## 10. Maintenance contract for local agents

The skill file **must be updated whenever a feature is added or changed**.
This is part of the definition of done.

### Files to update together

1. `skills/scriptforge-notes/SKILL.md` — this file (commands, examples, version).
2. `docs/notes-authoring.md` — the human-facing authoring reference.
3. `src/ui/snippets.js` — Insert palette presets (if user-insertable).
4. `src/data/presets.js` — demo presets (if it is a flagship feature).
5. `scripts/verify-*.mjs` — regression coverage for the new feature.
6. `README.md` — feature list / module map when relevant.

### Checklist

- [ ] New command or option documented in this file.
- [ ] `docs/notes-authoring.md` updated.
- [ ] A copy-paste example added if useful.
- [ ] Insert palette entry added in `src/ui/snippets.js` when appropriate.
- [ ] Demo preset updated in `src/data/presets.js` when appropriate.
- [ ] Regression test added to the relevant `scripts/verify-*` suite.
- [ ] `version` and `updated` bumped at the top of this file.
- [ ] `npm run verify` passes.
- [ ] `npm run verify:notes` passes.
- [ ] Studio hard-refreshed and the **AI Skill** download checked.

### Do not

- Do not document a command that does not exist in the renderer.
- Do not let `docs/notes-authoring.md` and this skill drift.
- Do not remove backward-compatible syntax without an explicit migration note.
- Do not rely on stale browser modules; hard-refresh after renderer changes.

---

## 11. Download and local usage

The studio header/notes panel has a **Download AI Skill** button. It fetches the
latest `skills/scriptforge-notes/SKILL.md` with `cache: "no-store"` and saves it
as `scriptforge-notes-SKILL.md`.

Local CLI equivalent:

```bash
cp skills/scriptforge-notes/SKILL.md /tmp/scriptforge-notes-SKILL.md
```

For agents that can read the repository directly, use the file path above; the
download button is for pasting the skill into another agent or chat.
