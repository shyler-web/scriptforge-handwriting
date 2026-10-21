# ScriptForge Studio

Dynamic stroke, 2D math and hand-drawn diagram engine. Turns a plain-text document into a
hand-written notebook page rendered as vectors — with every glyph uniquely perturbed, so no two
letters on the page are ever identical.

![ScriptForge Studio rendering a Digital Logic assignment](docs/screenshot.png)

## Features

- **Allographic glyph engine** — each character is sliced into micro-strips and warped with
  continuous Perlin noise, affine shear and pressure-modulated ink, so a page of `a` and `e`
  never looks like a font.
- **2D spatial LaTeX** — a real parser and renderer for fractions, integrals and sums with
  limits, radicals, matrices, overbars, sub- and superscripts, drawn as strokes rather than
  typeset.
- **Hand-sketched diagram engine** — Karnaugh maps with implicant loops, IEEE logic-gate
  schematics, DFA state graphs, damped-response plots.
- **Image → hand-traced vector** — upload any printed diagram and it is thresholded, traced into
  contours and re-drawn with pen tremor.
- **Paper and camera realism** — ruled / quad-grid / Cornell stationery, fibre grain, spine
  curvature, phone-camera shadow and vignette.

## Running it

The app uses native ES modules, so browsers will not load it from a `file://` path. Serve the
folder over HTTP:

```bash
npm run dev        # http://localhost:8000
```

No dependencies to install — `npm run dev` uses the bundled zero-dependency static server in
`scripts/serve.mjs`. Any other static server works too:

```bash
python3 -m http.server 8000
npx serve .
```

> **Network is optional.** Rough.js is vendored at `assets/vendor/rough.js`, Tailwind is
> compiled ahead of time into `assets/styles/tailwind.css`, and the handwriting webfonts are
> self-hosted under `assets/fonts/`. Layout, sketching and handwriting all work fully offline.
> Only the Lucide icon set is still fetched from a CDN; without it the icons simply disappear
> and every button keeps working through its text label.
>
> **Editing Tailwind classes?** `assets/styles/tailwind.css` is generated, not hand-edited.
> After adding or removing a utility class in `index.html` or `src/`, regenerate it:
>
> ```bash
> node scripts/build-tailwind.mjs
> ```

## Document markup

The editor accepts plain prose plus a small markup language:

| Syntax | Renders as |
|---|---|
| `# Heading` | Larger, hand-underlined heading |
| `$$ ... $$` | Display 2D math on its own lines |
| `$ ... $` | Inline 2D math inside a sentence |
| `[DIAGRAM: grid \| cols=A,B \| rows=1~2,3~4]` | A hand-ruled table |
| `[DIAGRAM: bitfield \| bits=32 \| fields=Op:6,R1:4,Unused:22]` | A segmented register strip |
| `[DIAGRAM: kmap \| vars=A,B,C,D \| ones=0,2,5,7]` | A Karnaugh map with those minterms set |
| `[DIAGRAM: circuit \| nodes=... \| edges=...]` | A logic-gate schematic |
| `[DIAGRAM: dfa \| states=q0,q1 \| transitions=...]` | A state automaton |
| `[DIAGRAM: tree \| nodes=... \| edges=...]` | A binary tree |
| `[DIAGRAM: plot \| label=Response]` | A damped-response function plot |
| `[DIAGRAM: custom_image]` | A contour trace of an uploaded image |
| `~~wrong term~~` | A multi-pass pen scratch-out |

## Module map

