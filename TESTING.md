# Testing

The grid draws to a `<canvas>`, so cell text is not in the DOM and you cannot select a cell with a CSS selector. The rule that makes it testable: **never assert on pixels, assert on the model.** Find coordinates from the grid's own geometry API, send events to the element a real mouse would hit, and check what the grid reports back (callbacks, `getCellContent`, your app's data).

There are two layers:

| Layer | Where | Use it for |
|---|---|---|
| Unit (jsdom) | `test/*.test.ts(x)`, `npm test` | Library behaviour: editing, selection, paste, keyboard, editors, port regressions |
| Browser | The consuming app, a real browser | Integration: layout, focus, scrolling, your callbacks, save flows |

## 1. Unit tests in jsdom

`npm test` runs the upstream suite plus the port tests. `vitest.setup.ts` installs `vitest-canvas-mock` and a `ResizeObserver` stub. `test/vanilla-data-editor.test.ts` is the template for new vanilla tests.

jsdom has no layout, so give the grid a fixed size and compute positions yourself:

```ts
vi.mock("../src/common/resize-detector", () => ({
    useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
}));

// columns 100px wide, headerHeight 36, rowHeight 32, no row markers
const pos = (col: number, row: number) => ({ clientX: col * 100 + 50, clientY: 36 + row * 32 + 16 });

grid = new DataEditor(host, makeProps({ onCellEdited }));
prep(false);                                   // from test/test-utils.tsx
const canvas = screen.getByTestId("data-grid-canvas");
sendClick(canvas, pos(0, 0));
sendClick(canvas, pos(0, 0));                  // second click opens the editor
act(() => void vi.runAllTimers());

const ta = document.querySelector<HTMLTextAreaElement>("#portal textarea")!;
ta.value = "hello";
fireEvent.input(ta);
fireEvent.keyDown(ta, { key: "Enter" });
act(() => void vi.runAllTimers());
expect(onCellEdited).toHaveBeenCalledWith([0, 0], expect.objectContaining({ data: "hello" }));
```

Things to know:

- **Use fake timers** (`vi.useFakeTimers()`), then `act(() => void vi.runAllTimers())` after each interaction. Editors, the accessibility tree and animations are all deferred.
- **`setProps` is batched.** Call `grid.flush()` before asserting on the result of a prop change.
- **The accessibility tree is real DOM.** It works as a text oracle without reading the canvas: `screen.getByTestId("glide-cell-<col>-<row>").textContent` and `[role=columnheader]`.
- **The geometry API** is worth asserting directly: `grid.getBounds(col, row)` and `grid.getMouseArgsForPosition(x, y)?.location`.
- **Always tear down.** In `afterEach`, call `grid.destroy()`, then remove the host and `#portal`.
- **A port bug** (something that works upstream but not here) needs a regression test in `test/vanilla-*.test.ts`, not in the upstream files. That keeps `npm run sync-upstream` merges clean.

## 2. Browser tests in a consuming app

jsdom cannot catch layout, focus or real event-ordering problems. Test those in a real browser, using any driver (Playwright, WebDriver, or a browser extension).

### Expose a dev hook

The single most useful step is to put a small hook on `window`, **in dev builds only**:

```js
if (import.meta.env.DEV) window.__glideGrid = {
    grid: () => grid,                              // the DataEditor instance
    rows: () => rows,                              // your data
    cols: () => columns,
    cell: (c, r) => getCellContent([c, r]),        // what the grid is told to draw
    onEdits: (edits) => applyEdits(edits),         // same path as onCellsEdited / onPaste
    bounds: (c, r) => grid.getBounds(c, r),        // screen rect, for real clicks
    events: [],                                    // push every callback you emit
};
```

Assert against `cell()`, `rows()` and `events`. Use `bounds()` only when you need a real click.

### Run test code in the page context

