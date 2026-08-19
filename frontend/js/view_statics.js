/**
 * Mango Market Business Intelligence Dashboard
 * Phase 2: Frontend Integration with Analytics APIs
 *
 * This module connects to 7 analytics endpoints:
 * - GET /api/analytics/overview
 * - GET /api/analytics/trends
 * - GET /api/analytics/funnel
 * - GET /api/analytics/markets
 * - GET /api/analytics/varieties
 * - GET /api/analytics/payments
 * - GET /api/analytics/insights
 */

const API_BASE = "http://127.0.0.1:5000";

// =====================================================
// STATE MANAGEMENT
// =====================================================

const dashboardState = {
  filters: {
    start_date: null,
    end_date: null,
    market: null,
    variety: null,
  },
  data: {
    overview: null,
    trends: null,
    funnel: null,
    markets: null,
    varieties: null,
    payments: null,
    insights: null,
    supplyOrigin: null,
  },
  charts: {}, // Store chart instances for cleanup
  loading: {
    overview: false,
    trends: false,
    funnel: false,
    markets: false,
    varieties: false,
    payments: false,
    insights: false,
    supplyOrigin: false,
  },
};

// =====================================================
// FORMATTING UTILITIES
// =====================================================

function formatCurrency(value) {
  if (value === null || value === undefined) return "₹0.00";
  const num = parseFloat(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return "0";
  return parseFloat(value).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercentage(value) {
  if (value === null || value === undefined) return "0%";
  return parseFloat(value).toFixed(1) + "%";
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN");
}

// =====================================================
// API FUNCTIONS
// =====================================================

async function fetchAnalytics(endpoint, params = {}) {
  try {
    const queryParams = new URLSearchParams();

    if (dashboardState.filters.start_date) {
      queryParams.append("start_date", dashboardState.filters.start_date);
    }
    if (dashboardState.filters.end_date) {
      queryParams.append("end_date", dashboardState.filters.end_date);
    }
    if (
      dashboardState.filters.market &&
      dashboardState.filters.market !== "all"
    ) {
      queryParams.append("market", dashboardState.filters.market);
    }
    if (
      dashboardState.filters.variety &&
      dashboardState.filters.variety !== "all"
    ) {
      queryParams.append("variety", dashboardState.filters.variety);
    }

    // Add any additional params
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const url = `${API_BASE}/api/analytics/${endpoint}?${queryParams}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Unknown error");
    }

    return result.data;
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error);
    throw error;
  }
}

async function loadAllAnalytics() {
  try {
    // Show loading state for all sections
    Object.keys(dashboardState.loading).forEach((key) => {
      dashboardState.loading[key] = true;
    });

    // Fetch all endpoints in parallel
    const results = await Promise.allSettled([
      fetchAnalytics("overview").then((data) => {
        dashboardState.data.overview = data;
        return data;
      }),
      fetchAnalytics("trends").then((data) => {
        dashboardState.data.trends = data;
        return data;
      }),
      fetchAnalytics("funnel").then((data) => {
        dashboardState.data.funnel = data;
        return data;
      }),
      fetchAnalytics("markets").then((data) => {
        dashboardState.data.markets = data;
        return data;
      }),
      fetchAnalytics("varieties").then((data) => {
        dashboardState.data.varieties = data;
        return data;
      }),
      fetchAnalytics("payments").then((data) => {
        dashboardState.data.payments = data;
        return data;
      }),
      fetchAnalytics("insights").then((data) => {
        dashboardState.data.insights = data;
        return data;
      }),
      fetchAnalytics("supply-origin").then((data) => {
        dashboardState.data.supplyOrigin = data;
        return data;
      }),
    ]);

    // Update loading states based on results
    const endpoints = [
      "overview",
      "trends",
      "funnel",
      "markets",
      "varieties",
      "payments",
      "insights",
      "supplyOrigin",
    ];
    results.forEach((result, idx) => {
      dashboardState.loading[endpoints[idx]] = false;
      if (result.status === "rejected") {
        console.error(`Failed to load ${endpoints[idx]}:`, result.reason);
      }
    });

    // Clear error box
    const errorBox = document.getElementById("dashboardError");
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }
  } catch (error) {
    console.error("Failed to load analytics:", error);
    const errorBox = document.getElementById("dashboardError");
    if (errorBox) {
      errorBox.style.display = "block";
      errorBox.textContent =
        "Failed to load analytics data. Please check your connection and try again.";
    }
  }
}

// =====================================================
// CHART MANAGEMENT
// =====================================================

function destroyChart(chartId) {
  if (dashboardState.charts[chartId]) {
    dashboardState.charts[chartId].destroy();
    delete dashboardState.charts[chartId];
  }
}

function destroyAllCharts() {
  Object.keys(dashboardState.charts).forEach((chartId) => {
    dashboardState.charts[chartId].destroy();
  });
  dashboardState.charts = {};
}

function showLoadingState(containerId, sectionName = "this section") {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="state-message">Loading ${sectionName}...</div>`;
  }
}

function showEmptyState(
  containerId,
  message = "No data available for the selected filters.",
) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="state-message">${message}</div>`;
  }
}

function showErrorState(
  containerId,
  message = "Unable to load this analytics section. Please try again.",
) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="state-message" style="color: var(--danger);">⚠️ ${message}</div>`;
  }
}

