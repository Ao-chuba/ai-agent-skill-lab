/* ─────────────────────────────────────────────────────────────────────────────
   PayrollPro — app.js
   Single-page application logic:
     - Client-side validation (inline errors, disable submit while invalid)
     - fetch() API calls to the FastAPI backend
     - Toast notifications, confirm dialog
     - Employee table rendering with load/delete per row
     - Live search (debounced), Delete All
   ───────────────────────────────────────────────────────────────────────────── */

const API = "http://localhost:8000/api/employees";

/* ─── DOM REFS ────────────────────────────────────────────────────────────── */
const form          = document.getElementById("employee-form");
const fEmployeeId   = document.getElementById("employee_id");
const fName         = document.getElementById("name");
const fBasic        = document.getElementById("basic_salary");
const fBonus        = document.getElementById("bonus");
const fDeduction    = document.getElementById("deduction");
const fNet          = document.getElementById("net_salary");

const btnAdd        = document.getElementById("btn-add");
const btnUpdate     = document.getElementById("btn-update");
const btnCalcNet    = document.getElementById("btn-calcnet");
const btnClear      = document.getElementById("btn-clear");
const btnDeleteAll  = document.getElementById("btn-delete-all");

const searchInput   = document.getElementById("search-input");
const tbody         = document.getElementById("employees-tbody");
const countBadge    = document.getElementById("employee-count-badge");

const overlay       = document.getElementById("confirm-overlay");
const confirmTitle  = document.getElementById("confirm-title");
const confirmMsg    = document.getElementById("confirm-message");
const confirmOk     = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");

