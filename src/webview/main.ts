// @ts-ignore
const vscode = acquireVsCodeApi();

// UI Elements
const sourceTypeSelect = document.getElementById('source-type') as HTMLSelectElement;
const sourcePathInput = document.getElementById('source-path') as HTMLInputElement;
const sourcePathLabel = document.getElementById('source-path-label') as HTMLLabelElement;
const baudrateGroup = document.getElementById('baudrate-group') as HTMLDivElement;
const baudrateSelect = document.getElementById('baudrate') as HTMLSelectElement;
const xColInput = document.getElementById('x-col') as HTMLInputElement;
const yColsInput = document.getElementById('y-cols') as HTMLInputElement;
const followCheckbox = document.getElementById('follow') as HTMLInputElement;
const titleCheckbox = document.getElementById('title') as HTMLInputElement;
const autorangeXCheckbox = document.getElementById('autorange-x') as HTMLInputElement;
const xSpanGroup = document.getElementById('x-span-group') as HTMLDivElement;
const xSpanInput = document.getElementById('x-span') as HTMLInputElement;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnClearConsole = document.getElementById('btn-clear-console') as HTMLButtonElement;
const statusDot = document.getElementById('status-dot') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const plotTitle = document.getElementById('plot-title') as HTMLDivElement;
const consoleOutput = document.getElementById('console-output') as HTMLDivElement;
const canvas = document.getElementById('plot-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Plot Data State
let xData: number[] = [];
let yDataList: number[][] = []; // Array of arrays for multiple Y lines
let legendLabels: string[] = [];
let xAxisLabel = 'X';
let isConnected = false;

const MAX_POINTS_TO_KEEP = 1000; // Limits memory consumption during follow mode

// Color palette for Y columns
const lineColors = [
    '#00f0ff', // Neon Cyan
    '#39ff14', // Neon Green
    '#ff007f', // Neon Pink
    '#ffff00', // Neon Yellow
    '#b026ff', // Neon Purple
    '#ff5e00', // Neon Orange
    '#00ffe0', // Neon Mint
];

// Handle Source Type Dropdown Changes
sourceTypeSelect.addEventListener('change', () => {
    const type = sourceTypeSelect.value;
    
    // Default config values and placeholders based on selected source type
    if (type === 'serial') {
        sourcePathLabel.textContent = 'Serial Port / Device';
        sourcePathInput.placeholder = 'e.g. COM3 or /dev/ttyUSB0';
        sourcePathInput.value = 'COM3';
        baudrateGroup.style.display = 'flex';
    } else if (type === 'socket') {
        sourcePathLabel.textContent = 'TCP Socket Server';
        sourcePathInput.placeholder = 'e.g. localhost:9000';
        sourcePathInput.value = 'localhost:9000';
        baudrateGroup.style.display = 'none';
    } else if (type === 'file') {
        sourcePathLabel.textContent = 'Local File Path';
        sourcePathInput.placeholder = 'e.g. telemetry.csv';
        sourcePathInput.value = 'test.csv';
        baudrateGroup.style.display = 'none';
    } else if (type === 'url') {
        sourcePathLabel.textContent = 'HTTP/HTTPS URL';
        sourcePathInput.placeholder = 'e.g. http://example.com/data.csv';
        sourcePathInput.value = 'http://localhost:8000/data.csv';
        baudrateGroup.style.display = 'none';
    } else if (type === 'ssh') {
        sourcePathLabel.textContent = 'SSH Remote (user@host:path)';
        sourcePathInput.placeholder = 'e.g. pi@192.168.1.100:telemetry.csv';
        sourcePathInput.value = 'pi@localhost:telemetry.csv';
        baudrateGroup.style.display = 'none';
    }
});

// Clear Data Plot
btnClear.addEventListener('click', () => {
    clearPlotData();
    logConsole('Plot data cleared.', 'system');
});

// Clear Console Logs
btnClearConsole.addEventListener('click', () => {
    consoleOutput.innerHTML = '';
});

// Auto-range X Axis toggling
autorangeXCheckbox.addEventListener('change', () => {
    if (autorangeXCheckbox.checked) {
        xSpanGroup.style.display = 'none';
    } else {
        xSpanGroup.style.display = 'flex';
    }
    drawPlot();
});

// X-span input changes
xSpanInput.addEventListener('input', () => {
    drawPlot();
});

// Connect Action
btnConnect.addEventListener('click', () => {
    const source = sourcePathInput.value.trim();
    if (!source) {
        logConsole('Error: Source cannot be empty.', 'error');
        return;
    }

    const yColsVal = yColsInput.value.trim();
    if (!yColsVal) {
        logConsole('Error: Y columns cannot be empty.', 'error');
        return;
    }

    // Set connection configuration
    const config = {
        source: source,
        baud: parseInt(baudrateSelect.value) || 115200,
        columns: xColInput.value + ' ' + yColsVal,
        follow: followCheckbox.checked,
        title: titleCheckbox.checked
    };

    logConsole(`Connecting to ${source}...`, 'system');
    vscode.postMessage({
        command: 'connect',
        config: config
    });
});

// Disconnect Action
btnDisconnect.addEventListener('click', () => {
    logConsole('Disconnecting...', 'system');
    vscode.postMessage({
        command: 'disconnect'
    });
});

// Listen for messages from extension backend
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case 'status':
            updateStatus(message.value);
            break;
            
        case 'metadata':
            handleMetadata(message.value);
            break;
            
        case 'data':
            handleData(message.value);
            break;
            
        case 'error':
            logConsole(`Error: ${message.value}`, 'error');
            updateStatus('Error', message.value);
            break;
    }
});