// =====================================================
// RENDERING FUNCTIONS
// =====================================================

function renderKPIs() {
  const container = document.getElementById("kpiGrid");
  if (!container) return;

  if (dashboardState.loading.overview) {
    container.innerHTML = '<div class="state-message">Loading KPIs...</div>';
    return;
  }

  const data = dashboardState.data.overview;
  if (!data) {
    showEmptyState("kpiGrid");
    return;
  }

  const kpiData = [
    {
      label: "Total Farmers",
      value: data.total_farmers || 0,
      format: "number",
    },
    {
      label: "Total Brokers",
      value: data.total_brokers || 0,
      format: "number",
    },
    {
      label: "Approved Brokers",
      value: data.approved_brokers || 0,
      format: "number",
    },
    {
      label: "Pending Brokers",
      value: data.pending_brokers || 0,
      format: "number",
    },
    {
      label: "Total Sell Requests",
      value: data.total_sell_requests || 0,
      format: "number",
    },
    {
      label: "Request Acceptance Rate",
      value: data.request_acceptance_rate || 0,
      format: "percentage",
    },
    {
      label: "Total Trading Quantity",
      value: data.total_trading_quantity || 0,
      format: "tons",
    },
    {
      label: "Total Trading Value",
      value: data.total_trading_value || 0,
      format: "currency",
    },
    {
      label: "Payment Completion Rate",
      value: data.payment_completion_rate || 0,
      format: "percentage",
    },
    {
      label: "Pending Payment Value",
      value: data.pending_payment_value || 0,
      format: "currency",
    },
    {
      label: "Completed Payment Value",
      value: data.completed_payment_value || 0,
      format: "currency",
    },
  ];

  container.innerHTML = kpiData
    .map((kpi) => {
      let displayValue;
      switch (kpi.format) {
        case "currency":
          displayValue = formatCurrency(kpi.value);
          break;
        case "percentage":
          displayValue = formatPercentage(kpi.value);
          break;
        case "tons":
          displayValue = formatNumber(kpi.value, 2) + " tons";
          break;
        default:
          displayValue = formatNumber(kpi.value, 0);
      }

      return `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
        <div class="kpi-value">${escapeHtml(displayValue)}</div>
      </div>
    `;
    })
    .join("");
}

