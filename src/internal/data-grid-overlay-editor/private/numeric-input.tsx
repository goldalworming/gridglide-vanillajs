import * as React from "../../../runtime/react.js";

/** Mirrors the values object of react-number-format's `onValueChange`. */
export interface NumberFormatValues {
    readonly floatValue: number | undefined;
    readonly formattedValue: string;
    readonly value: string;
}

interface Props extends Omit<React.HTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
    readonly value: number | string;
    readonly onValueChange: (values: NumberFormatValues) => void;
    readonly getInputRef?: React.MutableRefObject<HTMLInputElement | undefined>;
    readonly decimalScale?: number;
    readonly allowNegative?: boolean;
    readonly thousandSeparator?: boolean | string;
    readonly decimalSeparator: string;
    readonly disabled?: boolean;
}

interface Parsed {
    readonly formatted: string;
    readonly value: string;
    readonly floatValue: number | undefined;
}

function groupThousands(int: string, sep: string): string {
    if (sep === "") return int;
    let out = "";
    for (let i = 0; i < int.length; i++) {
        if (i > 0 && (int.length - i) % 3 === 0) out += sep;
        out += int[i];
    }
    return out;
}

/** Parses free text the way react-number-format's NumericFormat does and re-formats it. */
export function parseNumericText(
    text: string,
    decimalSeparator: string,
    thousandSeparator: string,
    allowNegative: boolean,
    decimalScale: number | undefined
): Parsed {
    const negative = allowNegative && text.trimStart().startsWith("-");
    let int = "";
    let frac = "";
    let hasDecimal = false;
    for (const ch of text) {
        if (ch >= "0" && ch <= "9") {
            if (hasDecimal) frac += ch;
            else int += ch;
        } else if (ch === decimalSeparator && ch !== thousandSeparator && !hasDecimal && decimalScale !== 0) {
            hasDecimal = true;
        }
    }
    if (decimalScale !== undefined) frac = frac.slice(0, decimalScale);
    const sign = negative ? "-" : "";
    const formatted = sign + groupThousands(int, thousandSeparator) + (hasDecimal ? decimalSeparator + frac : "");
    const value = sign + int + (hasDecimal ? "." + frac : "");
    const num = Number.parseFloat(value);
    return { formatted, value, floatValue: Number.isNaN(num) ? undefined : num };
}

function isSignificant(ch: string, decimalSeparator: string): boolean {
    return (ch >= "0" && ch <= "9") || ch === decimalSeparator || ch === "-";
}

/** Dependency-free replacement for react-number-format's `NumericFormat`. */
export const NumericInput: React.FunctionComponent<Props> = p => {
    const {
        value,
        onValueChange,
        getInputRef,
        decimalScale,
        allowNegative = true,
        thousandSeparator,
        decimalSeparator,
        ...rest
    } = p;
    const thousand = thousandSeparator === true ? "," : thousandSeparator === false ? "" : thousandSeparator ?? "";

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const lastEmitted = React.useRef<number | string | undefined>(undefined);

    const display = React.useMemo(() => {
        const text = typeof value === "number" ? String(value).replace(".", decimalSeparator) : value;
        return text === "-" ? "-" : parseNumericText(text, decimalSeparator, thousand, allowNegative, decimalScale).formatted;
    }, [allowNegative, decimalScale, decimalSeparator, thousand, value]);

    const [text, setText] = React.useState(display);

    // only adopt the prop value if it did not originate from our own last edit (keeps e.g. a trailing separator)
    const lastDisplay = React.useRef(display);
    if (lastDisplay.current !== display) {
        lastDisplay.current = display;
        if (!Object.is(lastEmitted.current, value)) setText(display);
    }

    const onChange = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const input = e.target;
            const raw = input.value;
            const caret = input.selectionStart ?? raw.length;
            let significantBefore = 0;
            for (let i = 0; i < caret; i++) if (isSignificant(raw[i], decimalSeparator)) significantBefore++;

            const parsed = parseNumericText(raw, decimalSeparator, thousand, allowNegative, decimalScale);
            input.value = parsed.formatted;
            let pos = 0;
            for (let seen = 0; pos < parsed.formatted.length && seen < significantBefore; pos++) {
                if (isSignificant(parsed.formatted[pos], decimalSeparator)) seen++;
            }
            input.setSelectionRange(pos, pos);
            setText(parsed.formatted);
            lastEmitted.current = parsed.floatValue;
            onValueChange({ floatValue: parsed.floatValue, formattedValue: parsed.formatted, value: parsed.value });
        },
        [allowNegative, decimalScale, decimalSeparator, onValueChange, thousand]
    );

    const setRef = React.useCallback(
        (el: HTMLInputElement | null) => {
            inputRef.current = el;
            if (getInputRef !== undefined) getInputRef.current = el ?? undefined;
        },
        [getInputRef]
    );

    return <input {...rest} ref={setRef} type="text" inputMode="decimal" value={text} onChange={onChange} />;
};
