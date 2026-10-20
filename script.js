/* =====================================================
   1. ELEMENTS & STATE
   ===================================================== */
const form = document.getElementById("expense-form");
const itemInput = document.getElementById("spend-item");
const descInput = document.getElementById("description");
const amountInput = document.getElementById("amount");

const table = document.getElementById("expense-table");
const emptyMessage = document.getElementById("empty-message");
const timeFilter = document.getElementById("time-filter");
const searchInput = document.getElementById("search-input");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");

let expenses = JSON.parse(localStorage.getItem("expenses")) || [];
let customCategories = JSON.parse(localStorage.getItem("customCategories")) || [];
let shoppingCards = JSON.parse(localStorage.getItem("shoppingCards")) || [];
let historyLog = JSON.parse(localStorage.getItem("historyLog")) || [];
let monthlyBudget = Number(localStorage.getItem("monthlyBudget")) || 0;
let currentCurrency = localStorage.getItem("currency") || "₦";

let editingId = null;
let currentFilter = "daily"; 
let currentSearch = "";
let activeCardId = null;
let itemImageBase64 = null;
let myChart = null; // Holds the Chart.js instance

/* =====================================================
   2. UTILS & CURRENCY
   ===================================================== */
function formatMoney(amount) {
  return `${currentCurrency}${amount.toLocaleString("en-NG", {minimumFractionDigits:2})}`;
}

const currencySelect = document.getElementById("currency-select");
currencySelect.value = currentCurrency;
currencySelect.addEventListener("change", function() {
  currentCurrency = this.value;
  localStorage.setItem("currency", currentCurrency);
  display(); // Re-render to update currency symbols
});

/* =====================================================
   3. NAVIGATION & THEME
   ===================================================== */
function navigateTo(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");

  document.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));
  document.querySelector(`.nav-link[data-view="${viewName}"]`).classList.add("active");

  closeSidebar();

  if (viewName === 'expenses') display();
  if (viewName === 'shopping') renderShoppingCards();
  if (viewName === 'history') renderHistory();
}

document.getElementById("open-sidebar").onclick = () => {
  sidebar.classList.add("open"); sidebarOverlay.classList.add("open");
};
document.getElementById("close-sidebar").onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;
function closeSidebar() {
  sidebar.classList.remove("open"); sidebarOverlay.classList.remove("open");
}

function applyTheme(theme) {
  const icon = document.querySelector("#theme-toggle i");
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
    icon.className = "fa-solid fa-sun";
  } else {
    document.body.removeAttribute("data-theme");
    icon.className = "fa-solid fa-moon";
  }
}
applyTheme(localStorage.getItem("theme") || "system");
document.getElementById("theme-toggle").onclick = () => {
  const isDark = document.body.hasAttribute("data-theme");
  const newTheme = isDark ? "light" : "dark";
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme);
};

/* =====================================================
   4. EXPENSES & FILTERING
   ===================================================== */
searchInput.addEventListener("input", function() { currentSearch = this.value.toLowerCase(); display(); });
timeFilter.addEventListener("change", function() {
  currentFilter = this.value;
  document.getElementById("custom-date-box").classList.toggle("hidden", currentFilter !== "custom");
  if (currentFilter !== "custom") display();
});
document.getElementById("apply-custom").onclick = () => display();