function renderTrendsCharts() {
  if (dashboardState.loading.trends) {
    showLoadingState("sellRequestsChart", "trends");
    return;
  }

  const data = dashboardState.data.trends;
  if (!data) {
    showEmptyState("sellRequestsChart");
    return;
  }

  // Destroy existing charts
  destroyChart("sellRequestsChart");
  destroyChart("tradingValueChart");
  destroyChart("tradingQuantityChart");
  destroyChart("paymentActivityChart");

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          font: { size: 11 },
          usePointStyle: true,
        },
      },
    },
  };

  // 1. Sell Requests Over Time
  if (data.sell_requests_over_time && data.sell_requests_over_time.length > 0) {
    const ctx1 = document.getElementById("sellRequestsChart");
    if (ctx1) {
      const chart1 = new Chart(ctx1, {
        type: "line",
        data: {
          labels: data.sell_requests_over_time.map((d) => d.date),
          datasets: [
            {
              label: "Sell Requests",
              data: data.sell_requests_over_time.map((d) => d.count),
              borderColor: "#155724",
              backgroundColor: "rgba(21, 87, 36, 0.1)",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: "#155724",
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (value) => value },
            },
          },
          plugins: {
            ...chartDefaults.plugins,
            title: { display: true, text: "Sell Requests Over Time" },
          },
        },
      });
      dashboardState.charts.sellRequestsChart = chart1;
    }
  } else {
    showEmptyState("sellRequestsChart", "No sell request data");
  }

  // 2. Trading Value Over Time
  if (data.trading_value_over_time && data.trading_value_over_time.length > 0) {
    const ctx2 = document.getElementById("tradingValueChart");
    if (ctx2) {
      const chart2 = new Chart(ctx2, {
        type: "line",
        data: {
          labels: data.trading_value_over_time.map((d) => d.date),
          datasets: [
            {
              label: "Trading Value (₹)",
              data: data.trading_value_over_time.map((d) => d.value),
              borderColor: "#f4a300",
              backgroundColor: "rgba(244, 163, 0, 0.1)",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: "#f4a300",
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => "₹" + (value / 100000).toFixed(0) + "L",
              },
            },
          },
          plugins: {
            ...chartDefaults.plugins,
            title: { display: true, text: "Trading Value Over Time" },
          },
        },
      });
      dashboardState.charts.tradingValueChart = chart2;
    }
  } else {
    showEmptyState("tradingValueChart", "No trading value data");
  }

  // 3. Trading Quantity Over Time
  if (
    data.trading_quantity_over_time &&
    data.trading_quantity_over_time.length > 0
  ) {
    const ctx3 = document.getElementById("tradingQuantityChart");
    if (ctx3) {
      const chart3 = new Chart(ctx3, {
        type: "line",
        data: {
          labels: data.trading_quantity_over_time.map((d) => d.date),
          datasets: [
            {
              label: "Trading Quantity (tons)",
              data: data.trading_quantity_over_time.map((d) => d.quantity),
              borderColor: "#1f7a8c",
              backgroundColor: "rgba(31, 122, 140, 0.1)",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: "#1f7a8c",
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (value) => value + " tons" },
            },
          },
          plugins: {
            ...chartDefaults.plugins,
            title: { display: true, text: "Trading Quantity Over Time" },
          },
        },
      });
      dashboardState.charts.tradingQuantityChart = chart3;
    }
  } else {
    showEmptyState("tradingQuantityChart", "No trading quantity data");
  }

  // 4. Payment Activity Over Time
  if (
    data.payment_activity_over_time &&
    data.payment_activity_over_time.length > 0
  ) {
    const ctx4 = document.getElementById("paymentActivityChart");
    if (ctx4) {
      const chart4 = new Chart(ctx4, {
        type: "line",
        data: {
          labels: data.payment_activity_over_time.map((d) => d.date),
          datasets: [
            {
              label: "Paid",
              data: data.payment_activity_over_time.map((d) => d.paid || 0),
              borderColor: "#27ae60",
              backgroundColor: "rgba(39, 174, 96, 0.1)",
              tension: 0.3,
              borderWidth: 2,
            },
            {
              label: "Awaiting Verification",
              data: data.payment_activity_over_time.map(
                (d) => d.awaiting_verification || 0,
              ),
              borderColor: "#f39c12",
              backgroundColor: "rgba(243, 156, 18, 0.1)",
              tension: 0.3,
              borderWidth: 2,
            },
            {
              label: "Pending",
              data: data.payment_activity_over_time.map((d) => d.pending || 0),
              borderColor: "#c0392b",
              backgroundColor: "rgba(192, 57, 43, 0.1)",
              tension: 0.3,
              borderWidth: 2,
            },
          ],
        },
        options: {
          ...chartDefaults,
          scales: {
            y: { beginAtZero: true },
          },
          plugins: {
            ...chartDefaults.plugins,
            title: { display: true, text: "Payment Activity Over Time" },
          },
        },
      });
      dashboardState.charts.paymentActivityChart = chart4;
    }
  } else {
    showEmptyState("paymentActivityChart", "No payment activity data");
  }
}

function renderFunnelChart() {
  if (dashboardState.loading.funnel) {
    showLoadingState("funnelContainer", "funnel");
    return;
  }

  const data = dashboardState.data.funnel;
  if (!data || data.length === 0) {
    showEmptyState("funnelContainer");
    return;
  }

  const container = document.getElementById("funnelContainer");
  if (!container) return;

  // Find largest drop-off
  let largestDropStageIndex = -1;
  let largestDropRate = 0;
  data.forEach((stage, idx) => {
    if (stage.drop_off_rate > largestDropRate) {
      largestDropRate = stage.drop_off_rate;
      largestDropStageIndex = idx;
    }
  });

  container.innerHTML = data
    .map((stage, idx) => {
      const maxCount = Math.max(...data.map((s) => s.count), 1);
      const fillPercentage = (stage.count / maxCount) * 100;
      const isLargestDrop =
        idx === largestDropStageIndex && largestDropRate > 20;

      return `
      <div class="funnel-stage ${isLargestDrop ? "largest-drop" : ""}">
        <div class="funnel-name">${escapeHtml(stage.stage)}</div>
        <div class="funnel-track">
          <div class="funnel-fill" style="width: ${fillPercentage}%"></div>
        </div>
        <div class="funnel-meta">
          ${stage.count} (${formatPercentage(stage.conversion_rate)})
        </div>
      </div>
    `;
    })
    .join("");
}

