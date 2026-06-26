"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var child_process = __toESM(require("child_process"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var pythonProcess = null;
var outputChannel = null;
function activate(context) {
  outputChannel = vscode.window.createOutputChannel("Plotty");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("Plotty extension activated!");
  let disposable = vscode.commands.registerCommand("plotty-ext.openPlotter", () => {
    const panel = vscode.window.createWebviewPanel(
      "plottyPlotter",
      "Plotty - Real-time Plotter",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "dist")),
          vscode.Uri.file(path.join(context.extensionPath, "src", "webview"))
        ],
        retainContextWhenHidden: true
      }
    );
    panel.webview.html = getWebviewContent(panel.webview, context);
    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "connect":
            startPlotting(message.config, panel, context);
            break;
          case "disconnect":
            stopPlotting(panel);
            break;
        }
      },
      void 0,
      context.subscriptions
    );
    panel.onDidDispose(() => {
      stopPlotting();
    }, null, context.subscriptions);
  });
  context.subscriptions.push(disposable);
}
function startPlotting(config, panel, context) {
  stopPlotting();
  const bridgeScriptPath = path.join(context.extensionPath, "bridge.py");
  const args = [bridgeScriptPath, config.source];
  if (config.columns && config.columns.trim().length > 0) {
    const cols = config.columns.split(/[,\s]+/).map((c) => c.trim()).filter((c) => c.length > 0);
    args.push(...cols);
  } else {
    args.push("0", "1");
  }
  if (config.follow) {
    args.push("-f");
  }
  if (config.title) {
    args.push("-t");
  }
  if (config.baud && (config.source.toUpperCase().startsWith("COM") || config.source.startsWith("/dev/tty"))) {
    args.push("-b", config.baud.toString());
  }
  outputChannel?.appendLine(`Spawning Python process: python ${args.join(" ")}`);
  panel.webview.postMessage({ type: "status", value: "Connecting" });
  pythonProcess = child_process.spawn("python", args, {
    cwd: context.extensionPath,
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
  });
  let buffer = "";
  pythonProcess.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      outputChannel?.appendLine(`[Python stdout] ${line}`);
      if (line.startsWith("STATUS:")) {
        const status = line.substring(7).trim();
        panel.webview.postMessage({ type: "status", value: status });
      } else if (line.startsWith("METADATA:")) {
        try {
          const metadata = JSON.parse(line.substring(9).trim());
          panel.webview.postMessage({ type: "metadata", value: metadata });
        } catch (e) {
          outputChannel?.appendLine(`Failed to parse metadata: ${e}`);
        }
      } else if (line.startsWith("DATA:")) {
        try {
          const dataPoints = JSON.parse(line.substring(5).trim());
          panel.webview.postMessage({ type: "data", value: dataPoints });
        } catch (e) {
          outputChannel?.appendLine(`Failed to parse data: ${e}`);
        }
      } else if (line.startsWith("ERROR:")) {
        const error = line.substring(6).trim();
        panel.webview.postMessage({ type: "error", value: error });
      }
    }
  });
  pythonProcess.stderr.on("data", (data) => {
    const msg = data.toString();
    outputChannel?.appendLine(`[Python stderr] ${msg}`);
  });
  pythonProcess.on("error", (err) => {
    outputChannel?.appendLine(`Process error: ${err.message}`);
    panel.webview.postMessage({ type: "error", value: `Failed to start Python: ${err.message}. Make sure Python is installed and in your PATH.` });
  });
  pythonProcess.on("exit", (code, signal) => {
    outputChannel?.appendLine(`Process exited with code ${code}, signal ${signal}`);
    panel.webview.postMessage({ type: "status", value: "Disconnected" });
    pythonProcess = null;
  });
}
function stopPlotting(panel) {
  if (pythonProcess) {
    outputChannel?.appendLine("Terminating Python process...");
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (panel) {
    panel.webview.postMessage({ type: "status", value: "Disconnected" });
  }
}
function deactivate() {
  stopPlotting();
}
function getWebviewContent(webview, context) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, "dist", "webview.js"))
  );
  const stylesUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, "src", "webview", "style.css"))
  );
  const htmlPath = path.join(context.extensionPath, "src", "webview", "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace("${scriptUri}", `${scriptUri.toString()}?t=${Date.now()}`);
  html = html.replace("${stylesUri}", `${stylesUri.toString()}?t=${Date.now()}`);
  return html;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
