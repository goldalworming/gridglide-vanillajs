import * as React from "../../runtime/react.js";

import { styled } from "../../runtime/styled.js";

import {
    type CustomCell,
    type CustomRenderer,
    getMiddleCenterBias,
    GridCellKind,
    TextCellEntry,
} from "../../component-api.js";
import { runtimeEditor } from "../../internal/data-grid/runtime-editor.js";
import { Select, type SelectOption } from "../select.js";

type DropdownOption = string | { value: string; label: string } | undefined | null;

interface DropdownCellProps {
    readonly kind: "dropdown-cell";
    readonly value: string | undefined | null;
    readonly allowedValues: readonly DropdownOption[];
}

export type DropdownCell = CustomCell<DropdownCellProps>;

const Wrap = styled.div`
    display: flex;
    flex-direction: column;
    align-items: stretch;

    .glide-select {
        font-family: var(--gdg-font-family);
        font-size: var(--gdg-editor-font-size);
    }
`;

// This is required since the padding is disabled for this cell type
// The settings are based on the "pad" settings in the data-grid-overlay-editor-style.tsx
const ReadOnlyWrap = styled.div`
    display: "flex";
    margin: auto 8.5px;
    padding-bottom: 3px;
`;

const Editor = runtimeEditor<DropdownCell>(p => {
    const { value: cell, onFinishedEditing, initialValue, portalElementRef } = p;
    const { allowedValues, value: valueIn } = cell.data;

    const [value, setValue] = React.useState(valueIn);
    const [inputValue, setInputValue] = React.useState(initialValue ?? "");

    const values = React.useMemo((): SelectOption[] => {
        return allowedValues.map(option => {
            if (typeof option === "string" || option === null || option === undefined) {
                return { value: option as string, label: option?.toString() ?? "" };
            }
            return option;
        });
    }, [allowedValues]);

    if (cell.readonly) {
        return (
            <ReadOnlyWrap>
                <TextCellEntry
                    highlight={true}
                    autoFocus={false}
                    disabled={true}
                    value={value ?? ""}
                    onChange={() => undefined}
                />
            </ReadOnlyWrap>
        );
    }

    return (
        <Wrap>
            <Select
                className="glide-select"
                isMulti={false}
                inputValue={inputValue}
                onInputChange={setInputValue}
                value={values.filter(x => x.value === value)}
                menuPortalTarget={portalElementRef?.current ?? document.getElementById("portal")}
                autoFocus={true}
                options={values}
                onChange={async selected => {
                    const e = selected[0];
                    if (e === undefined) return;
                    setValue(e.value);
                    await new Promise(r => window.requestAnimationFrame(r));
                    onFinishedEditing({
                        ...cell,
                        data: {
                            ...cell.data,
                            value: e.value,
                        },
                    });
                }}
            />
        </Wrap>
    );
});

const renderer: CustomRenderer<DropdownCell> = {
    kind: GridCellKind.Custom,
    isMatch: (c): c is DropdownCell => (c.data as any).kind === "dropdown-cell",
    draw: (args, cell) => {
        const { ctx, theme, rect } = args;
        const { value } = cell.data;
        const foundOption = cell.data.allowedValues.find(opt => {
            if (typeof opt === "string" || opt === null || opt === undefined) {
                return opt === value;
            }
            return opt.value === value;
        });

        const displayText = typeof foundOption === "string" ? foundOption : foundOption?.label ?? "";
        if (displayText) {
            ctx.fillStyle = theme.textDark;
            ctx.fillText(
                displayText,
                rect.x + theme.cellHorizontalPadding,
                rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
            );
        }
        return true;
    },
    measure: (ctx, cell, theme) => {
        const { value } = cell.data;
        return (value ? ctx.measureText(value).width : 0) + theme.cellHorizontalPadding * 2;
    },
    provideEditor: () => ({
        editor: Editor,
        disablePadding: true,
        deletedValue: v => ({
            ...v,
            copyData: "",
            data: {
                ...v.data,
                value: "",
            },
        }),
    }),
    onPaste: (v, d) => ({
        ...d,
        value: d.allowedValues.some(option => {
            if (option === null || option === undefined) return false;
            if (typeof option === "string") return option === v;
            return option.value === v;
        })
            ? v
            : d.value,
    }),
};

export default renderer;
