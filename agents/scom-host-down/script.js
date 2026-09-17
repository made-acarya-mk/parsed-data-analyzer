let currentRows = [];

function analyzeAlerts() {
  const input = document.getElementById("jsonInput").value.trim();

  hideError();

  if (!input) {
    showError("Please paste SCOM JSON data first.");
    return;
  }

  try {
    const data = JSON.parse(input);
    const rows = data.json?.rows || [];

    if (!Array.isArray(rows)) {
      throw new Error("SCOM rows data was not found.");
    }

    currentRows = rows;

    renderSummary(rows);
    renderServerList(rows);
    renderAlertDetails(rows);

  } catch (error) {
    showError("Invalid JSON or unsupported SCOM data format.");
    console.error(error);
  }
}

function renderSummary(rows) {
  const totalAlerts = rows.length;

  const errorAlerts = rows.filter(
    row => row.severity?.toLowerCase() === "error"
  ).length;

  const hosts = new Set(
    rows
      .map(row => row.monitoringobjectdisplayname)
      .filter(Boolean)
  );

  document.getElementById("totalAlerts").textContent = totalAlerts;
  document.getElementById("affectedHosts").textContent = hosts.size;
  document.getElementById("errorAlerts").textContent = errorAlerts;
}

function renderServerList(rows) {
  const serverList = document.getElementById("serverList");
  const serverCount = document.getElementById("serverCount");

  const servers = [
    ...new Set(
      rows
        .map(row => row.monitoringobjectdisplayname)
        .filter(Boolean)
    )
  ];

  serverCount.textContent =
    `${servers.length} server${servers.length !== 1 ? "s" : ""}`;

  if (servers.length === 0) {
    serverList.innerHTML = `
            <p class="empty-state">
                No servers detected.
            </p>
        `;
    return;
  }

  serverList.innerHTML = servers
    .map(
      (server, index) => `
                <div class="server-item">
                    <span class="server-number">${index + 1}.</span>
                    <span class="server-name">
                        ${escapeHtml(server)}
                    </span>
                </div>
            `
    )
    .join("");
}

function renderAlertDetails(rows) {
  const tableBody = document.getElementById("alertDetailsBody");
  const detailCount = document.getElementById("detailCount");

  detailCount.textContent =
    `${rows.length} alert${rows.length !== 1 ? "s" : ""}`;

  if (rows.length === 0) {
    tableBody.innerHTML = `
          <tr>
              <td colspan="4" class="empty-state">
                  No alert details available.
              </td>
          </tr>
      `;

    return;
  }

  tableBody.innerHTML = rows
    .map((row, index) => {
      const errorName =
        row.name ||
        row.alertname ||
        row.monitoringobjectname ||
        "Unknown Error";

      const severity =
        row.severity || "Unknown";

      const serverName =
        row.monitoringobjectdisplayname ||
        "Unknown Server";

      return `
              <tr>
                  <td class="table-number">
                      ${index + 1}
                  </td>

                  <td class="server-name">
                      ${escapeHtml(serverName)}
                  </td>

                  <td>
                      <span class="severity-badge severity-${severity.toLowerCase()}">
                          ${escapeHtml(severity)}
                      </span>
                  </td>
            
                  <td class="error-name">
                      ${escapeHtml(errorName)}
                  </td>
              </tr>
          `;
    })
    .join("");
}

async function copyServerList() {
  const servers = [
    ...new Set(
      currentRows
        .map(row => row.monitoringobjectdisplayname)
        .filter(Boolean)
    )
  ];

  if (servers.length === 0) {
    return;
  }

  const text = servers.join("\n");

  const success = await copyToClipboard(text);

  if (success) {
    alert(`${servers.length} server(s) copied to clipboard.`);
  } else {
    showError("Unable to copy server list.");
  }
}

document
  .getElementById("analyzeButton")
  .addEventListener("click", analyzeAlerts);

document
  .getElementById("copyButton")
  .addEventListener("click", copyServerList);