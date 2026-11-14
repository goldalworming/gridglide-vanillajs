import * as React from "../runtime/react.js";
import { createRoot, flush, type Root } from "../runtime/react.js";
import { DataEditorAll, type DataEditorAllProps } from "../data-editor-all.js";
import type { DataEditorRef } from "../data-editor/data-editor.js";
import type { VanillaEditor } from "../internal/data-grid/data-grid-types.js";
import { toNode } from "./foreign-node.js";
import { fillSelectionEdits, pasteToCell, trimPasteLines } from "./fill-paste.js";
import {
    CompactSelection,
    GridCellKind,
    isEditableGridCell,
    type EditListItem,
    type GridCell,
    type GridColumn,
    type GridSelection,
    type Item,
} from "../internal/data-grid/data-grid-types.js";
import { UndoHistory, type UndoStep } from "./undo-redo.js";

/**
 * Props of the vanilla {@link DataEditor}. Identical to Glide Data Grid's `DataEditorProps`, except:
 * - `rightElement` is a DOM node instead of a React node,
 * - `portalElement` replaces `portalElementRef`,
 * - editors (`provideEditor`, `imageEditorOverride`, custom renderers) use the {@link VanillaEditor} contract,
 * - spreadsheet defaults: F2 also opens the editor, Backspace also clears cells on every OS, Ctrl/Cmd+D fills down,
 *   Ctrl/Cmd+R fills right (`keybindings`), and an editor opened with Enter/F2/double-click puts the caret at the end
 *   instead of selecting the text (`editorSelectsAll`),
 * - `fillSelectionOnPaste` adds spreadsheet-style fill on paste,
 * - `undoRedo` adds built-in undo/redo,
 * - `validateCell` also checks pasted and filled values (upstream: only the cell editor),
 * - row insert/remove (`onRowsInserted`, `onRowsRemoved`, `rowContextMenu`, `minSpareRows`, paste past the last row),
 * - dragged column widths are kept without an `onColumnResize` handler.
 * @category DataEditor
 */
/** Props the grid itself consumes (what {@link DataEditorProps.enhance} receives and returns). */
export type CoreDataEditorProps = Omit<DataEditorAllProps, "ref">;

export interface DataEditorProps extends Omit<DataEditorAllProps, "rightElement" | "portalElementRef"> {
    /** A DOM node rendered to the right of the last column. */
    readonly rightElement?: HTMLElement;
    /**
     * Where overlay editors are rendered. Defaults to `#portal`; if no such element exists, one is created
     * at the end of `<body>` (fixed, top-left, high z-index), as recommended by upstream.
     */
    readonly portalElement?: HTMLElement;
    /**
     * Runs on every render, inside the grid, and may transform the props the grid receives. This is where the
     * `gridglide-vanillajs/source` helpers (`useColumnSort`, `useMoveableColumns`, `useUndoRedo`, ...) are used:
     *
     * ```ts
     * enhance: p => ({ ...p, ...useMoveableColumns(p) })
     * ```
     *
     * Like React hooks, those helpers must be called unconditionally and in the same order on every call, and
     * `enhance` must not be added or removed after construction.
     */
    readonly enhance?: (props: CoreDataEditorProps) => CoreDataEditorProps;
    /**
     * Spreadsheet-style paste into a larger selection (upstream only writes from the active cell): a single value fills
     * every selected cell, and a block whose size divides the selected range evenly is repeated across it, as in Excel.
     * Those edits go straight to `onCellsEdited` / `onCellEdited`, skipping `onPaste`; other pastes behave as
     * upstream, except that an unset `onPaste` acts like `true` (split into cells). Has no effect when `onPaste` is
     * `false`.
     */
    readonly fillSelectionOnPaste?: boolean;
    /**
     * Built-in undo/redo, as in spreadsheets: Ctrl/Cmd+Z undoes, Ctrl+Y or Ctrl/Cmd+Shift+Z redoes. Every edit the grid
     * makes (typing, paste, fill, Delete/Backspace, fill handle) is one step, up to 100 steps. Undoing writes the old
     * values back through `onCellsEdited` / `onCellEdited` and selects the changed cells. Inside an open cell editor
     * the keys keep their native text undo. Add your own steps (e.g. row insert/delete) with
     * {@link DataEditor.addUndoStep}, edit cells undoably from code with {@link DataEditor.editCells}, and call
     * {@link DataEditor.clearHistory} when you load other data.
     */
    readonly undoRedo?: boolean;
    /**
     * Inserts `count` empty rows at index `at`: update your data and `rows` (e.g. with `setProps`). Called by
     * {@link DataEditor.insertRows}, the row menu, `minSpareRows`, and a paste that runs past the last row (which then
     * adds rows, as in Handsontable).
     */
    readonly onRowsInserted?: (at: number, count: number) => void; // indexes are data rows, see columnSort
    /**
     * Removes rows (indexes in descending order): update your data and `rows`. Called by {@link DataEditor.removeRows}
     * and the row menu. Return a function that puts the same rows back to have undo restore them exactly (e.g. with
     * fields that are not columns); otherwise undo re-inserts empty rows and writes their cells back.
     */
    readonly onRowsRemoved?: (rows: readonly number[]) => (() => void) | void;
    /**
     * Right-click menu on cells with "Insert row above", "Insert row below" and "Remove row" (the selected rows, or the
     * clicked one), like Handsontable's `contextMenu`. Items show only for the handlers you set. Pass an object to change
     * the labels. The menu is a `<div class="gdg-row-menu">`.
     */
    readonly rowContextMenu?: boolean | Partial<RowMenuLabels>;
    /** Keeps at least this many empty rows at the end, through `onRowsInserted`, like Handsontable's `minSpareRows`. */
    readonly minSpareRows?: number;
    /**
     * Spreadsheet-style sorting: each column header gets a ▾ button with "Sort A → Z", "Sort Z → A" and "Clear sort"
     * (pass an object to change the labels); clicking elsewhere on the header still selects the column. Sorting only
     * changes the order rows are shown in, not your data, and is one undo step. While sorted, `getCellContent`,
     * `onCellsEdited`, `onCellEdited`, `validateCell`, `onCellActivated`, `onCellClicked`, `onCellContextMenu`, the
     * `location` of key events, `getRowThemeOverride`, `onRowsInserted` and `onRowsRemoved` receive data rows (rows
     * inserted while sorted are added at the end of your data); everything else (`gridSelection`, `highlightRegions`,
     * `scrollTo`, `editCells`, `insertRows`, `removeRows`) uses rows as shown. Convert with {@link DataEditor.dataRow}
     * and {@link DataEditor.viewRow}. Also available from code with {@link DataEditor.sortColumn}.
     */
    readonly columnSort?: boolean | Partial<SortMenuLabels>;
}

