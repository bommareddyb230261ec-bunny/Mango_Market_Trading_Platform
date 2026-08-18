const API_BASE = "http://127.0.0.1:5000";

const dashboardState = {
  brokers: [],
  payments: [],
  marketFilter: "all",
  startDate: "",
  endDate: "",
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-IN");

document.addEventListener("DOMContentLoaded", async function () {
  if (localStorage.getItem("host_password_verified") !== "true") {
    window.location.href = "host_access.html";
    return;
  }

  bindEvents();
  applyQuickRange("all");
  await loadDashboardData();
});

function bindEvents() {
  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const market = document.getElementById("marketFilter").value;

    dashboardState.startDate = startDate;
    dashboardState.endDate = endDate;
    dashboardState.marketFilter = market;

    renderDashboard();
  });

  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";
    document.getElementById("marketFilter").value = "all";
    dashboardState.startDate = "";
    dashboardState.endDate = "";
    dashboardState.marketFilter = "all";
    renderDashboard();
  });

  ["all", "7d", "30d", "month"].forEach((rangeId) => {
    const btn = document.getElementById(rangeId + "Btn");
    if (btn) {
      btn.addEventListener("click", () => applyQuickRange(rangeId));
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to log out?")) {
      localStorage.removeItem("host_password_verified");
      window.location.href = "host_access.html";
    }
  });

  document
    .getElementById("backToDashboardBtn")
    .addEventListener("click", () => {
      window.location.href = "host_dashboard.html";
    });
}

function applyQuickRange(range) {
  const today = new Date();
  const endDate = new Date(today);
  let startDate = new Date(today);

  if (range === "7d") {
    startDate.setDate(today.getDate() - 6);
  } else if (range === "30d") {
    startDate.setDate(today.getDate() - 29);
  } else if (range === "month") {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (range === "all") {
    startDate = new Date(2000, 0, 1);
  }

  document.getElementById("startDate").value = formatDateInput(startDate);
  document.getElementById("endDate").value = formatDateInput(endDate);
  dashboardState.startDate = document.getElementById("startDate").value;
  dashboardState.endDate = document.getElementById("endDate").value;
  dashboardState.marketFilter =
    document.getElementById("marketFilter").value || "all";

  renderDashboard();
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadDashboardData() {
  try {
    const [brokersRes, paymentsRes] = await Promise.all([
      fetch(`${API_BASE}/api/host/brokers/all`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }),
      fetch(`${API_BASE}/api/host/payments/all`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }),
    ]);

    if (!brokersRes.ok || !paymentsRes.ok) {
      throw new Error("Unable to load analytics data");
    }

    dashboardState.brokers = await brokersRes.json();
    dashboardState.payments = await paymentsRes.json();

    populateMarketFilter();
    renderDashboard();
  } catch (error) {
    console.error("Failed to load analytics data:", error);
    document.getElementById("dashboardError").style.display = "block";
    document.getElementById("dashboardError").textContent =
      "Unable to load dashboard data. Please check the backend connection.";
  }
}

function populateMarketFilter() {
  const select = document.getElementById("marketFilter");
  const markets = [
    ...new Set(
      dashboardState.brokers.map((item) => item.market_name).filter(Boolean),
    ),
  ].sort();

  select.innerHTML =
    '<option value="all">All Markets</option>' +
    markets
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join("");
}

function getFilteredBrokers() {
  let brokers = [...dashboardState.brokers];

  if (dashboardState.marketFilter && dashboardState.marketFilter !== "all") {
    brokers = brokers.filter(
      (broker) => (broker.market_name || "") === dashboardState.marketFilter,
    );
  }

  if (dashboardState.startDate) {
    brokers = brokers.filter((broker) => {
      const date =
        broker.created_at || broker.registration_date || broker.updated_at;
      return date && new Date(date) >= new Date(dashboardState.startDate);
    });
  }

  if (dashboardState.endDate) {
    const end = new Date(dashboardState.endDate);
    end.setHours(23, 59, 59, 999);
    brokers = brokers.filter((broker) => {
      const date =
        broker.created_at || broker.registration_date || broker.updated_at;
      return date && new Date(date) <= end;
    });
  }

  return brokers;
}

