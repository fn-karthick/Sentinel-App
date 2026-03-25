/************************************************************
 * SENTINEL DASHBOARD - app.js
 * Technologies:
 * - Firebase Auth
 * - Firebase Realtime Database
 * - Chart.js
 * - PapaParse
 * - Vanilla JavaScript
 ************************************************************/

/* =========================================================
   1) FIREBASE CONFIG SECTION
========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCeCnHkXqYrtoRm6jmCGdVOkbhyDB-y3yg",
  authDomain: "sentinel-dashboard-66313.firebaseapp.com",
  databaseURL: "https://sentinel-dashboard-66313-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sentinel-dashboard-66313",
  storageBucket: "sentinel-dashboard-66313.firebasestorage.app",
  messagingSenderId: "30369605006",
  appId: "1:30369605006:web:4d9b96179b432bdc7eb0df"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

/* =========================================================
   2) DOM REFERENCES
========================================================= */
// Pages
const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");

// Auth elements
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authMessage = document.getElementById("authMessage");
const logoutBtn = document.getElementById("logoutBtn");

// Summary cards
const tempValue = document.getElementById("tempValue");
const humidityValue = document.getElementById("humidityValue");
const gasStatusValue = document.getElementById("gasStatusValue");
const anomalyValue = document.getElementById("anomalyValue");
const lastUpdateValue = document.getElementById("lastUpdateValue");
const liveBadge = document.getElementById("liveBadge");
const latestPestValue = document.getElementById("latestPestValue");

// Tables
const historyTableBody = document.getElementById("historyTableBody");
const pestTableBody = document.getElementById("pestTableBody");

// CSV
const csvFileInput = document.getElementById("csvFileInput");
const uploadCsvBtn = document.getElementById("uploadCsvBtn");
const csvMessage = document.getElementById("csvMessage");

/* =========================================================
   3) GLOBAL STATE
========================================================= */
let sensorHistoryData = [];
let pestCsvData = [];

let tempChart = null;
let humidityChart = null;
let gasChart = null;
let statusChart = null;
let pestFrequencyChart = null;
let pestConfidenceChart = null;

/* =========================================================
   4) AUTHENTICATION LOGIC
========================================================= */
auth.onAuthStateChanged((user) => {
  if (user) {
    showDashboard();
    authMessage.textContent = "";
    startRealtimeListeners();
  } else {
    showLogin();
    stopRealtimeUI();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = "Please enter email and password.";
    authMessage.style.color = "#ff9ea8";
    return;
  }

  try {
    authMessage.textContent = "Logging in...";
    authMessage.style.color = "#9fb6cc";

    await auth.signInWithEmailAndPassword(email, password);

    authMessage.textContent = "Login successful!";
    authMessage.style.color = "#89ffca";
  } catch (error) {
    authMessage.textContent = error.message;
    authMessage.style.color = "#ff9ea8";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await auth.signOut();
  } catch (error) {
    alert("Logout failed: " + error.message);
  }
});

function showLogin() {
  loginPage.classList.add("active");
  dashboardPage.classList.remove("active");
}

function showDashboard() {
  loginPage.classList.remove("active");
  dashboardPage.classList.add("active");
}

function stopRealtimeUI() {
  tempValue.textContent = "-- °C";
  humidityValue.textContent = "-- %";
  gasStatusValue.textContent = "Safe";
  anomalyValue.textContent = "Normal";
  lastUpdateValue.textContent = "--";
  liveBadge.textContent = "LIVE DATA";
}

/* =========================================================
   5) FIREBASE REAL-TIME SENSOR DATA LISTENER
========================================================= */
function startRealtimeListeners() {
  listenLatestSensorData();
  listenSensorHistory();
}

