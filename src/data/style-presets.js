/**
 * ScriptForge curated style presets.
 * A preset is only a starting point: every slider remains editable afterwards.
 */

export const DEFAULT_STYLE_PRESET = 'classic_blue';

export const STYLE_PRESETS = {
    classic_blue: {
        label: 'Classic Blue',
        description: 'Fast cursive-print hybrid on college-ruled paper with a natural blue-ballpoint wobble.',
        font: 'Caveat',
        ink: 'ballpoint_blue',
        paper: 'ruled_margin',
        values: {
            glyphWarp: 0.65,
            baselineDrift: 0.45,
            pressureVar: 0.55,
            slantAngle: -4,
            diagRoughness: 0.55,
            diagBowing: 0.60,
            camShadow: 0.35,
            paperGrain: 0.40,
            pageTilt: 0.30
        },
        checks: {
            enableLigatures: true,
            singlePassStroke: true
        }
    },

    engineering_grid: {
        label: 'Engineering Grid',
        description: 'Neat Kalam engineering notes on 5 mm quad paper — crisp diagrams, low scan noise.',
        font: 'Kalam',
        ink: 'gel_navy',
        paper: 'engineering_grid',
        values: {
            glyphWarp: 0.45,
            baselineDrift: 0.30,
            pressureVar: 0.45,
            slantAngle: -2,
            diagRoughness: 0.35,
            diagBowing: 0.40,
            camShadow: 0.10,
            paperGrain: 0.25,
            pageTilt: 0.10
        },
        checks: {
            enableLigatures: true,
            singlePassStroke: true
        }
    },

    pencil_draft: {
        label: 'Pencil Draft',
        description: 'Loose 2B pencil study notes on heavy bond paper, with visible grain and sketchy diagrams.',
        font: 'Shadows Into Light',
        ink: 'graphite',
        paper: 'blank_a4',
        values: {
            glyphWarp: 0.85,
            baselineDrift: 0.70,
            pressureVar: 0.35,
            slantAngle: -8,
            diagRoughness: 0.85,
            diagBowing: 0.75,
            camShadow: 0.25,
            paperGrain: 0.65,
            pageTilt: 0.20
        },
        checks: {
            enableLigatures: true,
            singlePassStroke: true
        }
    },

    cornell_focus: {
        label: 'Cornell Focus',
        description: 'Balanced black-gel notes on Cornell paper — ideal for revision, cues and summaries.',
        font: 'Indie Flower',
        ink: 'pilot_black',
        paper: 'cornell',
        values: {
            glyphWarp: 0.55,
            baselineDrift: 0.40,
            pressureVar: 0.50,
            slantAngle: 0,
            diagRoughness: 0.45,
            diagBowing: 0.50,
            camShadow: 0.20,
            paperGrain: 0.30,
            pageTilt: 0.15
        },
        checks: {
            enableLigatures: true,
            singlePassStroke: true
        }
    },

    red_pen_notes: {
        label: 'Red Pen',
        description: 'Bold architectural block print in red rollerball — high contrast for corrections and formulas.',
        font: 'Patrick Hand',
        ink: 'crimson',
        paper: 'ruled_margin',
        values: {
            glyphWarp: 0.35,
            baselineDrift: 0.25,
            pressureVar: 0.40,
            slantAngle: 1,
            diagRoughness: 0.40,
            diagBowing: 0.45,
            camShadow: 0.15,
            paperGrain: 0.25,
            pageTilt: 0.10
        },
        checks: {
            enableLigatures: true,
            singlePassStroke: true
        }
    },

    clean_print: {
        label: 'Clean Print',
        description: 'Minimal, highly legible print on unruled paper — the calmest option for long reading notes.',
        font: 'Patrick Hand',
        ink: 'pilot_black',
        paper: 'blank_a4',
        values: {
            glyphWarp: 0.20,
            baselineDrift: 0.15,
            pressureVar: 0.30,
            slantAngle: 0,
            diagRoughness: 0.25,
            diagBowing: 0.30,
            camShadow: 0.05,
            paperGrain: 0.15,
            pageTilt: 0.05
        },
        checks: {
            enableLigatures: false,
            singlePassStroke: true
        }
    }
};

export default STYLE_PRESETS;
