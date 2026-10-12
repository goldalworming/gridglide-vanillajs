import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, act, screen } from "@testing-library/react";
import { DataEditor, GridCellKind, type DataEditorProps, type GridCell, type Item, type TextCell } from "../src/index.js";
import { flush } from "../src/runtime/react.js";
import { prep, sendClick, standardBeforeEach } from "./test-utils.js";
import { useMoveableColumns } from "../src/source/index.js";

const columns = [
    { title: "A", id: "a", width: 100 },
    { title: "B", id: "b", width: 100 },
];

function makeProps(extra: Partial<DataEditorProps> = {}): DataEditorProps {
    return {
        columns,
        rows: 100,
        width: 1000,
        height: 1000,
        rowHeight: 32,
        headerHeight: 36,
        getCellContent: ([col, row]: Item): GridCell => ({
            kind: GridCellKind.Text,
            data: `${col},${row}`,
            displayData: `${col},${row}`,
            allowOverlay: true,
        }),
        ...extra,
    };
}

// center of cell [col,row] for the props above (no row markers)
const pos = (col: number, row: number) => ({ clientX: col * 100 + 50, clientY: 36 + row * 32 + 16 });

describe("vanilla DataEditor", () => {
    // jsdom has no layout; same approach as the upstream suite
    vi.mock("../src/common/resize-detector", () => ({
        useResizeDetector: () => ({ ref: undefined, width: 1000, height: 1000 }),
    }));

    let host: HTMLDivElement;
    let grid: DataEditor | undefined;

    beforeEach(() => {
        standardBeforeEach();
        vi.useFakeTimers();
        host = document.body.appendChild(document.createElement("div"));
    });

    afterEach(() => {
        grid?.destroy();
        grid = undefined;
        host.remove();
        document.getElementById("portal")?.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    test("mounts, creates a default portal and unmounts cleanly", () => {
        grid = new DataEditor(host, makeProps());
        expect(host.querySelector("canvas")).not.toBeNull();
        expect(document.getElementById("portal")).not.toBeNull();
        grid.destroy();
        expect(host.childElementCount).toBe(0);
        expect(() => grid?.scrollTo(0, 0)).toThrow(/destroyed/);
    });

    test("setProps is batched and flush applies it", () => {
        grid = new DataEditor(host, makeProps());
        const right = document.createElement("span");
        right.textContent = "right!";
        grid.setProps({ rightElement: right });
        expect(host.contains(right)).toBe(false);
        grid.flush();
        expect(host.contains(right)).toBe(true);
        expect(grid.props.rightElement).toBe(right);
    });

    test("exposes the ref API", () => {
        grid = new DataEditor(host, makeProps());
        prep(false);
        const bounds = grid.getBounds(1, 1);
        expect(bounds).toEqual({ x: 100, y: 68, width: 101, height: 33 });
        expect(grid.getMouseArgsForPosition(150, 84)?.location).toEqual([1, 1]);
    });

    test("editing a text cell with real input events reports the edit", () => {
        const onCellEdited = vi.fn();
        grid = new DataEditor(host, makeProps({ onCellEdited }));
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(0, 0));
        sendClick(canvas, pos(0, 0));
        act(() => void vi.runAllTimers());

        const textarea = document.querySelector<HTMLTextAreaElement>("#portal textarea");
        expect(textarea).not.toBeNull();
        if (textarea === null) return;
        textarea.value = "hello";
        fireEvent.input(textarea);
        fireEvent.keyDown(textarea, { key: "Enter" });
        act(() => void vi.runAllTimers());

        expect(onCellEdited).toHaveBeenCalledWith([0, 0], expect.objectContaining({ data: "hello" }));
    });

    test("vanilla provideEditor receives a container, updates and is destroyed", () => {
        const update = vi.fn();
        const destroy = vi.fn();
        const onCellEdited = vi.fn();
        grid = new DataEditor(
            host,
            makeProps({
                onCellEdited,
                provideEditor: () => ({
                    editor: (container, props) => {
                        const input = document.createElement("input");
                        input.setAttribute("data-testid", "vanilla-editor");
                        input.value = (props.value as TextCell).data;
                        input.addEventListener("input", () =>
                            props.onChange({ ...props.value, data: input.value } as GridCell)
                        );
                        input.addEventListener("keydown", e => {
                            if (e.key === "Enter") props.onFinishedEditing({ ...props.value, data: input.value } as GridCell);
                        });
                        container.append(input);
                        return {
                            update: next => {
                                props = next;
                                update((next.value as TextCell).data);
                            },
                            destroy,
                        };
                    },
                }),
            })
        );
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(1, 2));
        sendClick(canvas, pos(1, 2));
        act(() => void vi.runAllTimers());

        const input = screen.getByTestId("vanilla-editor") as HTMLInputElement;
        expect(input.value).toBe("1,2");
        input.value = "x";
        fireEvent.input(input);
        flush();
        expect(update).toHaveBeenLastCalledWith("x");

        fireEvent.keyDown(input, { key: "Enter" });
        act(() => void vi.runAllTimers());
        expect(onCellEdited).toHaveBeenCalledWith([1, 2], expect.objectContaining({ data: "x" }));
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    test("enhance runs source helpers inside the grid", () => {
        let moved: ((from: number, to: number) => void) | undefined;
        grid = new DataEditor(
            host,
            makeProps({
                enhance: p => {
                    const result = { ...p, ...useMoveableColumns(p) };
                    moved = result.onColumnMoved;
                    return result;
                },
            })
        );
        prep(false);
        act(() => moved?.(0, 1));
        act(() => void vi.runAllTimers()); // the accessibility tree is debounced upstream

        // display column 0 now shows source column 1
        expect(screen.getByTestId("glide-cell-0-0").textContent).toBe("1,0");
        expect([...document.querySelectorAll("[role=columnheader]")].map(x => x.textContent)).toEqual(["B", "A"]);
    });
});