/** Labels of the {@link DataEditorProps.columnSort} menu. */
export interface SortMenuLabels {
    readonly sortAsc: string;
    readonly sortDesc: string;
    readonly clearSort: string;
}

const defaultSortMenuLabels: SortMenuLabels = {
    sortAsc: "Sort A → Z",
    sortDesc: "Sort Z → A",
    clearSort: "Clear sort",
};

/** Labels of the {@link DataEditorProps.rowContextMenu}. */
export interface RowMenuLabels {
    readonly insertAbove: string;
    readonly insertBelow: string;
    readonly removeRows: string;
}

const defaultRowMenuLabels: RowMenuLabels = {
    insertAbove: "Insert row above",
    insertBelow: "Insert row below",
    removeRows: "Remove row",
};

// ponytail: custom cells count as empty (their data has no common "empty"); a row of only custom cells never gets spares
function isEmptyCell(cell: GridCell): boolean {
    const data = (cell as { data?: unknown }).data;
    if (cell.kind === GridCellKind.Custom || data === undefined || data === null || data === "" || data === false) return true;
    return Array.isArray(data) && data.length === 0;
}

/**
 * Spreadsheet defaults on top of upstream: F2 edits a cell, Backspace clears it (upstream: macOS only), Ctrl/Cmd+D and
 * Ctrl/Cmd+R fill down and right (upstream: off).
 */
const spreadsheetKeys = {
    activateCell: " |Enter|shift+Enter|F2",
    delete: "Backspace|Delete",
    downFill: true,
    rightFill: true,
} as const;

const emptySelection: GridSelection = {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
};

