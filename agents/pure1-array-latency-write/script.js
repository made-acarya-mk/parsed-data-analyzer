/* ========================================
   PURE1 - ARRAY LATENCY WRITE
   Agent Logic
   ======================================== */

/* =========================
   State
   ========================= */

let currentData = null;
let currentTarget = null;
let currentPeers = [];


/* =========================
   Constants
   ========================= */

const METRIC_NAME = "array_write_latency_us";

const DEFAULT_UNIT = "us/op";

const SEVERITY_MAP = {
    0: "Normal",
    1: "Critical",
    2: "Warning",
    3: "Informational"
};


/* =========================
   DOM Helpers
   ========================= */

function getElement(id) {
    return document.getElementById(id);
}


/* =========================
   Formatting
   ========================= */

function formatNumber(value, decimals = 0) {
    if (!Number.isFinite(value)) {
        return "—";
    }

    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}


function formatLatency(value, unit = DEFAULT_UNIT) {
    if (!Number.isFinite(value)) {
        return "—";
    }

    return `${formatNumber(value)} ${unit}`;
}


function formatPercentage(value) {
    if (!Number.isFinite(value)) {
        return "—";
    }

    const sign = value > 0 ? "+" : "";

    return `${sign}${formatNumber(value, 1)}%`;
}


function formatMultiplier(value) {
    if (!Number.isFinite(value)) {
        return "—";
    }

    return `${formatNumber(value, 1)}×`;
}


function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds)) {
        return "—";
    }

    const seconds = Math.round(milliseconds / 1000);

    if (seconds < 60) {
        return `${seconds} seconds`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (remainingSeconds === 0) {
        return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}


function formatTimestamp(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return "—";
    }

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date
        .toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC")
        .replace("Z", " UTC");
}


function formatAggregation(value) {
    if (!value) {
        return "—";
    }

    return String(value).toUpperCase();
}


/* =========================
   HTML Safety
   ========================= */

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================
   Data Validation
   ========================= */

function isObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}


function validatePayload(data) {
    if (!isObject(data)) {
        throw new Error("Parsed data must be a JSON object.");
    }

    if (!isObject(data._item_data)) {
        throw new Error(
            "Target alert data (_item_data) was not found."
        );
    }

    if (!isObject(data.json)) {
        throw new Error(
            "Pure1 result collection (json) was not found."
        );
    }

    if (!Array.isArray(data.json.items)) {
        throw new Error(
            "Pure1 metric items (json.items) were not found."
        );
    }

    return true;
}


/* =========================
   Metric Normalization
   ========================= */

