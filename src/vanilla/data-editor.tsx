import * as React from "../runtime/react.js";
import { createRoot, flush, type Root } from "../runtime/react.js";
import { DataEditorAll, type DataEditorAllProps } from "../data-editor-all.js";
import type { DataEditorRef } from "../data-editor/data-editor.js";
import type { VanillaEditor } from "../internal/data-grid/data-grid-types.js";
import { toNode } from "./foreign-node.js";

/**
 * Props of the vanilla {@link DataEditor}. Identical to Glide Data Grid's `DataEditorProps`, except:
 * - `rightElement` is a DOM node instead of a React node,
 * - `portalElement` replaces `portalElementRef`,
 * - editors (`provideEditor`, `imageEditorOverride`, custom renderers) use the {@link VanillaEditor} contract.
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
}

const Enhanced: React.FunctionComponent<{
    readonly props: CoreDataEditorProps;
    readonly enhance?: (props: CoreDataEditorProps) => CoreDataEditorProps;
    readonly handle: { current: DataEditorRef | null };
}> = p => {
    const props = p.enhance === undefined ? p.props : p.enhance(p.props);
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
    private currentProps: DataEditorProps;
    private destroyed = false;

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
        this.root.unmount();
    }

    private render() {
        if (this.destroyed) throw new Error("DataEditor has been destroyed");
        const { rightElement, portalElement, enhance, ...rest } = this.currentProps;
        this.portalRef.current = portalElement ?? ensureDefaultPortal();
        this.root.render(
            <Enhanced
                props={{ ...rest, rightElement: toNode(rightElement), portalElementRef: this.portalRef }}
                enhance={enhance}
                handle={this.handle}
            />
        );
    }

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