Some drivers (browser extensions in particular) evaluate in an isolated world that cannot see `window.__glideGrid`. Inject a `<script>` and pass the result back through the DOM:

```js
const wrap = (js) => `(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(
  `try{document.body.dataset.out=JSON.stringify({v:(function(G){${js}})(window.__glideGrid)})}` +
  `catch(e){document.body.dataset.out=JSON.stringify({err:String(e)})}`)};` +
  `document.documentElement.appendChild(s);s.remove();var o=document.body.dataset.out;` +
  `delete document.body.dataset.out;return o})()`;
```

Playwright's `page.evaluate` already runs in the page context and does not need this.

### Interaction recipes

**Click a cell.** First scroll the grid and the cell into view. A cell outside the viewport has bounds, but clicking there hits nothing. Dispatch to the element under the point, not to the `<canvas>`: the transparent `.dvn-scroller` lies on top of the canvas (which sits in the sibling `.dvn-underlay`), so that is what a real mouse hits.

```js
G.grid().scrollTo(col, row);
const b = G.bounds(col, row);
const x = b.x + b.width / 2, y = b.y + b.height / 2;
const el = document.elementFromPoint(x, y);       // .dvn-scroller
for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
  const E = t.startsWith("pointer") ? PointerEvent : MouseEvent;
  el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
    buttons: t.endsWith("down") ? 1 : 0, pointerId: 1, isPrimary: true, pointerType: "mouse", view: window }));
}
```

**Right-click a cell.** Same point and target. `contextmenu` (and the drag events) are only listened for on `.dvn-scroller`, so one dispatched to the canvas is silently ignored, while pointer events work on either.

```js
el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, view: window }));
```

**Type into a cell.**

1. Select the cell.
2. Dispatch one `keydown` with a printable key to `document.activeElement`. This opens the overlay editor, `textarea.gdg-input`.
3. Set the value with the native setter, then fire `input`.
4. Send `keydown` `Enter` to commit, or `Escape` to cancel.

```js
const ta = document.querySelector("textarea.gdg-input");
Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "new value");
ta.dispatchEvent(new Event("input", { bubbles: true }));
```

**Keyboard shortcuts.** Dispatch the `keydown` to `document.activeElement` after a click (the focused accessibility cell inside the canvas, from which keys bubble to the canvas handler), or to `[data-testid=data-grid-canvas]` directly. The scroller has no key handlers.

**Paste.** A synthetic `paste` event cannot inject data: when the grid has focus, it reads the system clipboard through `navigator.clipboard` and only falls back to the event's `clipboardData` when that API is missing. Call your edit path directly: `G.onEdits([{ col, row, value }])`. If you implement `onPaste`, test its trimming separately. Excel and Sheets copies end with a newline, which produces an empty last row.

### Gotchas

- **No automatic re-render.** After your data changes, call `grid.setProps({ getCellContent: i => getCellContent(i), ... })` with a *new* function, or `grid.updateCells(...)` for a few cells. Otherwise the canvas shows stale data. Assert on `G.cell()`, not on your data alone.
- **`gridSelection` is controlled.** Update it in `onGridSelectionChange`, or the selection will not move.
- **Frameworks render asynchronously.** UI the app renders in response (menus, popovers, dialogs) is not there in the same tick. Query it in a separate evaluation, after a short wait.
- **A dev server can reload the page** on its first visit after a new dependency is installed (Vite dependency optimisation). Wait for the hook to exist before starting, and expect to re-run once.
- **Do not let tests write to a real backend.** Stub `fetch` (record the non-GET requests, return a fake success) and stub `confirm`/`alert`, then assert on the recorded requests. If you must hit a real store, only touch rows created by that run, and clean up by ID, never by title.
- **Large integer IDs** (more than 15 digits) lose precision as `Number`. Check that they come back as strings.

## Known port issues

None known. If something works upstream but not here, add it here with a failing test in `test/vanilla-*.test.ts`.
