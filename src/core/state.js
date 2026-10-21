/**
 * Single mutable application state store.
 * Replaces the four former page-level globals:
 *   globalHandSeed -> state.handSeed
 *   inspectVarianceMode -> state.inspectVariance
 *   customDiagramContours -> state.customContours
 *   currentInkKey -> state.inkKey
 */

import { INK_PROFILES } from './config.js';

export const state = {
    handSeed: 4219,
    inspectVariance: false,
    customContours: null,
    inkKey: 'ballpoint_blue'
};

export function getInk() {
    return INK_PROFILES[state.inkKey];
}

export function setHandSeed(seed) {
    state.handSeed = seed;
}

export function setInkKey(key) {
    state.inkKey = key;
}

export function setInspectVariance(value) {
    state.inspectVariance = value;
}

export function setCustomContours(contours) {
    state.customContours = contours;
}
