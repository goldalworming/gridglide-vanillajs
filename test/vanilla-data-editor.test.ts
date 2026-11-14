import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, act, screen } from "@testing-library/react";
import {
    CompactSelection,
    DataEditor,
    GridCellKind,
    type DataEditorProps,
    type EditListItem,
    type GridSelection,
    type GridCell,
    type Item,
    type TextCell,
} from "../src/index.js";
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

    test("a double-click editor keeps the focus", () => {
        grid = new DataEditor(host, makeProps());
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(0, 1));
        sendClick(canvas, pos(0, 1));
        act(() => void vi.runAllTimers());
        const ta = document.querySelector<HTMLTextAreaElement>("#portal textarea");
        expect(ta).not.toBeNull();
        expect(document.activeElement).toBe(ta);
    });

    test("Enter right after the last typed key still saves the edit", () => {
        const onCellEdited = vi.fn();
        grid = new DataEditor(host, makeProps({ onCellEdited }));
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(0, 1));
        fireEvent.keyDown(canvas, { key: "Q" });
        act(() => void vi.runAllTimers());
        const ta = document.querySelector<HTMLTextAreaElement>("#portal textarea");
        expect(ta).not.toBeNull();
        if (ta === null) return;
        ta.value = "Qx";
        fireEvent.input(ta);
        flush();
        // a scanner or autotype tool: Enter arrives before the timer of the previous key has run
        fireEvent.keyDown(ta, { key: "x" });
        fireEvent.keyDown(ta, { key: "Enter" });
        act(() => void vi.runAllTimers());
        expect(onCellEdited).toHaveBeenCalledWith([0, 1], expect.objectContaining({ data: "Qx" }));
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

    test("F2 opens the editor by default and custom activateCell keybindings are kept", () => {
        grid = new DataEditor(host, makeProps());
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(0, 0));
        fireEvent.keyDown(canvas, { key: "F2" });
        act(() => void vi.runAllTimers());
        expect(document.querySelector("#portal textarea")).not.toBeNull();

        grid.destroy();
        grid = new DataEditor(host, makeProps({ keybindings: { activateCell: "Enter" } }));
        prep(false);
        const canvas2 = screen.getByTestId("data-grid-canvas");
        sendClick(canvas2, pos(0, 0));
        fireEvent.keyDown(canvas2, { key: "F2" });
        act(() => void vi.runAllTimers());
        expect(document.querySelector("#portal textarea")).toBeNull();
    });

    test("an editor opened with F2 puts the caret at the end, unless editorSelectsAll is set", () => {
        grid = new DataEditor(host, makeProps());
        prep(false);
        sendClick(screen.getByTestId("data-grid-canvas"), pos(1, 2));
        fireEvent.keyDown(screen.getByTestId("data-grid-canvas"), { key: "F2" });
        act(() => void vi.runAllTimers());
        const ta = document.querySelector<HTMLTextAreaElement>("#portal textarea");
        expect([ta?.value, ta?.selectionStart, ta?.selectionEnd]).toEqual(["1,2", 3, 3]);

        grid.destroy();
        grid = new DataEditor(host, makeProps({ editorSelectsAll: true }));
        prep(false);
        sendClick(screen.getByTestId("data-grid-canvas"), pos(1, 2));
        fireEvent.keyDown(screen.getByTestId("data-grid-canvas"), { key: "F2" });
        act(() => void vi.runAllTimers());
        const ta2 = document.querySelector<HTMLTextAreaElement>("#portal textarea");
        expect([ta2?.selectionStart, ta2?.selectionEnd]).toEqual([0, 3]);
    });

    test("Ctrl+D fills down and Ctrl+R fills right", async () => {
        const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
        grid = new DataEditor(host, makeProps({ onCellsEdited, getCellsForSelection: true }));
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(0, 0));
        sendClick(canvas, { ...pos(1, 2), shiftKey: true });
        for (const [key, keyCode] of [["d", 68], ["r", 82]] as const) {
            await act(async () => {
                fireEvent.keyDown(canvas, { key, keyCode, ctrlKey: true });
                await vi.runAllTimersAsync();
            });
        }
        const calls = onCellsEdited.mock.calls.map(c => c[0].map(e => `${e.location.join(",")}=${(e.value as TextCell).data}`));
        expect(calls).toEqual([
            ["0,1=0,0", "0,2=0,0", "1,1=1,0", "1,2=1,0"],
            ["1,0=0,0", "1,1=0,1", "1,2=0,2"],
        ]);
    });

    test("Backspace clears the selected cell on every OS", () => {
        const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
        grid = new DataEditor(host, makeProps({ onCellsEdited }));
        prep(false);
        const canvas = screen.getByTestId("data-grid-canvas");
        sendClick(canvas, pos(1, 2));
        fireEvent.keyDown(canvas, { key: "Backspace" });
        act(() => void vi.runAllTimers());
        expect(onCellsEdited).toHaveBeenCalledTimes(1);
        expect(onCellsEdited.mock.calls[0][0].map(e => [e.location, (e.value as TextCell).data])).toEqual([[[1, 2], ""]]);
    });

    describe("undoRedo", () => {
        // a tiny store, so getCellContent shows what onCellsEdited wrote (undo reads old values from it)
        const store = () => {
            const data = new Map<string, string>();
            const read = ([c, r]: Item) => data.get(`${c},${r}`) ?? `${c},${r}`;
            return {
                read,
                props: (extra: Partial<DataEditorProps> = {}) =>
                    makeProps({
                        undoRedo: true,
                        getCellContent: (i: Item): GridCell => ({
                            kind: GridCellKind.Text,
                            data: read(i),
                            displayData: read(i),
                            allowOverlay: true,
                        }),
                        onCellsEdited: edits => {
                            for (const e of edits) data.set(`${e.location[0]},${e.location[1]}`, (e.value as TextCell).data);
                            return true;
                        },
                        ...extra,
                    }),
            };
        };
        const key = (k: string, mod: object = { ctrlKey: true }) => {
            fireEvent.keyDown(screen.getByTestId("data-grid-canvas"), { key: k, ...mod });
            act(() => void vi.runAllTimers());
        };

        test("Ctrl+Z / Ctrl+Y / Cmd+Shift+Z undo and redo grid edits, and select what changed", () => {
            const s = store();
            const onGridSelectionChange = vi.fn();
            grid = new DataEditor(host, s.props());
            prep(false);
            const canvas = screen.getByTestId("data-grid-canvas");
            sendClick(canvas, pos(1, 2));
            key("Delete", {});
            sendClick(canvas, pos(0, 0));
            key("Backspace", {});
            expect([s.read([1, 2]), s.read([0, 0])]).toEqual(["", ""]);
            expect(grid.canUndo).toBe(true);

            key("z");
            expect(s.read([0, 0])).toBe("0,0");
            key("z");
            expect(s.read([1, 2])).toBe("1,2");
            expect(grid.canUndo).toBe(false);
            expect(grid.canRedo).toBe(true);

            grid.setProps({ onGridSelectionChange });
            grid.flush();
            key("y");
            expect(s.read([1, 2])).toBe("");
            expect(onGridSelectionChange).toHaveBeenLastCalledWith(
                expect.objectContaining({ current: expect.objectContaining({ cell: [1, 2] }) })
            );
            key("z", { metaKey: true, shiftKey: true });
            expect(s.read([0, 0])).toBe("");
        });

        test("a fill paste is one step", async () => {
            const s = store();
            Object.defineProperty(navigator, "clipboard", { value: { readText: async () => "Z" }, configurable: true });
            try {
                grid = new DataEditor(host, s.props({ fillSelectionOnPaste: true }));
                prep(false);
                const canvas = screen.getByTestId("data-grid-canvas");
                sendClick(canvas, pos(0, 0));
                sendClick(canvas, { ...pos(1, 2), shiftKey: true });
                canvas.focus();
                await act(async () => {
                    fireEvent.paste(window);
                    await vi.runAllTimersAsync();
                });
                expect(s.read([1, 2])).toBe("Z");
                key("z");
                expect([s.read([0, 0]), s.read([1, 1]), s.read([1, 2])]).toEqual(["0,0", "1,1", "1,2"]);
                expect(grid.canUndo).toBe(false);
            } finally {
                Reflect.deleteProperty(navigator, "clipboard");
            }
        });

        test("own steps and editCells share one history; clearHistory forgets it", () => {
            const s = store();
            grid = new DataEditor(host, s.props());
            prep(false);
            const log: string[] = [];
            grid.editCells([{ location: [0, 1], value: { kind: GridCellKind.Text, data: "a", displayData: "a", allowOverlay: true } }]);
            grid.addUndoStep({ undo: () => log.push("undo row"), redo: () => log.push("redo row") });
            expect(s.read([0, 1])).toBe("a");

            expect(grid.undo()).toBe(true);
            expect(log).toEqual(["undo row"]);
            expect(s.read([0, 1])).toBe("a");
            expect(grid.undo()).toBe(true);
            expect(s.read([0, 1])).toBe("0,1");
            expect(grid.undo()).toBe(false);

            grid.redo();
            grid.clearHistory();
            expect([grid.canUndo, grid.canRedo]).toEqual([false, false]);
        });

        test("validateCell also checks pastes and fills; a fully rejected paste is no undo step", async () => {
            const s = store();
            Object.defineProperty(navigator, "clipboard", { value: { readText: async () => "x1" }, configurable: true });
            try {
                // column 1 accepts digits only
                const validateCell = ([col]: Item, v: GridCell) => col !== 1 || /^\d*$/.test((v as TextCell).data);
                grid = new DataEditor(host, s.props({ fillSelectionOnPaste: true, validateCell, onPaste: true }));
                prep(false);
                const canvas = screen.getByTestId("data-grid-canvas");
                sendClick(canvas, pos(0, 0));
                sendClick(canvas, { ...pos(1, 1), shiftKey: true });
                canvas.focus();
                await act(async () => {
                    fireEvent.paste(window);
                    await vi.runAllTimersAsync();
                });
                expect([s.read([0, 0]), s.read([1, 0]), s.read([0, 1]), s.read([1, 1])]).toEqual(["x1", "1,0", "x1", "1,1"]);

                grid.clearHistory();
                sendClick(canvas, pos(1, 3));
                canvas.focus();
                await act(async () => {
                    fireEvent.paste(window);
                    await vi.runAllTimersAsync();
                });
                expect(s.read([1, 3])).toBe("1,3");
                expect(grid.canUndo).toBe(false);
            } finally {
                Reflect.deleteProperty(navigator, "clipboard");
            }
        });

        test("without the option Ctrl+Z does nothing", () => {
            const s = store();
            grid = new DataEditor(host, s.props({ undoRedo: undefined }));
            prep(false);
            const canvas = screen.getByTestId("data-grid-canvas");
            sendClick(canvas, pos(0, 0));
            key("Delete", {});
            key("z");
            expect(s.read([0, 0])).toBe("");
            grid.addUndoStep({ undo: () => {}, redo: () => {} });
            expect(grid.canUndo).toBe(false);
        });
    });

    describe("fillSelectionOnPaste", () => {
        let clipboard = "";
        beforeEach(() => {
            Object.defineProperty(navigator, "clipboard", {
                value: { readText: async () => clipboard },
                configurable: true,
            });
        });
        afterEach(() => {
            Reflect.deleteProperty(navigator, "clipboard");
        });

        const paste = async (text: string) => {
            clipboard = text;
            screen.getByTestId("data-grid-canvas").focus();
            await act(async () => {
                fireEvent.paste(window);
                await vi.runAllTimersAsync();
            });
        };
        const selection = (x: number, y: number, width: number, height: number): GridSelection => ({
            columns: CompactSelection.empty(),
            rows: CompactSelection.empty(),
            current: { cell: [x, y], range: { x, y, width, height }, rangeStack: [{ x: 1, y: 5, width: 1, height: 1 }] },
        });
        const locations = (spy: { mock: { calls: (readonly [readonly EditListItem[]])[] } }) =>
            spy.mock.calls.flatMap(c => c[0].map(e => e.location));

        test("writes one value into every selected cell, rangeStack included, skipping readonly cells", async () => {
            const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
            grid = new DataEditor(
                host,
                makeProps({
                    fillSelectionOnPaste: true,
                    onCellsEdited,
                    gridSelection: selection(0, 0, 2, 2),
                    getCellContent: ([col, row]: Item): GridCell => ({
                        kind: GridCellKind.Text,
                        data: "",
                        displayData: "",
                        allowOverlay: true,
                        readonly: col === 1 && row === 1,
                    }),
                })
            );
            prep(false);
            await paste("Z");
            expect(locations(onCellsEdited)).toEqual([[0, 0], [1, 0], [0, 1], [1, 5]]);
            expect(onCellsEdited.mock.calls[0][0][0].value).toMatchObject({ data: "Z" });
        });

        test("falls back to onCellEdited and tracks an uncontrolled selection", async () => {
            const onCellEdited = vi.fn();
            grid = new DataEditor(host, makeProps({ fillSelectionOnPaste: true, onCellEdited }));
            prep(false);
            const canvas = screen.getByTestId("data-grid-canvas");
            sendClick(canvas, pos(0, 0));
            sendClick(canvas, { ...pos(0, 2), shiftKey: true });
            await paste("Z");
            expect(onCellEdited.mock.calls.map(c => c[0])).toEqual([[0, 0], [0, 1], [0, 2]]);
        });

        test("larger pastes keep upstream behaviour", async () => {
            const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
            const onPaste = vi.fn(() => true);
            grid = new DataEditor(
                host,
                makeProps({ fillSelectionOnPaste: true, onCellsEdited, onPaste, gridSelection: selection(0, 0, 2, 2) })
            );
            prep(false);
            await paste("a	b");
            expect(onPaste).toHaveBeenCalledWith([0, 0], [["a", "b"]]);
            expect(locations(onCellsEdited)).toEqual([[0, 0], [1, 0]]);
        });

        test("a block that divides the selection evenly is repeated across it, otherwise pasted once", async () => {
            const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
            const range = (height: number): GridSelection => ({
                columns: CompactSelection.empty(),
                rows: CompactSelection.empty(),
                current: { cell: [0, 0], range: { x: 0, y: 0, width: 2, height }, rangeStack: [] },
            });
            grid = new DataEditor(
                host,
                makeProps({ fillSelectionOnPaste: true, onCellsEdited, gridSelection: range(4) })
            );
            prep(false);
            await paste("x\ny");
            const written = onCellsEdited.mock.calls[0][0].map(e => `${e.location.join(",")}=${(e.value as TextCell).data}`);
            expect(written).toEqual(["0,0=x", "1,0=x", "0,1=y", "1,1=y", "0,2=x", "1,2=x", "0,3=y", "1,3=y"]);

            onCellsEdited.mockClear();
            grid.setProps({ gridSelection: range(3) }); // 3 rows is not a whole number of 2-row copies
            grid.flush();
            await paste("x\ny");
            expect(locations(onCellsEdited)).toEqual([[0, 0], [0, 1]]);
        });

        test("without the option only the active cell changes (upstream)", async () => {
            const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
            grid = new DataEditor(host, makeProps({ onCellsEdited, onPaste: true, gridSelection: selection(0, 0, 2, 2) }));
            prep(false);
            await paste("Z");
            expect(locations(onCellsEdited)).toEqual([[0, 0]]);
        });
        test("ignores the empty last line that Excel and Sheets add to a copy", async () => {
            const onCellsEdited = vi.fn((_edits: readonly EditListItem[]) => true);
            grid = new DataEditor(host, makeProps({ fillSelectionOnPaste: true, onCellsEdited, gridSelection: selection(0, 0, 2, 2) }));
            prep(false);
            await paste("Z\r\n");
            expect(locations(onCellsEdited)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [1, 5]]);
        });
    });

    describe("rows", () => {
        let clipboard = "";
        beforeEach(() => {
            Object.defineProperty(navigator, "clipboard", { value: { readText: async () => clipboard }, configurable: true });
        });
        afterEach(() => {
            Reflect.deleteProperty(navigator, "clipboard");
            for (const m of document.querySelectorAll(".gdg-row-menu")) m.remove();
        });

        // rows of [A, B] text, kept in sync with the grid through the row handlers
        const table = (n: number) => {
            const data = Array.from({ length: n }, (_, r) => [`a${r}`, `b${r}`]);
            const onRowsInserted = vi.fn((at: number, count: number) => {
                data.splice(at, 0, ...Array.from({ length: count }, () => ["", ""]));
                grid?.setProps({ rows: data.length });
            });
            const onRowsRemoved = vi.fn((rows: readonly number[]): (() => void) | void => {
                for (const r of rows) data.splice(r, 1);
                grid?.setProps({ rows: data.length });
            });
            const props = (extra: Partial<DataEditorProps> = {}) =>
                makeProps({
                    rows: data.length,
                    undoRedo: true,
                    getCellContent: ([c, r]: Item): GridCell => {
                        const v = data[r]?.[c] ?? "";
                        return { kind: GridCellKind.Text, data: v, displayData: v, allowOverlay: true };
                    },
                    onCellsEdited: edits => {
                        for (const e of edits) (data[e.location[1]] ??= ["", ""])[e.location[0]] = (e.value as TextCell).data;
                        return true;
                    },
                    onRowsInserted,
                    onRowsRemoved,
                    ...extra,
                });
            return { data, props, onRowsInserted, onRowsRemoved };
        };
        const key = (k: string) => {
            fireEvent.keyDown(screen.getByTestId("data-grid-canvas"), { key: k, ctrlKey: true });
            act(() => void vi.runAllTimers());
        };
        const menu = (col: number, row: number) => {
            fireEvent.contextMenu(document.querySelector(".dvn-scroller")!, pos(col, row));
            return [...document.querySelectorAll(".gdg-row-menu button")].map(b => b.textContent);
        };
        const choose = (label: string) =>
            act(() => (document.querySelector(".gdg-row-menu") as HTMLElement).querySelectorAll("button").forEach(b => {
                if (b.textContent === label) b.click();
            }));

        test("row menu removes the selected rows and inserts rows; Ctrl+Z / Ctrl+Y undo and redo both", () => {
            const t = table(5);
            grid = new DataEditor(host, t.props({ rowContextMenu: { removeRows: "Hapus baris" } }));
            prep(false);
            const canvas = screen.getByTestId("data-grid-canvas");
            sendClick(canvas, pos(0, 1));
            sendClick(canvas, { ...pos(0, 2), shiftKey: true });

            expect(menu(1, 2)).toEqual(["Insert row above", "Insert row below", "Hapus baris"]);
            choose("Hapus baris");
            expect(document.querySelector(".gdg-row-menu")).toBeNull();
            expect(t.onRowsRemoved).toHaveBeenLastCalledWith([2, 1]);
            expect(t.data.map(r => r[0])).toEqual(["a0", "a3", "a4"]);

            key("z"); // no restore function: rows come back empty, then their cells are written back
            expect(t.data.map(r => r.join())).toEqual(["a0,b0", "a1,b1", "a2,b2", "a3,b3", "a4,b4"]);
            key("y");
            expect(t.data.map(r => r[0])).toEqual(["a0", "a3", "a4"]);

            menu(0, 0); // outside the selection: acts on the clicked row
            choose("Insert row below");
            expect(t.data.map(r => r[0])).toEqual(["a0", "", "a3", "a4"]);
            key("z");
            expect(t.data.map(r => r[0])).toEqual(["a0", "a3", "a4"]);
            key("z");
            key("z");
            expect(t.data.map(r => r[0])).toEqual(["a0", "a1", "a2", "a3", "a4"]);
        });

        test("undo uses the function onRowsRemoved returns; no menu without rowContextMenu", () => {
            const t = table(3);
            const restore = vi.fn();
            t.onRowsRemoved.mockImplementation(() => restore);
            grid = new DataEditor(host, t.props());
            prep(false);
            expect(menu(0, 0)).toEqual([]);
            grid.removeRows([0, 2, 0]);
            expect(t.onRowsRemoved).toHaveBeenCalledWith([2, 0]);
            key("z");
            expect(restore).toHaveBeenCalledTimes(1);
            expect(t.onRowsInserted).not.toHaveBeenCalled();
        });

        test("minSpareRows keeps empty rows at the end", async () => {
            const t = table(2);
            grid = new DataEditor(host, t.props({ minSpareRows: 1 }));
            prep(false);
            await act(async () => void (await Promise.resolve()));
            expect(t.onRowsInserted).toHaveBeenCalledWith(2, 1);
            grid.editCells([{ location: [1, 2], value: { kind: GridCellKind.Text, data: "x", displayData: "x", allowOverlay: true } }]);
            await act(async () => void (await Promise.resolve()));
            expect(t.onRowsInserted).toHaveBeenLastCalledWith(3, 1);
            expect(t.data.length).toBe(4);
            expect(t.onRowsInserted).toHaveBeenCalledTimes(2);
        });

        test("a paste past the last row adds rows, as one undo step", async () => {
            const t = table(3);
            grid = new DataEditor(host, t.props({ onPaste: true }));
            prep(false);
            sendClick(screen.getByTestId("data-grid-canvas"), pos(0, 2));
            clipboard = "x\t1\ny\t2\nz\t3\n";
            screen.getByTestId("data-grid-canvas").focus();
            await act(async () => {
                fireEvent.paste(window);
                await vi.runAllTimersAsync();
            });
            expect(t.onRowsInserted).toHaveBeenCalledWith(3, 2);
            expect(t.data.map(r => r.join())).toEqual(["a0,b0", "a1,b1", "x,1", "y,2", "z,3"]);
            key("z");
            expect(t.data.map(r => r.join())).toEqual(["a0,b0", "a1,b1", "a2,b2"]);
        });
        test("sortColumn shows rows sorted without moving data; edits go to data rows; one undo step", () => {
            const t = table(4);
            Object.assign(t.data[0], ["10", "x"]);
            Object.assign(t.data[1], ["", "empty"]);
            Object.assign(t.data[2], ["9", "y"]);
            Object.assign(t.data[3], ["-2", "z"]);
            grid = new DataEditor(host, t.props({ columnSort: true }));
            prep(false);
            const shown = () => [0, 1, 2, 3].map(r => (grid!.props.getCellContent([1, grid!.dataRow(r)]) as TextCell).data);

            grid.sortColumn(0, "asc");
            expect(shown()).toEqual(["z", "y", "x", "empty"]); // numbers by value, empty last
            expect(grid.sort).toEqual({ col: 0, direction: "asc" });
            expect(grid.viewRow(0)).toBe(2);

            grid.editCells([{ location: [1, 0], value: { kind: GridCellKind.Text, data: "Z", displayData: "Z", allowOverlay: true } }]);
            expect(t.data[3][1]).toBe("Z"); // shown row 0 is data row 3
            grid.sortColumn(0, "desc");
            expect(shown()).toEqual(["x", "y", "Z", "empty"]);

            key("z"); // back to ascending
            expect(grid.sort?.direction).toBe("asc");
            key("z"); // the edit, on the same data row
            expect(t.data[3][1]).toBe("z");
            key("z"); // unsorted
            expect(grid.sort).toBeUndefined();
            expect(t.data.map(r => r[1])).toEqual(["x", "empty", "y", "z"]);
        });

        test("row insert and remove while sorted use data rows and undo back to the same view", () => {
            const t = table(3);
            Object.assign(t.data[0], ["c", "0"]);
            Object.assign(t.data[1], ["a", "1"]);
            Object.assign(t.data[2], ["b", "2"]);
            grid = new DataEditor(host, t.props({ columnSort: true }));
            prep(false);
            grid.sortColumn(0); // shown: a, b, c = data 1, 2, 0
            grid.removeRows([0]);
            expect(t.onRowsRemoved).toHaveBeenLastCalledWith([1]);
            expect([0, 1].map(r => t.data[grid!.dataRow(r)][0])).toEqual(["b", "c"]);

            grid.insertRows(1); // shown between b and c, added at the end of the data
            expect(t.onRowsInserted).toHaveBeenLastCalledWith(2, 1);
            expect([0, 1, 2].map(r => t.data[grid!.dataRow(r)][0])).toEqual(["b", "", "c"]);

            key("z");
            key("z");
            expect(t.data.map(r => r[0])).toEqual(["c", "a", "b"]);
            expect([0, 1, 2].map(r => t.data[grid!.dataRow(r)][0])).toEqual(["a", "b", "c"]);
        });
    });
});
