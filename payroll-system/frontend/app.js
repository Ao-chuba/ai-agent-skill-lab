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
document.addEventListener("DOMContentLoaded", () => loadEmployees());