function renderMarketCharts() {
  if (dashboardState.loading.markets) {
    showLoadingState("topMarketsValueChart", "market analytics");
    return;
  }

  const data = dashboardState.data.markets;
  if (!data || data.length === 0) {
    showEmptyState("topMarketsValueChart");
    showEmptyState("marketAcceptanceChart");
    return;
  }

  destroyChart("topMarketsValueChart");
  destroyChart("marketAcceptanceChart");

  // Sort by trading value (descending)
  const sortedByValue = [...data].sort(
    (a, b) => b.trading_value - a.trading_value,
  );

  // 1. Top Markets by Trading Value
  const ctx1 = document.getElementById("topMarketsValueChart");
  if (ctx1 && sortedByValue.length > 0) {
    const chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: sortedByValue.map((m) => m.market_name),
        datasets: [
          {
            label: "Trading Value (₹)",
            data: sortedByValue.map((m) => m.trading_value),
            backgroundColor: "#155724",
            borderColor: "#0e3b1c",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: sortedByValue.length > 5 ? "y" : "x",
        scales: {
          x: {
            ticks: {
              callback: (value) => "₹" + (value / 100000).toFixed(0) + "L",
            },
          },
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Top Markets by Trading Value" },
        },
      },
    });
    dashboardState.charts.topMarketsValueChart = chart1;
  }

  // 2. Market Acceptance Rate
  const ctx2 = document.getElementById("marketAcceptanceChart");
  if (ctx2 && data.length > 0) {
    const chart2 = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: data.map((m) => m.market_name),
        datasets: [
          {
            label: "Acceptance Rate (%)",
            data: data.map((m) => m.acceptance_rate),
            backgroundColor: "#f4a300",
            borderColor: "#c97d00",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              callback: (value) => value + "%",
            },
          },
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Market Acceptance Rate" },
        },
      },
    });
    dashboardState.charts.marketAcceptanceChart = chart2;
  }
}

function renderVarietyCharts() {
  if (dashboardState.loading.varieties) {
    showLoadingState("varietyQuantityChart", "variety analytics");
    return;
  }

  const data = dashboardState.data.varieties;
  if (!data || data.length === 0) {
    showEmptyState("varietyQuantityChart");
    showEmptyState("varietyValueChart");
    return;
  }

  destroyChart("varietyQuantityChart");
  destroyChart("varietyValueChart");

  // Sort by quantity (descending)
  const sortedByQuantity = [...data].sort(
    (a, b) => b.trading_quantity - a.trading_quantity,
  );
  // Sort by value (descending)
  const sortedByValue = [...data].sort(
    (a, b) => b.trading_value - a.trading_value,
  );

  // 1. Top Varieties by Trading Quantity
  const ctx1 = document.getElementById("varietyQuantityChart");
  if (ctx1 && sortedByQuantity.length > 0) {
    const chart1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: sortedByQuantity.map((v) => v.variety),
        datasets: [
          {
            label: "Trading Quantity (tons)",
            data: sortedByQuantity.map((v) => v.trading_quantity),
            backgroundColor: "#1f7a8c",
            borderColor: "#154a59",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: sortedByQuantity.length > 5 ? "y" : "x",
        scales: {
          x: {
            ticks: {
              callback: (value) => value + " tons",
            },
          },
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Top Varieties by Trading Quantity" },
        },
      },
    });
    dashboardState.charts.varietyQuantityChart = chart1;
  }

  // 2. Top Varieties by Trading Value
  const ctx2 = document.getElementById("varietyValueChart");
  if (ctx2 && sortedByValue.length > 0) {
    const chart2 = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: sortedByValue.map((v) => v.variety),
        datasets: [
          {
            label: "Trading Value (₹)",
            data: sortedByValue.map((v) => v.trading_value),
            backgroundColor: "#c0392b",
            borderColor: "#8b2a1f",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: sortedByValue.length > 5 ? "y" : "x",
        scales: {
          x: {
            ticks: {
              callback: (value) => "₹" + (value / 100000).toFixed(0) + "L",
            },
          },
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Top Varieties by Trading Value" },
        },
      },
    });
    dashboardState.charts.varietyValueChart = chart2;
  }
}