function normalizeMetricItem(item) {
    if (!isObject(item)) {
        return null;
    }

    if (item.name !== METRIC_NAME) {
        return null;
    }

    if (!Array.isArray(item.data)) {
        return null;
    }

    const samples = item.data
        .filter((sample) => {
            return (
                Array.isArray(sample) &&
                sample.length >= 2 &&
                Number.isFinite(Number(sample[0])) &&
                Number.isFinite(Number(sample[1]))
            );
        })
        .map((sample) => {
            return {
                timestamp: Number(sample[0]),
                value: Number(sample[1])
            };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

    if (samples.length === 0) {
        return null;
    }

    const resource =
        Array.isArray(item.resources) && item.resources.length > 0
            ? item.resources[0]
            : {};

    return {
        name: item.name,
        unit: item.unit || DEFAULT_UNIT,
        aggregation: item.aggregation || null,
        resolution: Number(item.resolution) || null,
        samples,
        resource
    };
}


/* =========================
   Target Extraction
   ========================= */

function getTargetMetric(data) {
    const target = normalizeMetricItem(data._item_data);

    if (!target) {
        throw new Error(
            "The target _item_data does not contain valid array write latency data."
        );
    }

    return target;
}


/* =========================
   Peer Extraction
   ========================= */

function getPeerMetrics(data, target) {
    return data.json.items
        .map(normalizeMetricItem)
        .filter(Boolean)
        .filter((item) => {
            return getResourceName(item) !== getResourceName(target);
        });
}


function getResourceName(metric) {
    return metric?.resource?.name || "Unknown Array";
}


function getResourceFqdn(metric) {
    return metric?.resource?.fqdn || "—";
}


/* =========================
   Metric Calculations
   ========================= */

function getCurrentValue(metric) {
    const samples = metric?.samples || [];

    if (samples.length === 0) {
        return null;
    }

    return samples[samples.length - 1].value;
}


function getInitialValue(metric) {
    const samples = metric?.samples || [];

    if (samples.length === 0) {
        return null;
    }

    return samples[0].value;
}


function getPeakValue(metric) {
    const values = (metric?.samples || [])
        .map((sample) => sample.value)
        .filter(Number.isFinite);

    if (values.length === 0) {
        return null;
    }

    return Math.max(...values);
}


function getDuration(metric) {
    const samples = metric?.samples || [];

    if (samples.length < 2) {
        return 0;
    }

    return (
        samples[samples.length - 1].timestamp -
        samples[0].timestamp
    );
}


function calculateIncrease(initialValue, currentValue) {
    if (
        !Number.isFinite(initialValue) ||
        !Number.isFinite(currentValue)
    ) {
        return {
            value: null,
            percentage: null
        };
    }

    const difference = currentValue - initialValue;

    if (initialValue === 0) {
        return {
            value: difference,
            percentage: null
        };
    }

    return {
        value: difference,
        percentage: (difference / initialValue) * 100
    };
}

/* =========================
   Triage Context
   ========================= */

function extractTriageContext(data, target, peers) {
    const eventHistory =
        isObject(data.event_history)
            ? data.event_history
            : isObject(data.eventHistory)
                ? data.eventHistory
                : null;

    const threshold =
        extractThreshold(data, target);

    return {
        eventHistory,
        threshold,
        applicationImpact:
            extractApplicationImpact(data),

        multipleArrayImpact:
            extractMultipleArrayImpact(data),

        correlatedStorageFailure:
            extractCorrelatedStorageFailure(data)
    };
}

function extractThreshold(data, target) {
    const candidates = [
        data.threshold,
        data.configured_threshold,
        data.alert_threshold,
        data.threshold_value,
        target.threshold,
        target.configured_threshold
    ];

    for (const value of candidates) {
        if (Number.isFinite(Number(value))) {
            return Number(value);
        }
    }

    return null;
}

function extractApplicationImpact(data) {
    const value =
        data.application_impact ??
        data.applicationImpact ??
        null;

    if (
        value === true ||
        value === false
    ) {
        return value;
    }

    return null;
}


function extractMultipleArrayImpact(data) {
    const value =
        data.multiple_array_impact ??
        data.multipleArrayImpact ??
        null;

    if (
        value === true ||
        value === false
    ) {
        return value;
    }

    return null;
}


function extractCorrelatedStorageFailure(data) {
    const value =
        data.correlated_storage_failure ??
        data.correlatedStorageFailure ??
        null;

    if (
        value === true ||
        value === false
    ) {
        return value;
    }

    return null;
}

function extractEventHistoryContext(eventHistory) {
    if (!eventHistory) {
        return {
            firstSeen: null,
            lastSeen: null,
            occurrenceCount: null,
            activeDuration: null,
            isStillActive: null
        };
    }

    const firstSeen =
        parseTimestamp(
            eventHistory.first_seen ??
            eventHistory.firstSeen
        );

    const lastSeen =
        parseTimestamp(
            eventHistory.last_seen ??
            eventHistory.lastSeen
        );

    const occurrenceRaw =
        eventHistory.occurrence_count ??
        eventHistory.occurrenceCount ??
        eventHistory.count;

    const occurrenceCount =
        Number.isFinite(Number(occurrenceRaw))
            ? Number(occurrenceRaw)
            : null;

    const isStillActive =
        typeof eventHistory.is_still_active === "boolean"
            ? eventHistory.is_still_active
            : typeof eventHistory.isStillActive === "boolean"
                ? eventHistory.isStillActive
                : null;

    let activeDuration = null;

    if (
        firstSeen !== null &&
        lastSeen !== null &&
        lastSeen >= firstSeen
    ) {
        activeDuration =
            lastSeen - firstSeen;
    }

    return {
        firstSeen,
        lastSeen,
        occurrenceCount,
        activeDuration,
        isStillActive
    };
}


function parseTimestamp(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    if (Number.isFinite(Number(value))) {
        return Number(value);
    }

    const parsed =
        Date.parse(String(value));

    return Number.isNaN(parsed)
        ? null
        : parsed;
}

function determineDecision(
    target,
    peers,
    context
) {
    const event =
        extractEventHistoryContext(
            context.eventHistory
        );

    const current =
        getCurrentValue(target);

    const initial =
        getInitialValue(target);

    const peak =
        getPeakValue(target);

    const peerMedian =
        calculatePeerMedian(peers);

    const dataGaps = [];

    /*
     * Determine available operational evidence.
     */

    if (!context.threshold) {
        dataGaps.push(
            "Threshold unavailable"
        );
    }

    if (!event.occurrenceCount) {
        dataGaps.push(
            "Event history / occurrence count unavailable"
        );
    }

    if (event.activeDuration === null) {
        dataGaps.push(
            "Active duration unavailable"
        );
    }

    if (event.isStillActive === null) {
        dataGaps.push(
            "Active / resolved status unavailable"
        );
    }

    if (context.applicationImpact === null) {
        dataGaps.push(
            "Application impact unavailable"
        );
    }

    /*
     * Immediate escalation conditions.
     *
     * These follow the operational prompt:
     * application impact, multiple-array impact,
     * or correlated storage failure can bypass
     * the five-minute waiting period.
     */

    if (
        context.applicationImpact === true ||
        context.multipleArrayImpact === true ||
        context.correlatedStorageFailure === true
    ) {
        return {
            status: "Escalate to Storage",

            reason:
                "Escalation is triggered by operational impact or correlated storage evidence rather than the five-minute duration alone.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Request MIM to page the Storage team.",

            escalationTarget:
                "Storage team through MIM",

            dataGaps
        };
    }

    /*
     * Resolved / acknowledged state.
     */

    if (
        event.isStillActive === false &&
        Number.isFinite(current) &&
        current <= initial &&
        context.applicationImpact === false
    ) {
        return {
            status: "Acknowledged / Resolved",

            reason:
                "The alert is no longer active and the latency has returned to or below the initial observed value, with no reported application impact.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Acknowledge or resolve after validation and add an operator comment.",

            escalationTarget:
                "Not applicable",

            dataGaps
        };
    }

    /*
     * Transient spike.
     */

    if (
        event.occurrenceCount === 1 &&
        event.isStillActive === false &&
        Number.isFinite(current) &&
        Number.isFinite(initial) &&
        current < peak
    ) {
        return {
            status: "Transient Spike",

            reason:
                "The alert was observed once, is no longer active, and the latest latency has decreased from the observed peak.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Continue monitoring or acknowledge after validation.",

            escalationTarget:
                "Not applicable",

            dataGaps
        };
    }

    /*
     * Active for more than five minutes.
     */

    if (
        event.activeDuration !== null &&
        event.activeDuration > 5 * 60 * 1000 &&
        event.isStillActive === true
    ) {
        return {
            status: "Escalate to Storage",

            reason:
                "The alert remains active beyond the five-minute operational checkpoint.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Request MIM to page the Storage team.",

            escalationTarget:
                "Storage team through MIM",

            dataGaps
        };
    }

    /*
     * Repeated event + threshold exceeded.
     */

    const thresholdExceeded =
        Number.isFinite(context.threshold) &&
        Number.isFinite(current) &&
        current > context.threshold;

    if (
        event.occurrenceCount !== null &&
        event.occurrenceCount > 1 &&
        thresholdExceeded
    ) {
        return {
            status: "Escalate to Storage",

            reason:
                "The alert has repeated and the current latency remains above the configured threshold.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Request MIM to page the Storage team.",

            escalationTarget:
                "Storage team through MIM",

            dataGaps
        };
    }

    /*
     * Ready to escalate.
     */

    if (
        event.activeDuration !== null &&
        event.activeDuration >= 4 * 60 * 1000 &&
        event.activeDuration <= 5 * 60 * 1000 &&
        Number.isFinite(current)
    ) {
        return {
            status: "Ready to Escalate",

            reason:
                "The alert remains active and the observed duration is approaching the five-minute checkpoint.",

            evidence: buildDecisionEvidence(
                target,
                peers,
                context,
                event,
                peerMedian
            ),

            recommendedAction:
                "Continue active monitoring and prepare Storage escalation.",

            escalationTarget:
                "Storage team through MIM",

            dataGaps
        };
    }

    /*
     * Default:
     *
     * For the current sample payload, this is
     * the expected decision because persistence
     * and event recurrence are unknown.
     */

    return {
        status: "Monitoring",

        reason:
            "The latest latency remains elevated relative to peer arrays, but the available metric window is below five minutes and event recurrence cannot be confirmed.",

        evidence: buildDecisionEvidence(
            target,
            peers,
            context,
            event,
            peerMedian
        ),

        recommendedAction:
            "Continue monitoring the next samples and verify event recurrence in NOCeyes.",

        escalationTarget:
            "Storage team through MIM, if escalation becomes necessary",

        dataGaps
    };
}

function buildDecisionEvidence(
    target,
    peers,
    context,
    event,
    peerMedian
) {
    const current =
        getCurrentValue(target);

    const peak =
        getPeakValue(target);

    const initial =
        getInitialValue(target);

    const increase =
        calculateIncrease(
            initial,
            current
        );

    const threshold =
        context.threshold;

    const thresholdExceeded =
        Number.isFinite(threshold) &&
            Number.isFinite(current)
            ? current > threshold
            : null;

    return [
        {
            label: "Current",
            value:
                formatLatency(
                    current,
                    target.unit
                )
        },

        {
            label: "Peak",
            value:
                formatLatency(
                    peak,
                    target.unit
                )
        },

        {
            label: "Initial",
            value:
                formatLatency(
                    initial,
                    target.unit
                )
        },

        {
            label: "Change",
            value:
                Number.isFinite(increase.percentage)
                    ? formatPercentage(
                        increase.percentage
                    )
                    : "—"
        },

        {
            label: "Peer Median",
            value:
                formatLatency(
                    peerMedian,
                    target.unit
                )
        },

        {
            label: "Metric Duration",
            value:
                formatDuration(
                    getDuration(target)
                )
        },

        {
            label: "Occurrence Count",
            value:
                event.occurrenceCount !== null
                    ? String(
                        event.occurrenceCount
                    )
                    : "Unknown"
        },

        {
            label: "Active Duration",
            value:
                event.activeDuration !== null
                    ? formatDuration(
                        event.activeDuration
                    )
                    : "Unknown"
        },

        {
            label: "Threshold",
            value:
                Number.isFinite(threshold)
                    ? formatLatency(
                        threshold,
                        target.unit
                    )
                    : "Not available"
        },

        {
            label: "Threshold Status",
            value:
                thresholdExceeded === null
                    ? "Insufficient Data"
                    : thresholdExceeded
                        ? "Exceeded"
                        : "Not exceeded"
        }
    ];
}

function renderDecisionResult(decision) {
    const badge =
        getElement("decisionBadge");

    const status =
        getElement("decisionStatus");

    const reason =
        getElement("decisionReason");

    const action =
        getElement("decisionAction");

    const escalation =
        getElement("decisionEscalation");

    const evidence =
        getElement("decisionEvidence");

    const dataGaps =
        getElement("decisionDataGaps");

    /*
     * Reset badge classes.
     */

    badge.className =
        "status-badge";

    switch (decision.status) {
        case "Monitoring":
            badge.classList.add(
                "status-monitoring"
            );
            break;

        case "Transient Spike":
            badge.classList.add(
                "status-transient"
            );
            break;

        case "Ready to Escalate":
            badge.classList.add(
                "status-ready"
            );
            break;

        case "Escalate to Storage":
            badge.classList.add(
                "status-escalate"
            );
            break;

        case "Acknowledged / Resolved":
            badge.classList.add(
                "status-resolved"
            );
            break;

        case "Insufficient Data":
            badge.classList.add(
                "status-insufficient"
            );
            break;

        default:
            badge.classList.add(
                "status-unknown"
            );
    }

    badge.textContent =
        decision.status;

    status.textContent =
        decision.status;

    reason.textContent =
        decision.reason;

    action.textContent =
        decision.recommendedAction;

    escalation.textContent =
        decision.escalationTarget;

    evidence.innerHTML =
        decision.evidence
            .map((item) => {
                return `
            <div class="evidence-item">
  
              <span>
                ${escapeHtml(
                    item.label
                )}
              </span>
  
              <strong>
                ${escapeHtml(
                    item.value
                )}
              </strong>
  
            </div>
          `;
            })
            .join("");

    if (
        decision.dataGaps.length === 0
    ) {
        dataGaps.innerHTML = `
        <div class="decision-empty">
          No data gaps identified.
        </div>
      `;

        return;
    }

    dataGaps.innerHTML =
        decision.dataGaps
            .map((gap) => {
                return `
            <div class="data-gap">
              ${escapeHtml(gap)}
            </div>
          `;
            })
            .join("");
}

/* =========================
   Median
   ========================= */

function calculateMedian(values) {
    const cleanValues = values
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (cleanValues.length === 0) {
        return null;
    }

    const middle = Math.floor(cleanValues.length / 2);

    if (cleanValues.length % 2 === 0) {
        return (
            cleanValues[middle - 1] +
            cleanValues[middle]
        ) / 2;
    }

    return cleanValues[middle];
}


function calculatePeerMedian(peers) {
    const latestValues = peers
        .map(getCurrentValue)
        .filter(Number.isFinite);

    return calculateMedian(latestValues);
}


function calculateDeviation(currentValue, peerMedian) {
    if (
        !Number.isFinite(currentValue) ||
        !Number.isFinite(peerMedian) ||
        peerMedian <= 0
    ) {
        return null;
    }

    return currentValue / peerMedian;
}


/* =========================
   Relative Peer Comparison
   ========================= */

function getPeerComparison(value, peerMedian, isTarget = false) {
    if (isTarget) {
        return {
            label: "Target",
            className: "peer-status-target"
        };
    }

    if (
        !Number.isFinite(value) ||
        !Number.isFinite(peerMedian)
    ) {
        return {
            label: "Peer",
            className: "peer-status-peer"
        };
    }

    if (value > peerMedian) {
        return {
            label: "Above Peer Median",
            className: "peer-status-above"
        };
    }

    return {
        label: "Peer",
        className: "peer-status-peer"
    };
}


/* =========================
   Alert Overview
   ========================= */

function renderAlertOverview(target) {
    const arrayName = getResourceName(target);
    const fqdn = getResourceFqdn(target);

    const currentValue = getCurrentValue(target);

    const lastSample =
        target.samples[target.samples.length - 1];

    getElement("alertName").textContent =
        "Pure1 - Array Latency Write";

    getElement("alertDescription").textContent =
        "Target array write latency analyzed from the Parsed Alert Data.";

    getElement("arrayName").textContent =
        arrayName;

    getElement("currentLatency").textContent =
        formatLatency(currentValue, target.unit);

    getElement("aggregation").textContent =
        formatAggregation(target.aggregation);

    getElement("lastObserved").textContent =
        formatTimestamp(lastSample?.timestamp);

    getElement("arrayFqdn").textContent =
        fqdn;

    getElement("metricName").textContent =
        target.name;

    renderStatus(target);
}


/* =========================
   Status
   ========================= */

function renderStatus(target) {
    const badge = getElement("statusBadge");

    badge.className =
        "status-badge status-investigating";

    badge.textContent =
        "Investigating";
}


/* =========================
   Summary
   ========================= */

function renderSummary(target, peers) {
    const current = getCurrentValue(target);
    const initial = getInitialValue(target);
    const peak = getPeakValue(target);

    const increase =
        calculateIncrease(initial, current);

    const peerMedian =
        calculatePeerMedian(peers);

    const deviation =
        calculateDeviation(current, peerMedian);

    getElement("summaryCurrent").textContent =
        formatLatency(current, target.unit);

    getElement("summaryPeak").textContent =
        formatLatency(peak, target.unit);

    getElement("summaryInitial").textContent =
        formatLatency(initial, target.unit);

    if (Number.isFinite(increase.value)) {
        const valueText =
            `${increase.value >= 0 ? "+" : ""}${formatNumber(
                increase.value
            )} ${target.unit}`;

        const percentageText =
            Number.isFinite(increase.percentage)
                ? ` (${formatPercentage(increase.percentage)})`
                : "";

        getElement("summaryIncrease").textContent =
            `${valueText}${percentageText}`;
    } else {
        getElement("summaryIncrease").textContent = "—";
    }

    getElement("summaryPeerMedian").textContent =
        formatLatency(peerMedian, target.unit);

    getElement("summaryDeviation").textContent =
        formatMultiplier(deviation);

    getElement("summarySamples").textContent =
        `${target.samples.length}`;

    getElement("summaryResolution").textContent =
        formatResolution(target.resolution);
}


/* =========================
   Resolution
   ========================= */

function formatResolution(milliseconds) {
    if (!Number.isFinite(milliseconds)) {
        return "—";
    }

    const seconds = milliseconds / 1000;

    if (seconds < 60) {
        return `${seconds} sec`;
    }

    const minutes = seconds / 60;

    return `${minutes} min`;
}


/* =========================
   Trend Chart
   ========================= */

function renderTrendChart(target) {
    const container = getElement("trendChart");

    if (!container) {
        return;
    }

    const samples = target.samples;

    if (samples.length === 0) {
        container.innerHTML = `
         <div class="chart-empty">
           No trend data available.
         </div>
       `;

        return;
    }

    getElement("trendBadge").textContent =
        `${samples.length} samples / ${formatResolution(
            target.resolution
        )} resolution`;

    const current = getCurrentValue(target);
    const peak = getPeakValue(target);

    getElement("trendDescription").textContent =
        `Write latency trend for ${getResourceName(
            target
        )}. Current: ${formatLatency(current, target.unit)}. Peak: ${formatLatency(
            peak,
            target.unit
        )}.`;

    container.innerHTML =
        buildTrendSvg(samples, target.unit);
}


function buildTrendSvg(samples, unit) {
    const width = 900;
    const height = 240;

    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 25;
    const paddingBottom = 45;

    const chartWidth =
        width - paddingLeft - paddingRight;

    const chartHeight =
        height - paddingTop - paddingBottom;

    const values = samples.map(
        (sample) => sample.value
    );

    const maxValue =
        Math.max(...values);

    const minValue =
        Math.min(...values);

    const range =
        maxValue - minValue;

    const yPadding =
        range === 0
            ? Math.max(maxValue * 0.1, 1)
            : range * 0.15;

    const yMin =
        Math.max(0, minValue - yPadding);

    const yMax =
        maxValue + yPadding;

    const getX = (index) => {
        if (samples.length === 1) {
            return paddingLeft + chartWidth / 2;
        }

        return (
            paddingLeft +
            (index / (samples.length - 1)) *
            chartWidth
        );
    };

    const getY = (value) => {
        if (yMax === yMin) {
            return paddingTop + chartHeight / 2;
        }

        return (
            paddingTop +
            chartHeight -
            ((value - yMin) / (yMax - yMin)) *
            chartHeight
        );
    };

    const points = samples
        .map((sample, index) => {
            return `${getX(index)},${getY(sample.value)}`;
        })
        .join(" ");

    const gridLines = buildGridLines(
        getY,
        yMin,
        yMax,
        paddingLeft,
        chartWidth
    );

    const pointMarkup = samples
        .map((sample, index) => {
            const x = getX(index);
            const y = getY(sample.value);

            return `
           <circle
             class="chart-point"
             cx="${x}"
             cy="${y}"
             r="4"
           />
           <text
             class="chart-value"
             x="${x}"
             y="${Math.max(y - 10, 12)}"
             text-anchor="middle"
           >
             ${escapeHtml(formatNumber(sample.value))}
           </text>
         `;
        })
        .join("");

    const peakIndex =
        values.indexOf(maxValue);

    const peakX =
        getX(peakIndex);

    const peakY =
        getY(maxValue);

    const xLabels = samples
        .map((sample, index) => {
            return `
           <text
             class="chart-label"
             x="${getX(index)}"
             y="${height - 15}"
             text-anchor="middle"
           >
             ${escapeHtml(
                formatChartTime(sample.timestamp)
            )}
           </text>
         `;
        })
        .join("");

    return `
       <svg
         viewBox="0 0 ${width} ${height}"
         role="img"
         aria-label="Pure1 write latency trend chart"
       >
   
         ${gridLines}
   
         <line
           class="chart-axis"
           x1="${paddingLeft}"
           y1="${paddingTop}"
           x2="${paddingLeft}"
           y2="${paddingTop + chartHeight}"
         />
   
         <line
           class="chart-axis"
           x1="${paddingLeft}"
           y1="${paddingTop + chartHeight}"
           x2="${paddingLeft + chartWidth}"
           y2="${paddingTop + chartHeight}"
         />
   
         <polyline
           class="chart-line"
           points="${points}"
         />
   
         ${pointMarkup}
   
         <circle
           class="chart-peak"
           cx="${peakX}"
           cy="${peakY}"
           r="6"
         />
   
         ${xLabels}
   
         <text
           class="chart-label"
           x="8"
           y="${paddingTop + 5}"
         >
           ${escapeHtml(formatNumber(yMax))}
         </text>
   
         <text
           class="chart-label"
           x="8"
           y="${paddingTop + chartHeight}"
         >
           ${escapeHtml(formatNumber(yMin))}
         </text>
   
         <text
           class="chart-label"
           x="${width - 5}"
           y="${height - 3}"
           text-anchor="end"
         >
           ${escapeHtml(unit)}
         </text>
   
       </svg>
     `;
}


function buildGridLines(
    getY,
    yMin,
    yMax,
    x,
    width
) {
    const count = 4;

    return Array.from(
        { length: count + 1 },
        (_, index) => {
            const ratio = index / count;

            const value =
                yMax -
                (yMax - yMin) * ratio;

            const y = getY(value);

            return `
           <line
             class="chart-grid"
             x1="${x}"
             y1="${y}"
             x2="${x + width}"
             y2="${y}"
           />
   
           <text
             class="chart-label"
             x="${x - 8}"
             y="${y + 3}"
             text-anchor="end"
           >
             ${escapeHtml(formatNumber(value))}
           </text>
         `;
        }
    ).join("");
}


function formatChartTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return "—";
    }

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toISOString().slice(11, 19);
}