const Enhanced: React.FunctionComponent<{
    readonly props: CoreDataEditorProps;
    readonly enhance?: (props: CoreDataEditorProps) => CoreDataEditorProps;
    readonly fillSelectionOnPaste?: boolean;
    readonly undoRedo?: boolean;
    readonly handle: { current: DataEditorRef | null };
    /** Receives the caller's edit and selection handlers on every render. */
    readonly live: { current: CoreDataEditorProps | undefined };
    readonly edit: (edits: readonly EditListItem[]) => void;
    readonly history: UndoHistory;
    /** Whether the row menu is on and whether rows can be inserted (`onRowsInserted` set). */
    readonly rowMenu: boolean;
    readonly growRows: boolean;
    readonly rowOps: {
        openMenu(row: number, x: number, y: number): void;
        /** Pastes a block that runs past the last row, adding rows. Returns false when it fits (grid pastes as usual). */
        pasteRows(target: Item, values: readonly (readonly string[])[]): boolean;
        openSortMenu(col: number, x: number, y: number): void;
        /** Shown row → data row; read on every call, so it follows sorting without a re-render. */
        dataRow(row: number): number;
    };
    /** Header sort menu on; the current sort (redrawn on change). */
    readonly sortMenu: boolean;
    readonly sorted: { readonly col: number; readonly direction: "asc" | "desc" } | undefined;
}> = p => {
    let props = p.enhance === undefined ? p.props : p.enhance(p.props);
    const [ownSelection, setOwnSelection] = React.useState(emptySelection);
    const [widths, setWidths] = React.useState<ReadonlyMap<string, number>>(new Map());
    const userTheme = props.theme;
    const theme = React.useMemo(
        () => (userTheme?.groupHeaderAlign === undefined ? { ...userTheme, groupHeaderAlign: "center" as const } : userTheme),
        [userTheme]
    );
    props = { ...props, theme };

    if (p.sortMenu || p.sorted !== undefined) {
        // the grid works in shown rows; the caller's cell callbacks get data rows
        const d = (row: number) => (row < 0 ? row : p.rowOps.dataRow(row));
        const at = ([col, row]: Item): Item => [col, d(row)];
        const q = props;
        const { getCellContent, onCellsEdited, onCellEdited, validateCell, onCellActivated, onCellClicked } = q;
        const { onCellContextMenu, onKeyDown, onKeyUp, getRowThemeOverride } = q;
        props = {
            ...q,
            getCellContent: i => getCellContent(at(i)),
            onCellsEdited: onCellsEdited && (edits => onCellsEdited(edits.map(e => ({ ...e, location: at(e.location) })))),
            onCellEdited: onCellEdited && ((i, v) => onCellEdited(at(i), v)),
            validateCell: validateCell && ((i, v, prev) => validateCell(at(i), v, prev)),
            onCellActivated: onCellActivated && ((i, e) => onCellActivated(at(i), e)),
            onCellClicked: onCellClicked && ((i, e) => onCellClicked(at(i), e)),
            onCellContextMenu: onCellContextMenu && ((i, e) => onCellContextMenu(at(i), e)),
            onKeyDown: onKeyDown && (e => onKeyDown(e.location === undefined ? e : { ...e, location: at(e.location) })),
            onKeyUp: onKeyUp && (e => onKeyUp(e.location === undefined ? e : { ...e, location: at(e.location) })),
            getRowThemeOverride: getRowThemeOverride && ((row, ...rest) => getRowThemeOverride(d(row), ...rest)),
        };
    }
    if (p.sortMenu) {
        const { sorted } = p;
        const onHeaderMenuClick = props.onHeaderMenuClick;
        props = {
            ...props,
            // the arrow goes into the title, so keep the old title as id (column widths are kept by id ?? title)
            columns: props.columns.map((c, i) =>
                sorted?.col === i
                    ? { ...c, id: c.id ?? c.title, hasMenu: true, title: `${c.title} ${sorted.direction === "asc" ? "▲" : "▼"}` }
                    : { ...c, hasMenu: true }
            ),
            onHeaderMenuClick: onHeaderMenuClick ?? ((col, b) => p.rowOps.openSortMenu(col, b.x, b.y + b.height)),
        };
    }

    // upstream shows resize handles but drops the new width unless onColumnResize stores it; keep it here, as spreadsheets do
    if (props.onColumnResize === undefined) {
        const keyOf = (c: GridColumn) => c.id ?? c.title;
        const columns = props.columns;
        props = {
            ...props,
            columns:
                widths.size === 0
                    ? columns
                    : columns.map(c => {
                          const w = widths.get(keyOf(c));
                          return w === undefined ? c : { ...c, width: w, grow: 0 };
                      }),
            onColumnResize: (c, w) => setWidths(m => new Map(m).set(keyOf(c), w)),
        };
    }

    for (const key of ["activateCell", "delete", "downFill", "rightFill"] as const) {
        const value = props.keybindings?.[key];
        if (value === undefined || value === true) {
            props = { ...props, keybindings: { ...props.keybindings, [key]: spreadsheetKeys[key] } };
        }
    }

    if (props.editorSelectsAll === undefined) props = { ...props, editorSelectsAll: false };

    const fill = p.fillSelectionOnPaste === true && props.onPaste !== false;
    // fill reads the selection and undo moves it, so hold it here when the caller leaves it uncontrolled
    if ((fill || p.undoRedo === true || p.rowMenu) && props.gridSelection === undefined && props.onGridSelectionChange === undefined) {
        props = { ...props, gridSelection: ownSelection, onGridSelectionChange: setOwnSelection };
    }
    p.live.current = props;

    if (p.undoRedo === true || props.validateCell !== undefined) {
        // every grid edit (typing, paste, fill, delete) arrives here: recorded for undo and validated in one place
        props = {
            ...props,
            onCellsEdited: edits => {
                p.edit(edits);
                return true;
            },
        };
    }
    if (p.undoRedo === true) {
        const onKeyDown = props.onKeyDown;
        props = {
            ...props,
            onKeyDown: e => {
                const k = e.key.toLowerCase();
                if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "z" || k === "y")) {
                    e.cancel();
                    e.preventDefault();
                    if (k === "y" || e.shiftKey) p.history.redo();
                    else p.history.undo();
                    return;
                }
                onKeyDown?.(e);
            },
        };
    }

    if (p.rowMenu) {
        const onCellContextMenu = props.onCellContextMenu;
        props = {
            ...props,
            onCellContextMenu: (cell, e) => {
                onCellContextMenu?.(cell, e);
                if (cell[1] < 0) return;
                e.preventDefault();
                p.rowOps.openMenu(cell[1], e.bounds.x + e.localEventX, e.bounds.y + e.localEventY);
            },
        };
    }

    const onPaste = props.onPaste;
    // a split paste (not upstream's whole-text-into-one-cell default) can fill the selection or add rows
    if (onPaste !== false && (onPaste !== undefined || fill) && (fill || p.growRows)) {
        const current = props;
        props = {
            ...current,
            onPaste: (target, raw) => {
                const values = trimPasteLines(raw);
                const edits = fill ? fillSelectionEdits(current, current.gridSelection, values) : undefined;
                if (edits === undefined) {
                    if (typeof onPaste === "function" && !onPaste(target, values)) return false;
                    return !p.rowOps.pasteRows(target, values);
                }
                if (edits.length > 0) {
                    if (current.onCellsEdited?.(edits) !== true) {
                        for (const e of edits) current.onCellEdited?.(e.location, e.value);
                    }
                    p.handle.current?.updateCells(edits.map(e => ({ cell: e.location })));
                }
                return false;
            },
        };
    }

    return <DataEditorAll {...props} ref={p.handle} />;
};

