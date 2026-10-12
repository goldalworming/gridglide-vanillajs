import * as React from "../runtime/react.js";

/** Places an externally owned DOM node inside the runtime tree. */
export const ForeignNode: React.FunctionComponent<{ readonly node: Node }> = p => {
    const { node } = p;
    const ref = React.useRef<HTMLDivElement | null>(null);
    React.useLayoutEffect(() => {
        const host = ref.current;
        if (host === null) return;
        host.appendChild(node);
        return () => {
            if (node.parentNode === host) host.removeChild(node);
        };
    }, [node]);
    return <div ref={ref} style={{ display: "contents" }} />;
};

/** Converts a vanilla DOM node into something the runtime can render; other values pass through. */
export function toNode(x: Node | undefined): React.ReactNode {
    return x === undefined ? undefined : <ForeignNode node={x} />;
}