/* =========================
   Peer Comparison
   ========================= */

function renderPeerComparison(target, peers) {
    const tbody =
        getElement("peerTableBody");

    const targetName =
        getResourceName(target);

    const targetValue =
        getCurrentValue(target);

    const peerMedian =
        calculatePeerMedian(peers);

    const rows = [
        target,
        ...peers
    ]
        .map((metric) => {
            return {
                metric,
                name: getResourceName(metric),
                value: getCurrentValue(metric)
            };
        })
        .filter((item) =>
            Number.isFinite(item.value)
        )
        .sort((a, b) => {
            return b.value - a.value;
        });

    getElement("peerCount").textContent =
        `${rows.length} arrays`;

    if (rows.length === 0) {
        tbody.innerHTML = `
         <tr>
           <td
             colspan="5"
             class="empty-state"
           >
             No peer data available.
           </td>
         </tr>
       `;

        return;
    }

    tbody.innerHTML = rows
        .map((item, index) => {
            const isTarget =
                item.name === targetName;

            const comparison =
                getPeerComparison(
                    item.value,
                    peerMedian,
                    isTarget
                );

            let differenceText = "—";

            if (
                !isTarget &&
                Number.isFinite(targetValue)
            ) {
                const difference =
                    item.value - targetValue;

                differenceText =
                    `${difference >= 0 ? "+" : ""}${formatNumber(
                        difference
                    )} ${target.unit}`;
            }

            return `
           <tr class="${isTarget ? "peer-target" : ""}">
   
             <td class="peer-rank">
               ${index + 1}
             </td>
   
             <td class="peer-array">
               ${escapeHtml(item.name)}
             </td>
   
             <td class="peer-latency">
               ${escapeHtml(
                formatLatency(
                    item.value,
                    target.unit
                )
            )}
             </td>
   
             <td class="peer-difference">
               ${escapeHtml(differenceText)}
             </td>
   
             <td>
               <span
                 class="peer-status ${comparison.className}"
               >
                 ${escapeHtml(comparison.label)}
               </span>
             </td>
   
           </tr>
         `;
        })
        .join("");
}