// Update connection status display
function updateStatus(status: string, details?: string) {
    statusDot.className = 'status-dot';
    statusText.textContent = status;

    if (status === 'Connected') {
        statusDot.classList.add('connected');
        btnConnect.disabled = true;
        btnDisconnect.disabled = false;
        isConnected = true;
        logConsole('Connected to data source successfully.', 'system');
        
        // Show current source in title bar
        plotTitle.textContent = `${sourceTypeSelect.value.toUpperCase()}: ${sourcePathInput.value}`;
    } else if (status === 'Connecting') {
        statusDot.classList.add('connecting');
        btnConnect.disabled = true;
        btnDisconnect.disabled = false;
        plotTitle.textContent = 'Establishing Connection...';
    } else if (status === 'Disconnected') {
        statusDot.classList.add('disconnected');
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
        isConnected = false;
        logConsole('Disconnected.', 'system');
    } else if (status === 'Error') {
        statusDot.classList.add('error');
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
        isConnected = false;
        if (details) {
            plotTitle.textContent = `Error: ${details}`;
        } else {
            plotTitle.textContent = 'Connection Error';
        }
    }
}

// Initialize Labels from Header Metadata
function handleMetadata(metadata: { labels: string[], x_label: string }) {
    legendLabels = metadata.labels;
    xAxisLabel = metadata.x_label;
    
    logConsole(`Header metadata received. Columns: ${metadata.labels.join(', ')}. X-Axis: ${metadata.x_label}`, 'system');
    
    // Initialize data storage arrays based on the number of Y columns
    yDataList = Array.from({ length: legendLabels.length }, () => []);
    xData = [];
    
    drawPlot();
}

// Receive Real-time Data Point
function handleData(row: number[]) {
    if (row.length < 2) return;
    
    const xVal = row[0];
    const yVals = row.slice(1);
    
    // Auto-initialize yDataList if it has not been done by metadata yet
    if (yDataList.length !== yVals.length) {
        yDataList = Array.from({ length: yVals.length }, () => []);
        legendLabels = yVals.map((_, i) => `Col ${i + 1}`);
    }
    
    // Add point to array
    xData.push(xVal);
    yVals.forEach((val, index) => {
        if (index < yDataList.length) {
            yDataList[index].push(val);
        }
    });
    
    // Keep max size to prevent performance degradation in follow mode
    if (followCheckbox.checked && xData.length > MAX_POINTS_TO_KEEP) {
        xData.shift();
        yDataList.forEach(arr => arr.shift());
    }
    
    // Log incoming csv line string to console
    const csvLine = row.join(', ');
    logConsole(csvLine, 'data');
    
    // Schedule render
    requestAnimationFrame(drawPlot);
}

// Append log to console component
function logConsole(text: string, type: 'system' | 'error' | 'data' = 'data') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    
    consoleOutput.appendChild(line);
    
    // Auto scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    
    // Cap log lines to 200 items
    while (consoleOutput.childNodes.length > 200) {
        consoleOutput.removeChild(consoleOutput.firstChild!);
    }
}

// Reset plot state
function clearPlotData() {
    xData = [];
    yDataList = yDataList.map(() => []);
    drawPlot();
}

// Setup canvas bounds
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Re-draw
    drawPlot();
}

window.addEventListener('resize', resizeCanvas);
// Run initial resize to compute bounds
setTimeout(resizeCanvas, 100);

