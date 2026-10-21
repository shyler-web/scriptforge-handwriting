/**
 * ScriptForge Central Reactive State Store (`src/core/state.js` - Wave 3)
 * Manages multi-page canvases, hand seed, active ink profile, zero-clone inspector, and custom contours.
 */

import { INK_PROFILES } from './config.js';

export const state = {
    handSeed: 4219,
    globalHandSeed: 4219,
    inkKey: 'ballpoint_blue',
    currentInkKey: 'ballpoint_blue',
    inspectVariance: false,
    inspectVarianceMode: false,
    customContours: null,
    customDiagramContours: null,
    pageCount: 1,
    activePageIdx: 0,
    zoomLevel: 1.0,
    mobileTab: 'preview' // 'editor' | 'preview' | 'controls'
};

export function setHandSeed(newSeed) {
    const s = Number(newSeed) || (Math.floor(Math.random() * 90000) + 1000);
    state.handSeed = s;
    state.globalHandSeed = s;
    return s;
}

export function setInkKey(key) {
    state.inkKey = key;
    state.currentInkKey = key;
    return key;
}

export function toggleInspectVariance() {
    state.inspectVariance = !state.inspectVariance;
    state.inspectVarianceMode = state.inspectVariance;
    return state.inspectVariance;
}

/**
 * Sets the zero-clone inspector explicitly (Wave 1/2 API, kept for compatibility).
 */
export function setInspectVariance(value) {
    state.inspectVariance = Boolean(value);
    state.inspectVarianceMode = state.inspectVariance;
    return state.inspectVariance;
}

/**
 * Resolves the active ink profile. `src/render/glyph.js` calls this per glyph,
 * so it stays a cheap property read on the shared state object.
 */
export function getInk() {
    return INK_PROFILES[state.inkKey] || INK_PROFILES.ballpoint_blue;
}

export default state;