/* =========================
   Alert Decision
   ========================= */

function renderDecision(target) {
    const sampleCount =
        target.samples.length;

    const duration =
        getDuration(target);

    getElement("decisionOccurrence").textContent =
        sampleCount > 0
            ? "1 payload observed"
            : "Not available";

    getElement("decisionDuration").textContent =
        formatDuration(duration);

    /*
     * The metric series itself cannot establish
     * whether the alert remained active for more
     * than five minutes.
     */
    getElement("decisionPersistence").textContent =
        "Unknown";

    /*
     * Threshold is intentionally not inferred.
     * Pure1 payload does not provide the configured
     * alert threshold in this structure.
     */
    getElement("decisionThreshold").textContent =
        "Not available";

    getElement("decisionThresholdStatus").textContent =
        "Unmapped";

    getElement("decisionAction").textContent =
        "Continue monitoring";
}


/* =========================
   Technical Details
   ========================= */

function renderTechnicalDetails(data, target) {
    const resource = {
        name: getResourceName(target),
        fqdn: getResourceFqdn(target),
        metric: target.name,
        unit: target.unit,
        aggregation: target.aggregation,
        resolution: target.resolution,
        sampleCount: target.samples.length
    };

    getElement("technicalResource").textContent =
        JSON.stringify(
            resource,
            null,
            2
        );

    getElement("rawData").textContent =
        JSON.stringify(
            data,
            null,
            2
        );
}


