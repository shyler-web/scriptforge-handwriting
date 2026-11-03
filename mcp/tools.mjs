/**
 * MCP tool definitions and handlers for ScriptForge notes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateNote, formatValidation } from './note-schema.mjs';
import { NoteValidationError } from './notes-store.mjs';

const GUIDE_PATH = resolve(import.meta.dirname, '../docs/notes-authoring.md');

const GUIDE_FALLBACK = `# ScriptForge note authoring

Call get_authoring_guide before writing DSL. Notes are Markdown-like:
- Headings: # ... ###### ...
- Inline math: $...$ ; display math must be one line: $$ ... $$
- Diagram must be alone on its line: [DIAGRAM: type | key=value | key=value]
- Page break: ---PAGE---
- Strike-through: ~~wrong~~
Diagram types: grid, bitfield, kmap, schematic/circuit, dfa, tree, graph, canvas2d/plot, svg, custom_image.
Always validate before finishing.`;

const SCOPE_DESCRIPTION =
    'public (default) stores notes/<slug>.md and updates the tracked notes/index.json. ' +
    'private stores notes/private/<slug>.md and updates the git-ignored notes/private/index.json. ' +
    'A slug beginning with "private/" implies private scope.';

const GUIDE_REMINDER =
    'Call get_authoring_guide first, then validate_note before finishing.';

export const TOOLS = [
    {
        name: 'get_authoring_guide',
        description:
            'Return the ScriptForge note grammar, frontmatter keys, diagram types and validation rules. ' +
            'Call this before create_note, update_note or append_to_note so your DSL matches the renderer.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
        name: 'list_notes',
        description: 'List available notes for a scope, including title, tags, updatedAt and fetch path.',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['public', 'private'], default: 'public', description: SCOPE_DESCRIPTION }
            },
            additionalProperties: false
        }
    },
    {
        name: 'read_note',
        description: 'Read a note by slug, including its raw content, body, frontmatter and title.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'Note slug, e.g. "dsa/trees" or "private/scratch".' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION }
            },
            required: ['slug'],
            additionalProperties: false
        }
    },
    {
        name: 'create_note',
        description:
            'Create a new note. ' + GUIDE_REMINDER + ' The content is ScriptForge DSL; frontmatter is added automatically when absent. ' +
            'Set overwrite:true only to replace an existing note deliberately.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'Note slug, e.g. "dsa/graphs". A "private/" prefix selects private scope.' },
                content: { type: 'string', description: 'ScriptForge DSL body (frontmatter optional).' },
                title: { type: 'string', description: 'Optional title written into frontmatter.' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags written into frontmatter.' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION },
                overwrite: { type: 'boolean', default: false }
            },
            required: ['slug', 'content'],
            additionalProperties: false
        }
    },
    {
        name: 'update_note',
        description:
            'Replace the entire content of an existing note. ' + GUIDE_REMINDER + ' Read it first, then write the full corrected document.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string' },
                content: { type: 'string', description: 'Full replacement ScriptForge DSL.' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION }
            },
            required: ['slug', 'content'],
            additionalProperties: false
        }
    },
    {
        name: 'append_to_note',
        description:
            'Append a validated section to an existing note. ' + GUIDE_REMINDER,
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string' },
                content: { type: 'string', description: 'Section to append (ScriptForge DSL).' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION }
            },
            required: ['slug', 'content'],
            additionalProperties: false
        }
    },
    {
        name: 'delete_note',
        description: 'Permanently delete a note. Requires confirm:true.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION },
                confirm: { type: 'boolean', default: false, description: 'Must be true to delete.' }
            },
            required: ['slug', 'confirm'],
            additionalProperties: false
        }
    },
    {
        name: 'validate_note',
        description:
            'Validate ScriptForge DSL without writing anything. Returns line-numbered errors and examples. ' +
            'Pass content directly or the slug of an existing note.',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'DSL text to validate.' },
                slug: { type: 'string', description: 'Existing note slug to validate instead of raw content.' },
                scope: { type: 'string', enum: ['public', 'private'], description: SCOPE_DESCRIPTION }
            },
            additionalProperties: false
        }
    }
];

function jsonText(value) {
    return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) };
}

function result(value) {
    return { content: [jsonText(value)] };
}

function failure(message, extra) {
    const payload = extra ? `${message}\n\n${typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2)}` : message;
    return { content: [{ type: 'text', text: payload }], isError: true };
}

function validationFailure(err) {
    return failure(formatValidation(err.result), {
        slug: err.slug,
        errors: err.result.errors,
        warnings: err.result.warnings
    });
}

export async function getAuthoringGuide() {
    try {
        return await readFile(GUIDE_PATH, 'utf8');
    } catch {
        return GUIDE_FALLBACK;
    }
}

/**
 * @param {string} name
 * @param {object} args
 * @param {ReturnType<typeof import('./notes-store.mjs').createNotesStore>} store
 */
