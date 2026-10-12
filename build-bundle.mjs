// Ready-to-use bundles (dependencies inlined) for <script> / CDN usage. The npm entry is the tsc output in dist/esm.
// The core, cells and source entries must share one runtime instance, hence code splitting for ESM and a single
// combined entry for the IIFE build.
import { build } from "esbuild";

const common = {
    bundle: true,
    minify: true,
    sourcemap: true,
    target: "es2020",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    define: { "process.env.NODE_ENV": '"production"' },
    // the article cell loads Toast UI Editor on demand; it is an optional peer dependency
    external: ["@toast-ui/editor"],
    logLevel: "info",
};

await Promise.all([
    build({
        ...common,
        entryPoints: { index: "src/index.ts", cells: "src/cells-extra/index.ts", source: "src/source/index.ts" },
        format: "esm",
        splitting: true,
        outdir: "dist/bundle",
        chunkNames: "chunks/[name]-[hash]",
    }),
    build({
        ...common,
        entryPoints: ["src/bundle-iife.ts"],
        format: "iife",
        globalName: "GlideGrid",
        outfile: "dist/gridglide.iife.js",
    }),
]);
