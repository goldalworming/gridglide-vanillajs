/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal, dependency-free implementation of the subset of the React API used by the grid internals:
 * createElement/Fragment (classic JSX), function components, forwardRef, memo, context, portals and the
 * hooks useState/useRef/useMemo/useCallback/useEffect/useLayoutEffect/useImperativeHandle/useContext.
 *
 * It exists so the upstream Glide Data Grid sources can be ported nearly verbatim while shipping zero
 * framework dependencies. It is an internal detail: the public API is the vanilla `DataEditor` class.
 *
 * Semantics intentionally mirror React 18:
 * - state updates are batched and flushed in a microtask (i.e. before the next event listener runs),
 * - render is top-down, layout effects then passive effects run post-order (children first),
 * - all effect cleanups of a commit run before any effect setup of the same kind.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type Key = string | number;

export interface ReactElement<P = any> {
    readonly $$el: true;
    readonly type: any;
    readonly props: P;
    readonly key: Key | null;
    readonly ref: any;
}

export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;

export interface RefObject<T> {
    readonly current: T | null;
}
export interface MutableRefObject<T> {
    current: T;
}
export type RefCallback<T> = (instance: T | null) => void;
export type Ref<T> = RefCallback<T> | RefObject<T> | null;
export type ForwardedRef<T> = ((instance: T | null) => void) | MutableRefObject<T | null> | null;
export type LegacyRef<T> = Ref<T>;

export interface RefAttributes<T> {
    ref?: Ref<T> | ForwardedRef<T>;
    key?: Key | null;
}

export type PropsWithChildren<P = unknown> = P & { children?: ReactNode | undefined };

export interface FunctionComponent<P = {}> {
    (props: PropsWithChildren<P>): ReactNode;
    displayName?: string;
}
export type FC<P = {}> = FunctionComponent<P>;
export type VFC<P = {}> = FunctionComponent<P>;

export interface ExoticComponent<P = {}> {
    (props: P): ReactNode;
    readonly $$exotic: true;
    displayName?: string;
}
export type ForwardRefExoticComponent<P> = ExoticComponent<P>;
export type MemoExoticComponent<T> = ExoticComponent<ComponentProps<T>>;
export type NamedExoticComponent<P> = ExoticComponent<P>;

export type ComponentType<P = {}> = FunctionComponent<P> | ExoticComponent<P>;
export type ComponentProps<T> = T extends (props: infer P) => any ? P : never;
export type ForwardRefRenderFunction<T, P = {}> = (props: P, ref: ForwardedRef<T>) => ReactNode;

export type SetStateAction<S> = S | ((prevState: S) => S);
export type Dispatch<A> = (value: A) => void;
export type DependencyList = readonly unknown[];
export type EffectCallback = () => void | (() => void);

type CSSValue = string | number | undefined;
export type CSSProperties = { [K in keyof CSSStyleDeclaration]?: CSSValue } & { [custom: `--${string}`]: CSSValue } & {
    cursor?: string;
};

/**
 * Event handlers receive the native DOM event. `nativeEvent` points back at the event itself so code written
 * against React's synthetic events keeps working.
 */
type Synthetic<E extends Event, T> = E & {
    readonly nativeEvent: E;
    readonly currentTarget: T & EventTarget;
    persist(): void;
};
export type SyntheticEvent<T = Element, E extends Event = Event> = Synthetic<E, T>;
export type KeyboardEvent<T = Element> = Synthetic<globalThis.KeyboardEvent, T>;
export type MouseEvent<T = Element, E extends globalThis.MouseEvent = globalThis.MouseEvent> = Synthetic<E, T>;
export type PointerEvent<T = Element> = Synthetic<globalThis.PointerEvent, T>;
export type TouchEvent<T = Element> = Synthetic<globalThis.TouchEvent, T>;
export type FocusEvent<T = Element> = Synthetic<globalThis.FocusEvent, T> & { readonly target: T & EventTarget };
export type DragEvent<T = Element> = Synthetic<globalThis.DragEvent, T>;
export type ClipboardEvent<T = Element> = Synthetic<globalThis.ClipboardEvent, T>;
export type UIEvent<T = Element> = Synthetic<globalThis.UIEvent, T>;
export type WheelEvent<T = Element> = Synthetic<globalThis.WheelEvent, T>;
export type FormEvent<T = Element> = Synthetic<Event, T>;
export type ChangeEvent<T = Element> = Synthetic<Event, T> & { readonly target: T & EventTarget };

export type EventHandler<E> = (event: E) => void;
export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>;
export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>;
export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>;
export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>;

