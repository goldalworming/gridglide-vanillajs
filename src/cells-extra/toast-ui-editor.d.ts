// @toast-ui/editor ships types but its package "exports" hide them from Node16 resolution; this covers what we use.
declare module "@toast-ui/editor" {
    export default class Editor {
        constructor(options: Record<string, unknown>);
        static factory(options: Record<string, unknown>): { destroy(): void };
        getMarkdown(): string;
        destroy(): void;
    }
}