function renderPaymentAnalytics() {
  if (dashboardState.loading.payments) {
    showLoadingState("paymentStatusChart", "payment analytics");
    return;
  }

  const data = dashboardState.data.payments;
  if (!data) {
    showEmptyState("paymentStatusChart");
    showEmptyState("paymentSummary");
    return;
  }

  // Render Payment Summary Cards
  if (data.payment_totals) {
    const summaryContainer = document.getElementById("paymentSummary");
    if (summaryContainer) {
      const totals = data.payment_totals;
      summaryContainer.innerHTML = `
        <div class="summary-item">
          <div class="summary-label">Total Payment Value</div>
          <div class="summary-value">${formatCurrency(totals.total_payment_value)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Pending Value</div>
          <div class="summary-value">${formatCurrency(totals.pending_payment_value)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Paid Value</div>
          <div class="summary-value">${formatCurrency(totals.paid_value)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Rejected Value</div>
          <div class="summary-value">${formatCurrency(totals.rejected_value)}</div>
        </div>
      `;
    }
  }

  // Render Payment Status Distribution Chart
  destroyChart("paymentStatusChart");

  if (data.status_distribution && data.status_distribution.length > 0) {
    const ctx = document.getElementById("paymentStatusChart");
    if (ctx) {
      const colors = {
        PENDING: "#c0392b",
        INITIATED: "#f39c12",
        AWAITING_VERIFICATION: "#f39c12",
        PAID: "#27ae60",
        REJECTED: "#8b2a1f",
      };

      const chart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: data.status_distribution.map((s) =>
            s.status.replace(/_/g, " "),
          ),
          datasets: [
            {
              data: data.status_distribution.map((s) => s.unique_request_count),
              backgroundColor: data.status_distribution.map(
                (s) => colors[s.status] || "#94a3b8",
              ),
              borderColor: "#fff",
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 11 } },
            },
            title: { display: true, text: "Payment Status Distribution" },
          },
        },
      });
      dashboardState.charts.paymentStatusChart = chart;
    }
  }

  // Render Priority Payments Table
  const tableBody = document.getElementById("priorityPaymentsBody");
  if (
    tableBody &&
    data.priority_payments &&
    data.priority_payments.length > 0
  ) {
    tableBody.innerHTML = data.priority_payments
      .map(
        (payment) => `
      <tr>
        <td>${escapeHtml(payment.order_id || "N/A")}</td>
        <td>${escapeHtml(String(payment.sell_request_id || "N/A"))}</td>
        <td>${escapeHtml(payment.farmer_name || "Unknown")}</td>
        <td>${escapeHtml(payment.market || "Unknown")}</td>
        <td><span class="status-chip ${getStatusClass(payment.payment_status)}">${escapeHtml(payment.payment_status)}</span></td>
        <td>${formatNumber(payment.actual_weight_tons, 2)} tons</td>
        <td>${formatCurrency(payment.final_price_per_kg)}/kg</td>
        <td>${formatCurrency(payment.calculated_value)}</td>
        <td>${formatDate(payment.created_at)}</td>
      </tr>
    `,
      )
      .join("");
  } else if (tableBody) {
    tableBody.innerHTML =
      '<tr><td colspan="9" class="empty-row">No pending payments found</td></tr>';
  }
}

// ============================================
// SUPPLY ORIGIN ANALYTICS
// ============================================

