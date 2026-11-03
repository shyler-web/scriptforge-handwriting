# ScriptForge

**Offline Declarative Sketchnote, 2D Math & Engineering Diagram Compiler (with MCP Server for AI Coding Agents).**

ScriptForge turns a small declarative document language into hand-written notebook pages:
prose, 2D mathematics, tables, Karnaugh maps, logic schematics, automata, graphs, plots and
raw SVG are compiled into vector ink strokes and exported as a multi-page PDF — entirely in
the browser, with no build step, no cloud service and no API key.

It is built for visual study guides, revision notebooks, engineering assignments and
accessible hand-written renditions of technical material.

![ScriptForge rendering a Digital Logic assignment](docs/screenshot.png)

---

## Why ScriptForge

- **Offline by design** — rendering, pagination, PDF compilation and note validation run
  locally. The optional vision parser is the only feature that can call a network API.
- **Declarative, not hand-drawn** — an agent or a human writes compact markup; the engine
  produces the handwriting, diagrams and page layout.
- **Agent-readable grammar** — an MCP server exposes note tools, a strict DSL validator and
  an authoring guide, so coding agents can create or correct notes without guessing.
- **Deterministic** — a seed reproduces the same page; different seeds resample every glyph
  and diagram tremor.
- **Printable** — every page compiles into a genuine multi-page PDF 1.4 file client-side.

---

## Quick start

Requires Node.js 18 or newer. There are no runtime dependencies to install.

```bash
npm run dev
# open http://localhost:8000
```

The studio boots with a demo assignment. Edit the markup, switch presets, change ink and
paper, then use **Export PDF** or **PNG**.

> The app uses native ES modules, so it must be served over HTTP. Any static server works:
> `python3 -m http.server 8000`, `npx serve .`, or the bundled `scripts/serve.mjs`.

---

## MCP server for AI coding agents

ScriptForge ships a zero-dependency MCP server over stdio. The agent supplies the model;
ScriptForge supplies storage, validation and rendering. No API keys and no network calls
are involved in the MCP path.

### Configure a client

