#!/usr/bin/env node
/**
 * Brings upstream Glide Data Grid changes into this port.
 *
 *   node scripts/sync-upstream.mjs [ref] [--dry-run] [--test] [--base <sha>]
 *   node scripts/sync-upstream.mjs --status     # which port files differ from (transformed) upstream at base
 *
 * For every upstream file that changed between the commit recorded in upstream.json ("base") and `ref`
 * (default: main), both upstream versions are first put through the same transformation the port applied
 * (path mapping + import rewriting). The result is then three-way merged into our file with `git merge-file`, so
 * local changes are kept and only real collisions get conflict markers. See SYNCING.md.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CACHE = process.env.UPSTREAM_CACHE ?? path.join(ROOT, ".upstream");
const STATE = path.join(ROOT, "upstream.json");

// ---------------------------------------------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = name => {
    const i = args.indexOf(name);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
};
const option = name => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};
const dryRun = flag("--dry-run");
const statusOnly = flag("--status");
const runTests = flag("--test");
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const baseRef = option("--base") ?? state.commit;
const targetRef = args[0] ?? "main";

// ---------------------------------------------------------------------------------------------------------------
// upstream access
// ---------------------------------------------------------------------------------------------------------------

const git = (...a) => execFileSync("git", ["-C", CACHE, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });

function ensureClone() {
    if (!fs.existsSync(path.join(CACHE, ".git"))) {
        console.log(`cloning ${state.repository} into .upstream/ (blobless) ...`);
        execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", state.repository, CACHE], { stdio: "inherit" });
    } else {
        git("fetch", "--quiet", "origin");
    }
}

function resolve(ref) {
    for (const candidate of [`origin/${ref}`, ref]) {
        try {
            return git("rev-parse", "--verify", "--quiet", `${candidate}^{commit}`).trim();
        } catch {
            // try next
        }
    }
    throw new Error(`cannot resolve upstream ref "${ref}"`);
}

const show = (sha, file) => git("show", `${sha}:${file}`);

// ---------------------------------------------------------------------------------------------------------------
// the port's transformation: upstream path -> our path, and import rewriting
// ---------------------------------------------------------------------------------------------------------------

/** Maps an upstream path to the port's path, or undefined if the file is not part of the port. */
function mapPath(up) {
    const skip = /(^|\/)(docs|stories)\/|\.stories\.tsx$/;
    if (skip.test(up)) return undefined;
    let m;
    if ((m = /^packages\/core\/src\/(.+\.tsx?)$/.exec(up))) return m[1] === "index.ts" ? "src/component-api.ts" : `src/${m[1]}`;
    if ((m = /^packages\/core\/test\/(.+\.tsx?)$/.exec(up))) return `test/${m[1]}`;
    if ((m = /^packages\/cells\/src\/(.+\.tsx?)$/.exec(up))) return `src/cells-extra/${m[1]}`;
    if ((m = /^packages\/cells\/test\/(.+\.tsx?)$/.exec(up))) return `test/cells-extra/${m[1]}`;
    if ((m = /^packages\/source\/src\/(.+\.tsx?)$/.exec(up))) return `src/source/${m[1]}`;
    if ((m = /^packages\/source\/test\/(.+\.tsx?)$/.exec(up))) return `test/source/${m[1]}`;
    return undefined;
}

/** Relative import specifier from `file` (repo-relative) to `target` (repo-relative). */
function rel(file, target) {
    const r = path.posix.relative(path.posix.dirname(file), target);
    return r.startsWith(".") ? r : `./${r}`;
}

