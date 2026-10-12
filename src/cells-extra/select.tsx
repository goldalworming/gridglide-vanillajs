/**
 * A small searchable (multi-)select used by the dropdown and multi-select cells. It replaces react-select and keeps
 * the behaviour those editors rely on: combobox input with filtering, a listbox menu (optionally portalled),
 * keyboard navigation, pills with remove buttons, clearing and creating new options.
 */
import * as React from "../runtime/react.js";
import { createPortal } from "../runtime/react.js";
import { styled } from "../runtime/styled.js";
import { getLuminance } from "../component-api.js";

export interface SelectOption {
    readonly value: string;
    readonly label?: string;
    readonly color?: string;
}

interface Props {
    readonly className?: string;
    readonly isMulti: boolean;
    readonly isDisabled?: boolean;
    readonly isClearable?: boolean;
    /** Allows creating options that do not exist yet. */
    readonly isCreatable?: boolean;
    readonly options: readonly SelectOption[];
    /** Selected options (a single entry for single selects). */
    readonly value: readonly SelectOption[];
    readonly onChange: (value: readonly SelectOption[]) => void;
    readonly inputValue: string;
    readonly onInputChange: (value: string) => void;
    readonly menuIsOpen?: boolean;
    readonly onMenuOpen?: () => void;
    readonly onMenuClose?: () => void;
    readonly menuDisabled?: boolean;
    readonly onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    readonly placeholder?: string;
    readonly noOptionsMessage?: (input: string) => string | undefined;
    readonly menuPortalTarget?: HTMLElement | null;
    readonly autoFocus?: boolean;
    readonly closeMenuOnSelect?: boolean;
}

const Control = styled.div`
    display: flex;
    align-items: center;
    min-height: 36px;
    box-sizing: border-box;
    padding: 2px 8px;
    gap: 4px;
    background-color: var(--gdg-bg-cell);
    color: var(--gdg-text-dark);
    font-family: var(--gdg-font-family);
    font-size: var(--gdg-editor-font-size);
    cursor: text;

    .gdg-select__values {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
    }

    .gdg-select__single-value {
        position: absolute;
        pointer-events: none;
        white-space: nowrap;
    }

    .gdg-select__input-wrap {
        position: relative;
        flex: 1;
        min-width: 30px;
        display: flex;
        align-items: center;
    }

    .gdg-select__input {
        flex: 1;
        min-width: 2px;
        border: 0;
        outline: none;
        padding: 2px 0;
        background: transparent;
        color: var(--gdg-text-dark);
        font: inherit;
    }

    .gdg-select__placeholder {
        position: absolute;
        pointer-events: none;
        color: var(--gdg-text-light);
        white-space: nowrap;
    }

    .gdg-select__multi-value {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        white-space: nowrap;
        background-color: var(--gdg-bg-bubble);
        border-radius: var(--gdg-rounding-radius, 10px);
        height: 20px;
    }

    .gdg-select__multi-value-label {
        padding: 0 4px 0 8px;
        color: var(--gdg-text-bubble);
        user-select: text;
    }

    .gdg-select__multi-value-remove {
        display: flex;
        align-items: center;
        padding: 0 4px;
        height: 100%;
        cursor: pointer;
        color: var(--gdg-text-bubble);
        border-radius: var(--gdg-rounding-radius, 10px);
    }

    .gdg-select__clear {
        display: flex;
        cursor: pointer;
        color: var(--gdg-text-light);

        :hover {
            color: var(--gdg-text-dark);
        }
    }
`;

const Menu = styled.div`
    font-family: var(--gdg-font-family);
    font-size: var(--gdg-editor-font-size);
    color: var(--gdg-text-dark);
    background-color: var(--gdg-bg-cell);
    border-radius: 4px;
    border: 1px solid var(--gdg-border-color);
    box-shadow: 0 4px 11px rgba(0, 0, 0, 0.1);
    max-height: 300px;
    overflow-y: auto;
    padding: 4px 0;
    box-sizing: border-box;
    z-index: 1;

    .gdg-select__option {
        padding: 8px var(--gdg-cell-horizontal-padding, 8px);
        cursor: pointer;
        user-select: none;

        :empty::after {
            content: "\\00a0";
        }
    }

    .gdg-select__option--focused {
        background-color: var(--gdg-accent-light);
    }

    .gdg-select__option:active {
        background-color: var(--gdg-accent-color);
        color: var(--gdg-accent-fg);
    }

    .gdg-select__no-options {
        padding: 8px 12px;
        text-align: center;
        color: var(--gdg-text-light);
    }
`;

