const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

async function main() {
  const extensionCtx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: minify,
    sourcemap: !minify,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ["src/webview/main.ts"],
    bundle: true,
    format: "iife",
    minify: minify,
    sourcemap: !minify,
    platform: "browser",
    outfile: "dist/webview.js",
  });

  if (watch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
    console.log("Watching for changes...");
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
    console.log("Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
