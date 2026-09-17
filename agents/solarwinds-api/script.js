/* ========================================
   SOLARWINDS API AGENT
   Agent-specific logic
   ======================================== */

let currentResults = [];
let currentPrimaryEntity = {};

/* =========================
   Main Analyzer
   ========================= */

function analyzeAlerts() {
  const input = document.getElementById("jsonInput").value.trim();

  hideError();

  if (!input) {
    showError("Please paste SolarWinds JSON data first.");
    return;
  }

  try {
    const data = JSON.parse(input);

    const results = extractResults(data);
    const primaryEntity = extractPrimaryEntity(data);

    currentResults = results;
    currentPrimaryEntity = primaryEntity;

    renderSummary(results);
    renderAlertContext(data, primaryEntity);
    renderPrimarySummary(primaryEntity);
    renderAffectedEntities(results);

    populateSeverityFilter(results);
    renderAlertDetails(results);

    renderCorrelatedAlerts(results, primaryEntity);
  } catch (error) {
    console.error("SolarWinds parsing error:", error);

    showError(
      "Invalid JSON or unsupported SolarWinds data format."
    );
  }
}

/* =========================
   Data Extraction
   ========================= */

function extractResults(data) {
  const results = data?.json?.results;

  if (!Array.isArray(results)) {
    return [];
  }

  return results;
}

function extractPrimaryEntity(data) {
  const itemData = data?._item_data;

  if (
    itemData &&
    typeof itemData === "object" &&
    !Array.isArray(itemData)
  ) {
    return itemData;
  }

  return {};
}

/* =========================
   Summary
   ========================= */

function renderSummary(results) {
  const activeAlerts = results.filter(
    row => row?.IsActiveAlert === true
  );

  const uniqueEntities = getUniqueEntities(results);
  const uniqueNodes = getUniqueNodes(results);

  document.getElementById("activeAlerts").textContent =
    activeAlerts.length;

  document.getElementById("affectedDevices").textContent =
    uniqueNodes.length;

  document.getElementById("affectedEntities").textContent =
    uniqueEntities.length;

  document.getElementById("impactScope").textContent =
    getImpactScope(uniqueNodes);
}

function populateSeverityFilter(results) {
  console.log("populateSeverityFilter called");
  console.log("results:", results);

  const filter = document.getElementById("severityFilter");

  console.log("filter element:", filter);

  const severities = [
    ...new Set(
      results
        .map(row => row?.Severity)
        .filter(
          severity =>
            severity !== undefined &&
            severity !== null &&
            severity !== ""
        )
        .map(severity => String(severity))
    )
  ].sort((a, b) => {
    const numberA = Number(a);
    const numberB = Number(b);

    if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) {
      return numberA - numberB;
    }

    return a.localeCompare(b);
  });

  filter.innerHTML = `
      <option value="all">All Severities</option>
      ${severities
      .map(
        severity => `
                  <option value="${escapeHtml(severity)}">
                      ${escapeHtml(formatSeverity(severity))}
                  </option>
              `
      )
      .join("")}
  `;
}

function getImpactScope(uniqueNodes) {
  if (uniqueNodes.length === 0) {
    return "—";
  }

  if (uniqueNodes.length === 1) {
    return "SINGLE-NODE";
  }

  return "MULTI-NODE";
}

/* =========================
   Alert Context
   ========================= */

function renderAlertContext(data, primaryEntity) {
  const alertTitle =
    getValue(primaryEntity, [
      "AlertTitle",
      "AlertName"
    ]);

  const alertMessage =
    getAlertMessage(data, primaryEntity);

  const primaryEntityName =
    getEntityName(primaryEntity);

  document.getElementById("alertTitle").textContent =
    alertTitle;

  document.getElementById("alertMessage").textContent =
    alertMessage;

  document.getElementById("primaryEntity").textContent =
    primaryEntityName;
}