export async function callTool(name, args = {}, store) {
    try {
        switch (name) {
            case 'get_authoring_guide':
                return result(await getAuthoringGuide());

            case 'list_notes': {
                const scope = args.scope === 'private' ? 'private' : 'public';
                const notes = await store.list(scope);
                return result({ scope, count: notes.length, notes });
            }

            case 'read_note': {
                if (!args.slug) return failure('read_note requires a slug.');
                const note = await store.read(args.slug, args.scope);
                return result({
                    slug: note.id,
                    scope: note.scope,
                    title: note.title,
                    meta: note.meta,
                    body: note.body,
                    content: note.content,
                    path: `/notes/${note.id}.md`
                });
            }

            case 'create_note': {
                if (!args.slug) return failure('create_note requires a slug.');
                if (typeof args.content !== 'string') return failure('create_note requires string content.');
                const note = await store.create({
                    slug: args.slug,
                    content: args.content,
                    title: args.title,
                    tags: args.tags,
                    scope: args.scope,
                    overwrite: args.overwrite === true
                });
                return result({
                    created: true,
                    slug: note.id,
                    scope: note.scope,
                    title: note.title,
                    path: `/notes/${note.id}.md`,
                    warnings: note.validation.warnings
                });
            }

            case 'update_note': {
                if (!args.slug) return failure('update_note requires a slug.');
                const note = await store.update({ slug: args.slug, content: args.content, scope: args.scope });
                return result({
                    updated: true,
                    slug: note.id,
                    scope: note.scope,
                    title: note.title,
                    path: `/notes/${note.id}.md`,
                    warnings: note.validation.warnings
                });
            }

            case 'append_to_note': {
                if (!args.slug) return failure('append_to_note requires a slug.');
                const note = await store.append({ slug: args.slug, content: args.content, scope: args.scope });
                return result({
                    appended: true,
                    slug: note.id,
                    scope: note.scope,
                    title: note.title,
                    path: `/notes/${note.id}.md`,
                    warnings: note.validation.warnings
                });
            }

            case 'delete_note': {
                if (!args.slug) return failure('delete_note requires a slug.');
                const note = await store.remove({ slug: args.slug, scope: args.scope, confirm: args.confirm === true });
                return result({ deleted: true, slug: note.id, scope: note.scope });
            }

            case 'validate_note': {
                let content = typeof args.content === 'string' ? args.content : null;
                let slug = args.slug || '';
                if (!content && slug) {
                    const note = await store.read(slug, args.scope);
                    content = note.content;
                    slug = note.id;
                }
                if (typeof content !== 'string') {
                    return failure('validate_note requires either content or an existing slug.');
                }
                const validation = validateNote(content, { slug });
                const text = formatValidation(validation);
                if (!validation.ok) {
                    return failure(text, { errors: validation.errors, warnings: validation.warnings });
                }
                return result({
                    valid: true,
                    title: validation.title,
                    meta: validation.meta,
                    warnings: validation.warnings,
                    body: validation.body
                });
            }

            default:
                return failure(`Unknown tool "${name}".`);
        }
    } catch (err) {
        if (err instanceof NoteValidationError) return validationFailure(err);
        return failure(err && err.message ? err.message : String(err));
    }
}

export default callTool;