// Loosely typed DOM props: event handlers are typed so inline handlers get proper parameter types,
// everything else is structural.
export interface DOMAttributes<T = Element> {
    children?: ReactNode;
    dangerouslySetInnerHTML?: { __html: string };
    onClick?: MouseEventHandler<T>;
    onDoubleClick?: MouseEventHandler<T>;
    onContextMenu?: MouseEventHandler<T>;
    onMouseDown?: MouseEventHandler<T>;
    onMouseUp?: MouseEventHandler<T>;
    onMouseMove?: MouseEventHandler<T>;
    onMouseEnter?: MouseEventHandler<T>;
    onMouseLeave?: MouseEventHandler<T>;
    onMouseOver?: MouseEventHandler<T>;
    onMouseOut?: MouseEventHandler<T>;
    onPointerDown?: EventHandler<PointerEvent<T>>;
    onPointerUp?: EventHandler<PointerEvent<T>>;
    onPointerMove?: EventHandler<PointerEvent<T>>;
    onTouchStart?: EventHandler<TouchEvent<T>>;
    onTouchMove?: EventHandler<TouchEvent<T>>;
    onTouchEnd?: EventHandler<TouchEvent<T>>;
    onKeyDown?: KeyboardEventHandler<T>;
    onKeyDownCapture?: KeyboardEventHandler<T>;
    onKeyUp?: KeyboardEventHandler<T>;
    onKeyPress?: KeyboardEventHandler<T>;
    onFocus?: FocusEventHandler<T>;
    onFocusCapture?: FocusEventHandler<T>;
    onBlur?: FocusEventHandler<T>;
    onChange?: ChangeEventHandler<T>;
    onInput?: EventHandler<FormEvent<T>>;
    onScroll?: EventHandler<UIEvent<T>>;
    onWheel?: EventHandler<WheelEvent<T>>;
    onDragStart?: EventHandler<DragEvent<T>>;
    onDrag?: EventHandler<DragEvent<T>>;
    onDragEnd?: EventHandler<DragEvent<T>>;
    onDragOver?: EventHandler<DragEvent<T>>;
    onDragLeave?: EventHandler<DragEvent<T>>;
    onDrop?: EventHandler<DragEvent<T>>;
    onPaste?: EventHandler<ClipboardEvent<T>>;
    onCopy?: EventHandler<ClipboardEvent<T>>;
    onLoad?: EventHandler<SyntheticEvent<T>>;
    onError?: EventHandler<SyntheticEvent<T>>;
    [key: string]: any;
}
export interface HTMLAttributes<T = Element> extends DOMAttributes<T> {
    className?: string;
    style?: CSSProperties;
    id?: string;
    ref?: Ref<T> | ForwardedRef<T> | RefCallback<T>;
    key?: Key | null;
}
export type AllHTMLAttributes<T = Element> = HTMLAttributes<T>;
export type InputHTMLAttributes<T = Element> = HTMLAttributes<T>;
export type TextareaHTMLAttributes<T = Element> = HTMLAttributes<T>;
export type ImgHTMLAttributes<T = Element> = HTMLAttributes<T>;
export type DetailedHTMLProps<E, _T> = E;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
    export type Element = ReactElement<any>;
    export type ElementType = string | ((props: any) => ReactNode);
    export interface ElementAttributesProperty {
        props: {};
    }
    export interface ElementChildrenAttribute {
        children: {};
    }
    export interface IntrinsicAttributes {
        key?: Key | null;
    }
    export interface IntrinsicClassAttributes<T> {
        ref?: Ref<T>;
    }
    export interface IntrinsicElements {
        a: HTMLAttributes<HTMLAnchorElement>;
        button: HTMLAttributes<HTMLButtonElement>;
        canvas: HTMLAttributes<HTMLCanvasElement>;
        div: HTMLAttributes<HTMLDivElement>;
        img: HTMLAttributes<HTMLImageElement>;
        input: HTMLAttributes<HTMLInputElement>;
        label: HTMLAttributes<HTMLLabelElement>;
        select: HTMLAttributes<HTMLSelectElement>;
        option: HTMLAttributes<HTMLOptionElement>;
        span: HTMLAttributes<HTMLSpanElement>;
        table: HTMLAttributes<HTMLTableElement>;
        tbody: HTMLAttributes<HTMLTableSectionElement>;
        thead: HTMLAttributes<HTMLTableSectionElement>;
        tr: HTMLAttributes<HTMLTableRowElement>;
        td: HTMLAttributes<HTMLTableCellElement>;
        th: HTMLAttributes<HTMLTableCellElement>;
        textarea: HTMLAttributes<HTMLTextAreaElement>;
        svg: HTMLAttributes<SVGSVGElement>;
        [elemName: string]: HTMLAttributes<any>;
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------------------------------------------------

export const Fragment = ((props: { children?: ReactNode }) => props.children) as unknown as ExoticComponent<{
    children?: ReactNode;
}>;

const PORTAL = Symbol("portal");
const TEXT = Symbol("text");
const FORWARD_REF = Symbol("forwardRef");
const MEMO = Symbol("memo");
const PROVIDER = Symbol("provider");

export function createElement(type: any, config?: any, ...children: any[]): ReactElement {
    const props: any = {};
    let key: Key | null = null;
    let ref: any = null;
    if (config !== null && config !== undefined) {
        for (const k in config) {
            if (k === "key") key = config.key === undefined ? null : config.key;
            else if (k === "ref") ref = config.ref ?? null;
            else props[k] = config[k];
        }
    }
    if (children.length === 1) props.children = children[0];
    else if (children.length > 1) props.children = children;
    return { $$el: true, type, props, key, ref };
}

export function isValidElement(x: unknown): x is ReactElement {
    return typeof x === "object" && x !== null && (x as any).$$el === true;
}

export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactElement {
    return { $$el: true, type: PORTAL, props: { children, container }, key: null, ref: null };
}

export function forwardRef<T, P = {}>(
    render: ForwardRefRenderFunction<T, P>
): ForwardRefExoticComponent<PropsWithChildren<P> & RefAttributes<T>> {
    const c: any = (_props: any) => {
        throw new Error("forwardRef components can only be rendered through JSX");
    };
    c.$$kind = FORWARD_REF;
    c.render = render;
    return c;
}

export function memo<T extends (props: any) => any>(
    type: T,
    compare?: (prev: ComponentProps<T>, next: ComponentProps<T>) => boolean
): T & ExoticComponent<ComponentProps<T>> {
    const c: any = (_props: any) => {
        throw new Error("memo components can only be rendered through JSX");
    };
    c.$$kind = MEMO;
    c.inner = type;
    c.compare = compare ?? shallowEqual;
    return c;
}

export function createRef<T>(): RefObject<T> {
    return { current: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------------------------------

export interface Context<T> {
    Provider: ExoticComponent<{ value: T; children?: ReactNode }>;
    readonly _default: T;
}

export function createContext<T>(defaultValue: T): Context<T> {
    const Provider: any = (props: any) => props.children;
    Provider.$$kind = PROVIDER;
    const ctx: Context<T> = { Provider, _default: defaultValue };
    Provider.ctx = ctx;
    return ctx;
}

// ---------------------------------------------------------------------------------------------------------------------
// Fiber tree
// ---------------------------------------------------------------------------------------------------------------------

interface EffectHook {
    kind: "effect";
    deps: DependencyList | undefined;
    cleanup: (() => void) | void | undefined;
    pending: EffectCallback | undefined;
}

interface Fiber {
    type: any;
    props: any;
    ref: any;
    element: ReactElement | string | null;
    parent: Fiber | null;
    depth: number;
    /** Host node for elements/text, container for portals and roots. */
    dom: Node | null;
    /** Rendered child fibers, in order. */
    children: Fiber[];
    childMap: Map<string, Fiber>;
    hooks: any[];
    /** Effects scheduled by the current render, committed post-order. */
    stagedLayout: EffectHook[];
    stagedPassive: EffectHook[];
    dirty: boolean;
    mounted: boolean;
    isSvg: boolean;
    /** Subscribed context consumers (for providers). */
    consumers?: Set<Fiber>;
    contextDeps?: Set<Fiber>;
}

const ROOT = Symbol("root");

let currentFiber: Fiber | null = null;
let hookIndex = 0;
let renderPhaseUpdate = false;

const dirtyFibers = new Set<Fiber>();
let flushScheduled = false;
let flushing = false;
let layoutQueue: [Fiber, EffectHook][] = [];
let passiveQueue: [Fiber, EffectHook][] = [];
let refQueue: [any, any][] = [];
let focusQueue: HTMLElement[] = [];

function markDirty(fiber: Fiber) {
    fiber.dirty = true;
    dirtyFibers.add(fiber);
}

function scheduleUpdate(fiber: Fiber) {
    if (!fiber.mounted) return;
    if (fiber === currentFiber) {
        renderPhaseUpdate = true;
        return;
    }
    markDirty(fiber);
    if (!flushing && !flushScheduled) {
        flushScheduled = true;
        queueMicrotask(() => {
            flushScheduled = false;
            flush();
        });
    }
}

/** Synchronously renders and commits every pending update. Safe to call at any time. */
export function flush(): void {
    if (flushing) return;
    flushing = true;
    try {
        let guard = 0;
        while (dirtyFibers.size > 0 || layoutQueue.length > 0 || passiveQueue.length > 0 || refQueue.length > 0) {
            if (guard++ > 1000) throw new Error("Maximum update depth exceeded");
            const sorted = [...dirtyFibers].sort((a, b) => a.depth - b.depth);
            dirtyFibers.clear();
            for (const f of sorted) {
                if (f.dirty && f.mounted) {
                    renderComponent(f);
                    syncHostParent(f);
                }
            }
            commit();
        }
    } finally {
        flushing = false;
    }
}

export function flushSync<T>(fn: () => T): T {
    const r = fn();
    flush();
    return r;
}

function commit() {
    const refs = refQueue;
    refQueue = [];
    for (const [ref, value] of refs) setRef(ref, value);

    const focus = focusQueue;
    focusQueue = [];
    for (const el of focus) {
        if (el.isConnected) el.focus();
    }

    const layout = layoutQueue;
    layoutQueue = [];
    runEffects(layout);

    const passive = passiveQueue;
    passiveQueue = [];
    runEffects(passive);
}

function runEffects(queue: [Fiber, EffectHook][]) {
    for (const [fiber, hook] of queue) {
        if (!fiber.mounted) continue;
        const c = hook.cleanup;
        hook.cleanup = undefined;
        if (typeof c === "function") c();
    }
    for (const [fiber, hook] of queue) {
        if (!fiber.mounted) continue;
        const fn = hook.pending;
        hook.pending = undefined;
        if (fn !== undefined) hook.cleanup = fn();
    }
}

function setRef(ref: any, value: any) {
    if (ref === null || ref === undefined) return;
    if (typeof ref === "function") ref(value);
    else ref.current = value;
}

function makeFiber(type: any, props: any, ref: any, element: ReactElement | string | null, parent: Fiber | null) {
    const fiber: Fiber = {
        type,
        props,
        ref,
        element,
        parent,
        depth: parent === null ? 0 : parent.depth + 1,
        dom: null,
        children: [],
        childMap: new Map(),
        hooks: [],
        stagedLayout: [],
        stagedPassive: [],
        dirty: true,
        mounted: true,
        isSvg: type === "svg" || (parent?.isSvg === true && type !== "foreignObject"),
    };
    return fiber;
}

function newFiber(element: ReactElement | string, parent: Fiber): Fiber {
    if (typeof element === "string") return makeFiber(TEXT, element, null, element, parent);
    return makeFiber(element.type, element.props, element.ref, element, parent);
}

function kindOf(type: any): symbol | "host" | "function" {
    if (type === TEXT || type === PORTAL || type === ROOT) return type;
    if (typeof type === "string") return "host";
    return type.$$kind ?? "function";
}

/** Renders a fiber (component, host element, portal ...) and reconciles its children. */
function renderFiber(fiber: Fiber) {
    const kind = kindOf(fiber.type);
    if (kind === TEXT) {
        if (fiber.dom === null) fiber.dom = document.createTextNode(fiber.props);
        else if (fiber.dom.nodeValue !== fiber.props) fiber.dom.nodeValue = fiber.props;
        fiber.dirty = false;
        return;
    }
    if (kind === "host") {
        renderHost(fiber);
        return;
    }
    if (kind === PORTAL) {
        fiber.dom = fiber.props.container;
        reconcileChildren(fiber, fiber.props.children);
        placeChildren(fiber.dom as Element, collectHostNodes(fiber), true);
        fiber.dirty = false;
        return;
    }
    renderComponent(fiber);
}

function renderComponent(fiber: Fiber) {
    const kind = kindOf(fiber.type);
    let output: ReactNode;
    if (kind === ROOT) {
        output = fiber.props.children;
    } else if (kind === PROVIDER) {
        const isUpdate = fiber.hooks.length > 0;
        const prev = fiber.hooks[0];
        fiber.hooks[0] = fiber.props.value;
        if (isUpdate && fiber.consumers !== undefined && !Object.is(prev, fiber.props.value)) {
            for (const c of fiber.consumers) if (c.mounted) markDirty(c);
        }
        output = fiber.props.children;
    } else if (kind === MEMO) {
        output = createElement(fiber.type.inner, { ...fiber.props, ref: fiber.ref ?? undefined });
    } else {
        const prevFiber = currentFiber;
        const prevIndex = hookIndex;
        currentFiber = fiber;
        let guard = 0;
        try {
            do {
                if (guard++ > 50) throw new Error("Too many re-renders");
                renderPhaseUpdate = false;
                hookIndex = 0;
                fiber.stagedLayout.length = 0;
                fiber.stagedPassive.length = 0;
                output = kind === FORWARD_REF ? fiber.type.render(fiber.props, fiber.ref) : fiber.type(fiber.props);
            } while (renderPhaseUpdate);
        } finally {
            currentFiber = prevFiber;
            hookIndex = prevIndex;
        }
    }
    fiber.dirty = false;
    dirtyFibers.delete(fiber);
    reconcileChildren(fiber, output);
    // post-order: children's effects were queued during reconcileChildren, ours go after them
    for (const h of fiber.stagedLayout) layoutQueue.push([fiber, h]);
    for (const h of fiber.stagedPassive) passiveQueue.push([fiber, h]);
    fiber.stagedLayout.length = 0;
    fiber.stagedPassive.length = 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------------------------------

function slot(node: ReactNode, index: number): string {
    return isValidElement(node) && node.key !== null ? "k" + node.key : "i" + index;
}

function flattenChildren(node: ReactNode, path: string, out: [string, ReactElement | string][]) {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
        out.push([path + "#t", String(node)]);
        return;
    }
    if (isValidElement(node)) {
        out.push([path, node]);
        return;
    }
    if (typeof (node as any)[Symbol.iterator] === "function") {
        // Like React, identity is the slot index (holes included) or the explicit key, scoped to this array.
        let i = 0;
        for (const c of node as Iterable<ReactNode>) {
            flattenChildren(c, path + "/" + slot(c, i), out);
            i++;
        }
        return;
    }
    throw new Error("Objects are not valid as a child: " + String(node));
}

function flattenOutput(output: ReactNode): [string, ReactElement | string][] {
    const items: [string, ReactElement | string][] = [];
    flattenChildren(output, slot(output, 0), items);
    return items;
}

function sameType(f: Fiber, el: ReactElement | string): boolean {
    if (typeof el === "string") return f.type === TEXT;
    if (f.type !== el.type) return false;
    if (el.type === PORTAL) return f.props.container === el.props.container;
    return true;
}

function reconcileChildren(fiber: Fiber, output: ReactNode) {
    const items = flattenOutput(output);
    const oldMap = fiber.childMap;
    const newMap = new Map<string, Fiber>();
    const newChildren: Fiber[] = [];
    for (const [key, el] of items) {
        let child = oldMap.get(key);
        if (child !== undefined && sameType(child, el)) {
            oldMap.delete(key);
            updateFiber(child, el);
        } else {
            child = newFiber(el, fiber);
            renderFiber(child);
        }
        newMap.set(key, child);
        newChildren.push(child);
    }
    for (const old of oldMap.values()) unmountFiber(old, true);
    fiber.childMap = newMap;
    fiber.children = newChildren;
}

function updateFiber(fiber: Fiber, el: ReactElement | string) {
    if (fiber.element === el && !fiber.dirty) return; // same element identity: bail out like React
    fiber.element = el;
    if (typeof el === "string") {
        fiber.props = el;
        renderFiber(fiber);
        return;
    }
    const oldProps = fiber.props;
    const oldRef = fiber.ref;
    fiber.props = el.props;
    fiber.ref = el.ref;
    const kind = kindOf(fiber.type);
    if (kind === MEMO && oldRef === el.ref && fiber.type.compare(oldProps, el.props) === true) {
        return;
    }
    renderFiber(fiber);
    if (kind === "host") {
        applyProps(fiber.dom as HTMLElement, oldProps, fiber.props, fiber.isSvg);
        if (oldRef !== el.ref) {
            setRef(oldRef, null);
            refQueue.push([el.ref, fiber.dom]);
        }
    }
}

function renderHost(fiber: Fiber) {
    let mounting = false;
    if (fiber.dom === null) {
        mounting = true;
        fiber.dom = fiber.isSvg
            ? document.createElementNS("http://www.w3.org/2000/svg", fiber.type)
            : document.createElement(fiber.type);
    }
    const el = fiber.dom as HTMLElement;
    if (fiber.props.dangerouslySetInnerHTML === undefined) {
        reconcileChildren(fiber, fiber.props.children);
        placeChildren(el, collectHostNodes(fiber), false);
    } else if (fiber.children.length > 0) {
        for (const c of fiber.children) unmountFiber(c, true);
        fiber.children = [];
        fiber.childMap = new Map();
    }
    if (mounting) {
        applyProps(el, {}, fiber.props, fiber.isSvg);
        if (fiber.ref !== null) refQueue.push([fiber.ref, el]);
        if (fiber.props.autoFocus === true) focusQueue.push(el);
    }
    fiber.dirty = false;
}

/** Top-level DOM nodes rendered by a fiber's children (descending through components, not into hosts/portals). */
function collectHostNodes(fiber: Fiber, out: Node[] = []): Node[] {
    for (const c of fiber.children) {
        if (c.type === PORTAL) continue;
        if (c.type === TEXT || typeof c.type === "string") out.push(c.dom as Node);
        else collectHostNodes(c, out);
    }
    return out;
}

/**
 * Puts `nodes` into `parent` in order. In append mode (roots and portals, whose container may hold foreign
 * content) the managed nodes are kept together at the end, otherwise they are kept at the start.
 */
function placeChildren(parent: Node, nodes: Node[], append: boolean) {
    let prev: Node | null = null;
    for (const n of nodes) {
        if (prev === null) {
            if (append) {
                if (n.parentNode !== parent) parent.appendChild(n);
            } else if (parent.firstChild !== n) {
                parent.insertBefore(n, parent.firstChild);
            }
        } else if (prev.nextSibling !== n) {
            parent.insertBefore(n, prev.nextSibling);
        }
        prev = n;
    }
}

/** After a component re-renders on its own, its nearest host ancestor must re-place its DOM children. */
function syncHostParent(fiber: Fiber) {
    let p: Fiber | null = fiber;
    while (p !== null) {
        if (typeof p.type === "string") {
            placeChildren(p.dom as Node, collectHostNodes(p), false);
            return;
        }
        if (p.type === PORTAL || p.type === ROOT) {
            placeChildren(p.dom as Node, collectHostNodes(p), true);
            return;
        }
        p = p.parent;
    }
}

function unmountFiber(fiber: Fiber, removeDom: boolean) {
    fiber.mounted = false;
    dirtyFibers.delete(fiber);
    // A removed host element takes its descendants with it; portals must clean up their own container.
    const childRemove = fiber.type === PORTAL || fiber.type === ROOT ? true : removeDom && fiber.dom === null;
    for (const c of fiber.children) unmountFiber(c, childRemove);
    for (const h of fiber.hooks) {
        if (h !== null && typeof h === "object" && h.kind === "effect" && typeof h.cleanup === "function") {
            const c = h.cleanup;
            h.cleanup = undefined;
            c();
        }
    }
    if (fiber.contextDeps !== undefined) {
        for (const p of fiber.contextDeps) p.consumers?.delete(fiber);
    }
    if (typeof fiber.type === "string" && fiber.ref !== null) setRef(fiber.ref, null);
    if (removeDom && fiber.dom !== null && fiber.type !== PORTAL && fiber.type !== ROOT) {
        fiber.dom.parentNode?.removeChild(fiber.dom);
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// DOM props
// ---------------------------------------------------------------------------------------------------------------------

const UNITLESS = new Set([
    "animationIterationCount",
    "aspectRatio",
    "flex",
    "flexGrow",
    "flexShrink",
    "fontWeight",
    "gridColumn",
    "gridRow",
    "lineClamp",
    "lineHeight",
    "opacity",
    "order",
    "orphans",
    "tabSize",
    "widows",
    "zIndex",
    "zoom",
    "fillOpacity",
    "strokeOpacity",
    "strokeWidth",
]);

function setStyleProp(style: CSSStyleDeclaration, key: string, value: any) {
    if (key.startsWith("--")) {
        if (value === null || value === undefined || value === "") style.removeProperty(key);
        else style.setProperty(key, String(value));
        return;
    }
    const v =
        value === null || value === undefined || typeof value === "boolean"
            ? ""
            : typeof value === "number" && value !== 0 && !UNITLESS.has(key)
            ? value + "px"
            : String(value);
    (style as any)[key] = v;
}

const EVENT_ALIASES: Record<string, string[]> = {
    doubleclick: ["dblclick"],
    // React's onChange fires on every edit. Listen to both and de-duplicate on the value.
    change: ["input", "change"],
    focus: ["focusin"],
    blur: ["focusout"],
};

interface ListenerEntry {
    handler: any;
    listener: (e: Event) => void;
    names: string[];
    capture: boolean;
}

function eventNames(prop: string): [string[], boolean] {
    let name = prop.slice(2);
    let capture = false;
    if (name.endsWith("Capture")) {
        capture = true;
        name = name.slice(0, -7);
    }
    name = name.toLowerCase();
    return [EVENT_ALIASES[name] ?? [name], capture];
}

function controlValue(el: any): unknown {
    return el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
}

function setEvent(el: Element, prop: string, handler: any) {
    const store: Record<string, ListenerEntry> = ((el as any).__gdgListeners ??= {});
    const existing = store[prop];
    if (typeof handler === "function") {
        if (existing !== undefined) {
            existing.handler = handler;
            return;
        }
        const isChange = prop === "onChange";
        const [names, capture] = eventNames(prop);
        const entry: ListenerEntry = {
            handler,
            names,
            capture,
            listener: (e: Event) => {
                if (isChange) {
                    const v = controlValue(el);
                    if (e.type === "change" && (el as any).__gdgLastValue === v) return;
                    (el as any).__gdgLastValue = v;
                }
                if (!("nativeEvent" in e)) {
                    Object.defineProperty(e, "nativeEvent", { value: e, configurable: true });
                    Object.defineProperty(e, "persist", { value: noop, configurable: true });
                }
                entry.handler(e);
            },
        };
        store[prop] = entry;
        for (const n of names) el.addEventListener(n, entry.listener, capture);
    } else if (existing !== undefined) {
        for (const n of existing.names) el.removeEventListener(n, existing.listener, existing.capture);
        delete store[prop];
    }
}

function noop() {
    // nothing
}

// boolean-ish attributes that must be written as "true"/"false"
const ENUMERATED = new Set(["spellCheck", "draggable", "contentEditable", "autoCorrect", "autoCapitalize"]);

const ATTR_ALIASES: Record<string, string> = {
    className: "class",
    htmlFor: "for",
};

function setProp(el: HTMLElement, key: string, prev: any, value: any, isSvg: boolean) {
    if (key === "children" || key === "key" || key === "ref") return;
    if (key === "style") {
        const style = el.style;
        if (typeof value === "string") {
            style.cssText = value;
            return;
        }
        if (typeof prev === "string") style.cssText = "";
        const p = typeof prev === "object" && prev !== null ? prev : {};
        const n = typeof value === "object" && value !== null ? value : {};
        for (const k in p) if (!(k in n)) setStyleProp(style, k, "");
        for (const k in n) if (p[k] !== n[k]) setStyleProp(style, k, n[k]);
        return;
    }
    if (key === "dangerouslySetInnerHTML") {
        const html = value?.__html ?? "";
        if (prev?.__html !== html) el.innerHTML = html;
        return;
    }
    if (key[0] === "o" && key[1] === "n" && key.length > 2 && key[2] === key[2].toUpperCase()) {
        setEvent(el, key, value);
        return;
    }
    if (key === "autoFocus" || key === "defaultValue" || key === "defaultChecked") {
        if (prev === undefined && value !== undefined) {
            if (key === "defaultValue") (el as any).value = value;
            else if (key === "defaultChecked") (el as any).checked = value;
        }
        return;
    }
    if (key === "value" || key === "checked" || key === "selected" || key === "indeterminate") {
        const v = key === "value" ? (value === null || value === undefined ? "" : String(value)) : value === true;
        if ((el as any)[key] !== v) (el as any)[key] = v;
        if (key !== "selected" && key !== "indeterminate") (el as any).__gdgLastValue = controlValue(el);
        return;
    }
    const attr = ATTR_ALIASES[key] ?? key;
    if (typeof value === "boolean" && ENUMERATED.has(key)) {
        el.setAttribute(key.toLowerCase(), String(value));
        return;
    }
    if (
        !isSvg &&
        attr !== "class" &&
        attr !== "for" &&
        attr !== "list" &&
        attr !== "form" &&
        attr !== "role" &&
        attr !== "width" &&
        attr !== "height" &&
        !attr.includes("-") &&
        key in el
    ) {
        try {
            (el as any)[key] = value ?? (typeof (el as any)[key] === "string" ? "" : null);
            if (value === null || value === undefined || value === false) el.removeAttribute(attr);
            return;
        } catch {
            // fall through to attribute
        }
    }
    if (value === null || value === undefined || (value === false && !attr.startsWith("aria-") && !attr.startsWith("data-"))) {
        el.removeAttribute(attr);
    } else {
        el.setAttribute(attr, value === true && !attr.startsWith("aria-") && !attr.startsWith("data-") ? "" : value);
    }
}

function applyProps(el: HTMLElement, prev: any, next: any, isSvg: boolean) {
    for (const k in prev) {
        if (!(k in next)) setProp(el, k, prev[k], undefined, isSvg);
    }
    for (const k in next) {
        const v = next[k];
        if (k === "value" || k === "checked" || prev[k] !== v) setProp(el, k, prev[k], v, isSvg);
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------------------------------

function getHook<T>(init: () => T): [T, boolean] {
    const fiber = currentFiber;
    if (fiber === null) throw new Error("Hooks can only be called inside the body of a function component");
    const i = hookIndex++;
    if (i >= fiber.hooks.length) {
        const h = init();
        fiber.hooks.push(h);
        return [h, true];
    }
    return [fiber.hooks[i], false];
}

function depsChanged(a: DependencyList | undefined, b: DependencyList | undefined): boolean {
    if (a === undefined || b === undefined) return true;
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return true;
    return false;
}

export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
export function useState<S>(initial?: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
    const fiber = currentFiber as Fiber;
    const [hook] = getHook(() => {
        const h: { kind: "state"; value: S; set: Dispatch<SetStateAction<S>> } = {
            kind: "state",
            value: typeof initial === "function" ? (initial as () => S)() : (initial as S),
            set: action => {
                const next = typeof action === "function" ? (action as (p: S) => S)(h.value) : action;
                if (Object.is(next, h.value)) return;
                h.value = next;
                scheduleUpdate(fiber);
            },
        };
        return h;
    });
    return [hook.value, hook.set];
}

export function useReducer<S, A>(reducer: (s: S, a: A) => S, initial: S): [S, Dispatch<A>] {
    const [state, setState] = useState(initial);
    const dispatch = useCallback((a: A) => setState(s => reducer(s, a)), [reducer]);
    return [state, dispatch];
}

export function useRef<T>(initial: T): MutableRefObject<T>;
export function useRef<T>(initial: T | null): RefObject<T>;
export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
export function useRef<T>(initial?: T): MutableRefObject<T | undefined> {
    return getHook(() => ({ current: initial }))[0];
}

export function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T {
    const [hook, isNew] = getHook(() => ({ kind: "memo", value: undefined as T, deps: undefined as any }));
    if (isNew || depsChanged(hook.deps, deps)) {
        hook.value = factory();
        hook.deps = deps;
    }
    return hook.value;
}

export function useCallback<T extends Function>(fn: T, deps: DependencyList): T {
    return useMemo(() => fn, deps);
}

function effectHook(fn: EffectCallback, deps: DependencyList | undefined, layout: boolean) {
    const fiber = currentFiber as Fiber;
    const [hook, isNew] = getHook<EffectHook>(() => ({
        kind: "effect",
        deps: undefined,
        cleanup: undefined,
        pending: undefined,
    }));
    if (isNew || depsChanged(hook.deps, deps)) {
        hook.deps = deps;
        hook.pending = fn;
        (layout ? fiber.stagedLayout : fiber.stagedPassive).push(hook);
    }
}

export function useEffect(fn: EffectCallback, deps?: DependencyList): void {
    effectHook(fn, deps, false);
}

export function useLayoutEffect(fn: EffectCallback, deps?: DependencyList): void {
    effectHook(fn, deps, true);
}

export function useImperativeHandle<T, R extends T>(
    ref: Ref<T> | ForwardedRef<T> | undefined,
    create: () => R,
    deps?: DependencyList
): void {
    useLayoutEffect(
        () => {
            if (ref === null || ref === undefined) return;
            setRef(ref, create());
            return () => setRef(ref, null);
        },
        deps === undefined ? undefined : [ref, ...deps]
    );
}

export function useContext<T>(ctx: Context<T>): T {
    const fiber = currentFiber as Fiber;
    let p = fiber.parent;
    while (p !== null) {
        if (p.type === ctx.Provider) {
            (p.consumers ??= new Set()).add(fiber);
            (fiber.contextDeps ??= new Set()).add(p);
            return p.props.value;
        }
        p = p.parent;
    }
    return ctx._default;
}

let idCounter = 0;
export function useId(): string {
    return useMemo(() => ":gdg" + (idCounter++).toString(36) + ":", []);
}

export function useDebugValue(_value: unknown): void {
    // no-op
}

export const Children = {
    toArray(children: ReactNode): (ReactElement | string)[] {
        return flattenOutput(children).map(x => x[1]);
    },
};

// ---------------------------------------------------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------------------------------------------------

export interface Root {
    /**
     * Renders `element` into the root's container. The first render is synchronous; later renders are batched
     * with any other pending update and flushed in a microtask (call `flush()` to force them).
     */
    render(element: ReactNode): void;
    unmount(): void;
}

export function createRoot(container: Element | DocumentFragment): Root {
    const root = makeFiber(ROOT, { children: null }, null, null, null);
    root.dom = container;
    root.dirty = false;
    let first = true;
    return {
        render(element) {
            if (!root.mounted) return;
            root.props = { children: element };
            if (first) {
                first = false;
                markDirty(root);
                flush();
            } else {
                scheduleUpdate(root);
            }
        },
        unmount() {
            if (!root.mounted) return;
            flush();
            unmountFiber(root, true);
            root.children = [];
            root.childMap = new Map();
        },
    };
}

export function shallowEqual(a: any, b: any): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) return false;
    }
    return true;
}

const React = {
    createElement,
    Fragment,
    forwardRef,
    memo,
    createContext,
    createRef,
    createPortal,
    isValidElement,
    useState,
    useReducer,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useImperativeHandle,
    useContext,
    useId,
    useDebugValue,
    Children,
};
export default React;
