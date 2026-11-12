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
 * Spreadsheet-style fill: one pasted value written into every cell of a multi-cell selection. Returns `undefined`
 * when the paste is not a single value or the selection is a single cell, so the grid pastes as usual.
 */
export function fillSelectionEdits(
    props: CoreDataEditorProps,
    selection: GridSelection | undefined,
    values: readonly (readonly string[])[]
): EditListItem[] | undefined {
    const current = selection?.current;
    if (current === undefined || values.length !== 1 || values[0].length !== 1) return undefined;
    const ranges = [current.range, ...current.rangeStack];
    if (!ranges.some(r => r.width * r.height > 1)) return undefined;

    const value = values[0][0];
    const seen = new Set<string>();
    const edits: EditListItem[] = [];
    // ponytail: one getCellContent call per selected cell; fine for typical ranges, slow for select-all on huge grids
    for (const r of ranges) {
        for (let row = r.y; row < Math.min(r.y + r.height, props.rows); row++) {
            for (let col = r.x; col < Math.min(r.x + r.width, props.columns.length); col++) {
                const key = `${col},${row}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const edit = pasteToCell(props, props.getCellContent([col, row]), [col, row], value);
                if (edit !== undefined) edits.push(edit);
            }
        }
    }
    return edits;
}

// same rules as the grid's own paste (data-editor.tsx onPasteInternal): coercePasteValue first, then the renderer
function pasteToCell(props: CoreDataEditorProps, cell: GridCell, location: Item, value: string): EditListItem | undefined {
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
