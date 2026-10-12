import * as React from "react";
import { describe, test, expect, afterEach } from "vitest";
import { createRoot, createPortal, flush, type Root } from "../src/runtime/react.js";
import { compileCss } from "../src/runtime/styled.js";

let roots: [Root, HTMLElement][] = [];
function mount(el: React.ReactNode) {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    root.render(el);
    roots.push([root, host]);
    return {
        host,
        update: (next: React.ReactNode) => {
            root.render(next);
            flush();
        },
        unmount: () => root.unmount(),
    };
}

afterEach(() => {
    for (const [r, h] of roots) {
        r.unmount();
        h.remove();
    }
    roots = [];
});

describe("runtime", () => {
    test("conditional siblings keep their slot (state survives a hole appearing)", () => {
        let setCount: (n: number) => void = () => undefined;
        const Counter = () => {
            const [n, set] = React.useState(0);
            setCount = set;
            return <span>{n}</span>;
        };
        const App = (p: { show: boolean }) => (
            <div>
                {p.show && <b>first</b>}
                <Counter />
            </div>
        );
        const r = mount(<App show={false} />);
        setCount(5);
        flush();
        r.update(<App show={true} />);
        expect(r.host.textContent).toBe("first5");
    });

    test("keyed children are moved, not recreated", () => {
        const List = (p: { items: string[] }) => (
            <ul>
                {p.items.map(i => (
                    <li key={i}>{i}</li>
                ))}
            </ul>
        );
        const r = mount(<List items={["a", "b", "c"]} />);
        const before = [...r.host.querySelectorAll("li")];
        r.update(<List items={["c", "a", "b"]} />);
        const after = [...r.host.querySelectorAll("li")];
        expect(after.map(x => x.textContent)).toEqual(["c", "a", "b"]);
        expect(after[0]).toBe(before[2]);
        expect(after[1]).toBe(before[0]);
    });

    test("effects run children first; all cleanups precede setups", () => {
        const log: string[] = [];
        const Child = (p: { v: number }) => {
            React.useLayoutEffect(() => {
                log.push(`child+${p.v}`);
                return () => log.push(`child-${p.v}`);
            }, [p.v]);
            return null;
        };
        const Parent = (p: { v: number }) => {
            React.useLayoutEffect(() => {
                log.push(`parent+${p.v}`);
                return () => log.push(`parent-${p.v}`);
            }, [p.v]);
            return <Child v={p.v} />;
        };
        const r = mount(<Parent v={1} />);
        expect(log).toEqual(["child+1", "parent+1"]);
        log.length = 0;
        r.update(<Parent v={2} />);
        expect(log).toEqual(["child-1", "parent-1", "child+2", "parent+2"]);
        log.length = 0;
        r.unmount();
        expect(log).toEqual(["child-2", "parent-2"]);
    });

    test("portals render into their container and clean up", () => {
        const target = document.body.appendChild(document.createElement("div"));
        target.appendChild(document.createElement("i")); // foreign content stays first
        const App = (p: { open: boolean }) => <div>{p.open && createPortal(<p>portalled</p>, target)}</div>;
        const r = mount(<App open={true} />);
        expect(target.lastChild?.textContent).toBe("portalled");
        expect(target.firstChild?.nodeName).toBe("I");
        r.update(<App open={false} />);
        expect(target.childNodes.length).toBe(1);
        target.remove();
    });

    test("context updates reach consumers behind memo", () => {
        const Ctx = React.createContext("default");
        const Consumer = () => <span>{React.useContext(Ctx)}</span>;
        const Blocked = React.memo(() => <Consumer />);
        const App = (p: { v: string }) => (
            <Ctx.Provider value={p.v}>
                <Blocked />
            </Ctx.Provider>
        );
        const r = mount(<App v="one" />);
        expect(r.host.textContent).toBe("one");
        r.update(<App v="two" />);
        expect(r.host.textContent).toBe("two");
    });

    test("onChange fires on input and is not duplicated by the change event", () => {
        const seen: string[] = [];
        const r = mount(<input onChange={e => seen.push(e.target.value)} value="" />);
        const input = r.host.querySelector("input") as HTMLInputElement;
        input.value = "x";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(seen).toEqual(["x"]);
    });

    test("updates are batched until flush", () => {
        let renders = 0;
        let set: (n: number) => void = () => undefined;
        const C = () => {
            const [n, s] = React.useState(0);
            set = s;
            renders++;
            return <span>{n}</span>;
        };
        const r = mount(<C />);
        set(1);
        set(2);
        expect(r.host.textContent).toBe("0");
        flush();
        expect(r.host.textContent).toBe("2");
        expect(renders).toBe(2);
    });
});

describe("styled css compiler", () => {
    test("handles stylis-style nesting", () => {
        const out = compileCss(
            "c",
            `color: red;
            :hover { color: blue; }
            > :first-child { top: 0; }
            .parent & { margin: 0; }
            a, b { x: 1; }
            ::placeholder { color: gray; }
            @media (min-width: 10px) { width: 1px; }`
        );
        expect(out).toContain(".c{color: red}");
        expect(out).toContain(".c:hover{color: blue}");
        expect(out).toContain(".c > :first-child{top: 0}");
        expect(out).toContain(".parent .c{margin: 0}");
        expect(out).toContain(".c a,.c b{x: 1}");
        expect(out).toContain(".c::placeholder{color: gray}");
        expect(out).toContain("@media (min-width: 10px){.c{width: 1px}}");
    });
});
