/**
 * ScriptForge Universal Diagram Dispatcher (`src/render/diagrams/index.js`)
 * Routes all 5 Universal Spatial Grammars (`grid`, `schematic`, `canvas2d`, `svg`, `custom_image`)
 * while preserving raw `<svg>...</svg>` strings and legacy aliases.
 */

import { INK_PROFILES } from '../../core/config.js';
import * as stateMod from '../../core/state.js';
import { renderUniversalGrid } from './grid.js';
import { renderUniversalSchematic } from './schematic.js';
import { renderCanvas2D } from './canvas2d.js';
import { renderSvgDiagram } from './svgAdapter.js';
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
    const raw = String(specStr || '').trim();

    // Special handling for raw SVG blocks: `[DIAGRAM: svg | <svg ...>...</svg>]`
    const svgIdx = raw.search(/<svg[\s>]/i);
    if (svgIdx !== -1) {
        const params = { _diagType: 'svg', rawSvg: raw.slice(svgIdx) };
        // Keep any key=value options that precede the SVG payload.
        for (const part of raw.slice(0, svgIdx).split('|')) {
            const eqIdx = part.indexOf('=');
            if (eqIdx === -1) continue;
            const k = part.slice(0, eqIdx).trim().toLowerCase();
            const v = part.slice(eqIdx + 1).trim();
            if (k && k !== 'svg') params[k] = v;
        }
        return { diagType: 'svg', params };
    }

    const parts = raw.split('|').map(p => p.trim()).filter(Boolean);
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
        if (diagType === 'svg') {
            usedHeight = renderSvgDiagram(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        } else if (diagType === 'grid' || diagType === 'table' || diagType === 'kmap' || diagType === 'bitfield' || diagType === 'array') {
            usedHeight = renderUniversalGrid(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        } else if (diagType === 'schematic' || diagType === 'circuit' || diagType === 'flipflop' || diagType === 'dfa' || diagType === 'nfa' || diagType === 'fsm' || diagType === 'tree' || diagType === 'list') {
            usedHeight = renderUniversalSchematic(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
        } else if (diagType === 'plot' || diagType === 'canvas2d' || diagType === 'geometry' || diagType === 'target' || diagType === 'vectors') {
            usedHeight = renderCanvas2D(ctx, rc, params, startX, startY, clampedWidth, counter, opts, ink, roughOpts);
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