/* =========================
   Error Handling
   ========================= */

function showError(message) {
    const errorElement =
        getElement("errorMessage");

    errorElement.textContent =
        message;

    errorElement.style.display =
        "block";
}


function hideError() {
    const errorElement =
        getElement("errorMessage");

    errorElement.textContent =
        "";

    errorElement.style.display =
        "none";
}


/* =========================
   Reset
   ========================= */

function resetResults() {
    currentData = null;
    currentTarget = null;
    currentPeers = [];

    getElement("alertName").textContent =
        "Pure1 - Array Latency Write";

    getElement("alertDescription").textContent =
        "No alert data analyzed yet.";

    getElement("arrayName").textContent =
        "—";

    getElement("currentLatency").textContent =
        "—";

    getElement("aggregation").textContent =
        "—";

    getElement("lastObserved").textContent =
        "—";

    getElement("arrayFqdn").textContent =
        "—";

    getElement("metricName").textContent =
        "—";

    const badge =
        getElement("statusBadge");

    badge.className =
        "status-badge status-unknown";

    badge.textContent =
        "Unknown";

    getElement("summaryCurrent").textContent =
        "—";

    getElement("summaryPeak").textContent =
        "—";

    getElement("summaryInitial").textContent =
        "—";

    getElement("summaryIncrease").textContent =
        "—";

    getElement("summaryPeerMedian").textContent =
        "—";

    getElement("summaryDeviation").textContent =
        "—";

    getElement("summarySamples").textContent =
        "—";

    getElement("summaryResolution").textContent =
        "—";

    getElement("trendBadge").textContent =
        "0 samples";

    getElement("trendDescription").textContent =
        "Target array latency over the available samples.";

    getElement("trendChart").innerHTML = `
       <div class="chart-empty">
         No trend data available.
       </div>
     `;

    getElement("peerCount").textContent =
        "0 arrays";

    getElement("peerTableBody").innerHTML = `
       <tr>
         <td
           colspan="5"
           class="empty-state"
         >
           No peer data available.
         </td>
       </tr>
     `;

    getElement("decisionOccurrence").textContent =
        "—";

    getElement("decisionDuration").textContent =
        "—";

    getElement("decisionPersistence").textContent =
        "Unknown";

    getElement("decisionThreshold").textContent =
        "Not available";

    getElement("decisionThresholdStatus").textContent =
        "Unmapped";

    getElement("decisionAction").textContent =
        "Continue monitoring";

    getElement("technicalResource").textContent =
        "—";

    getElement("rawData").textContent =
        "—";

    getElement("decisionBadge").className =
        "status-badge status-unknown";

    getElement("decisionBadge").textContent =
        "Unknown";

    getElement("decisionStatus").textContent =
        "Awaiting Analysis";

    getElement("decisionReason").textContent =
        "No alert has been analyzed yet.";

    getElement("decisionAction").textContent =
        "Continue monitoring";

    getElement("decisionEscalation").textContent =
        "Not applicable";

    getElement("decisionEvidence").innerHTML = `
        <div class="decision-empty">
          No evidence available.
        </div>
      `;

    getElement("decisionDataGaps").innerHTML = `
        <div class="decision-empty">
          No data gaps identified.
        </div>
      `;
}