function renderSupplyOrigin() {
  if (dashboardState.loading.supplyOrigin) {
    showLoadingState("supplyOriginSection", "supply origin analytics");
    return;
  }

  const data = dashboardState.data.supplyOrigin;
  if (!data) {
    showEmptyState("supplyOriginSection");
    return;
  }

  const {
    source_locations,
    top_varieties,
    location_variety_combinations,
    summary = {},
  } = data;

  // ===== RENDER SUMMARY CARDS =====
  const summaryContainer = document.getElementById("supplyOriginSummary");
  if (summaryContainer) {
    let summaryHTML = "";

    if (summary.top_source_location) {
      const loc = summary.top_source_location;
      summaryHTML += `
        <div class="summary-item">
          <div class="summary-label">Top Source Location</div>
          <div class="summary-value">${loc.source_location}</div>
          <div class="summary-detail">${formatNumber(loc.total_quantity_tons)} tons | ${loc.total_farmers} farmers</div>
        </div>
      `;
    }

    if (summary.top_variety) {
      const var_data = summary.top_variety;
      summaryHTML += `
        <div class="summary-item">
          <div class="summary-label">Top Mango Variety</div>
          <div class="summary-value">${var_data.mango_variety}</div>
          <div class="summary-detail">${formatNumber(var_data.total_quantity_tons)} tons | ₹${formatNumber(var_data.average_final_price)}/kg avg</div>
        </div>
      `;
    }

    if (summary.top_combination) {
      const comb = summary.top_combination;
      summaryHTML += `
        <div class="summary-item">
          <div class="summary-label">Top Location×Variety</div>
          <div class="summary-value">${comb.source_location} → ${comb.mango_variety}</div>
          <div class="summary-detail">${formatNumber(comb.total_quantity_tons)} tons | ${comb.sell_request_count} requests</div>
        </div>
      `;
    }

    summaryContainer.innerHTML =
      summaryHTML || '<p class="empty-state">No data available</p>';
  }

  // ===== RENDER SOURCE LOCATIONS CHART =====
  const sourceLocationsChartContainer = document.getElementById(
    "sourceLocationsChart",
  );
  if (
    sourceLocationsChartContainer &&
    source_locations &&
    source_locations.length > 0
  ) {
    const top10Locations = source_locations.slice(0, 10);
    const ctx = sourceLocationsChartContainer.getContext("2d");

    dashboardState.charts.sourceLocationsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top10Locations.map((l) => l.source_location),
        datasets: [
          {
            label: "Quantity (Tons)",
            data: top10Locations.map((l) => l.total_quantity_tons),
            backgroundColor: "#28a745",
            borderColor: "#1e7e34",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: "y",
        plugins: {
          legend: { display: true, position: "top" },
          title: { display: true, text: "Top Source Locations by Quantity" },
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => v.toFixed(1) } },
        },
      },
    });
  }

  // ===== RENDER TOP VARIETIES CHART =====
  const topVarietiesChartContainer =
    document.getElementById("topVarietiesChart");
  if (topVarietiesChartContainer && top_varieties && top_varieties.length > 0) {
    const top10Varieties = top_varieties.slice(0, 10);
    const ctx = topVarietiesChartContainer.getContext("2d");

    dashboardState.charts.topVarietiesChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top10Varieties.map((v) => v.mango_variety),
        datasets: [
          {
            label: "Quantity (Tons)",
            data: top10Varieties.map((v) => v.total_quantity_tons),
            backgroundColor: "#ffc107",
            borderColor: "#e0a800",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: "y",
        plugins: {
          legend: { display: true, position: "top" },
          title: { display: true, text: "Top Mango Varieties by Quantity" },
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => v.toFixed(1) } },
        },
      },
    });
  }

  // ===== RENDER LOCATION × VARIETY MATRIX TABLE =====
  const matrixContainer = document.getElementById("locationVarietyMatrix");
  if (
    matrixContainer &&
    location_variety_combinations &&
    location_variety_combinations.length > 0
  ) {
    // Build pivot table structure
    const locations = [
      ...new Set(location_variety_combinations.map((c) => c.source_location)),
    ];
    const varieties = [
      ...new Set(location_variety_combinations.map((c) => c.mango_variety)),
    ];

    // Create data map for quick lookup
    const dataMap = {};
    location_variety_combinations.forEach((combo) => {
      const key = `${combo.source_location}|${combo.mango_variety}`;
      dataMap[key] = combo;
    });

    // Calculate row and column totals
    const locationTotals = {};
    const varietyTotals = {};
    let grandTotal = 0;

    location_variety_combinations.forEach((combo) => {
      const qty = combo.total_quantity_tons || 0;
      locationTotals[combo.source_location] =
        (locationTotals[combo.source_location] || 0) + qty;
      varietyTotals[combo.mango_variety] =
        (varietyTotals[combo.mango_variety] || 0) + qty;
      grandTotal += qty;
    });

    // Build HTML table
    let tableHTML = `
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="location-header">Source Location</th>
            ${varieties.map((v) => `<th class="variety-header">${v}</th>`).join("")}
            <th class="total-header">Location Total (Tons)</th>
          </tr>
        </thead>
        <tbody>
    `;

    locations.forEach((loc) => {
      tableHTML += `<tr>
        <td class="location-name"><strong>${loc}</strong></td>`;

      varieties.forEach((var_name) => {
        const key = `${loc}|${var_name}`;
        const combo = dataMap[key];
        tableHTML += `<td class="matrix-cell">${combo ? formatNumber(combo.total_quantity_tons) : "-"}</td>`;
      });

      const locTotal = locationTotals[loc] || 0;
      tableHTML += `<td class="total-cell"><strong>${formatNumber(locTotal)}</strong></td>
      </tr>`;
    });

    // Add variety totals row
    tableHTML += `<tr class="totals-row">
      <td class="location-name"><strong>Variety Total</strong></td>`;

    varieties.forEach((var_name) => {
      const varTotal = varietyTotals[var_name] || 0;
      tableHTML += `<td class="total-cell"><strong>${formatNumber(varTotal)}</strong></td>`;
    });

    tableHTML += `<td class="grand-total-cell"><strong>${formatNumber(grandTotal)}</strong></td>
    </tr>
        </tbody>
      </table>
    `;

    matrixContainer.innerHTML = tableHTML;
  }
}

function renderInsights() {
  if (dashboardState.loading.insights) {
    showLoadingState("insightList", "insights");
    return;
  }

  const data = dashboardState.data.insights;
  if (!data || data.length === 0) {
    showEmptyState("insightList");
    return;
  }

  const container = document.getElementById("insightList");
  if (!container) return;

  container.innerHTML = data
    .map((insight) => {
      const severityClass = `severity-${insight.severity.toLowerCase()}`;
      const pillClass = insight.severity.toLowerCase();

      return `
      <div class="insight-item ${severityClass}">
        <div class="insight-head">
          <span class="severity-pill ${pillClass}">${insight.severity}</span>
          <strong>${escapeHtml(insight.title)}</strong>
        </div>
        <p style="margin: 6px 0; font-size: 0.9rem; color: #475569;">
          ${escapeHtml(insight.message)}
        </p>
        ${
          insight.metric
            ? `
          <p style="margin: 6px 0; font-size: 0.85rem; color: #64748b;">
            <strong>${escapeHtml(insight.metric.label)}:</strong>
            ${formatNumber(insight.metric.value, 2)}
          </p>
        `
            : ""
        }
      </div>
    `;
    })
    .join("");
}

