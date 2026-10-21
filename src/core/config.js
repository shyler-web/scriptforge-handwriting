/**
 * Static engine configuration: canvas geometry, HiDPI factor, and ink palettes.
 * Pure data — no DOM, no state.
 */

export const HI_DPI = 2;
export const LOGICAL_W = 820;
export const LOGICAL_H = 1100;

export const INK_PROFILES = {
    ballpoint_blue: { color: '#1b3b8c', secondary: '#2952b3', accent: '#b91c1c', alpha: 0.94, grain: 0.22, widthScale: 1.0 },
    gel_navy:       { color: '#0f1e42', secondary: '#1d356b', accent: '#047857', alpha: 0.98, grain: 0.08, widthScale: 1.12 },
    pilot_black:    { color: '#181a1f', secondary: '#2e323b', accent: '#1d4ed8', alpha: 0.97, grain: 0.10, widthScale: 1.08 },
    graphite:       { color: '#3b3f46', secondary: '#555b64', accent: '#374151', alpha: 0.88, grain: 0.45, widthScale: 0.95 },
    crimson:        { color: '#8f1d2c', secondary: '#b32739', accent: '#1e3a8a', alpha: 0.94, grain: 0.15, widthScale: 1.02 }
};
