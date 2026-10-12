/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Runtime replacement for the `styled` / `css` helpers of linaria used by upstream.
 *
 * - CSS is written with stylis-style nesting (`&`, `:hover`, `> child`, `.parent &`, `@media`) and is
 *   compiled to flat CSS once per definition, then injected into a single <style> element.
 * - Function interpolations become CSS custom properties set through the inline `style` attribute,
 *   exactly how linaria handles dynamic values.
 * - Interpolating a styled component yields its class selector.
 */
import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "./react.js";

let counter = 0;
let sheet: HTMLStyleElement | undefined;
const pending: string[] = [];

function inject(cssText: string) {
    if (typeof document === "undefined") {
        pending.push(cssText);
        return;
    }
    if (sheet === undefined || !sheet.isConnected) {
        sheet = document.createElement("style");
        sheet.setAttribute("data-gdg-styles", "");
        document.head.appendChild(sheet);
        if (pending.length > 0) sheet.appendChild(document.createTextNode(pending.splice(0).join("\n")));
    }
    sheet.appendChild(document.createTextNode(cssText));
}

function splitTopLevel(input: string, sep: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote: string | undefined;
    let cur = "";
    for (const ch of input) {
        if (quote !== undefined) {
            if (ch === quote) quote = undefined;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "(" || ch === "[") {
            depth++;
        } else if (ch === ")" || ch === "]") {
            depth--;
        } else if (ch === sep && depth === 0) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(s => s.length > 0);
}

function resolveSelector(parents: string[], child: string): string[] {
    const out: string[] = [];
    for (const c of splitTopLevel(child, ",")) {
        for (const p of parents) {
            if (c.includes("&")) out.push(c.replace(/&/g, p));
            else if (c.startsWith(":")) out.push(p + c);
            else out.push(p + " " + c);
        }
    }
    return out;
}

interface Block {
    decls: string[];
    rules: [string, Block][];
}

function parseBlock(src: string, pos: { i: number }): Block {
    const block: Block = { decls: [], rules: [] };
    let buf = "";
    let quote: string | undefined;
    let paren = 0;
    while (pos.i < src.length) {
        const ch = src[pos.i++];
        if (quote !== undefined) {
            buf += ch;
            if (ch === quote) quote = undefined;
            continue;
        }
        if (ch === "/" && src[pos.i] === "*") {
            const end = src.indexOf("*/", pos.i + 1);
            pos.i = end < 0 ? src.length : end + 2;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
        } else if (ch === "(") {
            paren++;
            buf += ch;
        } else if (ch === ")") {
            paren--;
            buf += ch;
        } else if (ch === ";" && paren === 0) {
            if (buf.trim().length > 0) block.decls.push(buf.trim());
            buf = "";
        } else if (ch === "{" && paren === 0) {
            const selector = buf.trim();
            buf = "";
            block.rules.push([selector, parseBlock(src, pos)]);
        } else if (ch === "}" && paren === 0) {
            break;
        } else {
            buf += ch;
        }
    }
    if (buf.trim().length > 0) block.decls.push(buf.trim());
    return block;
}

function emit(selectors: string[], block: Block, out: string[]) {
    if (block.decls.length > 0) out.push(`${selectors.join(",")}{${block.decls.join(";")}}`);
    for (const [sel, child] of block.rules) {
        if (sel.startsWith("@media") || sel.startsWith("@supports") || sel.startsWith("@container")) {
            const inner: string[] = [];
            emit(selectors, child, inner);
            out.push(`${sel}{${inner.join("")}}`);
        } else if (sel.startsWith("@")) {
            // @keyframes and friends are emitted verbatim
            const inner: string[] = [];
            for (const [s, b] of child.rules) emit([s], b, inner);
            out.push(`${sel}{${inner.join("")}}`);
        } else {
            emit(resolveSelector(selectors, sel), child, out);
        }
    }
}

/** Compiles nested CSS for `.className` into flat CSS. Exported for tests. */
export function compileCss(className: string, source: string): string {
    const out: string[] = [];
    emit(["." + className], parseBlock(source, { i: 0 }), out);
    return out.join("\n");
}

type Interpolation<P> = string | number | ((props: P) => string | number | undefined) | { readonly __gdgClass: string };

function build<P>(strings: TemplateStringsArray, values: Interpolation<P>[], className: string) {
    const vars: [string, (props: P) => string | number | undefined][] = [];
    let source = strings[0];
    values.forEach((v, i) => {
        let next = strings[i + 1];
        if (typeof v === "function" && (v as any).__gdgClass !== undefined) {
            source += "." + (v as any).__gdgClass;
        } else if (typeof v === "function") {
            const name = `--${className}-${i}`;
            const fn = v as (props: P) => string | number | undefined;
            // like linaria, a unit directly following the interpolation becomes part of the variable's value
            const unit = /^[a-z%]+/i.exec(next)?.[0];
            if (unit === undefined) {
                vars.push([name, fn]);
            } else {
                next = next.slice(unit.length);
                vars.push([name, p => `${fn(p)}${unit}`]);
            }
            source += `var(${name})`;
        } else {
            source += String(v);
        }
        source += next;
    });
    inject(compileCss(className, source));
    return vars;
}

/** `css` tagged template: returns a class name. */
export function css(strings: TemplateStringsArray, ...values: (string | number)[]): string {
    const className = `gdg-c${(counter++).toString(36)}`;
    build(strings, values, className);
    return className;
}

export interface StyledComponent<P, E = HTMLElement> {
    (props: P & HTMLAttributes<E>): ReactNode;
    readonly __gdgClass: string;
    toString(): string;
}

const probes = new Map<string, Element>();
function isDomProp(tag: string, key: string): boolean {
    if (key === "children" || key === "className" || key === "style" || key === "ref" || key === "key") return true;
    if (key.startsWith("on") || key.startsWith("aria-") || key.startsWith("data-")) return true;
    if (key === "role" || key === "autoFocus" || key === "htmlFor" || key === "dangerouslySetInnerHTML") return true;
    if (key === "defaultValue" || key === "spellCheck" || key === "autoComplete" || key === "autoCorrect") return true;
    if (typeof document === "undefined") return false;
    let probe = probes.get(tag);
    if (probe === undefined) {
        probe = document.createElement(tag);
        probes.set(tag, probe);
    }
    return key in probe;
}

function styledTag<E>(tag: string) {
    return <P = {}>(strings: TemplateStringsArray, ...values: Interpolation<P>[]): StyledComponent<P, E> => {
        const className = `gdg-s${(counter++).toString(36)}`;
        const vars = build(strings, values, className);
        const C: any = forwardRef<any, any>((props, ref) => {
            const domProps: Record<string, any> = { ref };
            for (const k in props) {
                if (k !== "className" && k !== "style" && isDomProp(tag, k)) domProps[k] = props[k];
            }
            domProps.className = props.className === undefined ? className : `${className} ${props.className}`;
            if (vars.length > 0) {
                const style: Record<string, any> = { ...props.style };
                for (const [name, fn] of vars) style[name] = fn(props);
                domProps.style = style;
            } else if (props.style !== undefined) {
                domProps.style = props.style;
            }
            return createElement(tag, domProps);
        });
        C.__gdgClass = className;
        C.toString = () => "." + className;
        return C as StyledComponent<P, E>;
    };
}

type StyledFactory<E> = <P = {}>(strings: TemplateStringsArray, ...values: Interpolation<P>[]) => StyledComponent<P, E>;

export const styled: {
    readonly div: StyledFactory<HTMLDivElement>;
    readonly input: StyledFactory<HTMLInputElement>;
    readonly textarea: StyledFactory<HTMLTextAreaElement>;
    readonly span: StyledFactory<HTMLSpanElement>;
} = {
    div: styledTag("div"),
    input: styledTag("input"),
    textarea: styledTag("textarea"),
    span: styledTag("span"),
};
