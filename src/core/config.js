/**
 * ScriptForge Core Geometry, Ink Rheology & Allograph Configuration (`src/core/config.js` - Wave 4)
 * Pure data constants for 2x HiDPI canvas geometry, physical pen ink pigment profiles,
 * multi-allograph structural pairings, and biomechanical velocity parameters.
 */

export const HI_DPI = 2;
export const LOGICAL_W = 820;
export const LOGICAL_H = 1100;

export const LINE_SPACING = 34;
export const TOP_MARGIN = 96;
export const LEFT_MARGIN = 92;
export const CORNELL_MARGIN = 222;
export const RIGHT_MARGIN_OFFSET = 42;

/**
 * Physical Pen Ink Pigment, Viscosity & Pooling Profiles
 * - `viscosity`: Controls how strongly low pen velocity causes ink pooling at stroke endpoints
 * - `starvation`: Controls micro-skipping on high-velocity horizontal/diagonal strokes
 * - `poolingRadius`: Size of ink accumulation bead at pen touchdown/lift-off
 */
export const INK_PROFILES = {
    ballpoint_blue: {
        name: 'Blue Bic Ballpoint',
        color: '#1b3b8c',
        secondary: '#2952b3',
        accent: '#b91c1c',
        alpha: 0.94,
        grain: 0.22,
        widthScale: 1.00,
        viscosity: 0.68,
        starvation: 0.24,
        poolingRadius: 0.85
    },
    gel_navy: {
        name: 'Dark Navy Gel Pen',
        color: '#0f1e42',
        secondary: '#1d356b',
        accent: '#047857',
        alpha: 0.98,
        grain: 0.08,
        widthScale: 1.12,
        viscosity: 0.86,
        starvation: 0.08,
        poolingRadius: 1.15
    },
    pilot_black: {
        name: 'Pilot G2 Black Gel',
        color: '#181a1f',
        secondary: '#2e323b',
        accent: '#1d4ed8',
        alpha: 0.97,
        grain: 0.10,
        widthScale: 1.08,
        viscosity: 0.82,
        starvation: 0.10,
        poolingRadius: 1.05
    },
    graphite: {
        name: '2B Mechanical Pencil',
        color: '#3b3f46',
        secondary: '#555b64',
        accent: '#374151',
        alpha: 0.88,
        grain: 0.45,
        widthScale: 0.95,
        viscosity: 0.25,
        starvation: 0.42,
        poolingRadius: 0.40
    },
    crimson: {
        name: 'Grading Red Rollerball',
        color: '#8f1d2c',
        secondary: '#b32739',
        accent: '#1e3a8a',
        alpha: 0.94,
        grain: 0.15,
        widthScale: 1.02,
        viscosity: 0.78,
        starvation: 0.14,
        poolingRadius: 0.95
    }
};

/**
 * Multi-Allograph Structural Variant Table (`A0` .. `A3`)
 * Maps each primary handwriting archetype to secondary structural sibling fonts and
 * geometric feature flags so repeated letters in the same word (e.g. "ee", "ll", "ss", "oo")
 * never share the same underlying glyph skeleton.
 */
export const ALLOGRAPH_ARCHETYPES = {
    'Caveat': {
        variants: ['Caveat', 'Caveat', 'Kalam', 'Shadows Into Light'],
        variantWeights: ['400', '600', '400', '400'],
        variantScales: [1.00, 0.98, 0.84, 0.90],
        baselineOffsets: [0.0, -0.4, 0.5, 0.3],
        cursiveBias: 0.78
    },
    'Kalam': {
        variants: ['Kalam', 'Kalam', 'Caveat', 'Patrick Hand'],
        variantWeights: ['400', '300', '600', '400'],
        variantScales: [1.00, 0.99, 1.14, 0.96],
        baselineOffsets: [0.0, 0.3, -0.5, 0.2],
        cursiveBias: 0.62
    },
    'Indie Flower': {
        variants: ['Indie Flower', 'Indie Flower', 'Patrick Hand', 'Kalam'],
        variantWeights: ['400', '400', '400', '300'],
        variantScales: [1.00, 0.97, 0.98, 0.95],
        baselineOffsets: [0.0, -0.3, 0.4, 0.2],
        cursiveBias: 0.55
    },
    'Patrick Hand': {
        variants: ['Patrick Hand', 'Patrick Hand', 'Kalam', 'Indie Flower'],
        variantWeights: ['400', '400', '400', '400'],
        variantScales: [1.00, 0.98, 0.94, 0.97],
        baselineOffsets: [0.0, 0.25, 0.35, -0.2],
        cursiveBias: 0.42
    },
    'Shadows Into Light': {
        variants: ['Shadows Into Light', 'Shadows Into Light', 'Caveat', 'Indie Flower'],
        variantWeights: ['400', '400', '400', '400'],
        variantScales: [1.00, 0.97, 1.08, 0.96],
        baselineOffsets: [0.0, -0.35, 0.4, 0.2],
        cursiveBias: 0.70
    }
};

/**
 * Character intrinsic complexity table (0.2 = simple straight stroke, 1.0 = multi-turn high curvature)
 * Used by the Kinematic Pen-Velocity engine to slow down the simulated hand on tight turns.
 */
export const CHAR_CURVATURE_COMPLEXITY = {
    'i': 0.22, 'l': 0.20, '1': 0.22, '|': 0.15, '-': 0.15, 'I': 0.25, 'j': 0.35,
    'c': 0.38, 'o': 0.42, 'u': 0.44, 'v': 0.38, 'n': 0.46, 'r': 0.40, 't': 0.45,
    'a': 0.58, 'e': 0.56, 's': 0.68, 'f': 0.66, 'g': 0.72, 'y': 0.62, 'p': 0.58,
    'q': 0.65, 'b': 0.56, 'd': 0.58, 'h': 0.54, 'k': 0.68, 'm': 0.66, 'w': 0.64,
    'x': 0.60, 'z': 0.70, '2': 0.58, '3': 0.66, '4': 0.55, '5': 0.64, '6': 0.58,
    '7': 0.48, '8': 0.78, '9': 0.58, '0': 0.42
};

export default {
    HI_DPI,
    LOGICAL_W,
    LOGICAL_H,
    LINE_SPACING,
    TOP_MARGIN,
    LEFT_MARGIN,
    CORNELL_MARGIN,
    RIGHT_MARGIN_OFFSET,
    INK_PROFILES,
    ALLOGRAPH_ARCHETYPES,
    CHAR_CURVATURE_COMPLEXITY
};
