const agents = [
  // SCOM Host Down Analyzer
  {
    id: "scom-host-down",
    name: "SCOM Host Down Analyzer",
    description:
      "Analyze SCOM host-down alerts and generate a list of affected servers.",

    icon: "🖥️",

    category: "SCOM",
    version: "1.0.0",

    input: "SCOM JSON",
    output: "Affected Server List",

    status: "available",

    path: "agents/scom-host-down/index.html"
  },

  // SolarWinds API Agent Analyzer
  {
    id: "solarwinds-api",
    name: "SolarWinds API Agent Analyzer",
    description:
      "Analyze SolarWinds alert data, affected devices, entities, severity, and correlated alerts.",
    icon: "📡",
    category: "SolarWinds",
    version: "1.0.0",
    input: "SolarWinds API JSON",
    output: "Alert Analysis",
    status: "available",
    path: "agents/solarwinds-api/index.html"
  },

  // Pure1 - Array Latency Write Analyzer
  {
    id: "pure1-array-latency-write",
    name: "Pure1 - Array Latency Write",
    description:
      "Analyze Pure1 array write latency alerts and compare the affected array against peer arrays.",
    icon: "💾",
    category: "Pure1",
    version: "1.0.0",
    input: "Pure1 Parsed Alert JSON",
    output: "Latency Analysis",
    status: "available",
    path: "agents/pure1-array-latency-write/index.html"
  },

  // More Agents
  {
    id: "coming-soon",
    name: "More Agents",
    description:
      "Additional NOCEyes automation agents will be added here.",

    icon: "🔧",

    category: "Other",
    version: "-",

    input: "-",
    output: "-",

    status: "coming-soon",

    path: null
  }
];

function renderAgents() {
  const agentGrid = document.querySelector(".agent-grid");

  if (!agentGrid) {
    return;
  }

  agentGrid.innerHTML = agents
    .map((agent) => {
      if (agent.status === "available") {
        return `
                <article class="agent-card">

                    <div class="agent-icon">
                        ${agent.icon}
                    </div>

                    <div class="agent-content">

                        <div class="agent-meta">
                            <span class="agent-status">
                                Available
                            </span>

                            <span class="agent-category">
                                ${agent.category}
                            </span>
                        </div>

                        <h3>
                            ${agent.name}
                        </h3>

                        <p>
                            ${agent.description}
                        </p>

                        <a
                            href="${agent.path}"
                            class="agent-button"
                        >
                            Open Agent →
                        </a>

                    </div>

                </article>
              `;
      }

      return `
                <article class="agent-card agent-disabled">

                    <div class="agent-icon">
                        ${agent.icon}
                    </div>

                    <div class="agent-content">

                        <span class="agent-status coming-soon">
                            Coming Soon
                        </span>

                        <h3>
                            ${agent.name}
                        </h3>

                        <p>
                            ${agent.description}
                        </p>

                    </div>

                </article>
            `;
    })
    .join("");
}

renderAgents();