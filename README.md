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
- Updates from `setProps` are batched. Call `grid.flush()` if you need them applied right away.
- No CSS import is needed.

## Development

```sh
npm install
npm test          # upstream test suite + port tests
npm run build
npm run demo      # demo/index.html, demo/cells.html, demo/bench.html
```

To pull in changes from upstream Glide Data Grid, see [SYNCING.md](SYNCING.md).

## License

MIT. This is a derivative of Glide Data Grid by typeguard, Inc.