function getFilteredExpenses() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = document.getElementById("start-date").value;
  const end = document.getElementById("end-date").value;

  return expenses.filter(exp => {
    const expTime = new Date(exp.date).getTime();
    if (currentSearch) {
      const matchItem = exp.item.toLowerCase().includes(currentSearch);
      const matchDesc = exp.description.toLowerCase().includes(currentSearch);
      if (!matchItem && !matchDesc) return false;
    }
    if (currentFilter === "daily") return expTime >= todayStart;
    if (currentFilter === "3days") {
      const d = new Date(todayStart); d.setDate(d.getDate() - 2); return expTime >= d.getTime();
    }
    if (currentFilter === "weekly") {
      const day = now.getDay(); const diff = (day === 0 ? 6 : day - 1);
      const d = new Date(todayStart); d.setDate(d.getDate() - diff); return expTime >= d.getTime();
    }
    const daysMap = { "10days": 10, "15days": 15, "30days": 30, "60days": 60, "90days": 90 };
    if (daysMap[currentFilter]) {
      const d = new Date(todayStart); d.setDate(d.getDate() - daysMap[currentFilter]); return expTime >= d.getTime();
    }
    if (currentFilter === "custom" && start && end) {
      const s = new Date(start).getTime();
      const e = new Date(end); e.setHours(23, 59, 59, 999);
      return expTime >= s && expTime <= e.getTime();
    }
    return true;
  });
}

function display() {
  const filtered = getFilteredExpenses();
  table.querySelectorAll("tbody").forEach(tb => tb.remove());

  renderChart(filtered); // Update Chart

  if (filtered.length === 0) {
    table.style.display = "none";
    emptyMessage.style.display = "block";
    updateBudgetUI();
    return;
  }
  
  table.style.display = "table";
  emptyMessage.style.display = "none";

  const groups = {};
  filtered.forEach(e => {
    const d = new Date(e.date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(e);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  const today = new Date(); today.setHours(0,0,0,0);

  sortedDates.forEach(dateStr => {
    const dayExpenses = groups[dateStr];
    let dayTotal = 0;
    dayExpenses.forEach(e => dayTotal += e.amount);

    const d = new Date(dateStr);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    
    let label = "";
    if (diffDays === 0) label = "Today total spending";
    else if (diffDays === 1) label = "Total spending a day ago";
    else if (diffDays < 7) label = `Total spending ${diffDays} days ago`;
    else if (diffDays === 7) label = "Total spending a week ago";
    else label = `Total spending on ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const tbody = document.createElement("tbody");
    tbody.innerHTML = `
      <tr class="day-header">
        <td colspan="5">
          <div class="day-header-content">
            <span class="day-label">${label}</span>
            <span class="day-amount">${formatMoney(dayTotal)}</span>
          </div>
        </td>
      </tr>
    `;

    dayExpenses.forEach(e => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-id", e.id);
      tr.innerHTML = `
        <td>${e.item}</td>
        <td class="desc-cell"><span class="desc-text">${e.description}</span></td>
        <td class="amount-cell">${formatMoney(e.amount)}</td>
        <td></td>
        <td class="actions-cell">
          <button class="menu-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          <div class="menu" data-id="${e.id}">
            <button class="menu-edit"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="menu-delete"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  });
  updateBudgetUI();
}

/* =====================================================
   5. CHART.JS INTEGRATION
   ===================================================== */
function renderChart(data) {
  const canvas = document.getElementById('expense-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Group data by category
  const categories = {};
  data.forEach(e => {
    if (!categories[e.item]) categories[e.item] = 0;
    categories[e.item] += e.amount;
  });

  const labels = Object.keys(categories);
  const values = Object.values(categories);

  if (myChart) myChart.destroy(); // Destroy old chart before drawing new

  const isDark = document.body.hasAttribute("data-theme");
  const textColor = isDark ? "#9ca3af" : "#6b7280";

  myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#0f766e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, font: { size: 11 } }
        }
      }
    }
  });
}

/* =====================================================
   6. CRUD OPERATIONS
   ===================================================== */
function logHistory(action, expenseData) {
  historyLog.push({ id: Date.now().toString(), action, timestamp: new Date().toISOString(), data: { ...expenseData } });
  localStorage.setItem("historyLog", JSON.stringify(historyLog));
}

document.getElementById("expense-form").onsubmit = (event) => {
  event.preventDefault();
  const amount = Number(amountInput.value);
  const desc = descInput.value.trim();
  if (isNaN(amount) || amount <= 0 || !desc) return alert("Invalid data.");

  expenses.push({ id: Date.now().toString() + Math.random().toString().slice(2), item: itemInput.value, description: desc, amount: amount, date: new Date().toISOString() });
  localStorage.setItem("expenses", JSON.stringify(expenses));
  
  document.getElementById("add-modal").classList.remove("open");
  document.getElementById("expense-form").reset();
  
  if (currentFilter !== "daily") { timeFilter.value = "daily"; currentFilter = "daily"; }
  display();
};

