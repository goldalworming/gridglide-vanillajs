import * as React from "../../runtime/react.js";
import { marked } from "marked";

import { MarkdownContainer } from "./private/markdown-container.js";

/** @category Renderers */
export interface MarkdownDivProps {
    contents: string;
    createNode?: (content: string) => DocumentFragment;
}

/** Renders markdown into `target`, replacing its contents. */
export function renderMarkdownInto(
    target: HTMLElement,
    contents: string,
    createNode?: (content: string) => DocumentFragment
): void {
    const innerHTML: string = (marked as any)(contents);

    const childRange = document.createRange();
    childRange.selectNodeContents(target);
    childRange.deleteContents();

    let newChild: DocumentFragment | undefined = createNode?.(innerHTML);
    if (newChild === undefined) {
        const childDoc = document.createElement("template");
        childDoc.innerHTML = innerHTML;
        newChild = childDoc.content;
    }
    target.append(newChild);

    const tags = target.getElementsByTagName("a");
    for (const tag of tags) {
        tag.target = "_blank";
        tag.rel = "noreferrer noopener";
    }
}

/** @category Renderers */
const MarkdownDivImpl: React.FunctionComponent<MarkdownDivProps> = p => {
    const { contents, createNode } = p;
    const targetRef = React.useRef<HTMLDivElement | null>(null);

    React.useLayoutEffect(() => {
        if (targetRef.current === null) return;
        renderMarkdownInto(targetRef.current, contents, createNode);
    }, [contents, createNode]);

    return <MarkdownContainer ref={targetRef} />;
};

const MarkdownDiv = React.memo(MarkdownDivImpl);
export default MarkdownDiv;
