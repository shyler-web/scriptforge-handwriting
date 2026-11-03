#!/usr/bin/env node
/**
 * ScriptForge notes CLI — an MCP-free path for any coding agent or human.
 *
 *   node scripts/notes-cli.mjs list [--scope private] [--json]
 *   node scripts/notes-cli.mjs read <slug> [--scope private]
 *   node scripts/notes-cli.mjs create <slug> --title "..." --tags dsa,trees [--file note.md] [--force]
 *   node scripts/notes-cli.mjs update <slug> --file note.md
 *   node scripts/notes-cli.mjs append <slug> --file section.md
 *   node scripts/notes-cli.mjs delete <slug> --yes
 *   node scripts/notes-cli.mjs validate --file note.md
 *   node scripts/notes-cli.mjs index
 *   node scripts/notes-cli.mjs guide
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createNotesStore, NoteValidationError } from '../mcp/notes-store.mjs';
import { validateNote, formatValidation } from '../mcp/note-schema.mjs';
import { getAuthoringGuide } from '../mcp/tools.mjs';

const store = createNotesStore({ root: process.env.SCRIPTFORGE_NOTES_ROOT || undefined });

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
        scope: { type: 'string' },
        title: { type: 'string' },
        tags: { type: 'string' },
        file: { type: 'string', short: 'f' },
        json: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        yes: { type: 'boolean', default: false },
        confirm: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false }
    }
});

const [command, slug] = positionals;
const scope = values.scope === 'private' ? 'private' : values.scope === 'public' ? 'public' : undefined;

function print(value) {
    if (values.json) {
        process.stdout.write(JSON.stringify(value, null, 2) + '\n');
        return;
    }
    if (typeof value === 'string') {
        process.stdout.write(value + (value.endsWith('\n') ? '' : '\n'));
        return;
    }
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

async function readStdin() {
    if (process.stdin.isTTY) return '';
    return await readFile(0, 'utf8');
}

async function readContent() {
    if (values.file) return await readFile(values.file, 'utf8');
    return await readStdin();
}

function tags() {
    return values.tags ? String(values.tags).split(',').map(t => t.trim()).filter(Boolean) : [];
}

function usage() {
    return `ScriptForge notes CLI

Commands:
  list [--scope public|private] [--json]
  read <slug> [--scope]
  create <slug> [--title T] [--tags a,b] [--scope] [--file F] [--force]
  update <slug> [--scope] --file F | stdin
  append <slug> [--scope] --file F | stdin
  delete <slug> [--scope] --yes
  validate [--slug S | --file F | stdin] [--scope]
  index [--scope]
  guide

A slug beginning with "private/" implies private scope.`;
}

try {
    if (!command || values.help || command === 'help') {
        print(usage());
        process.exit(0);
    }

    if (command === 'list') {
        const list = await store.list(scope || 'public');
        print(values.json ? { scope: scope || 'public', notes: list } : list);
        process.exit(0);
    }

    if (command === 'guide') {
        print(await getAuthoringGuide());
        process.exit(0);
    }

    if (command === 'index') {
        const rebuilt = scope ? await store.rebuildIndex(scope) : await store.rebuildAll();
        print(rebuilt);
        process.exit(0);
    }

    if (command === 'validate') {
        const content = slug ? (await store.read(slug, scope)).content : await readContent();
        if (!content) {
            print('validate requires --file, stdin, or a slug.');
            process.exit(2);
        }
        const validation = validateNote(content, { slug: slug || '' });
        print(formatValidation(validation));
        if (values.json) print(validation);
        process.exit(validation.ok ? 0 : 1);
    }

    if (!slug) {
        print(usage());
        process.exit(2);
    }

    if (command === 'read') {
        print(await store.read(slug, scope));
        process.exit(0);
    }

    if (command === 'create') {
        const content = await readContent();
        const note = await store.create({
            slug,
            content,
            title: values.title,
            tags: tags(),
            scope,
            overwrite: Boolean(values.force)
        });
        print(values.json ? note : `Created ${note.id} (${note.scope}) -> ${note.file}`);
        process.exit(0);
    }

    if (command === 'update') {
        const content = await readContent();
        if (!content) {
            print('update requires --file or stdin.');
            process.exit(2);
        }
        const note = await store.update({ slug, content, scope });
        print(values.json ? note : `Updated ${note.id} (${note.scope}) -> ${note.file}`);
        process.exit(0);
    }

    if (command === 'append') {
        const content = await readContent();
        if (!content) {
            print('append requires --file or stdin.');
            process.exit(2);
        }
        const note = await store.append({ slug, content, scope });
        print(values.json ? note : `Appended to ${note.id} (${note.scope}) -> ${note.file}`);
        process.exit(0);
    }

    if (command === 'delete') {
        const note = await store.remove({ slug, scope, confirm: Boolean(values.yes || values.confirm) });
        print(values.json ? note : `Deleted ${note.id} (${note.scope})`);
        process.exit(0);
    }

    print(usage());
    process.exit(2);
} catch (err) {
    if (err instanceof NoteValidationError) {
        print(formatValidation(err.result));
        process.exit(1);
    }
    process.stderr.write(`[notes-cli] ${err && err.message ? err.message : err}\n`);
    process.exit(1);
}