**opencode** (`opencode.json` or project config):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "scriptforge": {
      "type": "local",
      "command": ["node", "/absolute/path/to/ScriptForge/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`) and most other MCP clients:

```json
{
  "mcpServers": {
    "scriptforge": {
      "command": "node",
      "args": ["/absolute/path/to/ScriptForge/mcp/server.mjs"]
    }
  }
}
```

Then ask the agent to use the `scriptforge` server, for example:

> Call `get_authoring_guide`, then create a public note `dsa/graphs/traversal` with a short
> explanation of BFS, one graph diagram and the complexity equation. Validate it before finishing.

### Tools

| Tool | Purpose |
|---|---|
| `get_authoring_guide` | Returns the full grammar, frontmatter keys and diagram types. |
| `list_notes` | Lists public or private notes with title, tags, path and timestamp. |
| `read_note` | Returns raw content, frontmatter and body for a slug. |
| `create_note` | Creates a validated note; optional `overwrite`. |
| `update_note` | Replaces an existing note with validated content. |
| `append_to_note` | Appends a validated section to an existing note. |
| `delete_note` | Deletes a note; requires `confirm: true`. |
| `validate_note` | Validates raw content or an existing slug with line-numbered errors and examples. |

Tool descriptions instruct agents to call `get_authoring_guide` before writing. Validation
failures return line numbers and a minimal syntax example so the agent can self-correct.

### Public and private notes

| Scope | Storage | Index | Git |
|---|---|---|---|
| `public` (default) | `notes/<slug>.md` | `notes/index.json` | tracked |
| `private` | `notes/private/<slug>.md` | `notes/private/index.json` | ignored |

A slug beginning with `private/` selects private scope automatically. Private metadata is
never written into the tracked public index.

### Browse and live-reload notes

Open a note directly in the studio:

```text
http://localhost:8000/?note=dsa/graphs/traversal
http://localhost:8000/?note=private/scratch
```

The **Notes** dropdown merges public and private indexes and labels private entries with
`[Private]`. Note requests are served with `Cache-Control: no-store`; when the page is opened
with `?note=<slug>`, ScriptForge polls for agent writes and offers **Reload** if the editor
has local edits.

### CLI fallback

For agents that do not speak MCP:

```bash
npm run notes -- list --scope public
npm run notes -- read dsa/graphs
npm run notes -- create dsa/trees --title "Trees" --tags dsa,trees --file section.md
npm run notes -- validate --file section.md
npm run notes -- index
```

Content can also be piped on stdin. A slug beginning with `private/` selects private scope.

---

## Note format

Notes are plain text with optional frontmatter:

```markdown
---
title: Graph Theory Revision
tags: dsa, graphs, exam
font: Kalam
ink: ballpoint_blue
paper: ruled_margin
seed: 4219
---

# Graph Theory

A graph $G = (V, E)$ has degree sum:

$$ \sum_{v \in V} \deg(v) = 2|E| $$

[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A,A-C | layout=auto]
```

Supported `font`, `ink` and `paper` values are listed in the
[authoring guide](docs/notes-authoring.md), together with every diagram type and the exact
LaTeX allowlist.

The renderer enforces a few hard rules: display math must be single-line `$$ ... $$`, a
diagram block must be alone on its line, inline `$` must be closed, and unsupported LaTeX
commands are rejected rather than silently swallowed.

---

## Features

- **Allographic handwriting engine** — every character is warped with continuous noise,
  affine shear and pressure-modulated ink; adjacent identical characters draw different
  structural allographs.
- **2D mathematics** — fractions, radicals, matrices, cases, integrals, sums with limits,
  delimiters and accents, laid out as strokes rather than typeset glyphs.
- **Diagram compilers** — tables, bitfields, Karnaugh maps, logic and flip-flop schematics,
  DFAs, trees, linked lists, general graphs (layered/circular/bipartite/tree/Hasse), function
  plots, geometry and re-inked raw SVG.
- **Paper and camera realism** — ruled, quad-grid, Cornell and blank stationery, fibre grain,
  spine curvature, phone-camera shadow and vignette.
- **Multi-page flow** — automatic pagination that never slices a display equation or a
  diagram; deterministic per-page variation.
- **Client-side PDF export** — PDF 1.4 with one JPEG XObject per page, no server and no PDF
  library.
- **Responsive studio** — editor, notebook pages and ink/physics controls become tabs below
  1024 px.
- **Notes library + MCP** — agent-writable notes with validation, public/private scopes and
  live reload.

---

## Document markup

| Syntax | Renders as |
|---|---|
| `# Heading` … `###### Heading` | Larger hand-underlined heading |
| `$ ... $` | Inline 2D math |
| `$$ ... $$` | Single-line display 2D math |
| `[DIAGRAM: grid \| cols=A,B \| rows=1~2,3~4]` | Hand-ruled table |
| `[DIAGRAM: bitfield \| bits=32 \| fields=Op:6,R1:4,Unused:22]` | Segmented register strip |
| `[DIAGRAM: kmap \| vars=A,B,C,D \| ones=0,2,5,7]` | Karnaugh map |
| `[DIAGRAM: circuit \| expr=(A AND B) OR C]` | Logic-gate schematic |
| `[DIAGRAM: dfa \| states=q0,q1 \| accept=q1 \| edges=q0->q1:0]` | State automaton |
| `[DIAGRAM: tree \| nodes=50,30,70 \| edges=50-30,50-70]` | Binary tree |
| `[DIAGRAM: graph \| nodes=A,B,C \| edges=A-B,B-C]` | General graph |
| `[DIAGRAM: canvas2d \| fn=4*x^3 \| domain=0,1]` | Function plot |
| `[DIAGRAM: svg \| <svg ...>...</svg>]` | Any SVG, re-inked by hand |
| `~~wrong term~~` | Pen scratch-out |
| `---PAGE---` | Forced page break |

See [`docs/notes-authoring.md`](docs/notes-authoring.md) for the complete grammar.

---

## Architecture

```text
index.html                  Studio shell; controls use data-action / data-arg.
notes/                      Public notes and generated index.json.
shared/note-format.mjs      Frontmatter parsing and title/slug rules (browser + Node).
mcp/
  server.mjs                MCP stdio transport (newline JSON-RPC + Content-Length).
  tools.mjs                 Tool definitions and handlers.
  notes-store.mjs           Path-jailed CRUD, atomic writes, scope-aware indexes.
  note-schema.mjs           DSL validator grounded in the real renderers.
src/
  main.js                   Studio boot and notes-library initialization.
  core/                     Config, noise, state, render options.
  render/                   Glyph bank, paper, pagination, PDF, math and diagrams.
  ui/                       Event router, controls, notes library, optional VLM.
scripts/
  serve.mjs                 Zero-dependency static server (no-store for /notes/).
  notes-cli.mjs             MCP-free note operations.
  build-notes-index.mjs     Regenerates the public and private indexes.
  verify-notes.mjs          Note-format, validator and store tests.
  verify-mcp.mjs            End-to-end MCP stdio smoke test.
  verify-waves.mjs          Renderer and security exit-criteria checks.
  qa/                       Headless-Chrome assertion suites.
assets/                     Self-hosted fonts, compiled Tailwind, vendored Rough.js.
docs/                       Screenshot, authoring guide and design records.
```

---

## Verification

```bash
npm run verify:notes          # note store, validator, MCP transport and indexes
node scripts/verify-waves.mjs # renderer, math, diagram and secret-leak checks
```

Browser QA requires the dev server:

```bash
npm run dev
node scripts/qa/harness.mjs scripts/qa/wave1.assertions.js
node scripts/qa/harness.mjs scripts/qa/wave2.assertions.js
node scripts/qa/harness.mjs scripts/qa/wave3.assertions.js
node scripts/qa/harness.mjs scripts/qa/mobile.assertions.js
```

If you change Tailwind utility classes, regenerate the stylesheet:

```bash
node scripts/build-tailwind.mjs
```

---

## Security and privacy

- The MCP server has no network access, no shell access and no credentials. It reads and
  writes only inside `notes/`; path traversal and absolute paths are rejected.
- Writes are limited to 256 KB, validated before they land, and performed atomically.
- `delete_note` requires `confirm: true`.
- `notes/private/` and its index are git-ignored. Personal PDFs, notebooks, archives and
  internal planning material are ignored too.
- The optional vision-language parser is the only network-capable data feature. A key entered
  in its modal is used directly from the browser and is never stored or committed; leaving it
  blank keeps the pipeline fully local. Lucide icons load from a CDN and fail gracefully offline.

---

## Known limitations

- Pagination uses an upper-bound block estimate, so a page can end slightly early rather
  than clip content.
- Not every diagram parameter is honoured by every legacy alias; the universal engines
  (`grid`, `schematic`, `canvas2d`, `graph`, `svg`) have the widest coverage.
- DFA return-arc transition labels are drawn as curves but are not yet annotated.
- The zero-clone inspector currently visualises the slant delta only.
- The browser reader is read-only. Agents write notes through MCP or the CLI; the studio
  loads them and can export the rendered result.

---

## Provenance

ScriptForge was split out of a single 2090-line HTML file. The split was verified
pixel-identical against the original: rendered canvas bytes, interactive control behaviour
and the image-to-diagram pipeline all match. Vendored assets retain their original licences;
see `assets/vendor/rough.LICENSE`, `assets/fonts/OFL.txt` and `assets/fonts/NOTICE.md`.
