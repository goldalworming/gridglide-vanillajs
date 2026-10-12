/**
 * The handful of lodash helpers upstream depends on, with matching semantics, so the port has no lodash
 * dependency.
 */

export function clamp(n: number, lower: number, upper: number): number {
    return Math.min(Math.max(n, lower), upper);
}

export function uniq<T>(arr: readonly T[]): T[] {
    return [...new Set(arr)];
}

export function flatten<T>(arr: readonly (T | readonly T[])[]): T[] {
    const out: T[] = [];
    for (const x of arr) {
        if (Array.isArray(x)) out.push(...(x as T[]));
        else out.push(x as T);
    }
    return out;
}

/** lodash `range`: `range(end)`, `range(start, end)`, `range(start, end, step)`; counts down when start > end. */
export function range(start: number, end?: number, step?: number): number[] {
    if (end === undefined) {
        end = start;
        start = 0;
    }
    step ??= start < end ? 1 : -1;
    const length = Math.max(Math.ceil((end - start) / (step === 0 ? 1 : step)), 0);
    const out = new Array<number>(length);
    for (let i = 0; i < length; i++) {
        out[i] = start;
        start += step;
    }
    return out;
}

export function groupBy<T, K extends PropertyKey>(arr: readonly T[], fn: (x: T) => K): Record<K, T[]> {
    const out = {} as Record<K, T[]>;
    for (const x of arr) {
        const k = fn(x);
        (out[k] ??= []).push(x);
    }
    return out;
}

export function has(obj: unknown, key: PropertyKey): boolean {
    return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

export interface Cancelable {
    cancel(): void;
}

/** Trailing-edge debounce. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): ((...args: A) => void) & Cancelable {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const d = (...args: A) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            fn(...args);
        }, wait);
    };
    d.cancel = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    return d;
}

/** Leading + trailing edge throttle. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number): ((...args: A) => void) & Cancelable {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: A | undefined;
    const t = (...args: A) => {
        const now = Date.now();
        const remaining = wait - (now - last);
        if (remaining <= 0 || remaining > wait) {
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
            pending = undefined;
            last = now;
            fn(...args);
        } else {
            pending = args;
            timer ??= setTimeout(() => {
                timer = undefined;
                last = Date.now();
                if (pending !== undefined) {
                    const a = pending;
                    pending = undefined;
                    fn(...a);
                }
            }, remaining);
        }
    };
    t.cancel = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        pending = undefined;
        last = 0;
    };
    return t;
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + Math.max(1, size)));
    return out;
}

/** Stable ascending sort by a single iteratee (the only form upstream uses). */
export function orderBy<T>(arr: readonly T[], fn: (x: T) => number | string): T[] {
    return arr
        .map((x, i) => [fn(x), i, x] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))
        .map(x => x[2]);
}