/** Creates `<div id="portal">` when the page has none. */
function ensureDefaultPortal(): HTMLElement {
    const existing = document.getElementById("portal");
    if (existing !== null) return existing;
    const portal = document.createElement("div");
    portal.id = "portal";
    portal.style.position = "fixed";
    portal.style.left = "0";
    portal.style.top = "0";
    portal.style.zIndex = "9999";
    document.body.appendChild(portal);
    return portal;
}

/**
 * Glide Data Grid as a plain class. Mount it into any element; update it with {@link DataEditor.setProps}.
 *
 * Updates are batched like React state updates: they are applied in a microtask, before the next user event.
 * Call {@link DataEditor.flush} to apply them synchronously.
 *
 * ```ts
 * const grid = new DataEditor(document.getElementById("grid")!, {
 *     columns: [{ title: "Name", width: 200 }],
 *     rows: 1000,
 *     getCellContent: ([col, row]) => ({ kind: GridCellKind.Text, data: `${col},${row}`, displayData: `${col},${row}`, allowOverlay: true }),
 * });
 * ```
 * @category DataEditor
 */
export class DataEditor implements DataEditorRef {
    private readonly root: Root;
    private readonly handle: { current: DataEditorRef | null } = { current: null };
    private readonly portalRef: { current: HTMLElement | null } = { current: null };
    private readonly live: { current: CoreDataEditorProps | undefined } = { current: undefined };
    private readonly history = new UndoHistory();
    private currentProps: DataEditorProps;
    private destroyed = false;
    private closeMenu: (() => void) | undefined;
    private spareQueued = false;
    private spareAskedAt = -1;
    /** Data row of each shown row while sorted. */
    private order: number[] | undefined;
    private sorted: { col: number; direction: "asc" | "desc" } | undefined;
    /** >0 while our own row changes run, when `rows` and `order` briefly disagree. */
    private rowChanges = 0;

    constructor(public readonly container: HTMLElement, props: DataEditorProps) {
        this.currentProps = props;
        this.root = createRoot(container);
        this.render();
    }

    /** The props currently applied (including pending, not yet flushed updates). */
    public get props(): DataEditorProps {
        return this.currentProps;
    }

    /** Shallow-merges `props` into the current props and re-renders. Set a key to `undefined` to remove it. */
    public setProps(props: Partial<DataEditorProps>): void {
        this.currentProps = { ...this.currentProps, ...props };
        this.render();
    }

    /** Replaces all props. */
    public replaceProps(props: DataEditorProps): void {
        this.currentProps = props;
        this.render();
    }

    /** Synchronously applies pending updates. */
    public flush(): void {
        flush();
    }

