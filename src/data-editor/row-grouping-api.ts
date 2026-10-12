import * as React from "../runtime/react.js";
import type { Item } from "../internal/data-grid/data-grid-types.js";
import { flattenRowGroups, mapRowIndexToPath, type RowGroup, type RowGroupingOptions, type MapResult } from "./row-grouping.js";

export interface RowGroupingMapperResult<T> extends Omit<MapResult, 'originalIndex'> {
    path: readonly number[];
    originalIndex: T;
    isGroupHeader: boolean;
    groupRows: number;
}

export type RowGroupingMapper = {
    (itemOrRow: number): RowGroupingMapperResult<number>;
    (itemOrRow: Item): RowGroupingMapperResult<Item>;
};

export interface UseRowGroupingResult {
    readonly mapper: RowGroupingMapper;
    readonly updateRowGroupingByPath: (
        rowGrouping: readonly RowGroup[],
        path: readonly number[],
        update: Partial<RowGroup>
    ) => readonly RowGroup[];
    readonly getRowGroupingForPath: (rowGrouping: readonly RowGroup[], path: readonly number[]) => RowGroup;
}

/**
 * Framework-agnostic version of {@link useRowGrouping}: builds the row mapper for the given grouping options.
 */
export function createRowGrouping(options: RowGroupingOptions | undefined, rows: number): UseRowGroupingResult {
    const flattenedRowGroups = options === undefined ? undefined : flattenRowGroups(options, rows);
    const mapper = ((itemOrRow: number | Item) => {
        if (typeof itemOrRow === "number") {
            return mapRowIndexToPath(itemOrRow, flattenedRowGroups);
        }
        const r = mapRowIndexToPath(itemOrRow[1], flattenedRowGroups);
        return {
            ...r,
            originalIndex: [itemOrRow[0], r.originalIndex],
        } as any; // FIXME
    }) as RowGroupingMapper;
    return { getRowGroupingForPath, updateRowGroupingByPath, mapper };
}

export function useRowGrouping(options: RowGroupingOptions | undefined, rows: number): UseRowGroupingResult {
    return React.useMemo(() => createRowGrouping(options, rows), [options, rows]);
}

export function updateRowGroupingByPath(
    rowGrouping: readonly RowGroup[],
    path: readonly number[],
    update: Partial<RowGroup>
): readonly RowGroup[] {
    const [index, ...rest] = path;
    if (rest[0] === -1) {
        return rowGrouping.map((group, i) => (i === index ? { ...group, ...update } : group));
    }
    return rowGrouping.map((group, i) =>
        i === index ? { ...group, subGroups: updateRowGroupingByPath(group.subGroups ?? [], rest, update) } : group
    );
}

export function getRowGroupingForPath(rowGrouping: readonly RowGroup[], path: readonly number[]): RowGroup {
    const [index, ...rest] = path;
    if (rest[0] === -1) {
        return rowGrouping[index];
    }
    return getRowGroupingForPath(rowGrouping[index].subGroups ?? [], rest);
}
