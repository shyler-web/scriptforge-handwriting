/**
 * STAGE 3B: SHARP HI-DPI HAND-SKETCHED DIAGRAM SYNTHESIZER — dispatcher.
 * Parses a `[DIAGRAM: type | k=v | ...]` spec and routes it to the
 * per-diagram renderers in this folder.
 *
 * Every diagram renderer receives the same context object `d`:
 *   d.ctx           CanvasRenderingContext2D
 *   d.rc            Rough.js canvas generator
 *   d.params        Lower-cased key/value pairs parsed from the spec
 *   d.startX        Left origin of the diagram box
 *   d.startY        Top origin of the diagram box
 *   d.availWidth    Usable width remaining on the page
 *   d.charCounterRef  Shared mutable { count } used for unique seeds
 *   d.opts          Render options from readOptions()
 *   d.roughOpts     Base Rough.js style built from the active ink
 *   d.ink           Active ink profile
 *
 * Each renderer returns the vertical space it consumed.
 */

import { getInk, state } from '../../core/state.js';
import { drawKmap } from './kmap.js';
import { drawCircuit } from './circuit.js';
import { drawDfa } from './dfa.js';
import { drawPlot } from './plot.js';
import { drawCustomImage } from './customImage.js';

export function renderHandSketchedDiagram(ctx, rc, specStr, startX, startY, availWidth, charCounterRef, opts) {
    const parts = specStr.split('|').map(p => p.trim());
    const diagType = (parts[0] || 'kmap').toLowerCase();
    const params = {};
    for (let i = 1; i < parts.length; i++) {
        const [k, v] = parts[i].split('=').map(s => s.trim());
        if (k && v) params[k.toLowerCase()] = v;
    }

    const ink = getInk();
    const roughOpts = {
        stroke: ink.color,
        strokeWidth: 1.65 * ink.widthScale,
        roughness: opts.diagRoughness,
        bowing: opts.diagBowing,
        disableMultiStroke: opts.singlePassStroke,
        seed: state.handSeed + charCounterRef.count
    };

    const d = {
        ctx, rc, params, startX, startY, availWidth,
        charCounterRef, opts, roughOpts, ink
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let usedHeight = 40;

    if (diagType === 'kmap') {
        usedHeight = drawKmap(d);
    } else if (diagType === 'circuit') {
        usedHeight = drawCircuit(d);
    } else if (diagType === 'dfa') {
        usedHeight = drawDfa(d);
    } else if (diagType === 'plot') {
        usedHeight = drawPlot(d);
    } else if (diagType === 'custom_image' && state.customContours && state.customContours.length > 0) {
        usedHeight = drawCustomImage(d);
    }

    ctx.restore();
    return usedHeight;
}
