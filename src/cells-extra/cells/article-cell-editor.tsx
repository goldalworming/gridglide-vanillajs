import type { ProvideEditorProps } from "../../component-api.js";
import * as React from "../../runtime/react.js";
import { styled } from "../../runtime/styled.js";
import type { ArticleCell } from "./article-cell-types.js";
import type ToastEditor from "@toast-ui/editor";

const Wrapper = styled.div`
    .gdg-footer {
        display: flex;
        justify-content: flex-end;
        padding: 20px;

        button {
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: 500;
            font-family: var(--gdg-font-family);
            cursor: pointer;
            border-radius: var(--gdg-rounding-radius, 9px);
        }
    }
    .gdg-save-button {
        background-color: var(--gdg-accent-color);
        color: var(--gdg-accent-fg);
    }

    .gdg-close-button {
        background-color: var(--gdg-bg-header);
        color: var(--gdg-text-medium);
        margin-right: 8px;
    }
`;

interface ToastProps {
    readonly viewer: boolean;
    readonly initialValue: string;
    readonly onChange?: (markdown: string) => void;
}

/**
 * Mounts Toast UI Editor (the vanilla package that @toast-ui/react-editor wraps). It is loaded on demand, like
 * upstream's lazy editor; remember to include `@toast-ui/editor/dist/toastui-editor.css`.
 */
const Toast: React.FunctionComponent<ToastProps> = p => {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const propsRef = React.useRef(p);
    propsRef.current = p;

    React.useLayoutEffect(() => {
        let instance: ToastEditor | ReturnType<typeof ToastEditor.factory> | undefined;
        let cancelled = false;
        void import("@toast-ui/editor").then(mod => {
            const el = ref.current;
            if (cancelled || el === null) return;
            const Editor = mod.default;
            const { viewer, initialValue } = propsRef.current;
            if (viewer) {
                instance = Editor.factory({ el, viewer: true, initialValue, usageStatistics: false });
                return;
            }
            const editor = new Editor({
                el,
                initialEditType: "wysiwyg",
                autofocus: true,
                initialValue,
                hideModeSwitch: true,
                height: "75vh",
                usageStatistics: false,
                toolbarItems: [
                    ["heading", "bold", "italic", "strike"],
                    ["hr", "quote"],
                    ["ul", "ol", "task", "indent", "outdent"],
                    ["table", "link"],
                    ["code", "codeblock"],
                ],
                events: {
                    change: () => propsRef.current.onChange?.(editor.getMarkdown()),
                },
            });
            instance = editor;
        });
        return () => {
            cancelled = true;
            instance?.destroy();
        };
    }, []);

    return <div ref={ref} />;
};

const ArticleCellEditor: React.FunctionComponent<ProvideEditorProps<ArticleCell>> = p => {
    const [tempValue, setTempValue] = React.useState(p.value.data.markdown);

    const onKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation();
    }, []);

    const onSave = React.useCallback(() => {
        p.onFinishedEditing({
            ...p.value,
            data: {
                ...p.value.data,
                markdown: tempValue,
            },
        });
    }, [p, tempValue]);

    const onClose = React.useCallback(() => {
        p.onFinishedEditing(undefined);
    }, [p]);

    if (p.value.readonly) {
        return (
            <Wrapper id="gdg-markdown-readonly" onKeyDown={onKeyDown} style={{ height: "75vh", padding: "35px" }}>
                <Toast viewer={true} initialValue={p.value.data.markdown} />
            </Wrapper>
        );
    }

    return (
        <Wrapper id="gdg-markdown-wysiwyg" onKeyDown={onKeyDown}>
            <Toast viewer={false} initialValue={p.value.data.markdown} onChange={setTempValue} />
            <div className="gdg-footer">
                <button className="gdg-close-button" onClick={onClose}>
                    Close
                </button>
                <button className="gdg-save-button" onClick={onSave}>
                    Save
                </button>
            </div>
        </Wrapper>
    );
};

export default ArticleCellEditor;