table.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row || row.classList.contains("day-header")) return;
  const id = row.getAttribute("data-id");

  if (e.target.closest(".menu-btn")) {
    document.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
    row.querySelector(".menu").classList.toggle("open");
    return;
  }

  if (e.target.closest(".menu-edit")) {
    editingId = id;
    const exp = expenses.find(x => x.id === id);
    document.getElementById("edit-item").innerHTML = itemInput.innerHTML;
    document.getElementById("edit-item").value = exp.item;
    document.getElementById("edit-description").value = exp.description;
    document.getElementById("edit-amount").value = exp.amount;
    document.getElementById("edit-modal").classList.add("open");
    return;
  }

  if (e.target.closest(".menu-delete")) {
    if(confirm("Delete this expense? Logged in History.")) {
      logHistory("Deleted", expenses.find(exp => exp.id === id));
      expenses = expenses.filter(exp => exp.id !== id);
      localStorage.setItem("expenses", JSON.stringify(expenses));
      display();
    }
    return;
  }
});

document.getElementById("edit-form").onsubmit = (e) => {
  e.preventDefault();
  const exp = expenses.find(x => x.id === editingId);
  if (!exp) return;
  logHistory("Edited", { ...exp });
  
  exp.item = document.getElementById("edit-item").value;
  exp.description = document.getElementById("edit-description").value.trim();
  exp.amount = Number(document.getElementById("edit-amount").value);

  localStorage.setItem("expenses", JSON.stringify(expenses));
  display();
  document.getElementById("edit-modal").classList.remove("open");
};

/* =====================================================
   7. SHOPPING CARDS
   ===================================================== */
document.getElementById("create-card-form").onsubmit = (e) => {
  e.preventDefault();
  const name = document.getElementById("card-name-input").value.trim();
  if (!name) return;
  shoppingCards.push({ id: Date.now().toString(), name: name, items: [] });
  localStorage.setItem("shoppingCards", JSON.stringify(shoppingCards));
  document.getElementById("create-card-form").reset();
  document.getElementById("add-card-modal").classList.remove("open");
  renderShoppingCards();
};

function renderShoppingCards() {
  const container = document.getElementById("shopping-cards-container");
  container.innerHTML = "";
  if (shoppingCards.length === 0) {
    container.innerHTML = "<p style='color:var(--text-muted); grid-column: 1/-1;'>No cards yet. Create one to group your shopping items!</p>";
    return;
  }
  shoppingCards.forEach(card => {
    const pendingItems = card.items.filter(i => !i.done);
    const previewList = pendingItems.slice(0, 3).map(i => `<li>${i.text}</li>`).join("");
    const moreCount = pendingItems.length > 3 ? `<li>...and ${pendingItems.length - 3} more</li>` : "";
    const div = document.createElement("div");
    div.className = "shopping-card";
    div.onclick = () => openCardDetails(card.id);
    div.innerHTML = `
      <h3>${card.name}</h3>
      <ul class="card-preview">
        ${pendingItems.length > 0 ? previewList + moreCount : "<li style='color:var(--border);'>No items yet</li>"}
      </ul>
    `;
    container.appendChild(div);
  });
}

function openCardDetails(cardId) {
  activeCardId = cardId;
  const card = shoppingCards.find(c => c.id === cardId);
  document.getElementById("detail-card-title").textContent = card.name;
  
  document.getElementById("new-item-name").value = "";
  document.getElementById("new-item-desc").value = "";
  document.getElementById("item-image-file").value = "";
  itemImageBase64 = null;
  document.getElementById("img-hint-text").classList.remove("has-img");
  document.getElementById("img-hint-text").innerHTML = '<i class="fa-solid fa-camera"></i> add image to remember quickly';
  
  navigateTo('card-details');
  renderCardItems();
}

