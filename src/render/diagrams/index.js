/**
 * ScriptForge Universal Diagram Dispatcher (`src/render/diagrams/index.js`)
 * Routes all declarative `[DIAGRAM: type | key=val | ...]` blocks to the Universal Engines
 * while preserving 100% backward compatibility with `plot.js` and `customImage.js`.
 */

import { INK_PROFILES } from '../../core/config.js';
import * as stateMod from '../../core/state.js';
import { renderUniversalGrid } from './grid.js';
import { renderUniversalSchematic } from './schematic.js';
import * as plotMod from './plot.js';
import * as customImgMod from './customImage.js';

function resolveInkAndSeed(opts, charCounterRef) {
    const stateObj = stateMod.state || stateMod.default || stateMod;
    const inkKey = (opts && opts.inkKey) || (stateObj && stateObj.inkKey) || (stateObj && stateObj.currentInkKey) || 'ballpoint_blue';
    const ink = (opts && opts.ink) || INK_PROFILES[inkKey] || INK_PROFILES.ballpoint_blue || {
        color: '#1b3b8c', secondary: '#2952b3', accent: '#b91c1c', alpha: 0.94, widthScale: 1.0
    };
    const handSeed = (stateObj && (stateObj.handSeed || stateObj.globalHandSeed)) || 4219;
    const count = (charCounterRef && charCounterRef.count) || 1;
    return { ink, seed: handSeed + count };
}

export function parseDiagramSpec(specStr) {
    const parts = String(specStr || '').split('|').map(p => p.trim()).filter(Boolean);
    const diagType = (parts[0] || 'grid').toLowerCase();
    const params = { _diagType: diagType };

    for (let i = 1; i < parts.length; i++) {
        const eqIdx = parts[i].indexOf('=');
        if (eqIdx !== -1) {
            const k = parts[i].slice(0, eqIdx).trim().toLowerCase();
            const v = parts[i].slice(eqIdx + 1).trim();
            if (k) params[k] = v;
        }
    }
    return { diagType, params };
}

export function renderHandSketchedDiagram(ctx, rc, specStr, startX, startY, availWidth, charCounterRef, opts = {}) {
    const counter = charCounterRef || { count: 1 };
    const { diagType, params } = parseDiagramSpec(specStr);
    const { ink, seed } = resolveInkAndSeed(opts, counter);

    const roughOpts = {
        stroke: ink.color,
        strokeWidth: 1.65 * (ink.widthScale || 1.0),
        roughness: typeof opts.diagRoughness === 'number' ? opts.diagRoughness : 0.55,
        bowing: typeof opts.diagBowing === 'number' ? opts.diagBowing : 0.60,
        disableMultiStroke: opts.singlePassStroke !== undefined ? opts.singlePassStroke : true,
        seed
    };

    const clampedWidth = Math.min(availWidth || 640, 680);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let usedHeight = 48;

    try {
        if (diagType === 'grid' || diagType === 'table' || diagType === 'kmap' || diagType === 'bitfield' || diagType === 'array') {
            usedHeight = renderUniversalGrid(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        } else if (diagType === 'schematic' || diagType === 'circuit' || diagType === 'flipflop' || diagType === 'dfa' || diagType === 'nfa' || diagType === 'fsm' || diagType === 'tree' || diagType === 'list') {
            usedHeight = renderUniversalSchematic(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        } else if (diagType === 'plot' || diagType === 'canvas2d' || diagType === 'geometry') {
            const plotFn = plotMod.renderPlot || plotMod.drawPlot || plotMod.default;
            if (typeof plotFn === 'function') {
                usedHeight = plotFn(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts) || 168;
            }
        } else if (diagType === 'custom_image' || diagType === 'image') {
            const imgFn = customImgMod.renderCustomImage || customImgMod.drawCustomImage || customImgMod.default;
            if (typeof imgFn === 'function') {
                usedHeight = imgFn(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts) || 205;
            }
        } else {
            usedHeight = renderUniversalGrid(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        }
    } catch (err) {
        console.warn('[ScriptForge Diagram Engine] Graceful recovery on spec:', specStr, err);
    }

    ctx.restore();
    return Math.max(34, usedHeight);
}

export const renderDiagram = renderHandSketchedDiagram;
export default renderHandSketchedDiagram;