/* =========================
   Main Analysis
   ========================= */

function analyzeAlert() {
    hideError();

    const input =
        getElement("jsonInput").value.trim();

    if (!input) {
        showError(
            "Please paste Pure1 Parsed Alert JSON first."
        );

        return;
    }

    try {
        const data =
            JSON.parse(input);

        validatePayload(data);

        const target =
            getTargetMetric(data);

        const peers =
            getPeerMetrics(
                data,
                target
            );

        const context =
            extractTriageContext(
                data,
                target,
                peers
            );

        const decision =
            determineDecision(
                target,
                peers,
                context
            );

        currentData = data;
        currentTarget = target;
        currentPeers = peers;

        renderAlertOverview(target);

        renderSummary(
            target,
            peers
        );

        renderTrendChart(target);

        renderPeerComparison(
            target,
            peers
        );

        renderDecisionResult(
            decision
        );

        renderTechnicalDetails(
            data,
            target
        );

    } catch (error) {
        console.error(
            "Pure1 analysis error:",
            error
        );

        showError(
            error.message ||
            "Unable to analyze the Pure1 Parsed Alert Data."
        );
    }
}


/* =========================
   Clear
   ========================= */

function clearInput() {
    getElement("jsonInput").value = "";

    hideError();

    resetResults();
}


/* =========================
   Event Listeners
   ========================= */

getElement("analyzeButton")
    .addEventListener(
        "click",
        analyzeAlert
    );

getElement("clearButton")
    .addEventListener(
        "click",
        clearInput
    );


/* =========================
   Initial State
   ========================= */

resetResults();