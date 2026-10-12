// Benchmarks for the upstream marketing claims, shared by the port (demo/bench.html) and an upstream React build
// so both can be measured with identical code. `a` adapts a grid implementation:
// { mount(el, props) -> { destroy(), updateCells(cells) }, GridCellKind, SparklineCell, useAsyncDataSource }.
export function makeBench(a) {
    const { GridCellKind, SparklineCell, useAsyncDataSource } = a;
    const el = document.getElementById("grid");
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stats = xs => {
        const s = [...xs].sort((a, b) => a - b);
        const pick = q => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(2);
        return { frames: s.length, avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), p50: pick(0.5), p95: pick(0.95), max: pick(1) };
    };
    const columns = n => Array.from({ length: n }, (_, i) => ({ title: `Col ${i}`, id: `c${i}`, width: 120 }));
    const scroller = () => el.querySelector(".dvn-scroller");

    // Measures frame intervals while `step` runs once per animation frame.
    async function measureFrames(n, step) {
        const deltas = [];
        let last = performance.now();
        for (let i = 0; i < n; i++) {
            step(i);
            await frame();
            const now = performance.now();
            deltas.push(now - last);
            last = now;
        }
        return stats(deltas);
    }

    let longTasks = 0;
    new PerformanceObserver(l => (longTasks += l.getEntries().length)).observe({ entryTypes: ["longtask"] });

    return {
        async scale(rows) {
            let calls = 0;
            const touched = new Set();
            const heap0 = performance.memory?.usedJSHeapSize;
            const t0 = performance.now();
            const grid = a.mount(el, {
                columns: columns(20),
                rows,
                width: "100%",
                height: "100%",
                getCellContent: ([c, r]) => {
                    calls++;
                    touched.add(r);
                    return { kind: GridCellKind.Text, data: `${c},${r}`, displayData: `${c},${r}`, allowOverlay: false };
                },
            });
            await frame();
            await frame();
            const mountMs = performance.now() - t0;
            const initialCalls = calls;
            const initialRows = touched.size;
            // jump to the very end and check the last row is reachable
            const s = scroller();
            s.scrollTop = s.scrollHeight;
            await sleep(300);
            await frame();
            const lastRowVisible = [...touched].includes(rows - 1);
            const heap1 = performance.memory?.usedJSHeapSize;
            grid.destroy();
            return {
                rows,
                mountMs: +mountMs.toFixed(1),
                getCellContentCallsOnMount: initialCalls,
                distinctRowsFetchedOnMount: initialRows,
                distinctRowsFetchedTotal: touched.size,
                lastRowReachable: lastRowVisible,
                heapDeltaMB: heap0 === undefined ? null : +((heap1 - heap0) / 1e6).toFixed(1),
            };
        },

        async scrolling(kind) {
            const grid = a.mount(el, {
                columns: columns(30),
                rows: 1_000_000,
                width: "100%",
                height: "100%",
                smoothScrollY: true,
                smoothScrollX: true,
                getCellContent: ([c, r]) =>
                    c % 3 === 1
                        ? { kind: GridCellKind.Number, data: r * c, displayData: String(r * c), allowOverlay: false }
                        : { kind: GridCellKind.Text, data: `Row ${r} col ${c}`, displayData: `Row ${r} col ${c}`, allowOverlay: false },
            });
            await sleep(300);
            const s = scroller();
            const style = getComputedStyle(s);
            // read now: computed styles are live and empty once the grid is destroyed
            const nativeScroller = { overflowY: style.overflowY, scrollHeight: s.scrollHeight, clientHeight: s.clientHeight };
            longTasks = 0;
            const result = await measureFrames(300, i => {
                if (kind === "vertical") s.scrollTop += 120;
                else if (kind === "horizontal") s.scrollLeft = (i * 37) % (s.scrollWidth - s.clientWidth);
                else s.scrollTop = Math.random() * (s.scrollHeight - s.clientHeight); // random jumps
            });
            grid.destroy();
            return { kind, nativeScroller, frameMs: result, longTasks };
        },

        async realtime(updatesPerFrame) {
            const cols = 20;
            const rows = 100_000;
            const values = new Float64Array(cols * rows);
            const grid = a.mount(el, {
                columns: columns(cols),
                rows,
                width: "100%",
                height: "100%",
                getCellContent: ([c, r]) => {
                    const v = values[r * cols + c];
                    return { kind: GridCellKind.Number, data: v, displayData: v.toFixed(2), allowOverlay: false };
                },
            });
            await sleep(300);
            longTasks = 0;
            let updates = 0;
            const t0 = performance.now();
            const frames = await measureFrames(240, () => {
                // mutate random cells in the visible area (the expensive case: everything must repaint)
                const damage = [];
                for (let i = 0; i < updatesPerFrame; i++) {
                    const c = (Math.random() * cols) | 0;
                    const r = (Math.random() * 30) | 0;
                    values[r * cols + c] = Math.random() * 1000;
                    damage.push({ cell: [c, r] });
                }
                grid.updateCells(damage);
                updates += updatesPerFrame;
            });
            const seconds = (performance.now() - t0) / 1000;
            grid.destroy();
            return { updatesPerFrame, updatesPerSecond: Math.round(updates / seconds), frameMs: frames, longTasks };
        },

        async sparklines() {
            const cols = 12;
            const series = r => Array.from({ length: 30 }, (_, i) => Math.sin((i + r) / 3) * 40 + Math.cos(i * r) * 10);
            const grid = a.mount(el, {
                columns: columns(cols),
                rows: 100_000,
                rowHeight: 40,
                width: "100%",
                height: "100%",
                customRenderers: [SparklineCell],
                getCellContent: ([c, r]) => ({
                    kind: GridCellKind.Custom,
                    allowOverlay: false,
                    copyData: "",
                    data: { kind: "sparkline-cell", values: series(r + c * 7), color: c % 2 ? "#77c4c4" : "#D98466", graphKind: c % 3 === 0 ? "bar" : "area", yAxis: [-50, 50] },
                }),
            });
            await sleep(300);
            const visibleCharts = Math.ceil(innerHeight / 40) * Math.min(cols, Math.ceil(innerWidth / 120));
            const s = scroller();
            longTasks = 0;
            const frames = await measureFrames(240, () => (s.scrollTop += 80));
            grid.destroy();
            return { visibleCharts, frameMs: frames, longTasks };
        },

        async async(latencyMs) {
            let requests = 0;
            let inFlightMax = 0;
            let inFlight = 0;
            const drawnRows = new Set(); // rows whose loaded data was turned into cells
            const ref = { current: null };
            const grid = a.mount(el, {
                columns: columns(5),
                rows: 1_000_000,
                width: "100%",
                height: "100%",
                getCellContent: () => ({ kind: GridCellKind.Loading, allowOverlay: false }),
                enhance: p => ({
                    ...p,
                    ...useAsyncDataSource(
                        50,
                        4,
                        async ([start, end]) => {
                            requests++;
                            inFlightMax = Math.max(inFlightMax, ++inFlight);
                            await sleep(latencyMs);
                            inFlight--;
                            return Array.from({ length: end - start }, (_, i) => ({ id: start + i }));
                        },
                        (row, col) => (drawnRows.add(row.id), { kind: GridCellKind.Text, data: `#${row.id}`, displayData: `#${row.id}:${col}`, allowOverlay: false }),
                        () => undefined,
                        ref
                    ),
                }),
            });
            ref.current = grid;
            const cell = (c, r) => document.querySelector(`[data-testid="glide-cell-${c}-${r}"]`)?.textContent;
            await sleep(50);
            const beforeLoad = cell(0, 0) || "(loading cell)";
            await sleep(latencyMs + 400);
            const afterLoad = cell(0, 0);
            // jump far away: new pages must be fetched
            const s = scroller();
            const requestsBeforeJump = requests;
            drawnRows.clear();
            s.scrollTop = s.scrollHeight / 2;
            await sleep(latencyMs + 600);
            const drawn = [...drawnRows].sort((x, y) => x - y);
            grid.destroy();
            return {
                latencyMs,
                beforeLoad,
                firstCellAfterLoad: afterLoad,
                requestsBeforeJump,
                requestsAfterJump: requests - requestsBeforeJump,
                maxConcurrentRequests: inFlightMax,
                rowsDrawnAfterJump: drawn.length === 0 ? "none" : `${drawn[0]}..${drawn[drawn.length - 1]}`,
            };
        },
    };
}
