import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    esbuild: {
        jsx: "transform",
        jsxFactory: "React.createElement",
        jsxFragment: "React.Fragment",
    },
    resolve: {
        alias: [
            // the upstream test-suite runs unchanged against the internal runtime
            { find: /^react$/, replacement: r("./src/runtime/react.ts") },
            { find: /^react-dom\/test-utils$/, replacement: r("./test/shims/react-dom-test-utils.ts") },
            { find: /^@testing-library\/react$/, replacement: r("./test/shims/testing-library-react.ts") },
            { find: /^@testing-library\/react-hooks$/, replacement: r("./test/shims/testing-library-react-hooks.ts") },
            { find: /^lodash\/noop\.js$/, replacement: r("./test/shims/lodash-noop.ts") },
        ],
    },
    test: {
        include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
        environment: "jsdom",
        setupFiles: "vitest.setup.ts",
        watch: false,
        clearMocks: true,
        maxConcurrency: 8,
        fakeTimers: {
            toFake: [
                ...(configDefaults.fakeTimers.toFake ?? []),
                "performance",
                "requestAnimationFrame",
                "cancelAnimationFrame",
            ],
        },
        deps: {
            optimizer: {
                web: {
                    include: ["vitest-canvas-mock"],
                },
            },
        },
        environmentOptions: {
            jsdom: {
                resources: "usable",
            },
        },
    },
});
