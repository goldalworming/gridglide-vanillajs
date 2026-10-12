import type * as React from "../../runtime/react.js";
import type { InnerGridCell, ProvideEditorProps, RuntimeEditor, VanillaEditor } from "./data-grid-types.js";

/** Marks a runtime component as an editor rendered in-tree rather than through the vanilla editor contract. */
export function markRuntimeEditor<P>(component: React.FunctionComponent<P>): RuntimeEditor<P> {
    return Object.assign(component, { __gdgRuntimeEditor: true as const });
}

/** {@link markRuntimeEditor} for cell editors, inferring the cell type from context. */
export function runtimeEditor<T extends InnerGridCell>(
    component: React.FunctionComponent<ProvideEditorProps<T>>
): RuntimeEditor<ProvideEditorProps<T>> {
    return markRuntimeEditor(component);
}

export function isRuntimeEditor<P>(
    editor: VanillaEditor<P> | RuntimeEditor<P> | undefined
): editor is RuntimeEditor<P> {
    return (editor as Partial<RuntimeEditor<P>> | undefined)?.__gdgRuntimeEditor === true;
}