// Canvas Drawing Routine
function drawPlot() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    // Clear background
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, width, height);
    
    const margin = { top: 30, right: 30, bottom: 45, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    if (chartWidth <= 0 || chartHeight <= 0) return;
    
    // 1. Draw Grid Outline & Margins
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, chartWidth, chartHeight);
    
    if (xData.length === 0) {
        // Draw waiting prompt
        ctx.fillStyle = '#8c8f9f';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(isConnected ? 'Waiting for data...' : 'Connect to a data source to begin plotting', width / 2, height / 2);
        return;
    }
    
    // 2. Compute min/max for auto-scaling
    let minX = 0;
    let maxX = 0;
    if (autorangeXCheckbox.checked) {
        minX = Math.min(...xData);
        maxX = Math.max(...xData);
    } else {
        const span = parseFloat(xSpanInput.value) || 100;
        maxX = Math.max(...xData);
        minX = maxX - span;
    }
    
    let minY = Infinity;
    let maxY = -Infinity;
    
    yDataList.forEach(arr => {
        if (arr.length > 0) {
            minY = Math.min(minY, ...arr);
            maxY = Math.max(maxY, ...arr);
        }
    });
    
    if (minY === Infinity) minY = -1;
    if (maxY === -Infinity) maxY = 1;
    
    // Add padding to scales to keep lines from clipping
    if (maxX === minX) { minX -= 1; maxX += 1; }
    if (maxY === minY) { minY -= 1; maxY += 1; }
    
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    
    // Extra padding factor
    const padY = yRange * 0.05;
    minY -= padY;
    maxY += padY;
    
    const paddedYRange = maxY - minY;
    
    // Helper to map values to canvas pixels
    const getXPixel = (val: number) => margin.left + ((val - minX) / xRange) * chartWidth;
    const getYPixel = (val: number) => margin.top + chartHeight - ((val - minY) / paddedYRange) * chartHeight;
    
    // 3. Draw Grid Lines & Labels
    const numGridLines = 5;
    
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8c8f9f';
    ctx.font = '10px JetBrains Mono';
    
    // Horizontal Gridlines & Y axis labels
    for (let i = 0; i <= numGridLines; i++) {
        const pct = i / numGridLines;
        const yVal = minY + pct * paddedYRange;
        const py = getYPixel(yVal);
        
        // Draw gridline
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.moveTo(margin.left, py);
        ctx.lineTo(width - margin.right, py);
        ctx.stroke();
        
        // Draw Y label
        ctx.fillText(yVal.toFixed(2), margin.left - 8, py);
    }
    
    // Vertical Gridlines & X axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= numGridLines; i++) {
        const pct = i / numGridLines;
        const xVal = minX + pct * xRange;
        const px = getXPixel(xVal);
        
        // Draw gridline
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.moveTo(px, margin.top);
        ctx.lineTo(px, height - margin.bottom);
        ctx.stroke();
        
        // Draw X label
        ctx.fillText(xVal.toFixed(2), px, height - margin.bottom + 6);
    }
    
    // 4. Axis Labels
    ctx.fillStyle = '#e0e0e8';
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    // X Label
    ctx.fillText(xAxisLabel, margin.left + chartWidth / 2, height - 15);
    
    // Y Label (Rotated)
    ctx.save();
    ctx.translate(15, margin.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Values', 0, 0);
    ctx.restore();
    
    // 5. Draw Lines with Neon Glow Effects!
    ctx.save();
    // Create a clipping path to restrict drawing to the grid area
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, chartWidth, chartHeight);
    ctx.clip();

    yDataList.forEach((yArr, lineIndex) => {
        if (yArr.length < 2) return;
        
        const strokeColor = lineColors[lineIndex % lineColors.length];
        
        ctx.save();
        ctx.beginPath();
        
        // Neon Glow effect path styling
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Draw lines
        ctx.moveTo(getXPixel(xData[0]), getYPixel(yArr[0]));
        for (let idx = 1; idx < xData.length; idx++) {
            ctx.lineTo(getXPixel(xData[idx]), getYPixel(yArr[idx]));
        }
        ctx.stroke();
        ctx.restore();
    });
    ctx.restore();
    
    // 6. Draw Legend
    if (legendLabels.length > 0) {
        ctx.font = '10px Inter';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        let legendX = margin.left + 15;
        let legendY = margin.top + 15;
        
        legendLabels.forEach((label, lineIndex) => {
            const color = lineColors[lineIndex % lineColors.length];
            
            // Draw color dot
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(legendX, legendY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw text
            ctx.fillStyle = '#e0e0e8';
            ctx.fillText(label, legendX + 10, legendY);
            
            // Increment Y position for next item
            legendY += 16;
        });
    }
}