function listenLatestSensorData() {
  const latestRef = db.ref("sensorData/latest");

  latestRef.on("value", (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      tempValue.textContent = "-- °C";
      humidityValue.textContent = "-- %";
      gasStatusValue.textContent = "Safe";
      anomalyValue.textContent = "Normal";
      lastUpdateValue.textContent = "No data";
      liveBadge.textContent = "LIVE DATA";
      return;
    }

    const temperature = safeNumber(data.temperature);
    const humidity = safeNumber(data.humidity);
    const gasStatus = data.gasStatus || "Safe";
    const anomaly = data.anomaly || "Normal";
    const timestamp = data.timestamp || null;

    tempValue.textContent = `${temperature} °C`;
    humidityValue.textContent = `${humidity} %`;
    gasStatusValue.textContent = gasStatus;
    anomalyValue.textContent = anomaly;
    lastUpdateValue.textContent = timestamp ? formatReadableDateTime(timestamp) : "No timestamp";
    liveBadge.textContent = "LIVE DATA";
  }, (error) => {
    console.error("Latest sensor data error:", error);
  });
}

function listenSensorHistory() {
  const historyRef = db.ref("sensorData/history");

  historyRef.on("value", (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      sensorHistoryData = [];
      renderHistoryTable([]);
      updateSensorCharts([]);
      return;
    }

    const historyArray = Object.keys(data).map((key) => ({
      id: key,
      ...data[key]
    }));

    // Newest first
    historyArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sensorHistoryData = historyArray;

    renderHistoryTable(sensorHistoryData);
    updateSensorCharts(sensorHistoryData);
  }, (error) => {
    console.error("Sensor history error:", error);
  });
}

/* =========================================================
   6) HISTORY TABLE RENDERING
========================================================= */
function renderHistoryTable(records) {
  if (!records.length) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-row">No sensor history available</td>
      </tr>
    `;
    return;
  }

  historyTableBody.innerHTML = records.map((item, index) => {
    const { date, time } = splitDateTime(item.timestamp);

    const gasBadge = getGasBadge(item.gasStatus || "Safe");
    const anomalyBadge = getAnomalyBadge(item.anomaly || "Normal");

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td>${safeNumber(item.temperature)}</td>
        <td>${safeNumber(item.humidity)}</td>
        <td>${safeNumber(item.mq7)}</td>
        <td>${safeNumber(item.mq135)}</td>
        <td>${gasBadge}</td>
        <td>${anomalyBadge}</td>
      </tr>
    `;
  }).join("");
}

function getGasBadge(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("detect")) {
    return `<span class="badge badge-warning">Detected</span>`;
  }
  return `<span class="badge badge-success">Safe</span>`;
}

function getAnomalyBadge(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("anomaly")) {
    return `<span class="badge badge-danger">Anomaly Detected</span>`;
  }
  return `<span class="badge badge-success">Normal</span>`;
}