function renderMarketTable() {
  if (dashboardState.loading.markets) return;

  const data = dashboardState.data.markets;
  const tableBody = document.getElementById("marketTableBody");
  if (!tableBody) return;

  if (!data || data.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="9" class="empty-row">No market data available</td></tr>';
    return;
  }

  tableBody.innerHTML = data
    .map(
      (market) => `
    <tr>
      <td><strong>${escapeHtml(market.market_name || "Unknown")}</strong></td>
      <td>${market.total_requests || 0}</td>
      <td>${market.accepted_requests || 0}</td>
      <td>${market.rejected_requests || 0}</td>
      <td>${market.pending_requests || 0}</td>
      <td>${formatPercentage(market.acceptance_rate)}</td>
      <td>${formatNumber(market.trading_quantity, 2)} tons</td>
      <td>${formatCurrency(market.trading_value)}</td>
      <td>${formatCurrency(market.average_final_price)}/kg</td>
    </tr>
  `,
    )
    .join("");
}

function renderVarietyTable() {
  if (dashboardState.loading.varieties) return;

  const data = dashboardState.data.varieties;
  const tableBody = document.getElementById("varietyTableBody");
  if (!tableBody) return;

  if (!data || data.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="empty-row">No variety data available</td></tr>';
    return;
  }

  tableBody.innerHTML = data
    .map(
      (variety) => `
    <tr>
      <td><strong>${escapeHtml(variety.variety || "Unknown")}</strong></td>
      <td>${variety.total_requests || 0}</td>
      <td>${variety.accepted_requests || 0}</td>
      <td>${formatNumber(variety.trading_quantity, 2)} tons</td>
      <td>${formatCurrency(variety.trading_value)}</td>
      <td>${formatCurrency(variety.average_final_price)}/kg</td>
    </tr>
  `,
    )
    .join("");
}

async function renderDashboard() {
  // Destroy all charts before re-rendering
  destroyAllCharts();

  // Load all analytics data
  await loadAllAnalytics();

  // Render all sections
  renderKPIs();
  renderTrendsCharts();
  renderFunnelChart();
  renderMarketCharts();
  renderVarietyCharts();
  renderPaymentAnalytics();
  renderSupplyOrigin();
  renderInsights();
  renderMarketTable();
  renderVarietyTable();

  // Update filter dropdowns
  await populateFilterDropdowns();
}

// =====================================================
// FILTER MANAGEMENT
// =====================================================

async function populateFilterDropdowns() {
  // Populate market filter
  const marketSelect = document.getElementById("marketFilter");
  if (marketSelect && dashboardState.data.markets) {
    const markets = [
      ...new Set(dashboardState.data.markets.map((m) => m.market_name)),
    ].sort();
    const currentValue = marketSelect.value;

    marketSelect.innerHTML =
      '<option value="all">All Markets</option>' +
      markets
        .map(
          (m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`,
        )
        .join("");

    if (currentValue !== "all") {
      marketSelect.value = currentValue;
    }
  }

  // Populate variety filter
  const varietySelect = document.getElementById("varietyFilter");
  if (varietySelect && dashboardState.data.varieties) {
    const varieties = [
      ...new Set(dashboardState.data.varieties.map((v) => v.variety)),
    ].sort();
    const currentValue = varietySelect.value;

    varietySelect.innerHTML =
      '<option value="all">All Varieties</option>' +
      varieties
        .map(
          (v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`,
        )
        .join("");

    if (currentValue !== "all") {
      varietySelect.value = currentValue;
    }
  }
}

function applyQuickDateRange(range) {
  const today = new Date();
  const endDate = new Date(today);
  let startDate = new Date(today);

  switch (range) {
    case "7d":
      startDate.setDate(today.getDate() - 6);
      break;
    case "30d":
      startDate.setDate(today.getDate() - 29);
      break;
    case "month":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "all":
    default:
      startDate = new Date(2000, 0, 1);
  }

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  dashboardState.filters.start_date = formatDate(startDate);
  dashboardState.filters.end_date = formatDate(endDate);

  document.getElementById("startDate").value =
    dashboardState.filters.start_date;
  document.getElementById("endDate").value = dashboardState.filters.end_date;

  updateActiveRangeButton(range);
  renderDashboard();
}

function updateActiveRangeButton(range) {
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.range === range) {
      btn.classList.add("active");
    }
  });
}

function validateAndApplyFilters() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const market = document.getElementById("marketFilter").value || "all";
  const variety = document.getElementById("varietyFilter").value || "all";

  // Validate date range
  if (startDate && endDate && startDate > endDate) {
    const validationBox = document.getElementById("filterValidation");
    if (validationBox) {
      validationBox.style.display = "block";
      validationBox.textContent =
        "End date must be greater than or equal to start date";
    }
    return;
  }

  // Clear validation message
  const validationBox = document.getElementById("filterValidation");
  if (validationBox) {
    validationBox.style.display = "none";
    validationBox.textContent = "";
  }

  // Update filters
  dashboardState.filters.start_date = startDate || null;
  dashboardState.filters.end_date = endDate || null;
  dashboardState.filters.market = market !== "all" ? market : null;
  dashboardState.filters.variety = variety !== "all" ? variety : null;

  // Reset active button since custom filters were applied
  updateActiveRangeButton("custom");

  renderDashboard();
}

