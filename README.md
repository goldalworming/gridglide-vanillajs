# gridglide-vanillajs

[Glide Data Grid](https://github.com/glideapps/glide-data-grid) without React. A fast, canvas-based data grid that works in plain JavaScript and in any framework.

- Scales to millions of rows, because only the cells on screen are rendered
- Supports editing, copy/paste, fill handle, search, column resize and move, row markers, group headers and frozen columns
- Includes extra cells (dropdown, multi-select, sparkline, tags, date picker, and more) and data-source helpers
- Has no framework dependency
- Is a port of the upstream code, verified by running the upstream test suite against it

## Install

```sh
npm install gridglide-vanillajs
```

Without a bundler, load the single-file build from a CDN. It exposes a global `GlideGrid`:

```html
<script src="https://cdn.jsdelivr.net/npm/gridglide-vanillajs/dist/gridglide.iife.js"></script>
<script>
    const { DataEditor, GridCellKind } = GlideGrid;
</script>
```

## Quick start

```html
<div id="grid" style="height: 400px"></div>
```

```js
import { DataEditor, GridCellKind } from "gridglide-vanillajs";

const people = [
    { name: "Ada", age: 36 },
    { name: "Linus", age: 54 },
];

const grid = new DataEditor(document.getElementById("grid"), {
    columns: [
        { title: "Name", width: 200 },
        { title: "Age", width: 80 },
    ],
    rows: people.length,
    width: "100%",
    height: "100%",

    // called only for the cells that are visible
    getCellContent: ([col, row]) => {
        const p = people[row];
        return col === 0
            ? { kind: GridCellKind.Text, data: p.name, displayData: p.name, allowOverlay: true }
            : { kind: GridCellKind.Number, data: p.age, displayData: String(p.age), allowOverlay: true };
    },

    // called when the user edits a cell
    onCellEdited: ([col, row], value) => {
        if (col === 0) people[row].name = value.data;
        else people[row].age = value.data;
    },
});
```

## Updating the grid

```js
people.push({ name: "Grace", age: 85 });
grid.setProps({ rows: people.length }); // merge new props

grid.scrollTo(0, 2);                     // scroll to column 0, row 2
grid.updateCells([{ cell: [1, 0] }]);    // redraw specific cells after changing data
grid.destroy();                          // remove the grid
```

All props and methods match upstream, so the [Glide Data Grid docs](https://docs.grid.glideapps.com/) apply.

## Custom editors

An editor is a function that fills a container element. It can use plain DOM or mount any framework.

```js
new DataEditor(el, {
    // ...
    provideEditor: () => ({
        editor: (container, props) => {
            const input = document.createElement("input");
            input.value = props.value.data;
            input.oninput = () => props.onChange({ ...props.value, data: input.value });
            container.append(input);
            input.focus();
            return { update: next => (props = next), destroy: () => {} };
        },
    }),
});
```

## Extra cells

```js
import { allCells } from "gridglide-vanillajs/cells";

new DataEditor(el, { customRenderers: allCells /* , ... */ });
```

The article cell also needs [`@toast-ui/editor`](https://www.npmjs.com/package/@toast-ui/editor) and its CSS.

## Using with a framework

Create the grid on mount, call `setProps` when your state changes, and call `destroy` on unmount.

```js
// Vue 3
onMounted(() => (grid = new DataEditor(el.value, props)));
onBeforeUnmount(() => grid.destroy());

// Svelte action
export function glideGrid(node, props) {
    const grid = new DataEditor(node, props);
    return { update: p => grid.replaceProps(p), destroy: () => grid.destroy() };
}
```

## Differences from the React version

- Pass a DOM element for `rightElement` and `portalElement` (React used a node and a ref).
- Custom editors use the container function shown above instead of React components.
- With `fillSelectionOnPaste: true`, pasting a single value into a multi-cell selection fills every selected cell, and a copied block whose size divides the selected range evenly is repeated across it, as in Excel. Upstream writes only from the active cell.
- With `undoRedo: true`, Ctrl/Cmd+Z undoes and Ctrl+Y or Ctrl/Cmd+Shift+Z redoes every grid edit (typing, paste, fill, Delete), as in Handsontable. Old values go back through `onCellsEdited`. For changes the grid does not make itself, such as inserting rows, use `grid.addUndoStep({ undo, redo })`. `grid.editCells(edits)` applies an undoable edit from code, and `grid.clearHistory()` resets the history, for example after loading other data. Upstream's `useUndoRedo` still works through `enhance`, but listens on `window`.
- `validateCell` also checks pasted and filled values, not only what is typed into the cell editor. Rejected values are skipped.
- Rows, as in Handsontable: give `onRowsInserted(at, count)` and `onRowsRemoved(rows)` (update your data and `rows` in them) to get `grid.insertRows()` / `grid.removeRows()`, a right-click menu with `rowContextMenu: true` (insert above/below, remove the selected rows; pass an object to change the labels), `minSpareRows`, and pastes that run past the last row adding rows. All of it is undoable; return a restore function from `onRowsRemoved` to have undo bring back fields that are not columns.
- Sorting, as in spreadsheets: with `columnSort: true` every header gets a ▾ button with Sort A → Z / Z → A / Clear sort, while a click elsewhere on the header still selects the column. Sorting changes only the order rows are shown in (your data and its row indexes stay as they are) and is undoable; cell callbacks receive data rows, see `columnSort` in the API docs and `grid.dataRow()` / `grid.viewRow()`.
- Group header labels are centered (theme `groupHeaderAlign: "left"` restores upstream).
- A column dragged to a new width keeps it without an `onColumnResize` handler. The trailing empty line Excel and Sheets add to a copy is ignored.
- Spreadsheet defaults: F2 opens the editor, Backspace clears cells on every OS, Ctrl/Cmd+D fills down, Ctrl/Cmd+R fills right, and an editor opened with Enter, F2 or a double-click puts the caret at the end of the text (`editorSelectsAll: true` restores upstream's select-all). Override any of them with `keybindings`.
- Updates from `setProps` are batched. Call `grid.flush()` if you need them applied right away.
- No CSS import is needed.

## Development

```sh
npm install
npm test          # upstream test suite + port tests
npm run build
npm run demo      # demo/index.html, demo/cells.html, demo/bench.html
```

To pull in changes from upstream Glide Data Grid, see [SYNCING.md](SYNCING.md). For testing the canvas grid, in this repo and in apps that use it, see [TESTING.md](TESTING.md).

## License

MIT. This is a derivative of Glide Data Grid by typeguard, Inc.
