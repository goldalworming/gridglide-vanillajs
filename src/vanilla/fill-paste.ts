import { AllCellRenderers } from "../cells/index.js";
import type { CustomRenderer } from "../cells/cell-types.js";
import {
    GridCellKind,
    isEditableGridCell,
    isReadWriteCell,
    type CustomCell,
    type EditableGridCell,
    type EditListItem,
    type GridCell,
    type GridSelection,
    type Item,
} from "../internal/data-grid/data-grid-types.js";
import type { CoreDataEditorProps } from "./data-editor.js";

/**
 * Spreadsheet-style paste into a larger selection, as in Excel: a single value is written into every selected cell, and
 * a block whose size divides the (single) selected range evenly is repeated across it. Returns `undefined` otherwise,
 * so the grid pastes as usual.
 */
export function fillSelectionEdits(
    props: CoreDataEditorProps,
    selection: GridSelection | undefined,
    values: readonly (readonly string[])[]
): EditListItem[] | undefined {
    const current = selection?.current;
    values = trimPasteLines(values);
    if (current === undefined || values.length === 0) return undefined;
    const h = values.length;
    const w = Math.max(...values.map(line => line.length));
    const ranges = [current.range, ...current.rangeStack];
    if (h === 1 && w === 1) {
        if (!ranges.some(r => r.width * r.height > 1)) return undefined;
    } else {
        // like Excel: only one range, a whole number of copies, and more than one copy
        const r = current.range;
        if (ranges.length !== 1 || r.width % w !== 0 || r.height % h !== 0 || r.width * r.height === w * h) return undefined;
    }

    const seen = new Set<string>();
    const edits: EditListItem[] = [];
    // ponytail: one getCellContent call per selected cell; fine for typical ranges, slow for select-all on huge grids
    for (const r of ranges) {
        for (let row = r.y; row < Math.min(r.y + r.height, props.rows); row++) {
            for (let col = r.x; col < Math.min(r.x + r.width, props.columns.length); col++) {
                const key = `${col},${row}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const value = values[(row - r.y) % h][(col - r.x) % w] ?? "";
                const edit = pasteToCell(props, props.getCellContent([col, row]), [col, row], value);
                if (edit !== undefined) edits.push(edit);
            }
        }
    }
    return edits;
}

/** Drops the empty last line(s) that Excel and Sheets put at the end of every copy. */
export function trimPasteLines(values: readonly (readonly string[])[]): readonly (readonly string[])[] {
    let end = values.length;
    while (end > 1 && values[end - 1].every(v => v === "")) end--;
    return end === values.length ? values : values.slice(0, end);
}

// same rules as the grid's own paste (data-editor.tsx onPasteInternal): coercePasteValue first, then the renderer
export function pasteToCell(props: CoreDataEditorProps, cell: GridCell, location: Item, value: string): EditListItem | undefined {
    if (!isReadWriteCell(cell) || cell.readonly === true) return undefined;
    const coerced = props.coercePasteValue?.(value, cell);
    if (coerced !== undefined && isEditableGridCell(coerced)) return { location, value: coerced };

    if (cell.kind === GridCellKind.Custom) {
        const r = props.customRenderers?.find(x => x.isMatch(cell)) as CustomRenderer<CustomCell> | undefined;
        const data = r?.onPaste?.(value, cell.data);
        return data === undefined ? undefined : { location, value: { ...cell, data } };
    }
    const r = (props.renderers ?? AllCellRenderers).find(x => x.kind === cell.kind);
    const next = r?.onPaste?.(value, cell as never, { rawValue: value, formatted: undefined, formattedString: undefined });
    return next === undefined || next.kind !== cell.kind ? undefined : { location, value: next as EditableGridCell };
}