const CrossIcon = () => (
    <svg height="14" width="14" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
            fill="currentColor"
            d="M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z"
        />
    </svg>
);

function labelOf(o: SelectOption): string {
    return o.label ?? o.value ?? "";
}

function textColorFor(color: string | undefined): string | undefined {
    if (color === undefined) return undefined;
    return getLuminance(color) > 0.5 ? "black" : "white";
}

interface MenuEntry {
    readonly option: SelectOption;
    readonly label: string;
}

export const Select: React.FunctionComponent<Props> = p => {
    const {
        className,
        isMulti,
        isDisabled = false,
        isClearable = false,
        isCreatable = false,
        options,
        value,
        onChange,
        inputValue,
        onInputChange,
        menuDisabled = false,
        onKeyDown,
        placeholder,
        noOptionsMessage,
        menuPortalTarget,
        autoFocus = false,
        closeMenuOnSelect = true,
    } = p;

    const [menuOpenInner, setMenuOpenInner] = React.useState(false);
    const menuOpen = !isDisabled && (p.menuIsOpen ?? menuOpenInner);
    const setMenuOpen = React.useCallback(
        (open: boolean) => {
            setMenuOpenInner(open);
            if (open) p.onMenuOpen?.();
            else p.onMenuClose?.();
        },
        [p]
    );

    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const controlRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const listId = React.useId();

    const entries = React.useMemo((): MenuEntry[] => {
        const needle = inputValue.trim().toLowerCase();
        const selected = new Set(value.map(v => v.value));
        const result: MenuEntry[] = options
            .filter(o => !isMulti || !selected.has(o.value))
            .filter(o => needle === "" || labelOf(o).toLowerCase().includes(needle) || o.value?.toLowerCase().includes(needle))
            .map(o => ({ option: o, label: labelOf(o) }));
        const trimmed = inputValue.trim();
        if (isCreatable && trimmed !== "" && !options.some(o => labelOf(o) === trimmed || o.value === trimmed)) {
            result.push({ option: { value: trimmed, label: trimmed }, label: `Create "${trimmed}"` });
        }
        return result;
    }, [inputValue, isCreatable, isMulti, options, value]);

    const activeIndex = Math.min(focusedIndex, entries.length - 1);

    const select = React.useCallback(
        (o: SelectOption) => {
            onChange(isMulti ? [...value, o] : [o]);
            onInputChange("");
            setFocusedIndex(0);
            if (closeMenuOnSelect) setMenuOpen(false);
        },
        [closeMenuOnSelect, isMulti, onChange, onInputChange, setMenuOpen, value]
    );

    const remove = React.useCallback(
        (index: number) => {
            onChange(value.filter((_, i) => i !== index));
        },
        [onChange, value]
    );

    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            onKeyDown?.(e);
            if (e.defaultPrevented) return;
            switch (e.key) {
                case "ArrowDown":
                case "ArrowUp": {
                    e.preventDefault();
                    if (!menuOpen) {
                        setMenuOpen(true);
                        return;
                    }
                    const delta = e.key === "ArrowDown" ? 1 : -1;
                    setFocusedIndex(i => (entries.length === 0 ? 0 : (i + delta + entries.length) % entries.length));
                    return;
                }
                case "Enter":
                case "Tab": {
                    if (menuOpen && activeIndex >= 0 && entries[activeIndex] !== undefined) {
                        e.preventDefault();
                        select(entries[activeIndex].option);
                    }
                    return;
                }
                case "Escape": {
                    if (menuOpen) setMenuOpen(false);
                    return;
                }
                case "Backspace": {
                    if (inputValue === "" && isMulti && value.length > 0) remove(value.length - 1);
                    return;
                }
            }
        },
        [activeIndex, entries, inputValue, isMulti, menuOpen, onKeyDown, remove, select, setMenuOpen, value.length]
    );

    // keep the menu attached to the control when it is portalled
    const [menuPos, setMenuPos] = React.useState<{ left: number; top: number; width: number } | undefined>();
    React.useLayoutEffect(() => {
        if (!menuOpen || menuPortalTarget === null || menuPortalTarget === undefined || controlRef.current === null)
            return;
        const r = controlRef.current.getBoundingClientRect();
        const host = menuPortalTarget.getBoundingClientRect();
        const below = r.bottom + 300 <= window.innerHeight || r.top < 300;
        setMenuPos({
            left: r.left - host.left,
            top: below ? r.bottom - host.top + 4 : r.top - host.top - 4,
            width: r.width,
        });
    }, [menuOpen, menuPortalTarget, value.length]);

    const noOptions = noOptionsMessage?.(inputValue) ?? "No options";
    const menu =
        menuOpen && !menuDisabled ? (
            <Menu
                className="click-outside-ignore gdg-select__menu"
                style={
                    menuPortalTarget === null || menuPortalTarget === undefined
                        ? undefined
                        : {
                              position: "absolute",
                              left: menuPos?.left ?? 0,
                              top: menuPos?.top ?? 0,
                              width: menuPos?.width,
                          }
                }>
                <div role="listbox" id={listId} aria-multiselectable={isMulti}>
                    {entries.length === 0 ? (
                        <div className="gdg-select__no-options">{noOptions}</div>
                    ) : (
                        entries.map((entry, i) => (
                            <div
                                key={entry.option.value + "-" + i}
                                role="option"
                                aria-selected={i === activeIndex}
                                className={
                                    "gdg-select__option" + (i === activeIndex ? " gdg-select__option--focused" : "")
                                }
                                onMouseDown={e => e.preventDefault()}
                                onMouseMove={() => {
                                    if (i !== activeIndex) setFocusedIndex(i);
                                }}
                                onClick={() => select(entry.option)}>
                                {entry.label}
                            </div>
                        ))
                    )}
                </div>
            </Menu>
        ) : null;

    const showPlaceholder = inputValue === "" && value.length === 0 && placeholder !== undefined;

    return (
        <>
            <Control
                ref={controlRef}
                className={className}
                aria-disabled={isDisabled}
                onMouseDown={e => {
                    if (isDisabled || e.target === inputRef.current) return;
                    e.preventDefault();
                    inputRef.current?.focus();
                    setMenuOpen(!menuOpen);
                }}>
                <div className="gdg-select__values">
                    {isMulti &&
                        value.map((v, i) => (
                            <div
                                key={v.value + "-" + i}
                                className="gdg-select__multi-value"
                                style={v.color === undefined ? undefined : { backgroundColor: v.color }}>
                                <div
                                    className="gdg-select__multi-value-label"
                                    style={{ color: textColorFor(v.color), paddingRight: isDisabled ? 8 : undefined }}
                                    onMouseDown={e => e.stopPropagation()}
                                    onTouchEnd={e => e.stopPropagation()}>
                                    {labelOf(v)}
                                </div>
                                {!isDisabled && (
                                    <div
                                        className="gdg-select__multi-value-remove"
                                        role="button"
                                        aria-label={`Remove ${labelOf(v)}`}
                                        style={{ color: textColorFor(v.color) }}
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onClick={() => remove(i)}>
                                        <CrossIcon />
                                    </div>
                                )}
                            </div>
                        ))}
                    {!isMulti && value[0] !== undefined && inputValue === "" && (
                        <div className="gdg-select__single-value">{labelOf(value[0])}</div>
                    )}
                    {!isDisabled && (
                        <div className="gdg-select__input-wrap">
                            {showPlaceholder && <div className="gdg-select__placeholder">{placeholder}</div>}
                            <input
                                ref={inputRef}
                                className="gdg-select__input"
                                role="combobox"
                                aria-expanded={menuOpen}
                                aria-controls={listId}
                                aria-autocomplete="list"
                                autoComplete="off"
                                autoFocus={autoFocus}
                                value={inputValue}
                                onFocus={() => setMenuOpen(true)}
                                onChange={e => {
                                    onInputChange(e.target.value);
                                    setFocusedIndex(0);
                                    if (!menuOpen) setMenuOpen(true);
                                }}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                    )}
                </div>
                {isClearable && !isDisabled && value.length > 0 && (
                    <div
                        className="gdg-select__clear"
                        role="button"
                        aria-label="Clear"
                        onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChange([]);
                        }}>
                        <CrossIcon />
                    </div>
                )}
            </Control>
            {menuPortalTarget === null || menuPortalTarget === undefined
                ? menu
                : menu !== null && createPortal(menu, menuPortalTarget)}
        </>
    );
};