function deleteCurrentCard() {
  if (!confirm("Are you sure you want to delete this entire card?")) return;
  shoppingCards = shoppingCards.filter(c => c.id !== activeCardId);
  localStorage.setItem("shoppingCards", JSON.stringify(shoppingCards));
  navigateTo('shopping');
}

function renderCardItems() {
  const listEl = document.getElementById("card-items-container");
  listEl.innerHTML = "";
  const card = shoppingCards.find(c => c.id === activeCardId);
  
  if (card.items.length === 0) {
    listEl.innerHTML = "<p style='color:var(--text-muted); text-align:center; padding: 40px;'>Your list is empty. Add items below.</p>";
    return;
  }
  card.items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = `card-item ${item.done ? 'done' : ''}`;
    const imgHtml = item.image 
      ? `<img src="${item.image}" class="card-item-img" alt="Item">` 
      : `<div class="card-item-img"><i class="fa-solid fa-image"></i></div>`;

    div.innerHTML = `
      ${imgHtml}
      <div class="card-item-info">
        <h4>${item.text}</h4>
        <p>${item.desc || 'No description provided.'}</p>
        <div class="card-item-actions">
          ${!item.done ? `
            <button class="btn-get" onclick="handleGetItem(${index})"><i class="fa-solid fa-check"></i> Get it</button>
            <button class="btn-miss" onclick="handleMissItem(${index})"><i class="fa-solid fa-xmark"></i> Not found</button>
          ` : '<span style="font-size:12px; color:var(--text-muted);"><i class="fa-solid fa-check-double"></i> Handled</span>'}
        </div>
      </div>
    `;
    listEl.appendChild(div);
  });
}

function handleImagePreview(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      itemImageBase64 = e.target.result;
      const hint = document.getElementById("img-hint-text");
      hint.classList.add("has-img");
      hint.innerHTML = '<i class="fa-solid fa-check-circle"></i> Image attached!';
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function addItemToCard() {
  const nameInput = document.getElementById("new-item-name");
  const descInput = document.getElementById("new-item-desc");
  const text = nameInput.value.trim();
  const desc = descInput.value.trim();
  if (!text) return alert("Please enter an item name.");

  const card = shoppingCards.find(c => c.id === activeCardId);
  card.items.push({ text: text, desc: desc, image: itemImageBase64, done: false });
  localStorage.setItem("shoppingCards", JSON.stringify(shoppingCards));
  
  nameInput.value = "";
  descInput.value = "";
  document.getElementById("item-image-file").value = "";
  itemImageBase64 = null;
  document.getElementById("img-hint-text").classList.remove("has-img");
  document.getElementById("img-hint-text").innerHTML = '<i class="fa-solid fa-camera"></i> add image to remember quickly';
  
  renderCardItems();
}

window.handleGetItem = (itemIndex) => {
  const card = shoppingCards.find(c => c.id === activeCardId);
  const item = card.items[itemIndex];
  card.items[itemIndex].done = true;
  localStorage.setItem("shoppingCards", JSON.stringify(shoppingCards));
  renderCardItems();
  
  navigateTo('expenses');
  document.getElementById("add-modal").classList.add("open");
  descInput.value = item.text + (item.desc ? ` - ${item.desc}` : "");
  amountInput.value = "";
  amountInput.focus();
};

window.handleMissItem = (itemIndex) => {
  const card = shoppingCards.find(c => c.id === activeCardId);
  card.items[itemIndex].done = true;
  localStorage.setItem("shoppingCards", JSON.stringify(shoppingCards));
  renderCardItems();
};

/* =====================================================
   8. BUDGET, HISTORY, BACKUP & UTILS
   ===================================================== */
document.getElementById("budget-input").value = monthlyBudget > 0 ? monthlyBudget : "";
document.getElementById("save-budget-btn").onclick = () => {
  monthlyBudget = Number(document.getElementById("budget-input").value) || 0;
  localStorage.setItem("monthlyBudget", monthlyBudget);
  updateBudgetUI();
  alert("Budget saved!");
};

function updateBudgetUI() {
  const container = document.getElementById("budget-progress-container");
  if (monthlyBudget <= 0) { container.classList.add("hidden"); return; }
  container.classList.remove("hidden");

  const now = new Date();
  let spentThisMonth = 0;
  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) spentThisMonth += e.amount;
  });

  const percentage = (spentThisMonth / monthlyBudget) * 100;
  const fill = document.getElementById("budget-progress-fill");
  fill.style.width = Math.min(percentage, 100) + "%";
  
  if (percentage >= 100) {
    fill.classList.add("over-budget");
    document.getElementById("budget-status-text").textContent = "⚠️ Over Budget!";
  } else {
    fill.classList.remove("over-budget");
    document.getElementById("budget-status-text").textContent = "Monthly Budget";
  }
  document.getElementById("budget-amounts").textContent = `${formatMoney(spentThisMonth)} / ${formatMoney(monthlyBudget)}`;
}

