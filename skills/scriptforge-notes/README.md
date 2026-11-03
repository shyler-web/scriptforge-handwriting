# ScriptForge Notes Skill — Maintenance

The canonical agent skill is `SKILL.md` in this folder.

## When adding or changing a feature

Update all of these in the same change:

1. `SKILL.md` — command/option reference, examples, `version`, `updated`.
2. `docs/notes-authoring.md` — human-facing authoring guide.
3. `src/ui/snippets.js` — Insert palette preset, if users should insert it.
4. `src/data/presets.js` — demo preset, if it is a flagship feature.
5. `scripts/verify-*.mjs` — regression tests.
6. `README.md` — feature list / file map when relevant.

## Before finishing

```bash
npm run verify
npm run verify:notes
```

Hard-refresh the studio and click **AI Skill** to confirm the download serves
the latest file. `scripts/verify-skill.mjs` also checks that this skill and the
authoring docs mention every major feature.

The studio downloads this exact path with `cache: "no-store"`:

```text
skills/scriptforge-notes/SKILL.md
```
