/**
 * ScriptForge Live Control Panel Reader (`src/core/options.js` - Wave 3)
 * Safely reads all DOM sliders, selects, and checkboxes with sensible defaults.
 */

import { state } from './state.js';
import { INK_PROFILES } from './config.js';

function numVal(id, fallback) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
}

function strVal(id, fallback) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    return (el && el.value) ? String(el.value) : fallback;
}

function boolVal(id, fallback) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    return el ? Boolean(el.checked) : fallback;
}

export function getRenderOptions() {
    const inkKey = state.inkKey || state.currentInkKey || 'ballpoint_blue';
    const ink = INK_PROFILES[inkKey] || INK_PROFILES.ballpoint_blue;

    return {
        fontFamily: strVal('fontArchetype', 'Caveat'),
        glyphWarp: numVal('glyphWarp', 0.65),
        baselineDrift: numVal('baselineDrift', 0.45),
        pressureVar: numVal('pressureVar', 0.55),
        slantAngle: numVal('slantAngle', -4),
        enableLigatures: boolVal('enableLigatures', true),
        diagRoughness: numVal('diagRoughness', 0.55),
        diagBowing: numVal('diagBowing', 0.60),
        singlePassStroke: boolVal('singlePassStroke', true),
        paperStyle: strVal('paperStyle', 'ruled_margin'),
        camShadow: numVal('camShadow', 0.35),
        paperGrain: numVal('paperGrain', 0.40),
        pageTilt: numVal('pageTilt', 0.30),
        inkKey,
        ink,
        handSeed: state.handSeed || 4219,
        inspectVariance: Boolean(state.inspectVariance)
    };
}

export const readOptions = getRenderOptions;
export default getRenderOptions;