function renderHistory() {
  const tbody = document.getElementById("history-body");
  const empty = document.getElementById("history-empty");
  tbody.innerHTML = "";
  if (historyLog.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  const sorted = [...historyLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  sorted.forEach(log => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="${log.action === "Deleted" ? "badge-delete" : "badge-edit"}">${log.action}</span></td>
      <td style="color: var(--text-muted); font-size: 12px;">${new Date(log.timestamp).toLocaleString("en-NG", { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${log.data.item}</td>
      <td class="desc-cell"><span class="desc-text">${log.data.description}</span></td>
      <td style="font-weight: 600; text-align: right; color: var(--text-muted); text-decoration: line-through;">${formatMoney(log.data.amount)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function clearHistory() {
  if(confirm("Clear all history logs?")) {
    historyLog = [];
    localStorage.setItem("historyLog", JSON.stringify(historyLog));
    renderHistory();
  }
}

document.getElementById("export-csv-btn").onclick = () => {
  if (expenses.length === 0) return alert("No expenses to export!");
  let csv = "Date,Spend-item,Description,Amount\n";
  expenses.forEach(e => {
    csv += `"${new Date(e.date).toLocaleString()}","${e.item}","${e.description.replace(/"/g, '""')}",${e.amount}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Expenses_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};

// JSON BACKUP & RESTORE
function exportBackup() {
  const backupData = {
    expenses, customCategories, shoppingCards, historyLog, monthlyBudget, theme: localStorage.getItem("theme") || "system", currency: currentCurrency
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ExpenseTracker_Backup_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.expenses) {
        localStorage.setItem("expenses", JSON.stringify(data.expenses));
        localStorage.setItem("customCategories", JSON.stringify(data.customCategories || []));
        localStorage.setItem("shoppingCards", JSON.stringify(data.shoppingCards || []));
        localStorage.setItem("historyLog", JSON.stringify(data.historyLog || []));
        localStorage.setItem("monthlyBudget", data.monthlyBudget || 0);
        localStorage.setItem("theme", data.theme || "system");
        localStorage.setItem("currency", data.currency || "₦");
        alert("Backup restored successfully! The page will reload.");
        window.location.reload();
      } else {
        alert("Invalid backup file.");
      }
    } catch (err) {
      alert("Error reading backup file.");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll(".modal-close").forEach(btn => {
  btn.onclick = function() { this.closest(".modal-overlay").classList.remove("open"); };
});

// Init
function populateCategories() {
  itemInput.innerHTML = "";
  ["Food", "Transport", "Data", ...customCategories].forEach(cat => {
    itemInput.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
  itemInput.innerHTML += `<option value="Other...">Other...</option>`;
}

populateCategories();
display();

/* =====================================================
   9. PROGRESSIVE WEB APP (PWA) REGISTRATION
   ===================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker Registered!', reg))
      .catch(err => console.log('Service Worker Failed', err));
  });
}