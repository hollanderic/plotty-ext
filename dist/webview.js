"use strict";
(() => {
  // src/webview/main.ts
  var vscode = acquireVsCodeApi();
  var sourceTypeSelect = document.getElementById("source-type");
  var sourcePathInput = document.getElementById("source-path");
  var sourcePathLabel = document.getElementById("source-path-label");
  var baudrateGroup = document.getElementById("baudrate-group");
  var baudrateSelect = document.getElementById("baudrate");
  var xColInput = document.getElementById("x-col");
  var yColsInput = document.getElementById("y-cols");
  var followCheckbox = document.getElementById("follow");
  var titleCheckbox = document.getElementById("title");
  var btnConnect = document.getElementById("btn-connect");
  var btnDisconnect = document.getElementById("btn-disconnect");
  var btnClear = document.getElementById("btn-clear");
  var btnClearConsole = document.getElementById("btn-clear-console");
  var statusDot = document.getElementById("status-dot");
  var statusText = document.getElementById("status-text");
  var plotTitle = document.getElementById("plot-title");
  var consoleOutput = document.getElementById("console-output");
  var canvas = document.getElementById("plot-canvas");
  var ctx = canvas.getContext("2d");
  var xData = [];
  var yDataList = [];
  var legendLabels = [];
  var xAxisLabel = "X";
  var isConnected = false;
  var MAX_POINTS_TO_KEEP = 1e3;
  var lineColors = [
    "#00f0ff",
    // Neon Cyan
    "#39ff14",
    // Neon Green
    "#ff007f",
    // Neon Pink
    "#ffff00",
    // Neon Yellow
    "#b026ff",
    // Neon Purple
    "#ff5e00",
    // Neon Orange
    "#00ffe0"
    // Neon Mint
  ];
  sourceTypeSelect.addEventListener("change", () => {
    const type = sourceTypeSelect.value;
    if (type === "serial") {
      sourcePathLabel.textContent = "Serial Port / Device";
      sourcePathInput.placeholder = "e.g. COM3 or /dev/ttyUSB0";
      sourcePathInput.value = "COM3";
      baudrateGroup.style.display = "flex";
    } else if (type === "socket") {
      sourcePathLabel.textContent = "TCP Socket Server";
      sourcePathInput.placeholder = "e.g. localhost:9000";
      sourcePathInput.value = "localhost:9000";
      baudrateGroup.style.display = "none";
    } else if (type === "file") {
      sourcePathLabel.textContent = "Local File Path";
      sourcePathInput.placeholder = "e.g. telemetry.csv";
      sourcePathInput.value = "test.csv";
      baudrateGroup.style.display = "none";
    } else if (type === "url") {
      sourcePathLabel.textContent = "HTTP/HTTPS URL";
      sourcePathInput.placeholder = "e.g. http://example.com/data.csv";
      sourcePathInput.value = "http://localhost:8000/data.csv";
      baudrateGroup.style.display = "none";
    } else if (type === "ssh") {
      sourcePathLabel.textContent = "SSH Remote (user@host:path)";
      sourcePathInput.placeholder = "e.g. pi@192.168.1.100:telemetry.csv";
      sourcePathInput.value = "pi@localhost:telemetry.csv";
      baudrateGroup.style.display = "none";
    }
  });
  btnClear.addEventListener("click", () => {
    clearPlotData();
    logConsole("Plot data cleared.", "system");
  });
  btnClearConsole.addEventListener("click", () => {
    consoleOutput.innerHTML = "";
  });
  btnConnect.addEventListener("click", () => {
    const source = sourcePathInput.value.trim();
    if (!source) {
      logConsole("Error: Source cannot be empty.", "error");
      return;
    }
    const yColsVal = yColsInput.value.trim();
    if (!yColsVal) {
      logConsole("Error: Y columns cannot be empty.", "error");
      return;
    }
    const config = {
      source,
      baud: parseInt(baudrateSelect.value) || 115200,
      columns: xColInput.value + " " + yColsVal,
      follow: followCheckbox.checked,
      title: titleCheckbox.checked
    };
    logConsole(`Connecting to ${source}...`, "system");
    vscode.postMessage({
      command: "connect",
      config
    });
  });
  btnDisconnect.addEventListener("click", () => {
    logConsole("Disconnecting...", "system");
    vscode.postMessage({
      command: "disconnect"
    });
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "status":
        updateStatus(message.value);
        break;
      case "metadata":
        handleMetadata(message.value);
        break;
      case "data":
        handleData(message.value);
        break;
      case "error":
        logConsole(`Error: ${message.value}`, "error");
        updateStatus("Error", message.value);
        break;
    }
  });
  function updateStatus(status, details) {
    statusDot.className = "status-dot";
    statusText.textContent = status;
    if (status === "Connected") {
      statusDot.classList.add("connected");
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      isConnected = true;
      logConsole("Connected to data source successfully.", "system");
      plotTitle.textContent = `${sourceTypeSelect.value.toUpperCase()}: ${sourcePathInput.value}`;
    } else if (status === "Connecting") {
      statusDot.classList.add("connecting");
      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      plotTitle.textContent = "Establishing Connection...";
    } else if (status === "Disconnected") {
      statusDot.classList.add("disconnected");
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      isConnected = false;
      logConsole("Disconnected.", "system");
    } else if (status === "Error") {
      statusDot.classList.add("error");
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      isConnected = false;
      if (details) {
        plotTitle.textContent = `Error: ${details}`;
      } else {
        plotTitle.textContent = "Connection Error";
      }
    }
  }
  function handleMetadata(metadata) {
    legendLabels = metadata.labels;
    xAxisLabel = metadata.x_label;
    logConsole(`Header metadata received. Columns: ${metadata.labels.join(", ")}. X-Axis: ${metadata.x_label}`, "system");
    yDataList = Array.from({ length: legendLabels.length }, () => []);
    xData = [];
    drawPlot();
  }
  function handleData(row) {
    if (row.length < 2)
      return;
    const xVal = row[0];
    const yVals = row.slice(1);
    if (yDataList.length !== yVals.length) {
      yDataList = Array.from({ length: yVals.length }, () => []);
      legendLabels = yVals.map((_, i) => `Col ${i + 1}`);
    }
    xData.push(xVal);
    yVals.forEach((val, index) => {
      if (index < yDataList.length) {
        yDataList[index].push(val);
      }
    });
    if (followCheckbox.checked && xData.length > MAX_POINTS_TO_KEEP) {
      xData.shift();
      yDataList.forEach((arr) => arr.shift());
    }
    const csvLine = row.join(", ");
    logConsole(csvLine, "data");
    requestAnimationFrame(drawPlot);
  }
  function logConsole(text, type = "data") {
    const line = document.createElement("div");
    line.className = `log-line ${type}`;
    line.textContent = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] ${text}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    while (consoleOutput.childNodes.length > 200) {
      consoleOutput.removeChild(consoleOutput.firstChild);
    }
  }
  function clearPlotData() {
    xData = [];
    yDataList = yDataList.map(() => []);
    drawPlot();
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    drawPlot();
  }
  window.addEventListener("resize", resizeCanvas);
  setTimeout(resizeCanvas, 100);
  function drawPlot() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = "#090a0f";
    ctx.fillRect(0, 0, width, height);
    const margin = { top: 30, right: 30, bottom: 45, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    if (chartWidth <= 0 || chartHeight <= 0)
      return;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, chartWidth, chartHeight);
    if (xData.length === 0) {
      ctx.fillStyle = "#8c8f9f";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      ctx.fillText(isConnected ? "Waiting for data..." : "Connect to a data source to begin plotting", width / 2, height / 2);
      return;
    }
    let minX = Math.min(...xData);
    let maxX = Math.max(...xData);
    let minY = Infinity;
    let maxY = -Infinity;
    yDataList.forEach((arr) => {
      if (arr.length > 0) {
        minY = Math.min(minY, ...arr);
        maxY = Math.max(maxY, ...arr);
      }
    });
    if (minY === Infinity)
      minY = -1;
    if (maxY === -Infinity)
      maxY = 1;
    if (maxX === minX) {
      minX -= 1;
      maxX += 1;
    }
    if (maxY === minY) {
      minY -= 1;
      maxY += 1;
    }
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const padY = yRange * 0.05;
    minY -= padY;
    maxY += padY;
    const paddedYRange = maxY - minY;
    const getXPixel = (val) => margin.left + (val - minX) / xRange * chartWidth;
    const getYPixel = (val) => margin.top + chartHeight - (val - minY) / paddedYRange * chartHeight;
    const numGridLines = 5;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#8c8f9f";
    ctx.font = "10px JetBrains Mono";
    for (let i = 0; i <= numGridLines; i++) {
      const pct = i / numGridLines;
      const yVal = minY + pct * paddedYRange;
      const py = getYPixel(yVal);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.moveTo(margin.left, py);
      ctx.lineTo(width - margin.right, py);
      ctx.stroke();
      ctx.fillText(yVal.toFixed(2), margin.left - 8, py);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= numGridLines; i++) {
      const pct = i / numGridLines;
      const xVal = minX + pct * xRange;
      const px = getXPixel(xVal);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.moveTo(px, margin.top);
      ctx.lineTo(px, height - margin.bottom);
      ctx.stroke();
      ctx.fillText(xVal.toFixed(2), px, height - margin.bottom + 6);
    }
    ctx.fillStyle = "#e0e0e8";
    ctx.font = "11px Inter";
    ctx.textAlign = "center";
    ctx.fillText(xAxisLabel, margin.left + chartWidth / 2, height - 15);
    ctx.save();
    ctx.translate(15, margin.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Values", 0, 0);
    ctx.restore();
    yDataList.forEach((yArr, lineIndex) => {
      if (yArr.length < 2)
        return;
      const strokeColor = lineColors[lineIndex % lineColors.length];
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.moveTo(getXPixel(xData[0]), getYPixel(yArr[0]));
      for (let idx = 1; idx < xData.length; idx++) {
        ctx.lineTo(getXPixel(xData[idx]), getYPixel(yArr[idx]));
      }
      ctx.stroke();
      ctx.restore();
    });
    if (legendLabels.length > 0) {
      ctx.font = "10px Inter";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let legendX = margin.left + 15;
      let legendY = margin.top + 15;
      legendLabels.forEach((label, lineIndex) => {
        const color = lineColors[lineIndex % lineColors.length];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(legendX, legendY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e0e0e8";
        ctx.fillText(label, legendX + 10, legendY);
        legendY += 16;
      });
    }
  }
})();
//# sourceMappingURL=webview.js.map
