/**
 * Pure note-format helpers shared by the browser reader and the MCP server.
 * No DOM, no Node APIs: safe to import from either environment.
 */

export const FRONTMATTER_KEYS = ['title', 'tags', 'font', 'ink', 'paper', 'seed'];

export const SUPPORTED_FONTS = [
    'Caveat',
    'Kalam',
    'Indie Flower',
    'Patrick Hand',
    'Shadows Into Light'
];

export const SUPPORTED_INKS = [
    'ballpoint_blue',
    'gel_navy',
    'pilot_black',
    'graphite',
    'crimson'
];

export const SUPPORTED_PAPERS = [
    'ruled_margin',
    'engineering_grid',
    'cornell',
    'blank_a4'
];

/**
 * Splits an optional YAML-style frontmatter block from the note body.
 * Supports `key: value`, quoted values, comma lists and `[a, b]` lists.
 */
export function splitFrontmatter(text) {
    const source = String(text ?? '');
    const errors = [];
    const meta = {};

    if (!/^\uFEFF?---\r?\n/.test(source)) {
        return { hasFrontmatter: false, meta, body: source, raw: '', errors };
    }

    const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) {
        return { hasFrontmatter: false, meta, body: source, raw: '', errors };
    }

    const raw = match[1];
    const body = source.slice(match[0].length);
    const lines = raw.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        const colon = line.indexOf(':');
        if (colon === -1) {
            errors.push({ line: i + 2, message: `Frontmatter line ${i + 2} is not a "key: value" pair.` });
            continue;
        }

        const key = line.slice(0, colon).trim().toLowerCase();
        let value = line.slice(colon + 1).trim();
        if (!key) continue;

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key === 'tags') {
            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1);
            }
            meta.tags = value.split(',').map(v => v.trim()).filter(Boolean);
            continue;
        }

        if (key === 'seed') {
            const n = Number(value);
            meta.seed = Number.isFinite(n) ? Math.trunc(n) : value;
            continue;
        }

        meta[key] = value;
    }

    return { hasFrontmatter: true, meta, body, raw, errors };
}

export function firstHeading(body) {
    const match = String(body || '').match(/^#{1,6}\s+(.+)$/m);
    return match ? match[1].trim() : '';
}

export function deriveTitle(meta, body, slug = '') {
    const fromMeta = meta && typeof meta.title === 'string' ? meta.title.trim() : '';
    if (fromMeta) return fromMeta;
    const heading = firstHeading(body);
    if (heading) return heading;
    if (slug) {
        const leaf = String(slug).split('/').filter(Boolean).pop() || String(slug);
        return leaf.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return 'Untitled note';
}

export function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'untitled';
}

export function buildFrontmatter(meta = {}) {
    const lines = ['---'];
    const title = meta.title ? String(meta.title).replace(/\r?\n/g, ' ').trim() : '';
    if (title) lines.push(`title: ${title}`);
    if (Array.isArray(meta.tags) && meta.tags.length) {
        lines.push(`tags: ${meta.tags.map(t => String(t).trim()).filter(Boolean).join(', ')}`);
    }
    for (const key of ['font', 'ink', 'paper']) {
        if (meta[key]) lines.push(`${key}: ${meta[key]}`);
    }
    if (meta.seed !== undefined && meta.seed !== null && meta.seed !== '') {
        lines.push(`seed: ${meta.seed}`);
    }
    if (lines.length === 1) return '';
    lines.push('---', '');
    return lines.join('\n');
}

export function withFrontmatter(body, meta = {}) {
    const { hasFrontmatter } = splitFrontmatter(body);
    if (hasFrontmatter) return String(body);
    return buildFrontmatter(meta) + String(body || '').replace(/^\s+/, '');
}