function getAlertMessage(data, primaryEntity) {
  const possibleFields = [
    "alert_message",
    "AlertMessage",
    "alertMessage",
    "Message",
    "message"
  ];

  for (const field of possibleFields) {
    if (
      data?.[field] !== undefined &&
      data?.[field] !== null &&
      data?.[field] !== ""
    ) {
      return String(data[field]);
    }

    if (
      primaryEntity?.[field] !== undefined &&
      primaryEntity?.[field] !== null &&
      primaryEntity?.[field] !== ""
    ) {
      return String(primaryEntity[field]);
    }
  }

  return "—";
}

/* =========================
   Primary Summary
   ========================= */

function renderPrimarySummary(primaryEntity) {
  document.getElementById("primaryDevice").textContent =
    getValue(primaryEntity, [
      "NodeCaption",
      "EntityCaption"
    ]);

  document.getElementById("primaryAlertType").textContent =
    getValue(primaryEntity, [
      "AlertName"
    ]);

  document.getElementById("primaryStatus").textContent =
    getValue(primaryEntity, [
      "StatusDescription"
    ]);

  document.getElementById("primaryVendor").textContent =
    getValue(primaryEntity, [
      "Vendor"
    ]);

  document.getElementById("primaryIp").textContent =
    getValue(primaryEntity, [
      "IPAddress",
      "IP",
      "IpAddress"
    ]);

  document.getElementById("primaryLocation").textContent =
    getValue(primaryEntity, [
      "Location"
    ]);

  document.getElementById("primaryContact").textContent =
    getValue(primaryEntity, [
      "Contact"
    ]);

  document.getElementById("primaryNodeId").textContent =
    getValue(primaryEntity, [
      "NodeID"
    ]);
}

/* =========================
   Affected Entities
   ========================= */

function renderAffectedEntities(results) {
  const container =
    document.getElementById("affectedDeviceList");

  const count =
    document.getElementById("affectedCount");

  const entities =
    getUniqueEntities(results);

  count.textContent =
    `${entities.length} entit${entities.length !== 1 ? "ies" : "y"}`;

  if (entities.length === 0) {
    container.innerHTML = `
               <p class="empty-state">
                   No affected devices detected.
               </p>
           `;

    return;
  }

  container.innerHTML = entities
    .map(
      (entity, index) => `
                   <div class="entity-item">
                       <span class="entity-number">
                           ${index + 1}.
                       </span>
   
                       <span class="entity-name">
                           ${escapeHtml(entity.name)}
                       </span>
                   </div>
               `
    )
    .join("");
}

function getUniqueEntities(results) {
  const entityMap = new Map();

  results.forEach(row => {
    const entityId =
      row?.AlertObjectID ??
      row?.NodeID ??
      row?.EntityCaption;

    const entityName =
      getEntityName(row);

    if (!entityName) {
      return;
    }

    const key =
      entityId !== undefined &&
        entityId !== null
        ? String(entityId)
        : entityName;

    if (!entityMap.has(key)) {
      entityMap.set(key, {
        id: key,
        name: entityName
      });
    }
  });

  return [...entityMap.values()];
}

function getUniqueNodes(results) {
  const nodeMap = new Map();

  results.forEach(row => {
    const nodeId =
      row?.NodeID;

    const nodeName =
      row?.NodeCaption;

    if (
      nodeId === undefined &&
      !nodeName
    ) {
      return;
    }

    const key =
      nodeId !== undefined &&
        nodeId !== null
        ? String(nodeId)
        : nodeName;

    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        name: nodeName || "Unknown Node"
      });
    }
  });

  return [...nodeMap.values()];
}

function getEntityName(row) {
  return getValue(
    row,
    [
      "EntityCaption",
      "NodeCaption"
    ],
    ""
  );
}

/* =========================
   Alert Details
   ========================= */

