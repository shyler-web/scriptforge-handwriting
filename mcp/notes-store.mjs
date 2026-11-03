/**
 * Safe note storage for ScriptForge.
 *
 * Public notes:  notes/<slug>.md        -> notes/index.json         (tracked)
 * Private notes: notes/private/<slug>.md -> notes/private/index.json (git-ignored)
 *
 * All writes are confined to the notes directory, are atomic, and regenerate only
 * the index for the affected scope, so private metadata can never leak into the
 * tracked public index.
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
    splitFrontmatter,
    deriveTitle,
    withFrontmatter,
    slugify
} from '../shared/note-format.mjs';
import { validateNote } from './note-schema.mjs';

export const DEFAULT_ROOT = resolve(import.meta.dirname, '..');
export const MAX_NOTE_BYTES = 256 * 1024;

export class NoteValidationError extends Error {
    constructor(result, slug) {
        super(`Note "${slug}" failed validation:\n${result.errors.map(e => `line ${e.line}: ${e.message}`).join('\n')}`);
        this.name = 'NoteValidationError';
        this.result = result;
        this.slug = slug;
    }
}

function normalizeScope(scope, slug) {
    const rawSlug = String(slug ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.md$/i, '');
    const explicit = String(scope ?? '').trim().toLowerCase();

    if (explicit === 'private' || explicit === 'public') {
        const rel = rawSlug.replace(/^private\//i, '').replace(/^public\//i, '');
        return { scope: explicit, rel };
    }
    if (/^private\//i.test(rawSlug)) {
        return { scope: 'private', rel: rawSlug.replace(/^private\//i, '') };
    }
    if (/^public\//i.test(rawSlug)) {
        return { scope: 'public', rel: rawSlug.replace(/^public\//i, '') };
    }
    return { scope: 'public', rel: rawSlug };
}

function sanitizeRelative(rel) {
    const value = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.md$/i, '');
    if (!value) throw new Error('A note slug is required.');
    const parts = value.split('/');
    for (const part of parts) {
        if (!part || part === '.' || part === '..') {
            throw new Error(`Unsafe note slug "${value}". Path segments may not be empty, "." or "..".`);
        }
        if (/[\u0000-\u001f]/.test(part)) {
            throw new Error(`Unsafe note slug "${value}".`);
        }
    }
    return parts.join('/');
}

function publicId(rel) {
    return rel;
}

function privateId(rel) {
    return `private/${rel}`;
}

async function pathExists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function walkMarkdown(dir, prefix = '', skipDirs = new Set()) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }

    const files = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (skipDirs.has(entry.name)) continue;
            files.push(...await walkMarkdown(full, rel, skipDirs));
        } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
            files.push({ full, rel });
        }
    }
    return files;
}

async function atomicWrite(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, path);
}

export function createNotesStore({ root = DEFAULT_ROOT, maxBytes = MAX_NOTE_BYTES } = {}) {
    const notesDir = join(root, 'notes');
    const privateDir = join(notesDir, 'private');

    function scopeDir(scope) {
        return scope === 'private' ? privateDir : notesDir;
    }

    function resolveNote(slug, scope) {
        const normalized = normalizeScope(scope, slug);
        const rel = sanitizeRelative(normalized.rel);
        const dir = scopeDir(normalized.scope);
        const file = resolve(dir, `${rel}.md`);
        const guard = dir.endsWith(sep) ? dir : dir + sep;
        if (file !== dir && !file.startsWith(guard)) {
            throw new Error(`Unsafe note slug "${slug}".`);
        }
        return {
            scope: normalized.scope,
            rel,
            id: normalized.scope === 'private' ? privateId(rel) : publicId(rel),
            file,
            dir
        };
    }

    function indexFile(scope) {
        return join(scopeDir(scope), 'index.json');
    }

    async function rebuildIndex(scope = 'public') {
        const dir = scopeDir(scope);
        await mkdir(dir, { recursive: true });

        const skipDirs = scope === 'public' ? new Set(['private']) : new Set();
        const files = await walkMarkdown(dir, '', skipDirs);
        const notes = [];

        for (const file of files) {
            const content = await readFile(file.full, 'utf8');
            const front = splitFrontmatter(content);
            const rel = file.rel.replace(/\.md$/i, '');
            const id = scope === 'private' ? privateId(rel) : publicId(rel);
            const info = await stat(file.full);
            notes.push({
                id,
                title: deriveTitle(front.meta, front.body, id),
                tags: Array.isArray(front.meta.tags) ? front.meta.tags : [],
                font: front.meta.font || null,
                ink: front.meta.ink || null,
                paper: front.meta.paper || null,
                seed: typeof front.meta.seed === 'number' ? front.meta.seed : null,
                updatedAt: info.mtime.toISOString(),
                path: `/notes/${id}.md`,
                scope
            });
        }

        notes.sort((a, b) => a.title.localeCompare(b.title));
        const index = {
            generatedAt: new Date().toISOString(),
            scope,
            notes
        };
        await atomicWrite(indexFile(scope), JSON.stringify(index, null, 2) + '\n');
        return index;
    }

    async function read(slug, scope) {
        const target = resolveNote(slug, scope);
        const content = await readFile(target.file, 'utf8');
        const front = splitFrontmatter(content);
        return {
            ...target,
            content,
            body: front.body,
            meta: front.meta,
            title: deriveTitle(front.meta, front.body, target.id),
            hasFrontmatter: front.hasFrontmatter
        };
    }

    function assertSize(content, slug) {
        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > maxBytes) {
            throw new Error(`Note "${slug}" is ${bytes} bytes; the limit is ${maxBytes} bytes.`);
        }
    }

    function assertValid(content, slug) {
        const result = validateNote(content, { slug });
        if (!result.ok) throw new NoteValidationError(result, slug);
        return result;
    }

    async function create({ slug, content = '', title, tags = [], scope, overwrite = false, meta = {} }) {
        const target = resolveNote(slug, scope);
        if (!(await pathExists(dirname(target.file)))) {
            await mkdir(dirname(target.file), { recursive: true });
        }
        if (!overwrite && await pathExists(target.file)) {
            throw new Error(`Note "${target.id}" already exists. Pass overwrite:true or use update_note.`);
        }

        const mergedMeta = {
            ...meta,
            title: title || meta.title,
            tags: tags && tags.length ? tags : meta.tags
        };
        const finalContent = withFrontmatter(content, mergedMeta);
        assertSize(finalContent, target.id);
        const result = assertValid(finalContent, target.id);
        await atomicWrite(target.file, finalContent);
        await rebuildIndex(target.scope);
        return {
            ...target,
            content: finalContent,
            title: result.title,
            meta: result.meta,
            validation: result
        };
    }

    async function update({ slug, content, scope }) {
        if (typeof content !== 'string') throw new Error('update_note requires a string content field.');
        const target = resolveNote(slug, scope);
        if (!(await pathExists(target.file))) {
            throw new Error(`Note "${target.id}" does not exist. Use create_note first.`);
        }
        assertSize(content, target.id);
        const result = assertValid(content, target.id);
        await atomicWrite(target.file, content);
        await rebuildIndex(target.scope);
        return { ...target, content, title: result.title, meta: result.meta, validation: result };
    }

    async function append({ slug, content, scope }) {
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('append_to_note requires non-empty string content.');
        }
        const target = resolveNote(slug, scope);
        const existing = await readFile(target.file, 'utf8');
        const combined = `${existing.replace(/\s+$/, '')}\n\n${content.replace(/^\s+/, '')}\n`;
        assertSize(combined, target.id);
        const result = assertValid(combined, target.id);
        await atomicWrite(target.file, combined);
        await rebuildIndex(target.scope);
        return { ...target, content: combined, title: result.title, meta: result.meta, validation: result };
    }

    async function remove({ slug, scope, confirm = false }) {
        if (confirm !== true) {
            throw new Error('delete_note requires confirm:true. This operation is irreversible.');
        }
        const target = resolveNote(slug, scope);
        if (!(await pathExists(target.file))) {
            throw new Error(`Note "${target.id}" does not exist.`);
        }
        await rm(target.file);
        await rebuildIndex(target.scope);
        return { ...target, deleted: true };
    }

    async function list(scope = 'public') {
        const normalized = scope === 'private' ? 'private' : 'public';
        const indexPath = indexFile(normalized);
        if (await pathExists(indexPath)) {
            try {
                const parsed = JSON.parse(await readFile(indexPath, 'utf8'));
                if (Array.isArray(parsed.notes)) return parsed.notes;
            } catch {
                // Fall through to a rebuild.
            }
        }
        return (await rebuildIndex(normalized)).notes;
    }

    async function rebuildAll() {
        const publicIndex = await rebuildIndex('public');
        const privateIndex = await rebuildIndex('private');
        return { public: publicIndex, private: privateIndex };
    }

    return {
        root,
        notesDir,
        privateDir,
        resolveNote,
        read,
        create,
        update,
        append,
        remove,
        list,
        rebuildIndex,
        rebuildAll,
        slugify
    };
}

export default createNotesStore;