/* ─── STATE ──────────────────────────────────────────────────────────────── */
let allEmployees = [];
let confirmCallback = null;

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════════════════════════ */
function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toast-container");
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  container.appendChild(toast);

  const remove = () => {
    toast.classList.add("hiding");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  toast.addEventListener("click", () => { clearTimeout(timer); remove(); });
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIRM DIALOG
   ══════════════════════════════════════════════════════════════════════════ */
function showConfirm(title, message, onConfirm) {
  confirmTitle.textContent = title;
  confirmMsg.textContent = message;
  confirmCallback = onConfirm;
  overlay.classList.remove("hidden");
}

confirmOk.addEventListener("click", () => {
  overlay.classList.add("hidden");
  if (typeof confirmCallback === "function") confirmCallback();
  confirmCallback = null;
});
confirmCancel.addEventListener("click", () => {
  overlay.classList.add("hidden");
  confirmCallback = null;
});
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) {
    overlay.classList.add("hidden");
    confirmCallback = null;
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT-SIDE VALIDATION
   ══════════════════════════════════════════════════════════════════════════ */
const validators = {
  employee_id: (v) => {
    if (!v.trim()) return "Employee ID is required";
    return null;
  },
  name: (v) => {
    if (!v.trim()) return "Name is required";
    if (!/^[A-Za-z\s]+$/.test(v.trim())) return "Name must contain letters and spaces only";
    return null;
  },
  basic_salary: (v) => {
    if (v === "" || v === null) return "Basic Salary is required";
    if (isNaN(Number(v)) || Number(v) < 0) return "Must be a non-negative number";
    return null;
  },
  bonus: (v) => {
    if (v !== "" && (isNaN(Number(v)) || Number(v) < 0)) return "Must be a non-negative number";
    return null;
  },
  deduction: (v) => {
    const basic = parseFloat(fBasic.value) || 0;
    const bonus = parseFloat(fBonus.value) || 0;
    const ded = parseFloat(v) || 0;
    if (v !== "" && (isNaN(Number(v)) || Number(v) < 0)) return "Must be a non-negative number";
    if (ded > basic + bonus) return "Deduction cannot exceed Basic + Bonus";
    return null;
  },
};

function validateField(name, value) {
  const fn = validators[name];
  return fn ? fn(value) : null;
}

function showFieldError(name, msg) {
  const errEl = document.getElementById(`err-${name}`);
  const fg = document.getElementById(`fg-${name}`);
  const input = document.getElementById(name);
  if (errEl) errEl.textContent = msg || "";
  if (fg) {
    if (msg) { input?.classList.add("invalid"); }
    else      { input?.classList.remove("invalid"); }
  }
}

function validateAllRequired(fields) {
  let valid = true;
  for (const [name, value] of Object.entries(fields)) {
    const err = validateField(name, value);
    showFieldError(name, err || "");
    if (err) valid = false;
  }
  return valid;
}

/* Live validation */
["employee_id", "name", "basic_salary", "bonus", "deduction"].forEach((name) => {
  const el = document.getElementById(name);
  if (!el) return;
  el.addEventListener("input", () => {
    const err = validateField(name, el.value);
    showFieldError(name, err || "");
    updateNetPreview();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   NET SALARY PREVIEW (client-side display only)
   ══════════════════════════════════════════════════════════════════════════ */
function updateNetPreview() {
  const basic = parseFloat(fBasic.value) || 0;
  const bonus = parseFloat(fBonus.value) || 0;
  const ded   = parseFloat(fDeduction.value) || 0;
  const net   = basic + bonus - ded;
  if (fBasic.value === "" && fBonus.value === "" && fDeduction.value === "") {
    fNet.value = "";
  } else {
    fNet.value = net >= 0 ? formatCurrency(net) : "Invalid (negative)";
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */
function formatCurrency(val) {
  return Number(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getFormValues() {
  return {
    employee_id: fEmployeeId.value.trim(),
    name:         fName.value.trim(),
    basic_salary: fBasic.value,
    bonus:        fBonus.value || "0",
    deduction:    fDeduction.value || "0",
  };
}

function clearForm() {
  form.reset();
  fNet.value = "";
  ["employee_id", "name", "basic_salary", "bonus", "deduction"].forEach((n) =>
    showFieldError(n, "")
  );
}

function loadIntoForm(emp) {
  fEmployeeId.value = emp.employee_id;
  fName.value       = emp.name;
  fBasic.value      = emp.basic_salary;
  fBonus.value      = emp.bonus;
  fDeduction.value  = emp.deduction;
  fNet.value        = formatCurrency(emp.net_salary);
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.detail
        ? Array.isArray(data.detail)
          ? data.detail.map((e) => e.msg).join("; ")
          : String(data.detail)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABLE RENDERING
   ══════════════════════════════════════════════════════════════════════════ */
function renderTable(employees) {
  tbody.innerHTML = "";

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `
      <tr id="empty-row">
        <td colspan="7" class="empty-state">
          <div class="empty-icon">📋</div>
          <div>No employees found.</div>
        </td>
      </tr>`;
    return;
  }

  employees.forEach((emp) => {
    const tr = document.createElement("tr");
    tr.dataset.id = emp.employee_id;
    tr.innerHTML = `
      <td>${escapeHtml(emp.employee_id)}</td>
      <td>${escapeHtml(emp.name)}</td>
      <td>₹${formatCurrency(emp.basic_salary)}</td>
      <td>₹${formatCurrency(emp.bonus)}</td>
      <td>₹${formatCurrency(emp.deduction)}</td>
      <td class="net-cell">₹${formatCurrency(emp.net_salary)}</td>
      <td>
        <button class="btn-row-load" data-id="${escapeHtml(emp.employee_id)}" title="Load into form">✎ Edit</button>
        <button class="btn-row-delete" data-id="${escapeHtml(emp.employee_id)}" title="Delete employee">🗑 Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Row event delegation
  tbody.querySelectorAll(".btn-row-load").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emp = allEmployees.find((e) => e.employee_id === btn.dataset.id);
      if (emp) {
        loadIntoForm(emp);
        showToast(`Loaded ${emp.name} into form`, "info");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
  tbody.querySelectorAll(".btn-row-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      showConfirm(
        "Delete Employee",
        `Are you sure you want to delete employee "${id}"? This cannot be undone.`,
        () => deleteEmployee(id)
      );
    });
  });
}

function updateBadge(count) {
  countBadge.textContent = `${count} employee${count !== 1 ? "s" : ""}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightRow(id) {
  const tr = tbody.querySelector(`tr[data-id="${id}"]`);
  if (tr) {
    tr.classList.add("row-highlight");
    tr.addEventListener("animationend", () => tr.classList.remove("row-highlight"), { once: true });
  }
}

function showLoadingRow() {
  tbody.innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span>Loading…</td></tr>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   API OPERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

async function loadEmployees(query = "") {
  showLoadingRow();
  try {
    let url = API;
    if (query) url = `${API}/search?q=${encodeURIComponent(query)}`;
    allEmployees = await apiRequest(url);
    renderTable(allEmployees);
    updateBadge(allEmployees.length);
  } catch (err) {
    showToast(`Failed to load employees: ${err.message}`, "error");
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load data.</td></tr>`;
  }
}

async function addEmployee() {
  const vals = getFormValues();
  const valid = validateAllRequired(vals);
  if (!valid) { showToast("Please fix validation errors", "error"); return; }

  try {
    btnAdd.disabled = true;
    const emp = await apiRequest(API, {
      method: "POST",
      body: JSON.stringify(vals),
    });
    showToast(`✨ ${emp.name} added successfully!`, "success");
    clearForm();
    await loadEmployees(searchInput.value);
    highlightRow(emp.employee_id);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnAdd.disabled = false;
  }
}

async function updateSalary() {
  const id = fEmployeeId.value.trim();
  if (!id) { showFieldError("employee_id", "Employee ID is required to update"); return; }

  const vals = {
    basic_salary: fBasic.value,
    bonus:        fBonus.value || "0",
    deduction:    fDeduction.value || "0",
  };

  const salaryValid = validateAllRequired({
    basic_salary: vals.basic_salary,
    bonus:        vals.bonus,
    deduction:    vals.deduction,
  });
  if (!salaryValid) { showToast("Please fix validation errors", "error"); return; }

  try {
    btnUpdate.disabled = true;
    const emp = await apiRequest(`${API}/${encodeURIComponent(id)}/salary`, {
      method: "PUT",
      body: JSON.stringify(vals),
    });
    showToast(`Salary updated for ${emp.name}`, "success");
    fNet.value = formatCurrency(emp.net_salary);
    await loadEmployees(searchInput.value);
    highlightRow(emp.employee_id);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btnUpdate.disabled = false;
  }
}

async function calculateNet() {
  const id = fEmployeeId.value.trim();
  if (!id) {
    // Just use local preview if no ID
    updateNetPreview();
    showToast("Preview calculated (server calculation requires an Employee ID)", "info");
    return;
  }
  try {
    const data = await apiRequest(`${API}/${encodeURIComponent(id)}/net-salary`);
    fNet.value = formatCurrency(data.net_salary);
    showToast(`Net Salary = ₹${formatCurrency(data.net_salary)} (server confirmed)`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteEmployee(id) {
  try {
    await apiRequest(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
    showToast(`Employee "${id}" deleted`, "success");
    if (fEmployeeId.value.trim() === id) clearForm();
    await loadEmployees(searchInput.value);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteAllEmployees() {
  try {
    await apiRequest(API, { method: "DELETE" });
    showToast("All employees deleted", "success");
    clearForm();
    await loadEmployees();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT BINDINGS
   ══════════════════════════════════════════════════════════════════════════ */
btnAdd.addEventListener("click", addEmployee);
btnUpdate.addEventListener("click", updateSalary);
btnCalcNet.addEventListener("click", calculateNet);
btnClear.addEventListener("click", clearForm);

btnDeleteAll.addEventListener("click", () => {
  showConfirm(
    "Delete All Employees",
    "This will permanently delete ALL employee records. Are you absolutely sure?",
    deleteAllEmployees
  );
});

// Debounced search
let searchTimer = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadEmployees(searchInput.value.trim()), 350);
});

/* ─── INIT ─────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  loadEmployees();
  initAiSection();
});

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 2 & PHASE 3: AI EXPLAIN & AGENT CHAT
   ══════════════════════════════════════════════════════════════════════════ */
const API_EXPLAIN = "http://localhost:8000/api/ai/explain";
const API_AGENT   = "http://localhost:8000/api/agent/chat";
const API_CONFIRM_DELETE = "http://localhost:8000/api/agent/confirm-delete";

let pendingAgentDelete = null;

function initAiSection() {
  // Tab switching
  const tabExplain = document.getElementById("tab-explain");
  const tabAgent   = document.getElementById("tab-agent");
  const panelExplain = document.getElementById("panel-explain");
  const panelAgent   = document.getElementById("panel-agent");

  if (!tabExplain || !tabAgent) return;

  tabExplain.addEventListener("click", () => {
    tabExplain.classList.add("active");
    tabAgent.classList.remove("active");
    panelExplain.classList.remove("hidden");
    panelExplain.classList.add("active");
    panelAgent.classList.add("hidden");
    panelAgent.classList.remove("active");
  });

  tabAgent.addEventListener("click", () => {
    tabAgent.classList.add("active");
    tabExplain.classList.remove("active");
    panelAgent.classList.remove("hidden");
    panelAgent.classList.add("active");
    panelExplain.classList.add("hidden");
    panelExplain.classList.remove("active");
  });

  // AI Explain bindings
  const explainInput = document.getElementById("explain-input");
  const explainSend  = document.getElementById("explain-send");
  const explainEmpId = document.getElementById("explain-emp-id");

  explainSend.addEventListener("click", sendExplainQuestion);
  explainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendExplainQuestion();
    }
  });

  // Agent Chat bindings
  const agentInput = document.getElementById("agent-input");
  const agentSend  = document.getElementById("agent-send");
  const confirmYes = document.getElementById("agent-confirm-yes");
  const confirmNo  = document.getElementById("agent-confirm-no");

  agentSend.addEventListener("click", sendAgentMessage);
  agentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAgentMessage();
    }
  });

  confirmYes.addEventListener("click", executePendingDelete);
  confirmNo.addEventListener("click", cancelPendingDelete);

  // Add welcome messages
  appendMessage("explain-messages", "ai", "Hello! I am PayrollPro Explain. Ask me any question about payroll rules or why an employee's salary is calculated a certain way.", "PayrollPro Explain");
  appendMessage("agent-messages", "agent", "Hello! I'm your Payroll Agent. I can help you add employees, search, update salaries, calculate net pay, or delete records. How can I help you today?", "Payroll Agent");
}

/* ── AI Explain (Phase 2) ─────────────────────────────────────────────────── */
async function sendExplainQuestion() {
  const input = document.getElementById("explain-input");
  const empIdInput = document.getElementById("explain-emp-id");
  const question = input.value.trim();
  const empId = empIdInput.value.trim() || undefined;

  if (!question) return;

  appendMessage("explain-messages", "user", question, "You");
  input.value = "";

  const typingId = showTypingIndicator("explain-messages");

  try {
    const res = await fetch(API_EXPLAIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, employee_id: empId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Error getting AI explanation");
    }

    const data = await res.json();
    removeTypingIndicator(typingId);
    appendMessage("explain-messages", "ai", data.explanation, "PayrollPro Explain (GenAI)");
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage("explain-messages", "ai", `⚠️ Error: ${err.message}`, "PayrollPro Explain");
  }
}

/* ── Agent Chat (Phase 3) ─────────────────────────────────────────────────── */
async function sendAgentMessage() {
  const input = document.getElementById("agent-input");
  const message = input.value.trim();
  if (!message) return;

  appendMessage("agent-messages", "user", message, "You");
  input.value = "";

  const typingId = showTypingIndicator("agent-messages");

  try {
    const res = await fetch(API_AGENT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Agent communication error");
    }

    const data = await res.json();
    removeTypingIndicator(typingId);

    // If a tool was invoked, display a trace badge
    let toolBadge = null;
    if (data.tool_called) {
      const isSuccess = data.tool_result && data.tool_result.status === "success";
      const isError = data.tool_result && data.tool_result.status === "error";
      const statusClass = isSuccess ? "success" : isError ? "error" : "";
      toolBadge = `<div class="agent-trace ${statusClass}">🔧 Tool: <strong>${escapeHtml(data.tool_called)}</strong></div>`;
    }

    appendMessage("agent-messages", "agent", data.response, "Payroll Agent", toolBadge);

    // Refresh table if action might have modified data
    if (data.tool_called && ["add_employee", "update_salary", "delete_employee"].includes(data.tool_called)) {
      if (data.tool_result && data.tool_result.status === "success") {
        await loadEmployees(searchInput.value);
      }
    }

    // Check if safety prompt required confirmation
    if (data.pending_confirmation) {
      pendingAgentDelete = data.pending_confirmation;
      const banner = document.getElementById("agent-confirm-banner");
      const textSpan = document.getElementById("agent-confirm-text");
      textSpan.textContent = pendingAgentDelete.message || `Confirm deletion of employee ${pendingAgentDelete.employee_id}?`;
      banner.classList.remove("hidden");
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage("agent-messages", "agent", `⚠️ Agent error: ${err.message}`, "Payroll Agent");
  }
}

/* ── Delete Confirmation Flow (Phase 3 safety) ────────────────────────────── */
async function executePendingDelete() {
  if (!pendingAgentDelete) return;

  const banner = document.getElementById("agent-confirm-banner");
  banner.classList.add("hidden");

  const empId = pendingAgentDelete.employee_id;
  pendingAgentDelete = null;

  const typingId = showTypingIndicator("agent-messages");

  try {
    const res = await fetch(API_CONFIRM_DELETE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: empId }),
    });

    const data = await res.json();
    removeTypingIndicator(typingId);

    if (data.status === "success") {
      showToast(data.message, "success");
      appendMessage("agent-messages", "agent", `✅ ${data.message}`, "Payroll Agent", `<div class="agent-trace success">🗑 Confirmed deletion of ${escapeHtml(empId)}</div>`);
      await loadEmployees(searchInput.value);
    } else {
      showToast(data.message || "Failed to delete employee", "error");
      appendMessage("agent-messages", "agent", `❌ ${data.message}`, "Payroll Agent");
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage("agent-messages", "agent", `⚠️ Deletion error: ${err.message}`, "Payroll Agent");
  }
}

function cancelPendingDelete() {
  const banner = document.getElementById("agent-confirm-banner");
  banner.classList.add("hidden");
  if (pendingAgentDelete) {
    appendMessage("agent-messages", "user", "Cancelled deletion.", "You");
    appendMessage("agent-messages", "agent", "Action cancelled. The employee record was not deleted.", "Payroll Agent");
    pendingAgentDelete = null;
  }
}

/* ── Helpers for Chat UI ──────────────────────────────────────────────────── */
function appendMessage(containerId, senderType, text, senderLabel, extraHtml = "") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-msg ${senderType}`;

  const label = document.createElement("div");
  label.className = "chat-sender";
  label.textContent = senderLabel;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  msgDiv.appendChild(label);
  msgDiv.appendChild(bubble);

  if (extraHtml) {
    const extra = document.createElement("div");
    extra.innerHTML = extraHtml;
    msgDiv.appendChild(extra.firstElementChild);
  }

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const id = `typing-${Date.now()}`;
  const typingDiv = document.createElement("div");
  typingDiv.id = id;
  typingDiv.className = "chat-msg ai";
  typingDiv.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(typingDiv);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

