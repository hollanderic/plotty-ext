import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let pythonProcess: child_process.ChildProcessWithoutNullStreams | null = null;
let outputChannel: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("Plotty");
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine("Plotty extension activated!");

    let disposable = vscode.commands.registerCommand('plotty-ext.openPlotter', () => {
        const panel = vscode.window.createWebviewPanel(
            'plottyPlotter',
            'Plotty - Real-time Plotter',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'dist')),
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))
                ],
                retainContextWhenHidden: true
            }
        );

        // Get HTML content
        panel.webview.html = getWebviewContent(panel.webview, context);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'connect':
                        startPlotting(message.config, panel, context);
                        break;
                    case 'disconnect':
                        stopPlotting(panel);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Clean up when the panel is closed
        panel.onDidDispose(() => {
            stopPlotting();
        }, null, context.subscriptions);
    });

    context.subscriptions.push(disposable);
}

function startPlotting(config: any, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    stopPlotting(); // Ensure any existing process is stopped first

    const bridgeScriptPath = path.join(context.extensionPath, 'bridge.py');
    
    // Build arguments
    const args = [bridgeScriptPath, config.source];
    
    // Add columns
    if (config.columns && config.columns.trim().length > 0) {
        const cols = config.columns.split(/[,\s]+/).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
        args.push(...cols);
    } else {
        args.push("0", "1"); // Defaults: column 0 is X, column 1 is Y
    }

    if (config.follow) {
        args.push('-f');
    }
    if (config.title) {
        args.push('-t');
    }
    if (config.baud && (config.source.toUpperCase().startsWith("COM") || config.source.startsWith("/dev/tty"))) {
        args.push('-b', config.baud.toString());
    }

    outputChannel?.appendLine(`Spawning Python process: python ${args.join(' ')}`);
    
    panel.webview.postMessage({ type: 'status', value: 'Connecting' });

    // Spawn process. We run "python" on Windows or Unix.
    pythonProcess = child_process.spawn('python', args, {
        cwd: context.extensionPath,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let buffer = '';

    pythonProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep the last incomplete line

        for (const line of lines) {
            outputChannel?.appendLine(`[Python stdout] ${line}`);
            
            if (line.startsWith('STATUS:')) {
                const status = line.substring(7).trim();
                panel.webview.postMessage({ type: 'status', value: status });
            } else if (line.startsWith('METADATA:')) {
                try {
                    const metadata = JSON.parse(line.substring(9).trim());
                    panel.webview.postMessage({ type: 'metadata', value: metadata });
                } catch (e) {
                    outputChannel?.appendLine(`Failed to parse metadata: ${e}`);
                }
            } else if (line.startsWith('DATA:')) {
                try {
                    const dataPoints = JSON.parse(line.substring(5).trim());
                    panel.webview.postMessage({ type: 'data', value: dataPoints });
                } catch (e) {
                    outputChannel?.appendLine(`Failed to parse data: ${e}`);
                }
            } else if (line.startsWith('ERROR:')) {
                const error = line.substring(6).trim();
                panel.webview.postMessage({ type: 'error', value: error });
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        outputChannel?.appendLine(`[Python stderr] ${msg}`);
    });

    pythonProcess.on('error', (err) => {
        outputChannel?.appendLine(`Process error: ${err.message}`);
        panel.webview.postMessage({ type: 'error', value: `Failed to start Python: ${err.message}. Make sure Python is installed and in your PATH.` });
    });

    pythonProcess.on('exit', (code, signal) => {
        outputChannel?.appendLine(`Process exited with code ${code}, signal ${signal}`);
        panel.webview.postMessage({ type: 'status', value: 'Disconnected' });
        pythonProcess = null;
    });
}

function stopPlotting(panel?: vscode.WebviewPanel) {
    if (pythonProcess) {
        outputChannel?.appendLine("Terminating Python process...");
        pythonProcess.kill();
        pythonProcess = null;
    }
    if (panel) {
        panel.webview.postMessage({ type: 'status', value: 'Disconnected' });
    }
}

export function deactivate() {
    stopPlotting();
}

function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'dist', 'webview.js'))
    );

    const stylesUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'style.css'))
    );

    const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    html = html.replace('${scriptUri}', `${scriptUri.toString()}?t=${Date.now()}`);
    html = html.replace('${stylesUri}', `${stylesUri.toString()}?t=${Date.now()}`);

    return html;
}
