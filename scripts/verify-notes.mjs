#!/usr/bin/env node
/**
 * Headless tests for the note format, DSL validator and public/private store.
 * No browser, no network, no external dependencies.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotesStore, NoteValidationError } from '../mcp/notes-store.mjs';
import { splitFrontmatter, deriveTitle } from '../shared/note-format.mjs';
import { validateNote } from '../mcp/note-schema.mjs';

let passed = 0;
function ok(name, fn) {
    return Promise.resolve().then(fn).then(() => {
        passed++;
        process.stdout.write(`  ok ${name}\n`);
    }).catch((err) => {
        process.stderr.write(`  FAIL ${name}\n${err.stack}\n`);
        process.exitCode = 1;
        throw err;
    });
}

const VALID_NOTE = `---
title: Graph Theory Revision
tags: dsa, graphs
font: Kalam
ink: ballpoint_blue
paper: ruled_margin
seed: 1234
---
# Graph Theory

A graph $G = (V, E)$ has degree sum:

$$ \\sum_{v \\in V} \\deg(v) = 2|E| $$

[DIAGRAM: graph | nodes=A,B,C | edges=A-B,B-C,C-A | layout=circular]

[DIAGRAM: svg | <svg viewBox="0 0 20 20"><rect x="1" y="1" width="10" height="10"/></svg>]
`;

const INVALID_NOTE = `# Broken

[DIAGRAM: quantum | nodes=A,B]

$$ \\foo{x} = 1 $$

Inline $x is not closed.
`;

async function main() {
    const root = await mkdtemp(join(tmpdir(), 'scriptforge-notes-'));

    try {
        await ok('frontmatter parses metadata and strips the body', () => {
            const front = splitFrontmatter(VALID_NOTE);
            assert.equal(front.hasFrontmatter, true);
            assert.equal(front.meta.title, 'Graph Theory Revision');
            assert.deepEqual(front.meta.tags, ['dsa', 'graphs']);
            assert.equal(front.meta.font, 'Kalam');
            assert.match(front.body, /^# Graph Theory/);
            assert.doesNotMatch(front.body, /^---/);
        });

        await ok('title falls back to the first heading', () => {
            const front = splitFrontmatter('# Trees\n\nBody');
            assert.equal(deriveTitle(front.meta, front.body, 'trees'), 'Trees');
        });

        await ok('valid note passes the DSL validator', () => {
            const result = validateNote(VALID_NOTE, { slug: 'dsa/graphs' });
            assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
            assert.equal(result.title, 'Graph Theory Revision');
            assert.equal(result.warnings.length, 0);
        });

        await ok('invalid diagram, math command and inline dollar are reported with lines', () => {
            const result = validateNote(INVALID_NOTE, { slug: 'broken' });
            assert.equal(result.ok, false);
            assert.ok(result.errors.length >= 3, JSON.stringify(result.errors, null, 2));
            assert.ok(result.errors.some(e => /Unknown diagram type "quantum"/.test(e.message)));
            assert.ok(result.errors.some(e => /Unsupported LaTeX command "\\foo"/.test(e.message)));
            assert.ok(result.errors.some(e => /Unclosed inline math/.test(e.message)));
            assert.ok(result.errors.every(e => Number.isInteger(e.line) && e.line > 0));
            assert.ok(result.errors.every(e => e.example));
        });

        await ok('multi-line display math is rejected', () => {
            const result = validateNote('$$\n\\frac{1}{2}\n$$', { slug: 'multi' });
            assert.equal(result.ok, false);
            assert.ok(result.errors.some(e => /single line/.test(e.message)));
        });

        await ok('absolute or traversal slugs cannot escape the notes directory', async () => {
            const store = createNotesStore({ root });
            assert.throws(() => store.resolveNote('../../etc/passwd'), /Unsafe|slug/i);
            assert.throws(() => store.resolveNote('a/../../b'), /Unsafe|slug/i);
            assert.throws(() => store.resolveNote('.'), /Unsafe|slug/i);
            const absolute = store.resolveNote('/etc/passwd');
            assert.ok(absolute.file.startsWith(join(root, 'notes')));
        });

        await ok('public create writes the note and the tracked index', async () => {
            const store = createNotesStore({ root });
            const note = await store.create({ slug: 'dsa/graphs', content: VALID_NOTE });
            assert.equal(note.scope, 'public');
            assert.equal(note.id, 'dsa/graphs');
            await stat(join(root, 'notes', 'dsa', 'graphs.md'));

            const index = JSON.parse(await readFile(join(root, 'notes', 'index.json'), 'utf8'));
            assert.equal(index.scope, 'public');
            assert.equal(index.notes.length, 1);
            assert.equal(index.notes[0].id, 'dsa/graphs');
            assert.equal(index.notes[0].title, 'Graph Theory Revision');
            assert.deepEqual(index.notes[0].tags, ['dsa', 'graphs']);
            assert.equal(index.notes[0].font, 'Kalam');
            assert.equal(index.notes[0].path, '/notes/dsa/graphs.md');
        });

        await ok('private create stays out of the tracked index', async () => {
            const store = createNotesStore({ root });
            const note = await store.create({
                slug: 'private/scratch',
                content: '# Private scratch\n\nRemember $x^2$.'
            });
            assert.equal(note.scope, 'private');
            assert.equal(note.id, 'private/scratch');

            await stat(join(root, 'notes', 'private', 'scratch.md'));

            const publicIndex = JSON.parse(await readFile(join(root, 'notes', 'index.json'), 'utf8'));
            assert.equal(publicIndex.notes.some(n => n.id.includes('scratch')), false);

            const privateIndex = JSON.parse(await readFile(join(root, 'notes', 'private', 'index.json'), 'utf8'));
            assert.equal(privateIndex.scope, 'private');
            assert.equal(privateIndex.notes.length, 1);
            assert.equal(privateIndex.notes[0].id, 'private/scratch');
            assert.equal(privateIndex.notes[0].path, '/notes/private/scratch.md');
        });

        await ok('private scope can be inferred from a private/ slug', async () => {
            const store = createNotesStore({ root });
            const note = await store.create({ slug: 'private/second', content: '# Second' });
            assert.equal(note.scope, 'private');
            assert.equal(note.id, 'private/second');
        });

        await ok('list() separates public and private notes', async () => {
            const store = createNotesStore({ root });
            const publicNotes = await store.list('public');
            const privateNotes = await store.list('private');
            assert.deepEqual(publicNotes.map(n => n.id), ['dsa/graphs']);
            assert.deepEqual(privateNotes.map(n => n.id).sort(), ['private/scratch', 'private/second']);
        });

        await ok('update replaces content and append adds a validated section', async () => {
            const store = createNotesStore({ root });
            await store.update({ slug: 'dsa/graphs', content: '# Updated\n\n$$ a^2 + b^2 = c^2 $$' });
            let note = await store.read('dsa/graphs');
            assert.match(note.content, /^# Updated/);

            await store.append({ slug: 'dsa/graphs', content: '## Extra\n\nText.' });
            note = await store.read('dsa/graphs');
            assert.match(note.content, /## Extra/);
            assert.match(note.content, /a\^2 \+ b\^2/);
        });

        await ok('invalid updates are rejected before writing', async () => {
            const store = createNotesStore({ root });
            await assert.rejects(
                () => store.update({ slug: 'dsa/graphs', content: '[DIAGRAM: nope | x=1]' }),
                NoteValidationError
            );
            const note = await store.read('dsa/graphs');
            assert.match(note.content, /## Extra/);
        });

        await ok('create refuses to overwrite without overwrite:true', async () => {
            const store = createNotesStore({ root });
            await assert.rejects(() => store.create({ slug: 'dsa/graphs', content: '# Again' }), /already exists/);
            const note = await store.create({ slug: 'dsa/graphs', content: '# Again', overwrite: true });
            assert.match(note.content, /^# Again/);
        });

        await ok('delete requires confirm:true', async () => {
            const store = createNotesStore({ root });
            await assert.rejects(() => store.remove({ slug: 'private/second' }), /confirm:true/);
            await store.remove({ slug: 'private/second', confirm: true });
            await assert.rejects(() => store.read('private/second'), /ENOENT/);
        });

        await ok('size limit rejects oversized notes', async () => {
            const store = createNotesStore({ root, maxBytes: 64 });
            await assert.rejects(
                () => store.create({ slug: 'too-big', content: '# ' + 'x'.repeat(200) }),
                /limit is 64 bytes/
            );
        });

        process.stdout.write(`\nverify-notes: ${passed} checks passed\n`);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

main().catch((err) => {
    process.stderr.write(`verify-notes failed: ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
});