function resetFilters() {
  dashboardState.filters.start_date = null;
  dashboardState.filters.end_date = null;
  dashboardState.filters.market = null;
  dashboardState.filters.variety = null;

  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  document.getElementById("marketFilter").value = "all";
  document.getElementById("varietyFilter").value = "all";

  applyQuickDateRange("all");
}

// =====================================================
// CSV EXPORT
// =====================================================

function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(filename, headers, rows) {
  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportMarketsCSV() {
  if (
    !dashboardState.data.markets ||
    dashboardState.data.markets.length === 0
  ) {
    alert("No market data to export");
    return;
  }

  const headers = [
    "Market Name",
    "Total Requests",
    "Accepted",
    "Rejected",
    "Pending",
    "Acceptance Rate (%)",
    "Trading Quantity (tons)",
    "Trading Value (₹)",
    "Average Final Price (₹)",
  ];

  const rows = dashboardState.data.markets.map((m) => [
    m.market_name,
    m.total_requests,
    m.accepted_requests,
    m.rejected_requests,
    m.pending_requests,
    m.acceptance_rate.toFixed(2),
    m.trading_quantity.toFixed(2),
    m.trading_value.toFixed(2),
    m.average_final_price.toFixed(2),
  ]);

  const today = new Date().toISOString().split("T")[0];
  downloadCSV(`market_performance_${today}.csv`, headers, rows);
}

function exportVarietiesCSV() {
  if (
    !dashboardState.data.varieties ||
    dashboardState.data.varieties.length === 0
  ) {
    alert("No variety data to export");
    return;
  }

  const headers = [
    "Variety",
    "Total Requests",
    "Accepted Requests",
    "Trading Quantity (tons)",
    "Trading Value (₹)",
    "Average Final Price (₹)",
  ];

  const rows = dashboardState.data.varieties.map((v) => [
    v.variety,
    v.total_requests,
    v.accepted_requests,
    v.trading_quantity.toFixed(2),
    v.trading_value.toFixed(2),
    v.average_final_price.toFixed(2),
  ]);

  const today = new Date().toISOString().split("T")[0];
  downloadCSV(`variety_performance_${today}.csv`, headers, rows);
}

function exportPaymentsCSV() {
  if (
    !dashboardState.data.payments ||
    !dashboardState.data.payments.priority_payments ||
    dashboardState.data.payments.priority_payments.length === 0
  ) {
    alert("No payment data to export");
    return;
  }

  const headers = [
    "Order ID",
    "Sell Request ID",
    "Farmer Name",
    "Market",
    "Payment Status",
    "Quantity (tons)",
    "Final Price (₹/kg)",
    "Calculated Value (₹)",
    "Date",
  ];

  const rows = dashboardState.data.payments.priority_payments.map((p) => [
    p.order_id || "N/A",
    p.sell_request_id || "N/A",
    p.farmer_name || "Unknown",
    p.market || "Unknown",
    p.payment_status,
    p.actual_weight_tons.toFixed(2),
    p.final_price_per_kg.toFixed(2),
    p.calculated_value.toFixed(2),
    formatDate(p.created_at),
  ]);

  const today = new Date().toISOString().split("T")[0];
  downloadCSV(`priority_payments_${today}.csv`, headers, rows);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getStatusClass(status) {
  const statusMap = {
    PAID: "success",
    PENDING: "neutral",
    INITIATED: "warning",
    AWAITING_VERIFICATION: "warning",
    REJECTED: "danger",
  };
  return statusMap[status] || "neutral";
}

// =====================================================
// EVENT BINDING
// =====================================================

function bindEvents() {
  // Filter buttons
  document
    .getElementById("applyFiltersBtn")
    ?.addEventListener("click", validateAndApplyFilters);
  document
    .getElementById("resetFiltersBtn")
    ?.addEventListener("click", resetFilters);

  // Quick date range buttons
  ["all", "7d", "30d", "month"].forEach((range) => {
    const btn = document.getElementById(`${range}Btn`);
    if (btn) {
      btn.addEventListener("click", () => applyQuickDateRange(range));
    }
  });

  // Export buttons
  document
    .getElementById("exportMarketsBtn")
    ?.addEventListener("click", exportMarketsCSV);
  document
    .getElementById("exportVarietiesBtn")
    ?.addEventListener("click", exportVarietiesCSV);
  document
    .getElementById("exportPaymentsBtn")
    ?.addEventListener("click", exportPaymentsCSV);

  // Navigation
  document
    .getElementById("backToDashboardBtn")
    ?.addEventListener("click", () => {
      window.location.href = "host_dashboard.html";
    });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      localStorage.removeItem("host_password_verified");
      window.location.href = "host_access.html";
    }
  });
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", async function () {
  // Check authentication
  if (localStorage.getItem("host_password_verified") !== "true") {
    window.location.href = "host_access.html";
    return;
  }

  bindEvents();
  applyQuickDateRange("all");
});