    /** Unmounts the grid and releases its listeners. The instance cannot be used afterwards. */
    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.closeMenu?.();
        this.root.unmount();
    }

    /** Whether there is a step to undo (with `undoRedo`). */
    public get canUndo(): boolean {
        return this.history.canUndo;
    }

    /** Whether there is a step to redo (with `undoRedo`). */
    public get canRedo(): boolean {
        return this.history.canRedo;
    }

    /** Undoes the last step. Returns `false` when there is nothing to undo. */
    public undo(): boolean {
        return this.history.undo();
    }

    /** Redoes the last undone step. Returns `false` when there is nothing to redo. */
    public redo(): boolean {
        return this.history.redo();
    }

    /** Forgets all steps, e.g. after loading other data or saving. */
    public clearHistory(): void {
        this.history.clear();
    }

    /**
     * Adds your own step to the undo history (with `undoRedo`), for changes the grid does not make itself, such as
     * inserting or deleting rows. Ctrl+Z then undoes steps in order, whichever made them.
     */
    public addUndoStep(step: UndoStep): void {
        if (this.currentProps.undoRedo === true) this.history.push(step);
    }

    /**
     * Applies edits as if the user made them: checked by `validateCell`, sent through `onCellsEdited` / `onCellEdited`,
     * redrawn, and recorded as one undo step (with `undoRedo`). Like Handsontable's `setDataAtCell`.
     */
    public editCells(edits: readonly EditListItem[]): void {
        this.record(this.applyEdits(edits, true, false));
    }

    /**
     * Inserts `count` empty rows at `at` through `onRowsInserted`, as one undo step (undo needs `onRowsRemoved` too).
     * Like Handsontable's `alter("insert_row_above")`.
     */
    public insertRows(at: number, count = 1): void {
        if (count < 1 || this.currentProps.onRowsInserted === undefined) return;
        this.recordRowChange(this.insertStep(at, count));
    }

    /**
     * Removes rows through `onRowsRemoved`, as one undo step. Like Handsontable's `alter("remove_row")`.
     * See {@link DataEditorProps.onRowsRemoved} for how undo puts them back.
     */
    public removeRows(rows: readonly number[]): void {
        const p = this.currentProps;
        const sorted = [...new Set(rows)].filter(r => r >= 0 && r < p.rows).sort((a, b) => b - a);
        if (p.onRowsRemoved === undefined || sorted.length === 0) return;
        this.recordRowChange(this.removeStep(sorted));
    }

    private readonly recordEdits = (edits: readonly EditListItem[]) => this.record(this.applyEdits(edits, true, false));

    private record(step: UndoStep | undefined): void {
        if (step !== undefined) this.addUndoStep(step);
    }

    // a row change that cannot be undone shifts the rows older steps point at, so those steps are dropped
    private recordRowChange(step: UndoStep | undefined): void {
        if (step === undefined) this.history.clear();
        else this.addUndoStep(step);
    }

    /** Data row shown at row `row` (the same row unless sorted, see {@link DataEditorProps.columnSort}). */
    public dataRow(row: number): number {
        return this.order?.[row] ?? row;
    }

    /** Row where data row `row` is shown. */
    public viewRow(row: number): number {
        const v = this.order?.indexOf(row) ?? -1;
        return v < 0 ? row : v;
    }

    /** The current sort, if any. */
    public get sort(): { readonly col: number; readonly direction: "asc" | "desc" } | undefined {
        return this.sorted;
    }

    /**
     * Shows rows sorted by column `col` (empty cells last, numbers by value, text in natural order), or in data order
     * when `col` is omitted. One undo step. The order is fixed when sorting, as in spreadsheets: editing does not move
     * rows. Your data is not reordered; see {@link DataEditorProps.columnSort}.
     */
    public sortColumn(col?: number, direction: "asc" | "desc" = "asc"): void {
        if (col === undefined && this.sorted === undefined) return;
        const prev = { order: this.order, sorted: this.sorted };
        const next = col === undefined ? { order: undefined, sorted: undefined } : { order: this.sortedOrder(col, direction), sorted: { col, direction } };
        const apply = (s: typeof prev) => {
            this.order = s.order;
            this.sorted = s.sorted;
            this.selectRows();
            this.render();
        };
        apply(next);
        this.addUndoStep({ undo: () => apply(prev), redo: () => apply(next) });
    }

    private sortedOrder(col: number, direction: "asc" | "desc"): number[] {
        const p = this.currentProps;
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
        const numeric = /^-?\d+(\.\d+)?$/;
        const valueOf = (row: number): number | string | undefined => {
            const cell = p.getCellContent([col, row]);
            if (isEmptyCell(cell)) return undefined;
            const data = (cell as { data?: unknown }).data;
            if (typeof data === "number" || typeof data === "string") {
                return typeof data === "string" && numeric.test(data.trim()) ? Number(data) : data;
            }
            return "displayData" in cell && typeof cell.displayData === "string" ? cell.displayData : String(data);
        };
        const sign = direction === "asc" ? 1 : -1;
        // ponytail: reads one cell per row on every sort; fine for spreadsheet-sized data
        const keyed = Array.from({ length: p.rows }, (_, row) => ({ row, v: valueOf(row) }));
        keyed.sort((a, b) => {
            if (a.v === undefined || b.v === undefined) return a.v === b.v ? 0 : a.v === undefined ? 1 : -1;
            if (typeof a.v === "number" && typeof b.v === "number") return sign * (a.v - b.v);
            return sign * collator.compare(String(a.v), String(b.v));
        });
        return keyed.map(k => k.row);
    }

    /** Inserts at shown row `at`; while sorted the new rows go to the end of the data. */
    private insertRaw(at: number, count: number): void {
        const { rows, onRowsInserted } = this.currentProps;
        if (onRowsInserted === undefined) return;
        const order = this.order;
        if (order !== undefined) {
            this.order = [...order.slice(0, at), ...Array.from({ length: count }, (_, i) => rows + i), ...order.slice(at)];
        }
        this.rowChanges++;
        try {
            onRowsInserted(order === undefined ? at : rows, count);
        } finally {
            this.rowChanges--;
        }
    }

    /** `rows`: shown rows, descending. Returns the data rows removed (descending) and the caller's restore function. */
    private removeRaw(rows: readonly number[]): { data: number[]; restore: (() => void) | undefined } {
        const data = rows.map(r => this.dataRow(r)).sort((a, b) => b - a);
        if (this.order !== undefined) {
            const gone = new Set(rows);
            this.order = this.order.filter((_, v) => !gone.has(v)).map(r => r - data.filter(x => x < r).length);
        }
        this.rowChanges++;
        try {
            const restore = this.currentProps.onRowsRemoved?.(data);
            return { data, restore: typeof restore === "function" ? restore : undefined };
        } finally {
            this.rowChanges--;
        }
    }

    private insertStep(at: number, count: number): UndoStep | undefined {
        this.insertRaw(at, count);
        if (this.currentProps.onRowsRemoved === undefined) return undefined;
        const rows = Array.from({ length: count }, (_, i) => at + count - 1 - i);
        return {
            undo: () => {
                this.removeRaw(rows);
                this.selectRows();
            },
            redo: () => {
                this.insertRaw(at, count);
                this.selectRows(at, at + count - 1);
            },
        };
    }

    /** `rows`: shown rows in descending order, all existing. */
    private removeStep(rows: readonly number[]): UndoStep | undefined {
        const snapshot = this.order;
        const live = this.live.current;
        const before: EditListItem[] = [];
        // ponytail: reads every cell of the removed rows for the fallback undo, even when onRowsRemoved returns its own
        if (live !== undefined) {
            for (const row of rows) {
                for (let col = 0; col < live.columns.length; col++) {
                    const cell = live.getCellContent([col, row]);
                    if (isEditableGridCell(cell)) before.push({ location: [col, row], value: cell });
                }
            }
        }
        const remove = () => {
            const result = this.removeRaw(rows);
            this.selectRows();
            return result;
        };
        let removed = remove();
        if (removed.restore === undefined && this.currentProps.onRowsInserted === undefined) return undefined;
        return {
            undo: () => {
                const { data, restore } = removed;
                this.rowChanges++;
                try {
                    if (restore !== undefined) restore();
                    else for (const r of [...data].reverse()) this.currentProps.onRowsInserted?.(r, 1);
                } finally {
                    this.rowChanges--;
                }
                this.order = snapshot;
                if (restore === undefined) this.applyEdits(before, false, false);
                this.selectRows(rows[rows.length - 1], rows[0]);
                if (snapshot !== undefined) this.render(); // show the restored order
            },
            redo: () => {
                removed = remove();
            },
        };
    }

    /** Pastes a block that runs past the last row: adds the missing rows, then writes the cells, as one undo step. */
    private readonly pasteRows = (target: Item, values: readonly (readonly string[])[]): boolean => {
        const live = this.live.current;
        const rows = this.currentProps.rows;
        if (live === undefined || target[1] + values.length <= rows) return false;
        const inserted = this.insertStep(rows, target[1] + values.length - rows);
        const edits: EditListItem[] = [];
        values.forEach((line, dy) =>
            line.forEach((value, dx) => {
                const location: Item = [target[0] + dx, target[1] + dy];
                if (location[0] >= live.columns.length) return;
                const edit = pasteToCell(live, live.getCellContent(location), location, value);
                if (edit !== undefined) edits.push(edit);
            })
        );
        const edited = this.applyEdits(edits, true, false);
        this.recordRowChange(
            inserted === undefined || edited === undefined
                ? inserted
                : {
                      undo: () => {
                          edited.undo();
                          inserted.undo();
                      },
                      redo: () => {
                          inserted.redo();
                          edited.redo();
                      },
                  }
        );
        return true;
    };

    /** Selects whole rows `from`..`to`, or clears the selection. */
    private selectRows(from?: number, to?: number): void {
        const live = this.live.current;
        if (live === undefined) return;
        if (from === undefined || to === undefined) live.onGridSelectionChange?.(emptySelection);
        else this.select(0, from, live.columns.length - 1, to);
    }

    private select(x: number, y: number, x2: number, y2: number): void {
        this.live.current?.onGridSelectionChange?.({
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: { cell: [x, y], range: { x, y, width: x2 - x + 1, height: y2 - y + 1 }, rangeStack: [] },
        });
        this.handle.current?.scrollTo(x, y);
    }

    /** The rows the row menu acts on: the selected rows if `row` is one of them, else just `row`. */
    private menuRows(row: number): number[] {
        const s = this.live.current?.gridSelection;
        const out = new Set(s?.rows.toArray() ?? []);
        for (const r of s?.current === undefined ? [] : [s.current.range, ...s.current.rangeStack]) {
            for (let y = r.y; y < r.y + r.height; y++) out.add(y);
        }
        return out.has(row) ? [...out] : [row];
    }

    private readonly openMenu = (row: number, x: number, y: number): void => {
        this.closeMenu?.();
        const p = this.currentProps;
        const labels = { ...defaultRowMenuLabels, ...(typeof p.rowContextMenu === "object" ? p.rowContextMenu : {}) };
        const items: [string, () => void][] = [];
        if (p.onRowsInserted !== undefined) {
            items.push([labels.insertAbove, () => this.insertRows(row)], [labels.insertBelow, () => this.insertRows(row + 1)]);
        }
        const rows = this.menuRows(row);
        if (p.onRowsRemoved !== undefined) items.push([labels.removeRows, () => this.removeRows(rows)]);
        this.showMenu(items, x, y);
    };

    private readonly openSortMenu = (col: number, x: number, y: number): void => {
        const p = this.currentProps;
        const labels = { ...defaultSortMenuLabels, ...(typeof p.columnSort === "object" ? p.columnSort : {}) };
        const items: [string, () => void][] = [
            [labels.sortAsc, () => this.sortColumn(col, "asc")],
            [labels.sortDesc, () => this.sortColumn(col, "desc")],
        ];
        if (this.sorted !== undefined) items.push([labels.clearSort, () => this.sortColumn()]);
        this.showMenu(items, x, y, "gdg-sort-menu");
    };

    /** A small menu at (x, y), closed by choosing, clicking elsewhere, Escape or leaving the window. */
    private showMenu(items: readonly [string, () => void][], x: number, y: number, className = "gdg-row-menu"): void {
        this.closeMenu?.();
        if (items.length === 0) return;
        const menu = document.createElement("div");
        menu.className = className;
        menu.setAttribute("role", "menu");
        menu.style.cssText =
            "position:fixed;z-index:10000;min-width:180px;padding:4px 0;background:#fff;color:#111;" +
            "border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 4px 12px rgb(0 0 0 / 15%);font:13px system-ui,sans-serif";
        for (const [label, run] of items) {
            const item = document.createElement("button");
            item.type = "button";
            item.setAttribute("role", "menuitem");
            item.textContent = label;
            item.style.cssText =
                "display:block;width:100%;padding:6px 12px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer";
            item.onpointerenter = () => (item.style.background = "#f1f5f9");
            item.onpointerleave = () => (item.style.background = "none");
            item.onclick = () => {
                this.closeMenu?.();
                run();
                this.handle.current?.focus();
            };
            menu.append(item);
        }
        document.body.append(menu);
        // keep it on screen
        const box = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - box.width))}px`;
        menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - box.height))}px`;

        const onPointer = (e: Event) => {
            if (!menu.contains(e.target as Node)) this.closeMenu?.();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") this.closeMenu?.();
        };
        window.addEventListener("pointerdown", onPointer, true);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("blur", onPointer);
        this.closeMenu = () => {
            this.closeMenu = undefined;
            window.removeEventListener("pointerdown", onPointer, true);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("blur", onPointer);
            menu.remove();
        };
    }

    /** Keeps `minSpareRows` empty rows at the end. Runs after the current batch, once the caller has updated `rows`. */
    private checkSpareRows(): void {
        if (this.spareQueued || (this.currentProps.minSpareRows ?? 0) < 1) return;
        this.spareQueued = true;
        queueMicrotask(() => {
            this.spareQueued = false;
            const p = this.currentProps;
            const want = p.minSpareRows ?? 0;
            // a handler that does not update `rows` is asked once per row count, never in a loop
            if (this.destroyed || p.onRowsInserted === undefined || p.rows === this.spareAskedAt) return;
            const isEmptyRow = (row: number) =>
                p.columns.every((_, col) => isEmptyCell(p.getCellContent([col, this.dataRow(row)])));
            let empty = 0;
            while (empty < want && empty < p.rows && isEmptyRow(p.rows - 1 - empty)) empty++;
            if (empty >= want) return;
            this.spareAskedAt = p.rows;
            this.insertRaw(p.rows, want - empty);
        });
    }

    private applyEdits(proposed: readonly EditListItem[], record: boolean, select: boolean): UndoStep | undefined {
        const props = this.live.current;
        if (props === undefined) return undefined;
        const validate = props.validateCell;
        // upstream validates only the cell editor; paste and fill go through the same check here
        const edits =
            record && validate !== undefined
                ? proposed.flatMap(e => {
                      const result = validate(e.location, e.value, props.getCellContent(e.location));
                      return result === false ? [] : [result === true ? e : { location: e.location, value: result }];
                  })
                : proposed;
        if (edits.length === 0) return undefined;
        let step: UndoStep | undefined;
        if (record && this.currentProps.undoRedo === true) {
            const before: EditListItem[] = [];
            for (const e of edits) {
                const cell = props.getCellContent(e.location);
                if (isEditableGridCell(cell)) before.push({ location: e.location, value: cell });
            }
            step = {
                undo: () => this.applyEdits(before, false, true),
                redo: () => this.applyEdits(edits, false, true),
            };
        }
        if (props.onCellsEdited?.(edits) !== true) {
            for (const e of edits) props.onCellEdited?.(e.location, e.value);
        }
        this.handle.current?.updateCells(edits.map(e => ({ cell: e.location })));
        this.checkSpareRows();
        if (select) {
            // like spreadsheets, select what changed
            const xs = edits.map(e => e.location[0]);
            const ys = edits.map(e => e.location[1]);
            this.select(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
        }
        return step;
    }

    private render() {
        if (this.destroyed) throw new Error("DataEditor has been destroyed");
        const {
            rightElement,
            portalElement,
            enhance,
            fillSelectionOnPaste,
            undoRedo,
            onRowsInserted,
            onRowsRemoved,
            rowContextMenu,
            minSpareRows,
            columnSort,
            ...rest
        } = this.currentProps;
        // rows changed behind our back (e.g. other data loaded): the shown order no longer fits
        if (this.order !== undefined && this.rowChanges === 0 && this.order.length !== rest.rows) {
            this.order = undefined;
            this.sorted = undefined;
        }
        this.checkSpareRows();
        this.portalRef.current = portalElement ?? ensureDefaultPortal();
        this.root.render(
            <Enhanced
                props={{ ...rest, rightElement: toNode(rightElement), portalElementRef: this.portalRef }}
                enhance={enhance}
                fillSelectionOnPaste={fillSelectionOnPaste}
                undoRedo={undoRedo}
                handle={this.handle}
                live={this.live}
                edit={this.recordEdits}
                history={this.history}
                rowMenu={(rowContextMenu ?? false) !== false && (onRowsInserted !== undefined || onRowsRemoved !== undefined)}
                growRows={onRowsInserted !== undefined}
                rowOps={this.rowOps}
                sortMenu={(columnSort ?? false) !== false}
                sorted={this.sorted}
            />
        );
    }

    private readonly rowOps = {
        openMenu: this.openMenu,
        pasteRows: this.pasteRows,
        openSortMenu: this.openSortMenu,
        dataRow: (row: number) => this.dataRow(row),
    };

    private get ref(): DataEditorRef {
        const h = this.handle.current;
        if (h === null) throw new Error(this.destroyed ? "DataEditor has been destroyed" : "DataEditor is not mounted");
        return h;
    }

    public appendRow: DataEditorRef["appendRow"] = (...args) => this.ref.appendRow(...args);
    public appendColumn: DataEditorRef["appendColumn"] = (...args) => this.ref.appendColumn(...args);
    public updateCells: DataEditorRef["updateCells"] = (...args) => this.ref.updateCells(...args);
    public getBounds: DataEditorRef["getBounds"] = (...args) => this.ref.getBounds(...args);
    public focus: DataEditorRef["focus"] = (...args) => this.ref.focus(...args);
    public emit: DataEditorRef["emit"] = (...args) => this.ref.emit(...args);
    public scrollTo: DataEditorRef["scrollTo"] = (...args) => this.ref.scrollTo(...args);
    public remeasureColumns: DataEditorRef["remeasureColumns"] = (...args) => this.ref.remeasureColumns(...args);
    public getMouseArgsForPosition: DataEditorRef["getMouseArgsForPosition"] = (...args) =>
        this.ref.getMouseArgsForPosition(...args);
}

/**
 * Wraps one of the grid's built-in editor components (e.g. `TextCellEntry`) as a {@link VanillaEditor}, so custom
 * editors can reuse them.
 */
export function toVanillaEditor<P extends object>(Component: React.FunctionComponent<P>): VanillaEditor<P> {
    return (container, props) => {
        const root = createRoot(container);
        root.render(<Component {...props} />);
        return {
            update: next => root.render(<Component {...next} />),
            destroy: () => root.unmount(),
        };
    };
}