function getFilteredPayments() {
  let payments = [...dashboardState.payments];

  if (dashboardState.marketFilter && dashboardState.marketFilter !== "all") {
    const marketNames = new Set(
      dashboardState.brokers
        .filter((b) => b.market_name === dashboardState.marketFilter)
        .map((b) => b.market_name),
    );

    if (marketNames.size > 0) {
      payments = payments.filter((payment) => {
        const orderId = payment.order_id || "";
        const brokerMatch = dashboardState.brokers.find(
          (b) =>
            (b.market_name || "") === dashboardState.marketFilter &&
            (b.broker_name || "").toLowerCase().includes(orderId.toLowerCase()),
        );
        return payment.type || brokerMatch || true;
      });
    }
  }

  if (dashboardState.startDate) {
    payments = payments.filter((payment) => {
      const date = payment.created_at || payment.updated_at;
      return date && new Date(date) >= new Date(dashboardState.startDate);
    });
  }

  if (dashboardState.endDate) {
    const end = new Date(dashboardState.endDate);
    end.setHours(23, 59, 59, 999);
    payments = payments.filter((payment) => {
      const date = payment.created_at || payment.updated_at;
      return date && new Date(date) <= end;
    });
  }

  return payments;
}

function statusKey(value) {
  if (!value) return "unknown";
  return String(value).trim().toUpperCase().replace(/\s+/g, "_");
}

function isPendingStatus(value) {
  const key = statusKey(value);
  return (
    key.includes("PENDING") ||
    key.includes("AWAITING") ||
    key.includes("INITIATED") ||
    key.includes("SUBMITTED") ||
    key.includes("UNVERIFIED")
  );
}

function isApprovedStatus(value) {
  const key = statusKey(value);
  return (
    key.includes("APPROVED") ||
    key.includes("PAID") ||
    key.includes("SUCCESS") ||
    key.includes("VERIFIED")
  );
}

function isRejectedStatus(value) {
  const key = statusKey(value);
  return (
    key.includes("REJECTED") ||
    key.includes("DECLINED") ||
    key.includes("FAILED")
  );
}

function renderDashboard() {
  const brokers = getFilteredBrokers();
  const payments = getFilteredPayments();

  renderKpis(brokers, payments);
  renderBrokerBreakdown(brokers);
  renderPaymentBreakdown(payments);
  renderMarketBreakdown(brokers, payments);
  renderLocationBreakdown(brokers);
  renderActivityTable(payments);
  renderPriorityPayments(payments);
  renderInsights(brokers, payments);
}

function renderKpis(brokers, payments) {
  const totalBrokers = brokers.length;
  const pendingBrokers = brokers.filter(
    (b) => statusKey(b.verification_status) === "PENDING",
  ).length;
  const approvedBrokers = brokers.filter(
    (b) => statusKey(b.verification_status) === "APPROVED",
  ).length;
  const rejectedBrokers = brokers.filter(
    (b) => statusKey(b.verification_status) === "REJECTED",
  ).length;
  const approvalRate = totalBrokers
    ? (approvedBrokers / totalBrokers) * 100
    : 0;

  const totalPayments = payments.length;
  const pendingPayments = payments.filter((p) =>
    isPendingStatus(p.payment_status),
  ).length;
  const approvedPayments = payments.filter((p) =>
    isApprovedStatus(p.payment_status),
  ).length;
  const rejectedPayments = payments.filter((p) =>
    isRejectedStatus(p.payment_status),
  ).length;
  const totalAmount = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );
  const pendingAmount = payments
    .filter((p) => isPendingStatus(p.payment_status))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paymentSuccessRate = totalPayments
    ? (approvedPayments / totalPayments) * 100
    : 0;

  setText("totalBrokersValue", numberFormatter.format(totalBrokers));
  setText("approvedBrokersValue", numberFormatter.format(approvedBrokers));
  setText("pendingBrokersValue", numberFormatter.format(pendingBrokers));
  setText("rejectedBrokersValue", numberFormatter.format(rejectedBrokers));
  setText("approvalRateValue", `${approvalRate.toFixed(1)}%`);

  setText("totalPaymentsValue", numberFormatter.format(totalPayments));
  setText("approvedPaymentsValue", numberFormatter.format(approvedPayments));
  setText("pendingPaymentsValue", numberFormatter.format(pendingPayments));
  setText("rejectedPaymentsValue", numberFormatter.format(rejectedPayments));
  setText("totalAmountValue", currencyFormatter.format(totalAmount));
  setText("pendingAmountValue", currencyFormatter.format(pendingAmount));
  setText("paymentRateValue", `${paymentSuccessRate.toFixed(1)}%`);
}

