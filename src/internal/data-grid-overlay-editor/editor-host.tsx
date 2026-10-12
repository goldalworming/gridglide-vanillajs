import * as React from "../../runtime/react.js";
import type { EditorInstance, RuntimeEditor, VanillaEditor } from "../data-grid/data-grid-types.js";
import { isRuntimeEditor } from "../data-grid/runtime-editor.js";

interface VanillaEditorHostProps<P> {
    readonly editor: VanillaEditor<P>;
    readonly editorProps: P;
}

/**
 * Hosts a framework-agnostic editor: hands it a container on mount, forwards every re-render through
 * `update`, and calls `destroy` on unmount (or when the editor function itself changes).
 */
function VanillaEditorHost<P>(p: VanillaEditorHostProps<P>): React.ReactNode {
    const { editor, editorProps } = p;
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const instanceRef = React.useRef<EditorInstance<P> | undefined>(undefined);
    const propsRef = React.useRef(editorProps);
    propsRef.current = editorProps;

    React.useLayoutEffect(() => {
        const container = containerRef.current;
        if (container === null) return;
        const instance = editor(container, propsRef.current) ?? undefined;
        instanceRef.current = instance;
        return () => {
            instanceRef.current = undefined;
            instance?.destroy?.();
            container.replaceChildren();
        };
    }, [editor]);

    const mounted = React.useRef(false);
    React.useLayoutEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        instanceRef.current?.update?.(editorProps);
    });

    return <div ref={containerRef} className="gdg-vanilla-editor" style={{ display: "contents" }} />;
}

/** Renders either kind of editor with the given props. */
export function renderEditor<P extends object>(
    editor: VanillaEditor<P> | RuntimeEditor<P>,
    props: P
): React.ReactNode {
    if (isRuntimeEditor(editor)) {
        const Editor = editor as React.FunctionComponent<P>;
        return <Editor {...props} />;
    }
    return <VanillaEditorHost editor={editor} editorProps={props} />;
}