/* =========================================================
   7) CHART RENDERING (SENSOR DATA)
========================================================= */
function updateSensorCharts(records) {
  const latestRecords = [...records].slice(0, 20).reverse(); // oldest to newest for chart

  const labels = latestRecords.map((item) => {
    const dt = new Date(item.timestamp || Date.now());
    return formatTimeOnly(dt);
  });

  const temperatures = latestRecords.map((item) => safeNumber(item.temperature));
  const humidities = latestRecords.map((item) => safeNumber(item.humidity));
  const mq7Values = latestRecords.map((item) => safeNumber(item.mq7));
  const mq135Values = latestRecords.map((item) => safeNumber(item.mq135));

  const gasDetectedCount = latestRecords.filter(item =>
    String(item.gasStatus || "").toLowerCase().includes("detect")
  ).length;

  const gasSafeCount = latestRecords.length - gasDetectedCount;

  const anomalyDetectedCount = latestRecords.filter(item =>
    String(item.anomaly || "").toLowerCase().includes("anomaly")
  ).length;

  const normalCount = latestRecords.length - anomalyDetectedCount;

  // Temperature Chart
  tempChart = createOrUpdateChart(tempChart, "tempChart", "line", {
    labels,
    datasets: [{
      label: "Temperature (°C)",
      data: temperatures,
      borderColor: "#00d4ff",
      backgroundColor: "rgba(0, 212, 255, 0.15)",
      tension: 0.35,
      fill: true,
      borderWidth: 2
    }]
  });

  // Humidity Chart
  humidityChart = createOrUpdateChart(humidityChart, "humidityChart", "line", {
    labels,
    datasets: [{
      label: "Humidity (%)",
      data: humidities,
      borderColor: "#20d67b",
      backgroundColor: "rgba(32, 214, 123, 0.15)",
      tension: 0.35,
      fill: true,
      borderWidth: 2
    }]
  });

  // MQ7 & MQ135 Chart
  gasChart = createOrUpdateChart(gasChart, "gasChart", "line", {
    labels,
    datasets: [
      {
        label: "MQ7",
        data: mq7Values,
        borderColor: "#f7b731",
        backgroundColor: "rgba(247, 183, 49, 0.12)",
        tension: 0.35,
        fill: false,
        borderWidth: 2
      },
      {
        label: "MQ135",
        data: mq135Values,
        borderColor: "#ff5f6d",
        backgroundColor: "rgba(255, 95, 109, 0.12)",
        tension: 0.35,
        fill: false,
        borderWidth: 2
      }
    ]
  });

  // Gas & Anomaly Summary Chart
  statusChart = createOrUpdateChart(statusChart, "statusChart", "bar", {
    labels: ["Gas Detected", "Gas Safe", "Anomaly", "Normal"],
    datasets: [{
      label: "Count",
      data: [gasDetectedCount, gasSafeCount, anomalyDetectedCount, normalCount],
      backgroundColor: [
        "rgba(247, 183, 49, 0.7)",
        "rgba(32, 214, 123, 0.7)",
        "rgba(255, 95, 109, 0.7)",
        "rgba(0, 212, 255, 0.7)"
      ],
      borderRadius: 8
    }]
  }, false);
}

function createOrUpdateChart(existingChart, canvasId, type, data, showLegend = true) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend,
          labels: {
            color: "#d8ebff"
          }
        }
      },
      scales: type === "doughnut" ? {} : {
        x: {
          ticks: { color: "#9fb6cc" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#9fb6cc" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

/* =========================================================
   8) CSV UPLOAD PARSING
========================================================= */
uploadCsvBtn.addEventListener("click", () => {
  const file = csvFileInput.files[0];

  if (!file) {
    csvMessage.textContent = "Please select a CSV file first.";
    csvMessage.style.color = "#ff9ea8";
    return;
  }

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      try {
        const parsedRows = results.data.map((row, index) => parsePestRow(row, index))
          .filter(item => item !== null);

        pestCsvData = parsedRows;

        renderPestTable(pestCsvData);
        updatePestCharts(pestCsvData);
        updateLatestPestSummary(pestCsvData);

        csvMessage.textContent = `CSV uploaded successfully. ${pestCsvData.length} records loaded.`;
        csvMessage.style.color = "#89ffca";
      } catch (error) {
        console.error("CSV parse error:", error);
        csvMessage.textContent = "Error parsing CSV. Please check column names: Timestamp, Prediction";
        csvMessage.style.color = "#ff9ea8";
      }
    },
    error: function (error) {
      console.error("PapaParse error:", error);
      csvMessage.textContent = "Failed to parse CSV file.";
      csvMessage.style.color = "#ff9ea8";
    }
  });
});

function parsePestRow(row, index) {
  const rawTimestamp = row.Timestamp || row.timestamp || "";
  const rawPrediction = row.Prediction || row.prediction || "";

  if (!rawTimestamp && !rawPrediction) return null;

  const { date, time } = splitCsvTimestamp(rawTimestamp);
  const { pestName, confidence } = extractPredictionDetails(rawPrediction);

  return {
    id: index + 1,
    rawTimestamp,
    date,
    time,
    pestName,
    confidence,
    originalPrediction: rawPrediction
  };
}