function renderBrokerBreakdown(brokers) {
  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  brokers.forEach((broker) => {
    const status = statusKey(broker.verification_status);
    if (status === "PENDING") counts.pending += 1;
    if (status === "APPROVED") counts.approved += 1;
    if (status === "REJECTED") counts.rejected += 1;
  });

  const total = brokers.length || 1;
  const rows = [
    {
      label: "Pending",
      value: counts.pending,
      percent: (counts.pending / total) * 100,
      className: "warning",
    },
    {
      label: "Approved",
      value: counts.approved,
      percent: (counts.approved / total) * 100,
      className: "success",
    },
    {
      label: "Rejected",
      value: counts.rejected,
      percent: (counts.rejected / total) * 100,
      className: "danger",
    },
  ];

  const root = document.getElementById("brokerBreakdown");
  root.innerHTML = rows
    .map(
      (item) => `
        <div class="bar-item">
            <div class="bar-row">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </div>
            <div class="bar-track">
                <div class="bar-fill ${item.className}" style="width:${Math.max(item.percent, 4)}%"></div>
            </div>
        </div>
    `,
    )
    .join("");
}

function renderPaymentBreakdown(payments) {
  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  payments.forEach((p) => {
    if (isPendingStatus(p.payment_status)) counts.pending += 1;
    else if (isApprovedStatus(p.payment_status)) counts.approved += 1;
    else if (isRejectedStatus(p.payment_status)) counts.rejected += 1;
  });

  const total = payments.length || 1;
  const rows = [
    {
      label: "Pending",
      value: counts.pending,
      percent: (counts.pending / total) * 100,
      className: "warning",
    },
    {
      label: "Approved",
      value: counts.approved,
      percent: (counts.approved / total) * 100,
      className: "success",
    },
    {
      label: "Rejected",
      value: counts.rejected,
      percent: (counts.rejected / total) * 100,
      className: "danger",
    },
  ];

  const root = document.getElementById("paymentBreakdown");
  root.innerHTML = rows
    .map(
      (item) => `
        <div class="bar-item">
            <div class="bar-row">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </div>
            <div class="bar-track">
                <div class="bar-fill ${item.className}" style="width:${Math.max(item.percent, 4)}%"></div>
            </div>
        </div>
    `,
    )
    .join("");
}

function renderMarketBreakdown(brokers, payments) {
  const grouped = {};

  brokers.forEach((broker) => {
    const market = broker.market_name || "Unknown";
    if (!grouped[market]) {
      grouped[market] = { total: 0, approved: 0, pending: 0, rejected: 0 };
    }
    grouped[market].total += 1;
    const status = statusKey(broker.verification_status);
    if (status === "APPROVED") grouped[market].approved += 1;
    if (status === "PENDING") grouped[market].pending += 1;
    if (status === "REJECTED") grouped[market].rejected += 1;
  });

  const marketRows = Object.entries(grouped)
    .map(([market, value]) => ({ market, ...value }))
    .sort((a, b) => b.total - a.total);

  const root = document.getElementById("marketTableBody");
  root.innerHTML = marketRows.length
    ? marketRows
        .map(
          (row) => `
        <tr>
            <td>${escapeHtml(row.market)}</td>
            <td>${row.total}</td>
            <td>${row.approved}</td>
            <td>${row.pending}</td>
            <td>${row.rejected}</td>
        </tr>
    `,
        )
        .join("")
    : '<tr><td colspan="5" class="empty-row">No market data available</td></tr>';

  const marketChart = document.getElementById("marketChart");
  const max = Math.max(...marketRows.map((r) => r.total), 1);
  marketChart.innerHTML = marketRows.length
    ? marketRows
        .map(
          (row) => `
        <div class="chart-row">
            <div class="chart-label">${escapeHtml(row.market)}</div>
            <div class="chart-bar-wrap">
                <div class="chart-bar purple" style="width:${(row.total / max) * 100}%"></div>
            </div>
            <div class="chart-value">${row.total}</div>
        </div>
    `,
        )
        .join("")
    : '<div class="empty-message">No market data available</div>';
}

