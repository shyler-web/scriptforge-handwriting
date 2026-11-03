// ScriptForge style-preset QA — starting looks, manual overrides and reset.
// Run with: node scripts/qa/harness.mjs scripts/qa/style-presets.assertions.js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const preset = (key) => document.querySelector(`[data-action="stylePreset"][data-arg="${key}"]`);
const active = (key) => preset(key)?.dataset.active === 'true';
const val = (id) => document.getElementById(id)?.value;
const label = (id) => document.getElementById('val_' + id)?.textContent;
const inkActive = (key) => document.getElementById(`ink_${key}`)?.classList.contains('ring-2');

try {
  const buttons = [...document.querySelectorAll('[data-action="stylePreset"]')];
  R('presets.buttons', buttons.length === 6, buttons.map(b => b.dataset.arg).join(','));

  R('presets.default.active', active('classic_blue'), preset('classic_blue')?.dataset.active);
  R('presets.default.font', val('fontArchetype') === 'Caveat', val('fontArchetype'));
  R('presets.default.paper', val('paperStyle') === 'ruled_margin', val('paperStyle'));
  R('presets.default.ink', inkActive('ballpoint_blue'), val('fontArchetype'));
  R('presets.default.slider', val('glyphWarp') === '0.65' && label('glyphWarp') === '0.65', label('glyphWarp'));
  R('presets.default.slant', label('slantAngle') === '-4°', label('slantAngle'));

  preset('engineering_grid').click();
  await sleep(150);
  R('presets.engineering.active', active('engineering_grid'));
  R('presets.engineering.font', val('fontArchetype') === 'Kalam', val('fontArchetype'));
  R('presets.engineering.paper', val('paperStyle') === 'engineering_grid', val('paperStyle'));
  R('presets.engineering.ink', inkActive('gel_navy'));
  R('presets.engineering.sliders', val('glyphWarp') === '0.45' && val('diagRoughness') === '0.35', `${val('glyphWarp')},${val('diagRoughness')}`);
  R('presets.engineering.hint', /quad/i.test(document.getElementById('stylePresetHint').textContent), document.getElementById('stylePresetHint').textContent);

  const warp = document.getElementById('glyphWarp');
  warp.value = '1.05';
  warp.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);
  R('presets.manual.override', label('glyphWarp') === '1.05' && val('glyphWarp') === '1.05', label('glyphWarp'));

  document.querySelector('[data-action="stylePresetReset"]').click();
  await sleep(150);
  R('presets.reset.active', active('classic_blue'));
  R('presets.reset.font', val('fontArchetype') === 'Caveat');
  R('presets.reset.paper', val('paperStyle') === 'ruled_margin');
  R('presets.reset.slider', val('glyphWarp') === '0.65' && label('glyphWarp') === '0.65', label('glyphWarp'));

  const canvas = document.getElementById('notebookCanvas');
  const stats = document.getElementById('charStats').textContent;
  R('presets.render', canvas.width > 0 && /\d+\s+glyphs/.test(stats), stats);
} catch (err) {
  R('presets.eval', false, err.message);
}

return results;
