/** Stand-in for @testing-library/react-hooks running on the grid's internal runtime. */
import { createElement, createRoot, flush, type ReactNode, type Root } from "../../src/runtime/react.js";
import { act } from "./testing-library-react.js";

const roots = new Set<Root>();

interface Options<P> {
    initialProps?: P;
    wrapper?: (props: { children?: ReactNode }) => ReactNode;
}

export function renderHook<P, R>(callback: (props: P) => R, options: Options<P> = {}) {
    const all: R[] = [];
    const result = {
        get current(): R {
            return all[all.length - 1];
        },
        get all(): R[] {
            return all;
        },
        error: undefined as Error | undefined,
    };
    const Harness = (p: { hookProps: P }) => {
        try {
            all.push(callback(p.hookProps));
        } catch (e) {
            result.error = e as Error;
        }
        return null;
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.add(root);
    const renderWith = (props: P) => {
        const el = createElement(Harness, { hookProps: props });
        root.render(options.wrapper === undefined ? el : createElement(options.wrapper, null, el));
        flush();
    };
    let lastProps = options.initialProps as P;
    act(() => renderWith(lastProps));
    return {
        result,
        rerender: (props?: P) => {
            if (props !== undefined) lastProps = props;
            act(() => renderWith(lastProps));
        },
        unmount: () => {
            act(() => root.unmount());
            roots.delete(root);
        },
    };
}

export function cleanup() {
    for (const r of roots) r.unmount();
    roots.clear();
}

export { act };