function renderLocationBreakdown(brokers) {
  const locationMap = {};

  brokers.forEach((broker) => {
    const location = broker.location || "Unknown";
    if (!locationMap[location]) {
      locationMap[location] = { total: 0, approved: 0, pending: 0 };
    }
    locationMap[location].total += 1;
    const status = statusKey(broker.verification_status);
    if (status === "APPROVED") locationMap[location].approved += 1;
    if (status === "PENDING") locationMap[location].pending += 1;
  });

  const rows = Object.entries(locationMap)
    .map(([location, value]) => ({ location, ...value }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const root = document.getElementById("locationTableBody");
  root.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
        <tr>
            <td>${escapeHtml(row.location)}</td>
            <td>${row.total}</td>
            <td>${row.approved}</td>
            <td>${row.pending}</td>
        </tr>
    `,
        )
        .join("")
    : '<tr><td colspan="4" class="empty-row">No location data available</td></tr>';
}

function renderActivityTable(payments) {
  const grouped = {};

  payments.forEach((payment) => {
    const date = payment.created_at || payment.updated_at;
    if (!date) return;
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return;
    const key = formatDateInput(parsed);
    if (!grouped[key])
      grouped[key] = { date: key, approved: 0, pending: 0, amount: 0 };

    if (isApprovedStatus(payment.payment_status)) grouped[key].approved += 1;
    if (isPendingStatus(payment.payment_status)) grouped[key].pending += 1;
    grouped[key].amount += Number(payment.amount || 0);
  });

  const rows = Object.values(grouped)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-7);
  const tbody = document.getElementById("activityTableBody");
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
        <tr>
            <td>${formatDisplayDate(row.date)}</td>
            <td>${row.approved}</td>
            <td>${row.pending}</td>
            <td>${currencyFormatter.format(row.amount)}</td>
        </tr>
    `,
        )
        .join("")
    : '<tr><td colspan="4" class="empty-row">No activity records available</td></tr>';
}

function renderPriorityPayments(payments) {
  const rows = payments
    .filter(
      (p) =>
        isPendingStatus(p.payment_status) || isApprovedStatus(p.payment_status),
    )
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 8);

  const tbody = document.getElementById("priorityPaymentsBody");
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (p) => `
        <tr>
            <td>${escapeHtml(p.order_id || p.transaction_id || "N/A")}</td>
            <td>${escapeHtml(p.farmer_name || "Farmer")}</td>
            <td>${escapeHtml(p.type || "payment")}</td>
            <td>${currencyFormatter.format(Number(p.amount || 0))}</td>
            <td><span class="status-chip ${getStatusClass(p.payment_status)}">${escapeHtml(p.payment_status || "Unknown")}</span></td>
        </tr>
    `,
        )
        .join("")
    : '<tr><td colspan="5" class="empty-row">No payment records available</td></tr>';
}

function renderInsights(brokers, payments) {
  const items = [];
  const totalBrokers = brokers.length;
  const approvedBrokers = brokers.filter(
    (b) => statusKey(b.verification_status) === "APPROVED",
  ).length;
  const approvalRate = totalBrokers
    ? (approvedBrokers / totalBrokers) * 100
    : 0;

  const pendingAmount = payments
    .filter((p) => isPendingStatus(p.payment_status))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalAmount = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );

  if (pendingAmount > 0) {
    items.push({
      severity: "HIGH",
      title: `₹${numberFormatter.format(Math.round(pendingAmount))} in pending payments`,
      text: "A significant payment amount is awaiting host verification.",
    });
  }

  if (totalBrokers && approvalRate < 75) {
    items.push({
      severity: "MEDIUM",
      title: "Broker approval rate is below target",
      text: `Current approval rate is ${approvalRate.toFixed(1)}%, below the 75% benchmark.`,
    });
  }

  if (totalAmount > 0) {
    const topMarket = getTopMarket(brokers);
    if (topMarket) {
      items.push({
        severity: "POSITIVE",
        title: `${topMarket.name} is leading active registrations`,
        text: `${topMarket.count} broker(s) are currently registered under this market.`,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      severity: "LOW",
      title: "No major alerts",
      text: "No critical operational issues were detected in the current filter range.",
    });
  }

  const root = document.getElementById("insightList");
  root.innerHTML = items
    .map(
      (item) => `
        <div class="insight-item severity-${item.severity.toLowerCase()}">
            <div class="insight-head">
                <span class="severity-pill ${item.severity.toLowerCase()}">${item.severity}</span>
                <strong>${escapeHtml(item.title)}</strong>
            </div>
            <p>${escapeHtml(item.text)}</p>
        </div>
    `,
    )
    .join("");
}

function getTopMarket(brokers) {
  const counts = {};
  brokers.forEach((b) => {
    const name = b.market_name || "Unknown";
    counts[name] = (counts[name] || 0) + 1;
  });

  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;

  return { name: best[0], count: best[1] };
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatDisplayDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusClass(value) {
  const status = statusKey(value);
  if (isPendingStatus(value)) return "warning";
  if (isApprovedStatus(value)) return "success";
  if (isRejectedStatus(value)) return "danger";
  return "neutral";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