function transform(content, file) {
    let s = content.replace(/\r\n/g, "\n");
    if (file.startsWith("src/")) {
        const runtime = rel(file, "src/runtime/react.js");
        s = s.replace(/import React from "react";/g, `import * as React from "${runtime}";`);
        s = s.replace(/import type React from "react";/g, `import type * as React from "${runtime}";`);
        s = s.replace(/from "react";/g, `from "${runtime}";`);
        s = s.replace(/from "react-dom";/g, `from "${runtime}";`);
        s = s.replace(/from "@linaria\/(react|core)";/g, `from "${rel(file, "src/runtime/styled.js")}";`);
        s = s.replace(/from "@glideapps\/glide-data-grid";/g, `from "${rel(file, "src/component-api.js")}";`);
        s = s.replace(/import (\w+) from "lodash\/(\w+)\.js";/g, (_, name, fn) => {
            const what = fn === name ? fn : `${fn} as ${name}`;
            return `import { ${what} } from "${rel(file, "src/common/lodash.js")}";`;
        });
        // the old package index is src/component-api.ts in the port (src/index.ts is the vanilla API)
        s = s.replace(/from "((?:\.\.?\/)+)index\.js";/g, (all, dots) => {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${dots}index.js`));
            return target === "src/index.js" ? `from "${rel(file, "src/component-api.js")}";` : all;
        });
    } else if (file.startsWith("test/cells-extra/")) {
        s = s.replace(/"\.\.\/src\/cells\//g, '"../../src/cells-extra/cells/');
        s = s.replace(/from "@glideapps\/glide-data-grid";/g, 'from "../../src/component-api.js";');
    } else if (file.startsWith("test/source/")) {
        s = s.replace(/"\.\.\/src\//g, '"../../src/source/');
        s = s.replace(/from "@glideapps\/glide-data-grid";/g, 'from "../../src/component-api.js";');
    } else if (file.startsWith("test/")) {
        s = s.replace(/"\.\.\/src\/index\.js"/g, '"../src/component-api.js"');
    }
    return s;
}

// ---------------------------------------------------------------------------------------------------------------
// checks that point at work a merge cannot do
// ---------------------------------------------------------------------------------------------------------------

const runtimeExports = new Set(
    [...fs.readFileSync(path.join(ROOT, "src/runtime/react.ts"), "utf8").matchAll(/export (?:function|const|type|interface|namespace|class) (\w+)/g)].map(m => m[1])
);
const knownPackages = new Set(["canvas-hypertxt", "marked", "@toast-ui/editor", "vitest", "react", "react-dom/test-utils", "lodash/noop.js", "@testing-library/react", "@testing-library/react-hooks", "@testing-library/user-event", "@testing-library/dom"]);

function attention(content, file) {
    const notes = [];
    const missing = new Set();
    for (const m of content.matchAll(/\bReact\.(\w+)/g)) if (!runtimeExports.has(m[1])) missing.add(m[1]);
    for (const m of content.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"[^"]*runtime\/react\.js"/g)) {
        for (const name of m[1].split(",").map(x => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean)) {
            if (!runtimeExports.has(name)) missing.add(name);
        }
    }
    if (missing.size > 0) notes.push(`uses React API missing from src/runtime/react.ts: ${[...missing].join(", ")}`);
    for (const m of content.matchAll(/from "([^".][^"]*)"/g)) {
        if (!knownPackages.has(m[1])) notes.push(`imports unported package "${m[1]}"`);
    }
    if (/\bclass \w+ extends React\.(Pure)?Component\b/.test(content)) notes.push("class component (convert to a function component)");
    if (/process\.env/.test(content)) notes.push("uses process.env (use isDevMode() from common/support.js)");
    if (file.startsWith("src/") && /provideEditor[^\n]*=>\s*(\(?p\)?\s*=>|\(\{)/.test(content) && !/runtimeEditor/.test(content)) {
        notes.push("editor component not wrapped in runtimeEditor()");
    }
    return notes;
}

// ---------------------------------------------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------------------------------------------

ensureClone();
const base = resolve(baseRef);

if (statusOnly) {
    // Lists the port's local modifications: files whose content differs from transformed upstream at base.
    const files = git("ls-tree", "-r", "--name-only", base, "--", "packages/core", "packages/cells", "packages/source")
        .trim()
        .split("\n");
    let identical = 0;
    const modified = [];
    const missing = [];
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gdg-status-"));
    for (const up of files) {
        const ours = mapPath(up);
        if (ours === undefined) continue;
        const abs = path.join(ROOT, ours);
        if (!fs.existsSync(abs)) {
            missing.push(ours);
            continue;
        }
        const a = path.join(tmpDir, "a");
        fs.writeFileSync(a, transform(show(base, up), ours));
        const r = spawnSync("git", ["diff", "--no-index", "--numstat", "--ignore-cr-at-eol", a, abs], { encoding: "utf8" });
        const line = r.stdout.trim();
        if (line === "") identical++;
        else {
            const [add, del] = line.split("\t");
            modified.push([ours, +add + +del]);
        }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`base ${base.slice(0, 7)}: ${identical} files identical to transformed upstream\n`);
    console.log(`locally modified (${modified.length}), lines changed:`);
    for (const [f, n] of modified.sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
    if (missing.length > 0) console.log(`\nnot in the port (${missing.length}):\n  ${missing.join("\n  ")}`);
    process.exit(0);
}

const target = resolve(targetRef);
console.log(`upstream ${state.repository}\n  base   ${base}\n  target ${target}${dryRun ? "  (dry run)" : ""}\n`);
if (base === target) {
    console.log("Already up to date.");
    process.exit(0);
}

const changes = git("diff", "--name-status", "--no-renames", base, target, "--", "packages/core", "packages/cells", "packages/source")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => line.split("\t"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gdg-sync-"));
const report = { merged: [], conflicts: [], added: [], deleted: [], kept: [], attention: [], ignored: [] };

for (const [status, up] of changes) {
    const ours = mapPath(up);
    if (ours === undefined) {
        report.ignored.push(up);
        continue;
    }
    const oursAbs = path.join(ROOT, ours);
    const exists = fs.existsSync(oursAbs);
    const baseText = status === "A" ? "" : transform(show(base, up), ours);
    const theirText = status === "D" ? undefined : transform(show(target, up), ours);

    if (theirText !== undefined) {
        // only report what upstream newly introduced; what was already there has been ported
        const before = new Set(attention(baseText, ours));
        const notes = attention(theirText, ours).filter(n => !before.has(n));
        if (notes.length > 0) report.attention.push([ours, notes]);
    }

    if (status === "D") {
        if (!exists) continue;
        const current = fs.readFileSync(oursAbs, "utf8").replace(/\r\n/g, "\n");
        if (current === baseText) {
            if (!dryRun) fs.rmSync(oursAbs);
            report.deleted.push(ours);
        } else {
            report.kept.push(`${ours} (deleted upstream, but changed here: decide by hand)`);
        }
        continue;
    }

    if (!exists) {
        if (status === "A") {
            if (!dryRun) {
                fs.mkdirSync(path.dirname(oursAbs), { recursive: true });
                fs.writeFileSync(oursAbs, theirText);
            }
            report.added.push(ours);
        } else {
            report.kept.push(`${ours} (removed from the port, changed upstream: check ${up})`);
        }
        continue;
    }

    const files = ["ours", "base", "theirs"].map(n => path.join(tmp, n));
    fs.writeFileSync(files[0], fs.readFileSync(oursAbs, "utf8").replace(/\r\n/g, "\n"));
    fs.writeFileSync(files[1], baseText);
    fs.writeFileSync(files[2], theirText);
    const r = spawnSync(
        "git",
        ["merge-file", "-p", "-L", "port", "-L", `upstream ${base.slice(0, 7)}`, "-L", `upstream ${target.slice(0, 7)}`, ...files],
        { encoding: "utf8", maxBuffer: 1 << 28 }
    );
    if (r.status < 0 || r.status === null) throw new Error(`git merge-file failed for ${ours}: ${r.stderr}`);
    if (!dryRun) fs.writeFileSync(oursAbs, r.stdout);
    (r.status === 0 ? report.merged : report.conflicts).push(r.status === 0 ? ours : `${ours} (${r.status} conflict${r.status > 1 ? "s" : ""})`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------------------------

const section = (title, items, fmt = x => x) => {
    if (items.length === 0) return;
    console.log(`${title} (${items.length})`);
    for (const i of items) console.log(`  ${fmt(i)}`);
    console.log("");
};
section("merged cleanly", report.merged);
section("CONFLICTS: resolve the <<<<<<< markers", report.conflicts);
section("added", report.added);
section("deleted", report.deleted);
section("needs a decision", report.kept);
section("NEEDS PORTING WORK", report.attention, ([f, n]) => `${f}\n      - ${n.join("\n      - ")}`);
section("ignored (not part of the port)", report.ignored);

if (!dryRun) {
    fs.writeFileSync(STATE, JSON.stringify({ ...state, commit: target, syncedAt: new Date().toISOString().slice(0, 10) }, null, 4) + "\n");
    console.log(`upstream.json now points at ${target.slice(0, 7)}.`);
}

if (runTests && !dryRun) {
    console.log("\nrunning typecheck and tests ...");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const ok = [["run", "typecheck"], ["test"]].every(
        a => spawnSync(npm, a, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }).status === 0
    );
    process.exitCode = ok ? 0 : 1;
}

if (report.conflicts.length > 0 || report.attention.length > 0) process.exitCode = 1;