function renderAlertDetails(results) {
  const tableBody = document.getElementById("alertDetailsBody");
  const detailCount = document.getElementById("detailCount");

  const filterValue =
    document.getElementById("severityFilter")?.value || "all";

  const filteredResults =
    filterValue === "all"
      ? results
      : results.filter(
        row =>
          String(row?.Severity ?? "") ===
          String(filterValue)
      );

  detailCount.textContent =
    `${filteredResults.length} alert${filteredResults.length !== 1 ? "s" : ""
    }`;

  if (filteredResults.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    No alerts match the selected severity.
                </td>
            </tr>
        `;
    return;
  }

  tableBody.innerHTML = filteredResults
    .map((row, index) => {
      const entity = getEntityName(row);
      const alertName = getValue(row, ["AlertName"]);
      const severity = formatSeverity(row?.Severity);
      const description = getValue(
        row,
        ["StatusDescription"]
      );

      return `
                <tr>
                    <td class="table-number">
                        ${index + 1}
                    </td>

                    <td class="alert-entity">
                        ${escapeHtml(entity)}
                    </td>

                    <td class="alert-name">
                        ${escapeHtml(alertName)}
                    </td>

                    <td>
                        ${renderSeverityBadge(severity)}
                    </td>

                    <td class="alert-description">
                        ${escapeHtml(description)}
                    </td>
                </tr>
            `;
    })
    .join("");
}

/* =========================
   Severity
   ========================= */
const SEVERITY_MAP = {
  0: "Normal",
  1: "Critical",
  2: "Warning",
  3: "Informational"
};

function formatSeverity(severity) {
  if (
    severity === undefined ||
    severity === null ||
    severity === ""
  ) {
    return "Unknown";
  }

  const severityKey = Number(severity);

  return SEVERITY_MAP[severityKey] ?? String(severity);
}

function renderSeverityBadge(severity) {
  const normalized =
    severity
      .toLowerCase()
      .replace(/\s+/g, "-");

  return `
           <span
               class="severity-badge severity-${escapeHtml(
    normalized
  )}"
           >
               ${escapeHtml(severity)}
           </span>
       `;
}

/* =========================
   Correlated Alerts
   ========================= */

function renderCorrelatedAlerts(
  results,
  primaryEntity
) {
  const container =
    document.getElementById("correlatedAlerts");

  const primaryAlert =
    getValue(primaryEntity, [
      "AlertName"
    ], "");

  const relatedAlerts =
    getRelatedAlerts(
      results,
      primaryEntity,
      primaryAlert
    );

  if (relatedAlerts.length === 0) {
    container.innerHTML = `
               <p class="empty-state">
                   No correlated alerts detected.
               </p>
           `;

    return;
  }

  container.innerHTML = relatedAlerts
    .map(
      alert => `
                   <div class="correlated-item">
                       ${escapeHtml(alert)}
                   </div>
               `
    )
    .join("");
}

function getRelatedAlerts(
  results,
  primaryEntity,
  primaryAlert
) {
  const primaryNodeId =
    primaryEntity?.NodeID;

  const alerts = [];

  results.forEach(row => {
    const alertName =
      getValue(row, [
        "AlertName"
      ], "");

    if (!alertName) {
      return;
    }

    const sameNode =
      primaryNodeId !== undefined &&
      primaryNodeId !== null &&
      row?.NodeID !== undefined &&
      String(row.NodeID) === String(primaryNodeId);

    const differentAlert =
      alertName !== primaryAlert;

    if (sameNode && differentAlert) {
      alerts.push(alertName);
    }
  });

  return [...new Set(alerts)];
}

/* =========================
   Clear
   ========================= */

function clearInput() {
  document.getElementById("jsonInput").value = "";

  currentResults = [];
  currentPrimaryEntity = {};

  resetResults();

  hideError();
}

function resetResults() {
  switchDataPanel("devices");
  const severityFilter = document.getElementById("severityFilter");

  severityFilter.innerHTML = `<option value="all">All Severities</option>`;

  document.getElementById("activeAlerts").textContent = "0";

  document.getElementById("affectedDevices").textContent = "0";

  document.getElementById("affectedEntities").textContent = "0";

  document.getElementById("impactScope").textContent = "—";

  document.getElementById("alertTitle").textContent = "—";

  document.getElementById("alertMessage").textContent = "—";

  document.getElementById("primaryEntity").textContent = "—";

  document.getElementById("primaryDevice").textContent = "—";

  document.getElementById("primaryAlertType").textContent = "—";

  document.getElementById("primaryStatus").textContent = "—";

  document.getElementById("primaryVendor").textContent = "—";

  document.getElementById("primaryIp").textContent = "—";

  document.getElementById("primaryLocation").textContent = "—";

  document.getElementById("primaryContact").textContent = "—";

  document.getElementById("primaryNodeId").textContent = "—";

  document.getElementById("affectedCount").textContent = "0 entities";

  document.getElementById("detailCount").textContent = "0 alerts";

  document.getElementById("severityFilter").innerHTML = `<option value="all">All Severities</option>`;

  document.getElementById("affectedDeviceList").innerHTML = `
           <p class="empty-state">
               No affected devices detected.
           </p>
       `;

  document.getElementById("alertDetailsBody").innerHTML = `
           <tr>
               <td colspan="5" class="empty-state">
                   No alert details available.
               </td>
           </tr>
       `;

  document.getElementById("correlatedAlerts").innerHTML = `
           <p class="empty-state">
               No correlated alerts detected.
           </p>
       `;
}

/* =========================
   Helpers
   ========================= */

function getValue(
  object,
  fields,
  fallback = "—"
) {
  for (const field of fields) {
    const value =
      object?.[field];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return String(value);
    }
  }

  return fallback;
}

function showError(message) {
  const errorMessage =
    document.getElementById("errorMessage");

  errorMessage.textContent = message;

  errorMessage.style.display = "block";
}

function hideError() {
  const errorMessage =
    document.getElementById("errorMessage");

  errorMessage.style.display = "none";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyEntityList() {
  const entities = getUniqueEntities(currentResults);

  if (entities.length === 0) {
    return;
  }

  const entityList = entities
    .map(entity => entity.name)
    .join("\n");

  try {
    await navigator.clipboard.writeText(entityList);

    const button = document.getElementById(
      "copyEntityListButton"
    );

    const originalText = button.textContent;

    button.textContent = "Copied!";
    button.classList.add("copy-success");

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("copy-success");
    }, 1500);
  } catch (error) {
    console.error("Failed to copy entity list:", error);
  }
}

function switchDataPanel(panel) {
  const affectedDevicesTab =
    document.getElementById("affectedDevicesTab");

  const alertDetailsTab =
    document.getElementById("alertDetailsTab");

  const affectedDevicesPanel =
    document.getElementById("affectedDevicesPanel");

  const alertDetailsPanel =
    document.getElementById("alertDetailsPanel");

  if (panel === "devices") {
    affectedDevicesTab.classList.add("active");
    alertDetailsTab.classList.remove("active");

    affectedDevicesPanel.classList.add("active");
    alertDetailsPanel.classList.remove("active");

    return;
  }

  if (panel === "alerts") {
    affectedDevicesTab.classList.remove("active");
    alertDetailsTab.classList.add("active");

    affectedDevicesPanel.classList.remove("active");
    alertDetailsPanel.classList.add("active");
  }
}

/* =========================
   Event Listeners
   ========================= */

document
  .getElementById("analyzeButton")
  .addEventListener(
    "click",
    analyzeAlerts
  );

document
  .getElementById("clearButton")
  .addEventListener(
    "click",
    clearInput
  );

document
  .getElementById("severityFilter")
  .addEventListener("change", () => {
    renderAlertDetails(currentResults);
  });

document
  .getElementById("copyEntityListButton")
  .addEventListener("click", copyEntityList);

document
  .getElementById("affectedDevicesTab")
  .addEventListener("click", () => {
    switchDataPanel("devices");
  });

document
  .getElementById("alertDetailsTab")
  .addEventListener("click", () => {
    switchDataPanel("alerts");
  });