```
index.html                  Shell markup. Controls declare intent via data-action / data-arg.
assets/styles/app.css       Extracted stylesheet (project overrides).
assets/styles/tailwind.css  Generated Tailwind bundle. Rebuild with scripts/build-tailwind.mjs.
assets/vendor/rough.js      Vendored Rough.js 4.6.6 (MIT) — the sketching dependency.
assets/fonts/               Self-hosted handwriting webfonts (WOFF2, OFL 1.1).
assets/styles/fonts.css     @font-face rules for the self-hosted fonts.
docs/screenshot.png         Rendered sample page.
scripts/serve.mjs           Zero-dependency static dev server.
scripts/build-tailwind.mjs  Offline Tailwind compiler for assets/styles/tailwind.css.
src/
  main.js                   Entry point: boots the studio on window load.
  core/
    config.js               Canvas geometry, HiDPI factor, ink palettes. Pure data.
    noise.js                Deterministic Perlin/value noise engine.
    state.js                The single mutable state store (seed, ink, inspector, contours).
    options.js              Reads the live control-panel values into the render options.
  data/
    presets.js              The three demo documents.
  render/
    glyph.js                Allographic glyph + word rendering (the zero-clone engine).
    math/
      parser.js             LaTeX -> recursive 2D box AST (supsub, frac, binom, sqrt,
                            accent, bigop, delim, matrix).
      measure.js            AST bounding-box measurement + ruled-line snap invariant.
      renderer.js           AST -> hand-drawn strokes, stretchy delimiters.
    diagrams/
      index.js              Dispatcher: parses the spec, builds the ink style, routes by type.
      primitives.js         Rounded rects, arrows, curly braces, hachure, logic gates.
      grid.js               Universal grid engine: tables, bitfields, K-maps, array strips.
      schematic.js          Universal schematic engine: circuits, automata, trees, lists.
      kmap.js               Legacy alias -> grid.js.
      circuit.js            Legacy alias -> schematic.js.
      dfa.js                Legacy alias -> schematic.js.
      plot.js               Function plot with damping envelope.
      customImage.js        Vectorized uploaded-image contours.
    paper.js                Stationery background, spine shadow, camera lighting.
    page.js                 Full-page compositor — lays the document out on the canvas.
  pipeline/
    vectorize.js            Image -> luminance-gradient edges -> chained polylines.
  ui/
    controls.js             The actions the interface can trigger.
    events.js               Delegated data-action wiring.
    vlm.js                  Optional vision-language document parser.
```

## Adding a feature

- **A new control** — add `data-action="..."` to the element in `index.html`, then add an entry
  to the matching map in `src/ui/events.js` (`CLICK_ACTIONS`, `CHANGE_ACTIONS` or
  `INPUT_ACTIONS`) and the action function in `src/ui/controls.js`. Sliders use
  `data-arg="<input id>"` plus an optional `data-suffix` for the readout (`slantAngle` uses `°`).
- **A new diagram type** — write `src/render/diagrams/<type>.js` exporting `draw<Name>(d)` and
  return the vertical space consumed, then register it in `src/render/diagrams/index.js`. The `d`
  context object is documented at the top of that file.
- **A new math primitive** — add a node type in `src/render/math/parser.js`, a measurement rule
  in `measure.js`, and a render rule in `renderer.js`.
- **New render state** — add it to `src/core/state.js`. Do not reintroduce page-level globals;
  they are what made the original single file hard to extend.

## Known limitations

- **Multi-page is not implemented yet.** `src/render/page.js` lays the document out on a single
  canvas and drops anything past the last ruled line. There is no `#pagesContainer`, no
  `.notebook-page-canvas`, no `src/render/pdfExport.js`, and the export button downloads a
  single PNG rather than a multi-page PDF.
- **Wave 2 engines are not implemented yet.** `src/render/diagrams/canvas2d.js` and
  `src/render/diagrams/svgAdapter.js` do not exist, so `[DIAGRAM: svg | <svg>...]` is not
  renderable and `fn=` on a plot is still ignored. `src/pipeline/vectorize.js` still uses
  luminance-gradient edge detection rather than Zhang-Suen thinning with Douglas-Peucker
  simplification, so uploaded images trace hollow double-edges.
- **The glyph bank has one skeleton per character.** `src/render/glyph.js` warps a single
  webfont outline per instance; there are no distinct structural allographs, and the ink
  "velocity" term is index-derived noise rather than a real pen-speed signal. The Proof of
  Zero-Clone inspector shows the slant delta (`Δθ`) only, not the warp seed, scale matrix or
  ligature links.
- **Diagram parameters are only partly honoured.** `vars=`, `expr=`, `states=`, `accept=` and
  `fn=` are parsed into the diagram context but the renderers still draw default geometry.
- The DFA renderer's return arcs from the accepting state are drawn as smooth curves but are not
  yet annotated with their transition labels.
- The optional Gemini key in the VLM modal is read from the DOM and sent directly to Google's
  API from the browser. It is never stored or committed, and the app works fully offline
  without it.

## Provenance

This project was split out of a single 2090-line monolithic HTML file. The split was verified
pixel-identical against the original: the rendered canvas bytes, ten interactive control
behaviours, and the full image-to-diagram pipeline all match exactly. The original file remains
in the git history in the first commit.
