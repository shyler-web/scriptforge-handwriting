// ScriptForge [sketch] QA — DSL compile, page integration and validator.
// Run with: node scripts/qa/harness.mjs scripts/qa/sketch.assertions.js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DSL = `title "Universal Math Sketch Test"
point O = (0, 0) label="$O$" pos=sw
point A = O + polar(70, 35) label="$A$"
arrow O -> A label="$F$"
angle (1, 0) O A label="$\\theta$"
support (-40, 30) -- (150, 30) side=below`;

try {
  const engine = await import('/src/render/sketch/engine.js');
  const scene = engine.compileSketchScene(DSL, 'Caveat', 15);
  R('sketch.compile.title', scene.title === 'Universal Math Sketch Test', scene.title);
  R('sketch.compile.items', scene.items.length >= 4, scene.items.map(i => i.type).join(','));
  const dims = engine.measureSketch(DSL, 520, 'Caveat');
  R('sketch.measure', dims.width >= 220 && dims.width <= 520 && dims.height >= 90, JSON.stringify(dims));

  const doc = document.getElementById('docInput');
  const original = doc.value;
  doc.value = `# Sketch Integration\n\n[sketch:\n${DSL}\n]\n`;

  const page = await import('/src/render/page.js');
  page.renderFullPage();
  await sleep(500);

  const stats = document.getElementById('charStats').textContent;
  R('sketch.render', /\d+\s+glyphs/.test(stats), stats);

  const canvas = document.getElementById('notebookCanvas');
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let inkPixels = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 120) inkPixels++;
  }
  R('sketch.ink', inkPixels > 200, `inkPixels=${inkPixels}`);

  const schema = await import('/mcp/note-schema.mjs');
  const valid = schema.validateNote('[sketch:\n  point O = (0, 0)\n]', { slug: 'sketch/ok' });
  R('sketch.validator.valid', valid.ok, JSON.stringify(valid.errors));
  const invalid = schema.validateNote('[sketch:\n  point O = (0, 0\n]', { slug: 'sketch/bad' });
  R('sketch.validator.invalid', !invalid.ok && invalid.errors.some(e => /Unbalanced parentheses/.test(e.message)), JSON.stringify(invalid.errors));

  doc.value = original;
  page.renderFullPage();
} catch (err) {
  R('sketch.eval', false, err.stack || err.message);
}

return results;