function renderPestTable(records) {
  if (!records.length) {
    pestTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">No pest data found in CSV</td>
      </tr>
    `;
    return;
  }

  pestTableBody.innerHTML = records.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.date}</td>
      <td>${item.time}</td>
      <td>${item.pestName || "-"}</td>
      <td>${item.confidence !== null ? item.confidence : "-"}</td>
      <td>${item.originalPrediction || "-"}</td>
    </tr>
  `).join("");
}

function updateLatestPestSummary(records) {
  if (!records.length) {
    latestPestValue.textContent = "No CSV uploaded";
    return;
  }

  const latest = records[records.length - 1];
  latestPestValue.textContent = `${latest.pestName || "Unknown"} (${latest.confidence ?? "--"}%) at ${latest.time}`;
}

/* =========================================================
   9) PEST CHART RENDERING
========================================================= */
function updatePestCharts(records) {
  if (!records.length) {
    if (pestFrequencyChart) pestFrequencyChart.destroy();
    if (pestConfidenceChart) pestConfidenceChart.destroy();
    return;
  }

  // Frequency count
  const pestCounts = {};
  records.forEach(item => {
    const key = item.pestName || "Unknown";
    pestCounts[key] = (pestCounts[key] || 0) + 1;
  });

  const freqLabels = Object.keys(pestCounts);
  const freqValues = Object.values(pestCounts);

  pestFrequencyChart = createOrUpdateChart(
    pestFrequencyChart,
    "pestFrequencyChart",
    "bar",
    {
      labels: freqLabels,
      datasets: [{
        label: "Detection Count",
        data: freqValues,
        backgroundColor: "rgba(0, 212, 255, 0.7)",
        borderRadius: 8
      }]
    },
    false
  );

  // Confidence trend
  const confidenceLabels = records.map(item => item.time || item.rawTimestamp);
  const confidenceValues = records.map(item => item.confidence ?? 0);

  pestConfidenceChart = createOrUpdateChart(
    pestConfidenceChart,
    "pestConfidenceChart",
    "line",
    {
      labels: confidenceLabels,
      datasets: [{
        label: "Confidence (%)",
        data: confidenceValues,
        borderColor: "#f7b731",
        backgroundColor: "rgba(247, 183, 49, 0.15)",
        tension: 0.35,
        fill: true,
        borderWidth: 2
      }]
    }
  );
}

/* =========================================================
   10) UTILITY FUNCTIONS
========================================================= */
function safeNumber(value) {
  if (value === null || value === undefined || value === "") return "--";
  const num = Number(value);
  return Number.isNaN(num) ? "--" : num.toFixed(1);
}

function formatReadableDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function splitDateTime(timestamp) {
  if (!timestamp) {
    return { date: "-", time: "-" };
  }

  const dateObj = new Date(timestamp);

  return {
    date: dateObj.toLocaleDateString(),
    time: dateObj.toLocaleTimeString()
  };
}

function formatTimeOnly(dateObj) {
  return dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function splitCsvTimestamp(timestampString) {
  if (!timestampString) {
    return { date: "-", time: "-" };
  }

  // Expected format: 2026-03-22 10:28:17
  const parts = timestampString.split(" ");
  return {
    date: parts[0] || "-",
    time: parts[1] || "-"
  };
}

function extractPredictionDetails(prediction) {
  if (!prediction) {
    return { pestName: "Unknown", confidence: null };
  }

  // Example: "larva (64.1%)"
  const regex = /(.*)\s*\(([\d.]+)%\)/;
  const match = prediction.match(regex);

  if (match) {
    return {
      pestName: match[1].trim(),
      confidence: parseFloat(match[2])
    };
  }

  return {
    pestName: prediction.trim(),
    confidence: null
  };
}

/* =========================================================
   11) OPTIONAL: INITIAL EMPTY CHARTS ON PAGE LOAD
========================================================= */
window.addEventListener("DOMContentLoaded", () => {
  // Create empty charts so layout looks ready before data comes
  updateSensorCharts([]);
});