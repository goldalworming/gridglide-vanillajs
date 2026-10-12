# Syncing with upstream Glide Data Grid

This port keeps the upstream sources almost unchanged. The differences are import paths and a few files that had to be ported by hand. As a result, most upstream changes can be applied automatically.

`upstream.json` records the upstream commit the port currently matches.

## Quick version

```sh
npm run sync-upstream -- --dry-run      # preview what would change
npm run sync-upstream -- --test         # apply upstream main, then typecheck + test
npm run sync-upstream -- v6.1.0 --test  # or sync to a specific tag / branch / commit
```

Then fix whatever the report lists under **CONFLICTS** and **NEEDS PORTING WORK**, run `npm test`, try the demos, and commit.

## How it works

`scripts/sync-upstream.mjs`:

1. Clones upstream into `.upstream/` (a blobless clone, gitignored) or fetches it if the clone already exists.
2. Lists the files under `packages/core`, `packages/cells` and `packages/source` that changed between the recorded commit (*base*) and the requested ref (*target*).
3. Transforms both upstream versions of each file exactly as the original port did:
   - **Paths:** `core/src` → `src/` (with `index.ts` → `src/component-api.ts`), `cells/src` → `src/cells-extra/`, `source/src` → `src/source/`. Tests go to `test/`, `test/cells-extra/` and `test/source/`. Docs and stories are skipped.
   - **Imports:** `react` / `react-dom` → `src/runtime/react.js`, `@linaria/*` → `src/runtime/styled.js`, `@glideapps/glide-data-grid` → `src/component-api.js`, `lodash/x.js` → `src/common/lodash.js`.
4. Three-way merges each file with `git merge-file`, using the transformed old version as base, the transformed new version as *theirs*, and our file as *ours*. Local changes are kept. Where both sides changed the same lines, conflict markers are written.
5. Adds files that are new upstream. Deletes files that were removed upstream, but only if we never modified them.
6. Scans the new upstream code for things a merge cannot handle (see below), updates `upstream.json`, and optionally runs typecheck and tests.

`--status` lists the files that differ from upstream at the recorded commit. That is where conflicts can appear:

```sh
npm run sync-upstream -- --status
```

## Where conflicts are expected

Most files (`data-editor.tsx`, `data-grid.tsx`, every renderer) differ from upstream only in their imports, so they merge cleanly. Only the files below were changed by hand. Keep the port's intent when you resolve a conflict in them.

| File | Why it differs |
| --- | --- |
| `src/cells-extra/cells/multi-select-cell.tsx`, `dropdown-cell.tsx` | `react-select` was replaced by `src/cells-extra/select.tsx`. Bring new upstream behavior over to that component. |
| `src/cells-extra/cells/article-cell*.tsx` | Uses the vanilla `@toast-ui/editor`, loaded on demand (no React wrapper, no `lazy`). |
| `src/internal/data-grid-overlay-editor/private/image-overlay-editor*.tsx` | `react-responsive-carousel` was replaced by a small built-in carousel. |
| `src/internal/data-grid-overlay-editor/private/number-overlay-editor.tsx` | `react-number-format` was replaced by `numeric-input.tsx`. |
| `src/internal/markdown-div/markdown-div.tsx`, `click-outside-container.tsx` | Class components converted to function components. |
| `src/internal/data-grid/data-grid-types.ts`, `data-grid-overlay-editor.tsx` | Editor contract: vanilla editors plus `RuntimeEditor`, rendered through `renderEditor()`. |
| `src/cells/*-cell.tsx`, `src/cells-extra/cells/*-cell.tsx` | Built-in editors are wrapped in `runtimeEditor(...)`. |
| `src/data-editor/data-editor.tsx`, `src/cells/number-cell.tsx` | `React.lazy`/`Suspense` replaced by direct imports. `process.env` replaced by `isDevMode()`. |
| `src/data-editor/row-grouping-api.ts` | Adds the non-hook `createRowGrouping`. |
| `test/cells.test.tsx` | The image-editor test uses the vanilla editor contract. |

## NEEDS PORTING WORK

The script reports only problems that upstream newly introduced:

- **React API missing from `src/runtime/react.ts`.** Implement it in the runtime, keeping React 18 semantics, and add a case to `test/runtime.test.tsx`. If upstream starts relying on large parts of React that are missing (concurrent features, error boundaries), consider switching the runtime to `preact/compat`.
- **Unported package.** A new React-only dependency needs a replacement (as with `react-select`) or must be written on top of the runtime. Plain JS packages can simply be added to `dependencies`.
- **Class component.** Convert it to a function component, as was done for `markdown-div.tsx`.
- **`process.env`.** Use `isDevMode()` from `src/common/support.js`, so plain `<script>` usage keeps working.
- **Editor not wrapped in `runtimeEditor()`.** Wrap it. Otherwise the overlay treats it as a vanilla editor.

## Checklist

1. `npm run sync-upstream -- --test`
2. Resolve the conflicts and porting work. Search for `<<<<<<<` to find what is left.
3. `npm run typecheck && npm test`. The upstream test suite is the main guarantee that behavior still matches.
4. `npm run demo` and click through `demo/index.html` and `demo/cells.html`. Optionally compare `demo/bench.html` with the previous numbers.
5. If the public API changed, update the props and docs in `src/vanilla/data-editor.tsx`, `src/index.ts` and `README.md`.
6. Commit `upstream.json` together with the merged sources, e.g. `sync: upstream glideapps/glide-data-grid@<sha>`.
