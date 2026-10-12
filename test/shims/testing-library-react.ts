/**
 * Stand-in for @testing-library/react that drives the grid's internal runtime instead of React, so the upstream
 * test suite can run unchanged against the port.
 */
import { configure, fireEvent as domFireEvent, getQueriesForElement, prettyDOM } from "@testing-library/dom";
import { createElement, createRoot, flush, type ReactNode, type Root } from "../../src/runtime/react.js";

export function act<T>(cb: () => T): T extends Promise<any> ? Promise<void> : void {
    const r = cb();
    if (r instanceof Promise) {
        return r.then(() => {
            flush();
        }) as any;
    }
    flush();
    return undefined as any;
}

configure({
    eventWrapper: cb => {
        let result: unknown;
        act(() => {
            result = cb();
        });
        return result;
    },
    asyncWrapper: async cb => {
        const r = await cb();
        flush();
        return r;
    },
});

type FireEvent = typeof domFireEvent;
// like @testing-library/react: focus/blur also dispatch focusin/focusout, mouseEnter/Leave dispatch over/out
const fireEvent: FireEvent = ((...args: Parameters<FireEvent>) => domFireEvent(...args)) as FireEvent;
Object.assign(fireEvent, domFireEvent);
fireEvent.focus = (el, init) => {
    domFireEvent.focusIn(el, init);
    return domFireEvent.focus(el, init);
};
fireEvent.blur = (el, init) => {
    domFireEvent.focusOut(el, init);
    return domFireEvent.blur(el, init);
};
fireEvent.mouseEnter = (el, init) => {
    domFireEvent.mouseOver(el, init);
    return domFireEvent.mouseEnter(el, init);
};
fireEvent.mouseLeave = (el, init) => {
    domFireEvent.mouseOut(el, init);
    return domFireEvent.mouseLeave(el, init);
};

const mounted = new Set<{ root: Root; container: HTMLElement }>();

interface RenderOptions {
    container?: HTMLElement;
    baseElement?: HTMLElement;
    wrapper?: (props: { children?: ReactNode }) => ReactNode;
}

export function render(ui: ReactNode, options: RenderOptions = {}) {
    const baseElement = options.baseElement ?? document.body;
    const container = options.container ?? baseElement.appendChild(document.createElement("div"));
    const root = createRoot(container);
    const wrap = (node: ReactNode) =>
        options.wrapper === undefined ? node : createElement(options.wrapper, null, node);
    act(() => root.render(wrap(ui)));
    const entry = { root, container };
    mounted.add(entry);
    return {
        container,
        baseElement,
        debug: (el: Element = baseElement) => {
            // eslint-disable-next-line no-console
            console.log(prettyDOM(el));
        },
        rerender: (next: ReactNode) => act(() => root.render(wrap(next))),
        unmount: () => act(() => root.unmount()),
        asFragment: () => {
            const t = document.createElement("template");
            t.innerHTML = container.innerHTML;
            return t.content;
        },
        ...getQueriesForElement(baseElement),
    };
}

export function cleanup() {
    for (const { root, container } of mounted) {
        act(() => root.unmount());
        container.remove();
    }
    mounted.clear();
}

export * from "@testing-library/dom";
export { fireEvent };
