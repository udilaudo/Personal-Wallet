/**
 * ============================================================
 * APP.JS — UI Logic for Wallet Dashboard
 * ============================================================
 */

// ======================== DEFAULT CONFIG ========================

const DEFAULT_USER = {
  categories_list: [
    "💼 Entrate","🛒 Spesa", "🍸 Cibo fuori / Bevute", "🏠 Casa", "🏠 Affitto",
    "💡 Bollette", "⚕️ Salute", "🔁 Abbonamenti", "🎁 Prestiti/Rimborsi","🎁 Regali","🚊 Trasporto","⚽ Sport", "🚗 Auto", "💇 Cura / Benessere","🎉 Divertimento","👔 Abbigliamento", "📦 Altro", "📚 Cultura","💻 Tecnologia","📈 Investimenti",
  ],
  conti_list: [
    "postapay", "Revolut", "bancoposta", "fineco", "contanti", "paypal"
  ],
  subscriptions: {
    "Iliad": {
      amount: 9.99,
      conto: "bancoposta",
      start_date: "2025-04-02",
      end_date: "2028-04-02",
      status: "active"
    },
    "Spotify": {
      amount: 20.99,
      conto: "paypal",
      start_date: "2025-04-18",
      end_date: "2027-04-18",
      status: "active"
    },
    "iCloud": {
      amount: 2.99,
      conto: "postapay",
      start_date: "2025-04-10",
      end_date: "2028-04-10",
      status: "active"
    }
  },
  commission: 0.0
};

// ======================== INIT ========================

let wallet = new Wallet(DEFAULT_USER);
wallet.load();

let currentChartMain = null;
let currentChartFiltered = null;
let currentChartInvestment = null;
let currentChartInvPie = null;
let currentChartAccountsPie = null;
// Riferimento al grafico del saldo giornaliero cumulativo
let currentChartDailyBalance = null;

let currentChartTypeMain = "pie-categories";
let currentChartTypeFiltered = "pie-categories";
let excludeSaldoMain = true; // attivo di default: esclude la categoria "Saldo" dai grafici
let excludeSaldoFiltered = false;

let investments = JSON.parse(localStorage.getItem("wallet_investments") || "[]");
let selectedInvTicker = null;
let selectedInvRange = "1mo";

function saveInvestments() {
  localStorage.setItem("wallet_investments", JSON.stringify(investments));
}

// ======================== BACKEND SYNC ========================

async function syncToBackend() {
  try {
    await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: wallet.transactions,
        categories: wallet.categories,
        contiList: wallet.contiList,
        subscriptions: wallet.subscriptions,
        commission: wallet.commission,
        investments: investments,
      }),
    });
  } catch (e) {
    console.warn("Backend sync failed:", e.message);
  }
}

async function loadFromBackend() {
  try {
    const res = await fetch("/api/load");
    if (!res.ok) return false;
    const data = await res.json();

    if (data.transactions && data.transactions.length > 0) {
      wallet.transactions = data.transactions;
    }
    if (data.categories) wallet.categories = data.categories;
    if (data.contiList) wallet.contiList = data.contiList;
    if (data.subscriptions) wallet.subscriptions = data.subscriptions;
    if (data.commission !== undefined) wallet.commission = data.commission;
    wallet.update();
    wallet.paySubscriptions();

    if (data.investments && data.investments.length > 0) {
      investments = data.investments;
    }

    return true;
  } catch (e) {
    console.warn("Backend not available, using localStorage:", e.message);
    return false;
  }
}

// Override wallet.save to also sync to backend
const _originalWalletSave = wallet.save.bind(wallet);
wallet.save = function () {
  _originalWalletSave();
  syncToBackend();
};

// Override saveInvestments to also sync to backend
const _originalSaveInvestments = saveInvestments;
saveInvestments = function () {
  _originalSaveInvestments();
  syncToBackend();
};

// ======================== THEME TOGGLE ========================

/**
 * Inizializza il tema (chiaro/scuro) leggendo la preferenza salvata
 * in localStorage, oppure usando la preferenza di sistema.
 * Applica subito l'attributo data-theme per evitare il flash di tema sbagliato.
 */
function initTheme() {
  const saved = localStorage.getItem("wallet-theme");
  // Se l'utente ha una preferenza salvata la usiamo, altrimenti controlliamo il sistema
  if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  // L'aggiornamento dell'icona avviene dopo il DOMContentLoaded
}

/**
 * Alterna tra tema chiaro e scuro, salva la preferenza, aggiorna icona e grafici.
 */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("wallet-theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("wallet-theme", "dark");
  }
  updateThemeIcon();

  // Ri-renderizza: renderMainPage() include già il grafico con i dati filtrati correnti
  try {
    renderMainPage();
    renderInvestmentsPage();
  } catch (e) {
    // Ignora errori se le pagine non sono ancora state inizializzate
  }
}

/**
 * Aggiorna l'icona luna/sole su entrambi i pulsanti (desktop e mobile).
 */
function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const iconName = isDark ? "sun" : "moon";
  // Aggiorna entrambi i bottoni toggle (mobile e desktop)
  ["btn-theme-toggle", "btn-theme-toggle-desktop"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }
  });
  // Re-init Lucide per rendere le nuove icone
  lucide.createIcons();
}

// Applica il tema subito (prima del DOMContentLoaded) per evitare flash
initTheme();

// ======================== DOM READY ========================

document.addEventListener("DOMContentLoaded", async () => {
  // Try loading from backend first (falls back to localStorage silently)
  await loadFromBackend();

  // Initialize Lucide icons
  lucide.createIcons();

  // Aggiorna l'icona del tema (sole/luna) ora che il DOM è pronto
  updateThemeIcon();

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("add-date").value = today;
  document.getElementById("transfer-date").value = today;
  document.getElementById("edit-date").value = today;
  document.getElementById("sub-start").value = today;
  document.getElementById("inv-date").value = today;

  // Default: ultimi 2 mesi (coerente con il preset "Last 2 Months" attivo di default)
  // const twoMonthsAgo = new Date();
  // twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  // document.getElementById("filter-date-from").value = twoMonthsAgo.toISOString().split("T")[0];
  // document.getElementById("filter-date-to").value = today;

  populateSelects();
  renderMainPage();        // renderizza con filtri vuoti = totale
  renderSettingsPage();
  renderInvestmentsPage();

  bindNavigation();
  bindModals();
  bindMainActions();
  bindFilterActions();
  bindSettingsActions();
  bindChartButtons();
  // Riflette lo stato iniziale di excludeSaldoMain sul bottone toggle
  document.getElementById("toggle-saldo-main").classList.toggle("active", excludeSaldoMain);
  bindImportExport();
  bindInvestmentActions();
  bindMobileNav();
  bindBottomNav(); // Barra di navigazione inferiore per mobile
  bindFAB();
  bindFilterToggle(); // Toggle collassa/espandi pannello filtri nella Dashboard

  // Bind dei pulsanti toggle tema (mobile + desktop)
  document.getElementById("btn-theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("btn-theme-toggle-desktop").addEventListener("click", toggleTheme);

  // Il grafico principale è già incluso in renderMainPage(), non serve crearlo separatamente.
});

// ======================== NAVIGATION ========================

function bindNavigation() {
  const navButtons = document.querySelectorAll(".nav-btn");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navigateTo(btn.dataset.page);
    });
  });
}

function navigateTo(page) {
  // Desktop nav (header orizzontale)
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add("active"));

  // Mobile nav overlay (menu hamburger slide-in, mantenuto per retrocompatibilità)
  document.querySelectorAll(".mobile-nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.mobile-nav-btn[data-page="${page}"]`).forEach(b => b.classList.add("active"));

  // Bottom nav (barra inferiore mobile — aggiornamento stato attivo)
  document.querySelectorAll(".bottom-nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.bottom-nav-btn[data-page="${page}"]`).forEach(b => b.classList.add("active"));

  // Pages
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.getElementById(`page-${page}`).classList.remove("hidden");

  // Close mobile nav
  document.getElementById("mobile-nav-overlay").classList.add("hidden");

  // Mostra il FAB solo sulla Dashboard (pagina principale delle transazioni)
  // Su tutte le altre pagine è nascosto per non creare confusione
  const fab = document.getElementById("fab-add");
  if (page === "main") {
    fab.classList.remove("hidden");
  } else {
    fab.classList.add("hidden");
  }
}

function bindMobileNav() {
  document.getElementById("btn-mobile-menu").addEventListener("click", () => {
    document.getElementById("mobile-nav-overlay").classList.remove("hidden");
    lucide.createIcons();
  });

  document.getElementById("mobile-nav-close").addEventListener("click", () => {
    document.getElementById("mobile-nav-overlay").classList.add("hidden");
  });

  document.getElementById("mobile-nav-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById("mobile-nav-overlay").classList.add("hidden");
    }
  });

  document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateTo(btn.dataset.page);
    });
  });
}

/**
 * bindBottomNav — collega i pulsanti della bottom navigation bar (mobile)
 * alla funzione navigateTo(). Ogni pulsante ha data-page="<nome-pagina>"
 * e chiama navigateTo() esattamente come fanno i pulsanti desktop.
 */
function bindBottomNav() {
  document.querySelectorAll(".bottom-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateTo(btn.dataset.page);
    });
  });
}

function bindFAB() {
  document.getElementById("fab-add").addEventListener("click", () => {
    openModal("modal-add");
  });
}

// ======================== FILTER TOGGLE & HELPERS ========================

/**
 * bindFilterToggle — collega il pulsante "Filters" nella Dashboard
 * al pannello di controllo filtri (collassabile).
 */
function bindFilterToggle() {
  const toggleBtn = document.getElementById("btn-toggle-filters");
  const controls = document.getElementById("filter-controls");
  if (!toggleBtn || !controls) return;

  toggleBtn.addEventListener("click", () => {
    const isOpen = !controls.classList.contains("hidden");
    controls.classList.toggle("hidden");

    // Aggiorna l'icona del bottone in base allo stato aperto/chiuso
    const icon = toggleBtn.querySelector("i");
    icon.setAttribute("data-lucide", isOpen ? "sliders-horizontal" : "chevron-up");
    lucide.createIcons();
  });
}

/**
 * resetFilters — azzera tutti i filtri attivi e torna alla vista totale.
 * Deseleziona categorie e account, pulisce le date, re-renderizza.
 */
function resetFilters() {
  // Deseleziona tutte le categorie
  document.querySelectorAll("#filter-categories .filter-chip").forEach(chip => {
    const cb = chip.querySelector("input");
    if (cb) cb.checked = false;
    chip.classList.remove("selected");
  });

  // Deseleziona tutti gli account
  document.querySelectorAll("#filter-accounts .filter-chip").forEach(chip => {
    const cb = chip.querySelector("input");
    if (cb) cb.checked = false;
    chip.classList.remove("selected");
  });

  // Pulisci i campi data e rimuovi il preset attivo
  document.getElementById("filter-date-from").value = "";
  document.getElementById("filter-date-to").value = "";
  document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));

  // Re-renderizza la dashboard: nessun filtro = tutte le transazioni
  renderMainPage();
  showToast("Filters cleared — showing all data");
}

/**
 * hasActiveFilters — restituisce true se almeno un filtro è attivo.
 * Usato per mostrare/nascondere il badge e il tasto Reset.
 */
function hasActiveFilters() {
  const hasCats = document.querySelectorAll("#filter-categories input:checked").length > 0;
  const hasAccs = document.querySelectorAll("#filter-accounts input:checked").length > 0;
  const hasDateFrom = !!document.getElementById("filter-date-from").value;
  const hasDateTo = !!document.getElementById("filter-date-to").value;
  return hasCats || hasAccs || hasDateFrom || hasDateTo;
}

/**
 * updateFilterBadge — aggiorna visibilità del pallino "filtri attivi"
 * e del pulsante Reset in base allo stato corrente dei filtri.
 */
function updateFilterBadge() {
  const active = hasActiveFilters();
  const dot = document.getElementById("filter-active-dot");
  const resetBtn = document.getElementById("btn-reset-filters");
  if (dot) dot.classList.toggle("hidden", !active);
  if (resetBtn) resetBtn.classList.toggle("hidden", !active);
}

// ======================== MODAL SYSTEM ========================

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  lucide.createIcons();
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function bindModals() {
  // Close buttons with data-close attribute
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal(btn.dataset.close);
    });
  });

  // Close on overlay click
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
      }
    });
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
    }
  });

  // Open modal buttons
  document.getElementById("btn-open-add").addEventListener("click", () => openModal("modal-add"));
  document.getElementById("btn-open-transfer").addEventListener("click", () => openModal("modal-transfer"));
  document.getElementById("btn-open-add-inv").addEventListener("click", () => openModal("modal-add-inv"));
  document.getElementById("btn-open-add-sub").addEventListener("click", () => openModal("modal-add-sub"));
  document.getElementById("btn-open-manual-price").addEventListener("click", () => openModal("modal-manual-price"));
}

// ======================== POPULATE SELECTS ========================

function populateSelects() {
  const categorySelects = ["add-category", "edit-category", "remove-category"];
  categorySelects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = "";
    wallet.categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
  });

  const accountSelects = ["add-account", "edit-account", "transfer-from", "transfer-to", "sub-account", "remove-account"];
  accountSelects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = "";
    const list = id === "transfer-to"
      ? [wallet.contiList[1], wallet.contiList[0], ...wallet.contiList.slice(2)]
      : wallet.contiList;
    list.forEach(acc => {
      const opt = document.createElement("option");
      opt.value = acc;
      opt.textContent = acc;
      sel.appendChild(opt);
    });
  });

  // Popola i filtri categorie come chips selezionabili
  const filterCats = document.getElementById("filter-categories");
  if (filterCats) {
    filterCats.innerHTML = "";
    const cats = [...new Set(wallet.transactions.map(t => t.Category))];
    // Metti "Uscite" e "Entrate" come meta-filtri alla fine
    const ordered = cats.filter(c => c !== "Entrate").concat(["Uscite", "Entrate"]);
    const unique = [...new Set(ordered)];
    unique.forEach(cat => {
      const chip = document.createElement("label");
      chip.className = "filter-chip";
      // Checkbox nascosta dentro il chip per mantenere compatibilità con la logica esistente
      chip.innerHTML = `<input type="checkbox" value="${cat}" /> ${cat}`;
      // Click sul chip toglie/aggiunge la classe "selected"
      chip.addEventListener("click", () => {
        const cb = chip.querySelector("input");
        // Il click sul label già toglie la checkbox, sincronizziamo la classe
        // e ri-renderizziamo subito senza bisogno di premere Apply
        setTimeout(() => {
          chip.classList.toggle("selected", cb.checked);
          renderMainPage();
        }, 0);
      });
      filterCats.appendChild(chip);
    });
  }

  // Popola i filtri account come chips selezionabili
  const filterAccs = document.getElementById("filter-accounts");
  if (filterAccs) {
    filterAccs.innerHTML = "";
    wallet.contiList.forEach(acc => {
      const chip = document.createElement("label");
      chip.className = "filter-chip";
      chip.innerHTML = `<input type="checkbox" value="${acc}" /> ${acc}`;
      chip.addEventListener("click", () => {
        const cb = chip.querySelector("input");
        // Auto-apply anche per gli account
        setTimeout(() => {
          chip.classList.toggle("selected", cb.checked);
          renderMainPage();
        }, 0);
      });
      filterAccs.appendChild(chip);
    });
  }

  // Subscription select
  const subSelect = document.getElementById("remove-subscription");
  if (subSelect) {
    subSelect.innerHTML = "";
    Object.keys(wallet.subscriptions).forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      subSelect.appendChild(opt);
    });
  }
}

// ======================== RENDER MAIN PAGE ========================

/**
 * renderMainPage — unica funzione di rendering per la Dashboard.
 * Usa getFilteredData() per ottenere i dati: se nessun filtro è attivo
 * restituisce tutte le transazioni (= totale), altrimenti le filtra.
 * In questo modo "nessun filtro" è semplicemente un filtro vuoto.
 */
function renderMainPage() {
  wallet.sortAndReindex();

  // Ottieni i dati in base ai filtri attivi (filtri vuoti = tutte le transazioni)
  const data = getFilteredData();

  // --- Transaction Table (dati filtrati) ---
  const tbody = document.getElementById("transactions-body");
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No transactions for the current filters. Click "Reset filters" to see all data.</td></tr>';
  } else {
    for (const t of data) {
      const tr = document.createElement("tr");

      if (t.Type === 1 || t.Type === 3) {
        tr.className = "row-income";
      } else if (t.Type === 4) {
        tr.className = "row-transfer";
      }

      const dateStr = `${String(t.D).padStart(2, "0")}/${String(t.M).padStart(2, "0")}/${t.Y}`;
      const typeLabels = { 0: "Expense", 1: "Income", 2: "Balance Out", 3: "Balance In", 4: "Transfer" };

      tr.innerHTML = `
        <td class="amount ${t.Amount >= 0 ? 'positive' : 'negative'}">${t.Amount.toFixed(2)} &euro;</td>
        <td>${t.Category}</td>
        <td>${t.Description}</td>
        <td>${dateStr}</td>
        <td><span class="badge">${t.Conto || "—"}</span></td>
        <td><span class="type-badge type-${t.Type}">${typeLabels[t.Type] || t.Type}</span></td>
        <td>
          <div class="row-actions">
            ${t.Type !== 4 ? `<button class="btn-icon" title="Edit" data-edit-id="${t.ID}"><i data-lucide="pencil"></i></button>` : ''}
            <button class="btn-icon btn-icon-danger" title="Delete" data-delete-id="${t.ID}"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Re-init Lucide for new icons
  lucide.createIcons();

  // Bind inline edit/delete buttons
  document.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.editId);
      const t = wallet.transactions.find(t => t.ID === id);
      if (!t) return;

      document.getElementById("edit-id").value = t.ID;
      document.getElementById("edit-type").value = t.Type === 1 ? "1" : "0";
      document.getElementById("edit-amount").value = Math.abs(t.Amount).toFixed(2);
      document.getElementById("edit-category").value = t.Category;
      document.getElementById("edit-description").value = t.Description;
      document.getElementById("edit-account").value = t.Conto;
      document.getElementById("edit-date").value = `${t.Y}-${String(t.M).padStart(2, "0")}-${String(t.D).padStart(2, "0")}`;

      openModal("modal-edit");
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.deleteId);
      const t = wallet.transactions.find(t => t.ID === id);
      document.getElementById("delete-id").value = id;
      const confirmText = document.querySelector("#modal-confirm-delete .confirm-text");
      if (t && t.Type === 4) {
        confirmText.textContent = "This will delete the entire transfer (both accounts will be reverted).";
      } else {
        confirmText.textContent = "Are you sure you want to delete this transaction?";
      }
      openModal("modal-confirm-delete");
    });
  });

  // --- Summary Cards (calcolate sui dati filtrati) ---
  const summary = Wallet.computeSummary(data);
  const summaryDiv = document.getElementById("summary-main");
  summaryDiv.innerHTML = `
    <div class="card card-total">
      <div class="card-icon"><i data-lucide="wallet"></i></div>
      <span class="card-label">Total Balance</span>
      <span class="card-value">${summary.saldo.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-income">
      <div class="card-icon"><i data-lucide="trending-up"></i></div>
      <span class="card-label">Income</span>
      <span class="card-value">${summary.totalIncome.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-expense">
      <div class="card-icon"><i data-lucide="trending-down"></i></div>
      <span class="card-label">Expenses</span>
      <span class="card-value">${summary.totalOutcome.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-count">
      <div class="card-icon"><i data-lucide="hash"></i></div>
      <span class="card-label">Transactions</span>
      <span class="card-value">${summary.count}</span>
    </div>
  `;

  // --- Account Balances ---
  const balancesDiv = document.getElementById("account-balances");
  balancesDiv.innerHTML = "";
  for (const [conto, saldo] of Object.entries(wallet.saldoConti)) {
    const chip = document.createElement("div");
    chip.className = "balance-chip";
    chip.innerHTML = `
      <span class="balance-chip-name">${conto.charAt(0).toUpperCase() + conto.slice(1)}</span>
      <span class="balance-chip-value ${saldo >= 0 ? 'positive' : 'negative'}">${saldo.toFixed(2)} &euro;</span>
    `;
    balancesDiv.appendChild(chip);
  }

  // --- Account Pie Chart ---
  renderAccountsPieChart();

  // --- Pivot Table (dati filtrati) ---
  renderPivotTable(data, "pivot-head-main", "pivot-body-main");

  // --- Chart principale (ri-creato con i dati filtrati) ---
  // Il grafico si aggiorna ogni volta che cambiano i dati o i filtri
  createChart("chart-main", currentChartTypeMain, data, excludeSaldoMain);

  // --- Daily Balance Chart (usa tutte le transazioni, non filtrate) ---
  // Mostra il saldo cumulativo giornaliero nel tempo sull'intera storia del wallet
  renderDailyBalanceChart();

  // Aggiorna badge e tasto reset in base allo stato dei filtri
  updateFilterBadge();

  // Re-init icons
  lucide.createIcons();

  wallet.save();
}

// ======================== MAIN ACTIONS ========================

function bindMainActions() {
  // Add Transaction
  document.getElementById("btn-add-transaction").addEventListener("click", () => {
    const type = parseInt(document.getElementById("add-type").value);
    const amount = parseFloat(document.getElementById("add-amount").value);
    const category = document.getElementById("add-category").value;
    const description = document.getElementById("add-description").value;
    const conto = document.getElementById("add-account").value;
    const date = document.getElementById("add-date").value;

    if (!amount || amount <= 0) return showToast("Please enter a valid amount", "error");
    if (!date) return showToast("Please select a date", "error");

    const [y, m, d] = date.split("-").map(Number);
    wallet.add(amount, category, description, y, m, d, conto, type);
    wallet.sortAndReindex();

    renderMainPage();
    closeModal("modal-add");
    showToast("Transaction added!");

    document.getElementById("add-amount").value = "0.00";
    document.getElementById("add-description").value = "";
  });

  // Transfer
  document.getElementById("btn-transfer").addEventListener("click", () => {
    const from = document.getElementById("transfer-from").value;
    const to = document.getElementById("transfer-to").value;
    const amount = parseFloat(document.getElementById("transfer-amount").value);
    const date = document.getElementById("transfer-date").value;

    if (!amount || amount <= 0) return showToast("Please enter a valid amount", "error");
    if (from === to) return showToast("Source and destination must be different", "error");

    const [y, m, d] = date.split("-").map(Number);
    wallet.giroconto(amount, from, to, y, m, d);
    wallet.sortAndReindex();

    renderMainPage();
    closeModal("modal-transfer");
    showToast("Transfer completed!");

    document.getElementById("transfer-amount").value = "0.00";
  });

  // Delete (cascade for transfers)
  document.getElementById("btn-delete").addEventListener("click", () => {
    const id = parseInt(document.getElementById("delete-id").value);
    const t = wallet.transactions.find(t => t.ID === id);
    const isTransfer = t && t.Type === 4;
    const success = isTransfer ? wallet.deleteTransferGroup(id) : wallet.delete(id);
    if (success) {
      renderMainPage();
      closeModal("modal-confirm-delete");
      showToast(isTransfer ? "Transfer deleted!" : "Transaction deleted!");
    } else {
      showToast("Transaction not found", "error");
    }
  });

  // Edit
  document.getElementById("btn-edit").addEventListener("click", () => {
    const id = parseInt(document.getElementById("edit-id").value);
    const type = parseInt(document.getElementById("edit-type").value);
    const amount = parseFloat(document.getElementById("edit-amount").value);
    const category = document.getElementById("edit-category").value;
    const description = document.getElementById("edit-description").value;
    const conto = document.getElementById("edit-account").value;
    const date = document.getElementById("edit-date").value;

    if (!amount || amount <= 0) return showToast("Please enter a valid amount", "error");

    const [y, m, d] = date.split("-").map(Number);
    const success = wallet.editTransaction(id, amount, category, description, y, m, d, conto, type);

    if (success) {
      renderMainPage();
      closeModal("modal-edit");
      showToast("Transaction updated!");
    } else {
      showToast("Transaction not found", "error");
    }
  });
}

// ======================== FILTERED PAGE ========================

/**
 * renderFilteredPage — mantenuta per retrocompatibilità (chiamata da importCSV ecc.)
 * Ora delega a renderMainPage() che usa già getFilteredData() internamente.
 */
function renderFilteredPage() {
  renderMainPage();
}

function bindFilterActions() {
  // Pulsante Reset: azzera tutti i filtri e torna al totale
  document.getElementById("btn-reset-filters").addEventListener("click", () => {
    resetFilters();
  });

  // --- Date Presets: cliccando un preset aggiorna le date nel form ---
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      const now = new Date();
      const toDate = now.toISOString().split("T")[0];
      let fromDate = "";

      // Calcola la data "from" in base al preset selezionato
      if (preset === "this-month") {
        // Dal primo giorno del mese corrente
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      } else if (preset === "last-2") {
        // 1° del mese scorso (es. 20 Feb → 1 Gen)
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
      } else if (preset === "last-3") {
        // 1° di 2 mesi fa (es. 20 Feb → 1 Dic)
        fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0];
      } else if (preset === "last-6") {
        // 1° di 5 mesi fa (es. 20 Feb → 1 Set)
        fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split("T")[0];
      } else if (preset === "this-year") {
        // Dal primo gennaio dell'anno corrente
        fromDate = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      } else if (preset === "all") {
        // Nessun limite: svuota entrambe le date
        fromDate = "";
      }

      // Aggiorna i campi data
      document.getElementById("filter-date-from").value = fromDate;
      document.getElementById("filter-date-to").value = preset === "all" ? "" : toDate;

      // Evidenzia il preset attivo
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Auto-apply: aggiorna i dati subito senza premere Apply
      renderMainPage();
    });
  });

  // Quando l'utente modifica manualmente una data, deseleziona i preset e auto-applica
  document.getElementById("filter-date-from").addEventListener("input", () => {
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    renderMainPage();
  });
  document.getElementById("filter-date-to").addEventListener("input", () => {
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    renderMainPage();
  });

  // --- Select All / None per le categorie ---
  document.getElementById("cats-select-all").addEventListener("click", () => {
    document.querySelectorAll("#filter-categories .filter-chip").forEach(chip => {
      chip.querySelector("input").checked = true;
      chip.classList.add("selected");
    });
    renderMainPage();
  });
  document.getElementById("cats-select-none").addEventListener("click", () => {
    document.querySelectorAll("#filter-categories .filter-chip").forEach(chip => {
      chip.querySelector("input").checked = false;
      chip.classList.remove("selected");
    });
    renderMainPage();
  });

  // --- Select All / None per gli account ---
  document.getElementById("accs-select-all").addEventListener("click", () => {
    document.querySelectorAll("#filter-accounts .filter-chip").forEach(chip => {
      chip.querySelector("input").checked = true;
      chip.classList.add("selected");
    });
    renderMainPage();
  });
  document.getElementById("accs-select-none").addEventListener("click", () => {
    document.querySelectorAll("#filter-accounts .filter-chip").forEach(chip => {
      chip.querySelector("input").checked = false;
      chip.classList.remove("selected");
    });
    renderMainPage();
  });
}

// ======================== SETTINGS PAGE ========================

function renderSettingsPage() {
  // Subscriptions list
  const subList = document.getElementById("subscriptions-list");
  subList.innerHTML = "";

  const active = Object.entries(wallet.subscriptions).filter(([, d]) => d.status === "active");
  const expired = Object.entries(wallet.subscriptions).filter(([, d]) => d.status !== "active");
  const all = [...active, ...expired];

  if (all.length === 0) {
    subList.innerHTML = '<p class="empty-msg" style="padding: 1rem 0;">No subscriptions yet.</p>';
  } else {
    all.forEach(([name, details]) => {
      const isActive = details.status === "active";
      const div = document.createElement("div");
      div.className = "sub-card";
      div.innerHTML = `
        <div class="sub-card-header">
          <span class="sub-card-name">${name}</span>
          <span class="sub-status ${isActive ? 'status-active' : 'status-expired'}">${details.status}</span>
        </div>
        <div class="sub-card-details">
          <span class="sub-card-amount">${details.amount.toFixed(2)} &euro;/month</span>
          <span>${details.conto}</span>
          <span>${details.start_date} — ${details.end_date}</span>
        </div>
      `;
      subList.appendChild(div);
    });
  }

  // Category tags
  const catsTags = document.getElementById("categories-tags");
  if (catsTags) {
    catsTags.innerHTML = "";
    wallet.categories.forEach(cat => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = cat;
      catsTags.appendChild(span);
    });
  }

  // Account tags
  const accsTags = document.getElementById("accounts-tags");
  if (accsTags) {
    accsTags.innerHTML = "";
    wallet.contiList.forEach(acc => {
      const span = document.createElement("span");
      span.className = "tag tag-account";
      span.textContent = acc;
      accsTags.appendChild(span);
    });
  }

  // Commission
  const commEl = document.getElementById("current-commission");
  if (commEl) commEl.textContent = wallet.commission.toFixed(2);
}

function bindSettingsActions() {
  // Add category
  document.getElementById("btn-add-category").addEventListener("click", () => {
    const input = document.getElementById("new-category");
    const name = input.value.trim();
    if (!name) return showToast("Please enter a category name", "error");
    if (wallet.categories.includes(name)) return showToast("Category already exists", "warning");

    wallet.categories.push(name);
    input.value = "";
    populateSelects();
    renderSettingsPage();
    wallet.save();
    showToast(`Category "${name}" added!`);
  });

  // Remove category
  document.getElementById("btn-remove-category").addEventListener("click", () => {
    const name = document.getElementById("remove-category").value;
    if (!name) return showToast("Please select a category", "error");

    wallet.categories = wallet.categories.filter(c => c !== name);
    populateSelects();
    renderSettingsPage();
    wallet.save();
    showToast(`Category "${name}" removed!`);
  });

  // Add account
  document.getElementById("btn-add-account").addEventListener("click", () => {
    const input = document.getElementById("new-account");
    const name = input.value.trim();
    if (!name) return showToast("Please enter an account name", "error");
    if (wallet.contiList.includes(name)) return showToast("Account already exists", "warning");

    wallet.contiList.push(name);
    input.value = "";
    populateSelects();
    renderSettingsPage();
    wallet.save();
    showToast(`Account "${name}" added!`);
  });

  // Remove account
  document.getElementById("btn-remove-account").addEventListener("click", () => {
    const name = document.getElementById("remove-account").value;
    if (!name) return showToast("Please select an account", "error");

    wallet.contiList = wallet.contiList.filter(c => c !== name);
    populateSelects();
    renderSettingsPage();
    wallet.save();
    showToast(`Account "${name}" removed!`);
  });

  // Add subscription
  document.getElementById("btn-add-subscription").addEventListener("click", () => {
    const name = document.getElementById("sub-name").value.trim();
    const startDate = document.getElementById("sub-start").value;
    const duration = parseInt(document.getElementById("sub-duration").value);
    const amount = parseFloat(document.getElementById("sub-amount").value);
    const account = document.getElementById("sub-account").value;

    if (!name) return showToast("Please enter a subscription name", "error");
    if (wallet.subscriptions[name]) return showToast("Subscription already exists", "warning");

    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + duration);
    const endStr = end.toISOString().split("T")[0];

    wallet.subscriptions[name] = {
      amount,
      conto: account,
      start_date: startDate,
      end_date: endStr,
      status: "active"
    };

    document.getElementById("sub-name").value = "";
    populateSelects();
    renderSettingsPage();
    closeModal("modal-add-sub");
    wallet.save();
    showToast(`Subscription "${name}" added!`);
  });

  // Remove subscription
  document.getElementById("btn-remove-subscription").addEventListener("click", () => {
    const name = document.getElementById("remove-subscription").value;
    if (!name) return showToast("Please select a subscription", "error");

    delete wallet.subscriptions[name];
    populateSelects();
    renderSettingsPage();
    wallet.save();
    showToast(`Subscription "${name}" removed!`);
  });

  // Deactivate subscription
  document.getElementById("btn-deactivate-subscription").addEventListener("click", () => {
    const name = document.getElementById("remove-subscription").value;
    if (!name || !wallet.subscriptions[name]) return showToast("Please select a subscription", "error");

    wallet.subscriptions[name].status = "expired";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    wallet.subscriptions[name].end_date = yesterday.toISOString().split("T")[0];

    renderSettingsPage();
    wallet.save();
    showToast(`Subscription "${name}" deactivated!`);
  });

  // Save commission
  document.getElementById("btn-save-commission").addEventListener("click", () => {
    const value = parseFloat(document.getElementById("commission-value").value);
    wallet.commission = value;
    renderSettingsPage();
    wallet.save();
    showToast(`Commission saved: ${value.toFixed(2)} EUR`);
  });
}

// ======================== CHARTS ========================

/**
 * Restituisce colori adattati al tema corrente per i grafici Chart.js.
 * In dark mode i testi e le griglie usano colori chiari.
 */
function getChartThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    textColor: isDark ? "#e8e6f0" : "#1a1a2e",
    gridColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
    borderColor: isDark ? "#1a1a2e" : "#ffffff"
  };
}

function createChart(canvasId, chartType, data, excludeSaldo = false) {
  if (excludeSaldo) {
    data = data.filter(t => t.Category !== "Saldo");
  }

  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");

  if (canvasId === "chart-main" && currentChartMain) {
    currentChartMain.destroy();
  } else if (canvasId === "chart-filtered" && currentChartFiltered) {
    currentChartFiltered.destroy();
  }

  let config;
  // Colori adattati al tema per testo, griglie e bordi dei grafici
  const theme = getChartThemeColors();

  // Imposta i default globali di Chart.js per rispettare il tema
  Chart.defaults.color = theme.textColor;
  Chart.defaults.borderColor = theme.gridColor;

  switch (chartType) {
    case "bar": {
      const chartData = Wallet.chartBarData(data);
      config = {
        type: "bar",
        data: {
          labels: chartData.labels,
          datasets: [
            { label: "Expenses", data: chartData.expenses, backgroundColor: "#ef4444", borderRadius: 6 },
            { label: "Income", data: chartData.incomes, backgroundColor: "#10b981", borderRadius: 6 }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Net by Category", font: { size: 16, weight: "bold" } },
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const sign = ctx.dataset.label === "Expenses" ? "-" : "+";
                  return ` ${ctx.dataset.label}: ${sign}${ctx.raw.toFixed(2)} \u20AC`;
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: theme.gridColor } },
            x: { grid: { display: false } }
          }
        }
      };
      break;
    }

    case "pie-income-expense": {
      const pie = Wallet.chartPieIncomeExpense(data);
      config = {
        type: "doughnut",
        data: {
          labels: ["Expenses", "Income"],
          datasets: [{
            data: [pie.totalExpense, pie.totalIncome],
            backgroundColor: ["#ef4444", "#10b981"],
            borderWidth: 2,
            borderColor: theme.borderColor
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Income vs Expenses", font: { size: 16, weight: "bold" } },
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const sign = ctx.label === "Expenses" ? "-" : "+";
                  return ` ${ctx.label}: ${sign}${ctx.parsed.toFixed(2)} \u20AC`;
                }
              }
            }
          }
        }
      };
      break;
    }

    case "pie-categories": {
      const pieData = Wallet.chartPieCategories(data);
      const pieNets = pieData.nets;
      config = {
        type: "doughnut",
        data: {
          labels: pieData.labels,
          datasets: [{
            data: pieData.values,
            backgroundColor: pieData.colors,
            borderWidth: 2,
            borderColor: theme.borderColor
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Net by Category", font: { size: 16, weight: "bold" } },
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const net = pieNets[ctx.dataIndex];
                  const sign = net >= 0 ? "+" : "";
                  return ` ${ctx.label}: ${sign}${net.toFixed(2)} \u20AC`;
                }
              }
            }
          }
        }
      };
      break;
    }

    case "pie-accounts": {
      const accData = Wallet.chartPieAccounts(data);
      const accNets = accData.nets;
      config = {
        type: "doughnut",
        data: {
          labels: accData.labels,
          datasets: [{
            data: accData.values,
            backgroundColor: accData.colors,
            borderWidth: 2,
            borderColor: theme.borderColor
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Net by Account", font: { size: 16, weight: "bold" } },
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const net = accNets[ctx.dataIndex];
                  const sign = net >= 0 ? "+" : "";
                  return ` ${ctx.label}: ${sign}${net.toFixed(2)} \u20AC`;
                }
              }
            }
          }
        }
      };
      break;
    }

    case "time-series": {
      const ts = Wallet.chartTimeSeries(data);
      config = {
        type: "bar",
        data: {
          labels: ts.labels,
          datasets: [
            { label: "Expenses", data: ts.expenses.map(v => -v), backgroundColor: "#ef4444", borderRadius: 4 },
            { label: "Income", data: ts.incomes, backgroundColor: "#10b981", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: "Income & Expenses by Month", font: { size: 16, weight: "bold" } },
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const sign = ctx.dataset.label === "Expenses" ? "-" : "+";
                  return ` ${ctx.dataset.label}: ${sign}${Math.abs(ctx.raw).toFixed(2)} \u20AC`;
                }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, grid: { color: theme.gridColor },
              ticks: { callback: v => Math.abs(v) }
            }
          }
        }
      };
      break;
    }
  }

  const chart = new Chart(ctx, config);

  if (canvasId === "chart-main") currentChartMain = chart;
  else if (canvasId === "chart-filtered") currentChartFiltered = chart;

  return chart;
}

function renderAccountsPieChart() {
  if (currentChartAccountsPie) currentChartAccountsPie.destroy();

  const balances = wallet.saldoConti;
  const labels = [];
  const values = [];

  for (const [conto, saldo] of Object.entries(balances)) {
    if (saldo === 0) continue;
    labels.push(conto.charAt(0).toUpperCase() + conto.slice(1));
    values.push(Math.abs(saldo));
  }

  if (labels.length === 0) return;

  const palette = [
    "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"
  ];
  const colors = labels.map((_, i) => palette[i % palette.length]);
  const total = values.reduce((a, b) => a + b, 0);

  const ctx = document.getElementById("chart-accounts-pie").getContext("2d");
  currentChartAccountsPie = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: getChartThemeColors().borderColor
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${val.toFixed(2)} \u20AC (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * renderDailyBalanceChart — crea il grafico a linee del saldo giornaliero cumulativo.
 *
 * Logica:
 *   - Usa TUTTE le transazioni del wallet (non quelle filtrate) per avere il vero
 *     saldo storico in ogni momento. I filtri attivi non influenzano questo grafico.
 *   - Chiama Wallet.chartDailyBalance() che restituisce { labels, balances }.
 *   - labels: date ISO "YYYY-MM-DD" ordinate cronologicamente
 *   - balances: saldo cumulativo in euro a fine di ogni giorno
 *   - Il colore della linea è verde se il saldo finale è positivo, rosso altrimenti.
 *   - Fill verso y=0: evidenzia visivamente i periodi in positivo o negativo.
 */
function renderDailyBalanceChart() {
  // Distruggi il chart precedente per evitare memory leak e doppi canvas
  if (currentChartDailyBalance) {
    currentChartDailyBalance.destroy();
    currentChartDailyBalance = null;
  }

  const canvas = document.getElementById("chart-daily-balance");
  if (!canvas) return;

  // Usa TUTTE le transazioni (non filtrate) per il saldo storico reale
  const { labels, balances } = Wallet.chartDailyBalance(wallet.transactions);

  // Se non ci sono dati, non disegnare nulla
  if (labels.length === 0) return;

  const ctx = canvas.getContext("2d");
  const theme = getChartThemeColors();

  // Colore adattivo: verde se il saldo finale è positivo, rosso altrimenti
  const lastBalance = balances[balances.length - 1];
  const isPositive = lastBalance >= 0;
  const lineColor = isPositive ? "#10b981" : "#ef4444";
  const fillColor = isPositive ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)";

  // Formatta le label da "YYYY-MM-DD" a "DD MMM YY" per la leggibilità sull'asse X
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const formattedLabels = labels.map(iso => {
    const [y, m, d] = iso.split("-");
    return `${d} ${monthNames[parseInt(m) - 1]} ${y.slice(2)}`;
  });

  // Aggiorna i default di Chart.js per rispettare il tema (dark/light)
  Chart.defaults.color = theme.textColor;
  Chart.defaults.borderColor = theme.gridColor;

  currentChartDailyBalance = new Chart(ctx, {
    type: "line",
    data: {
      labels: formattedLabels,
      datasets: [{
        label: "Balance",
        data: balances,
        borderColor: lineColor,
        backgroundColor: fillColor,
        // fill: "origin" riempie l'area tra la linea e y=0
        fill: "origin",
        tension: 0.2,          // leggera curva per rendere il grafico più fluido
        pointRadius: 2,        // punti piccoli ma visibili
        pointHitRadius: 10,    // area di hover più ampia per la UX
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        title: {
          display: true,
          text: "Daily Balance Over Time",
          font: { size: 16, weight: "bold" }
        },
        // La legenda è ridondante con un solo dataset
        legend: { display: false },
        tooltip: {
          callbacks: {
            // Mostra la data ISO originale + il saldo formattato
            title: (items) => {
              // Recupera la data ISO dalla label originale (prima del formato)
              return labels[items[0].dataIndex];
            },
            label: ctx => ` Balance: ${ctx.parsed.y.toFixed(2)} \u20AC`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          // Limita il numero di tick per non sovraffollare l'asse X
          ticks: { maxTicksLimit: 12, font: { size: 11 } }
        },
        y: {
          grid: { color: theme.gridColor },
          ticks: {
            // Mostra il simbolo € accanto ai valori sull'asse Y
            callback: v => `${v.toFixed(0)} \u20AC`
          }
        }
      }
    }
  });
}

function bindChartButtons() {
  // Chip per la selezione del tipo di grafico — usa sempre i dati filtrati correnti
  document.querySelectorAll("[data-chart]").forEach(btn => {
    btn.addEventListener("click", () => {
      // Aggiorna il chip attivo (solo i chip tipo-grafico, non i toggle)
      btn.closest(".chart-buttons").querySelectorAll(".chip:not(.chip-toggle)").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      currentChartTypeMain = btn.dataset.chart;
      // Usa getFilteredData(): filtri vuoti = tutte le transazioni
      createChart("chart-main", currentChartTypeMain, getFilteredData(), excludeSaldoMain);
    });
  });

  // Toggle Excl. Saldo — aggiorna il grafico con i dati filtrati correnti
  document.getElementById("toggle-saldo-main").addEventListener("click", () => {
    excludeSaldoMain = !excludeSaldoMain;
    document.getElementById("toggle-saldo-main").classList.toggle("active", excludeSaldoMain);
    createChart("chart-main", currentChartTypeMain, getFilteredData(), excludeSaldoMain);
  });
}

function getFilteredData() {
  const selectedCats = [];
  document.querySelectorAll("#filter-categories input:checked").forEach(cb => selectedCats.push(cb.value));
  const selectedAccs = [];
  document.querySelectorAll("#filter-accounts input:checked").forEach(cb => selectedAccs.push(cb.value));

  return wallet.filter({
    categories: selectedCats,
    accounts: selectedAccs,
    dateFrom: document.getElementById("filter-date-from").value || null,
    dateTo: document.getElementById("filter-date-to").value || null
  });
}

// ======================== IMPORT / EXPORT ========================

function bindImportExport() {
  document.getElementById("btn-import-csv").addEventListener("click", () => {
    const fileInput = document.getElementById("csv-import");
    const file = fileInput.files[0];
    if (!file) return showToast("Please select a CSV file", "error");

    const reader = new FileReader();
    reader.onload = (e) => {
      wallet.importCSV(e.target.result);
      populateSelects();
      renderMainPage();
      renderFilteredPage();
      renderSettingsPage();
      showToast(`Imported ${wallet.transactions.length} transactions!`);
    };
    reader.readAsText(file);
  });

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    const csv = wallet.exportCSV();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallet_export.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported!");
  });
}

// ======================== TOAST ========================

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ======================== PIVOT TABLE ========================

function renderPivotTable(data, headId, bodyId) {
  const thead = document.getElementById(headId);
  const tbody = document.getElementById(bodyId);
  thead.innerHTML = "";
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td class="empty-msg" colspan="2">No data available</td></tr>';
    return;
  }

  const relevant = data.filter(t => t.Type === 0 || t.Type === 1);

  if (relevant.length === 0) {
    tbody.innerHTML = '<tr><td class="empty-msg" colspan="2">No expenses or income to display</td></tr>';
    return;
  }

  const monthsSet = new Set();
  const categoriesSet = new Set();

  for (const t of relevant) {
    const monthKey = `${t.Y}-${String(t.M).padStart(2, "0")}`;
    monthsSet.add(monthKey);
    categoriesSet.add(t.Category);
  }

  const months = [...monthsSet].sort();
  const categories = [...categoriesSet].sort((a, b) => {
    if (a === "Entrate") return 1;
    if (b === "Entrate") return -1;
    return a.localeCompare(b);
  });

  const matrix = {};
  for (const cat of categories) {
    matrix[cat] = {};
    for (const m of months) {
      matrix[cat][m] = 0;
    }
  }

  for (const t of relevant) {
    const monthKey = `${t.Y}-${String(t.M).padStart(2, "0")}`;
    matrix[t.Category][monthKey] += t.Amount;
  }

  const colTotals = {};
  months.forEach(m => colTotals[m] = 0);

  const rowTotals = {};
  for (const cat of categories) {
    rowTotals[cat] = 0;
    for (const m of months) {
      rowTotals[cat] += matrix[cat][m];
      colTotals[m] += matrix[cat][m];
    }
  }

  const grandTotal = Object.values(rowTotals).reduce((s, v) => s + v, 0);

  let maxAbs = 0;
  for (const cat of categories) {
    for (const m of months) {
      const abs = Math.abs(matrix[cat][m]);
      if (abs > maxAbs) maxAbs = abs;
    }
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatMonth(key) {
    const [year, month] = key.split("-");
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }

  function cellColor(value) {
    if (value === 0) return "";
    const intensity = Math.min(Math.abs(value) / (maxAbs || 1), 1);
    const alpha = 0.08 + intensity * 0.47;
    if (value < 0) {
      return `background-color: rgba(239, 68, 68, ${alpha.toFixed(2)})`;
    } else {
      return `background-color: rgba(16, 185, 129, ${alpha.toFixed(2)})`;
    }
  }

  // Header
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `<th class="pivot-header-cat">Category</th>`;
  for (const m of months) {
    headerRow.innerHTML += `<th class="pivot-header-month">${formatMonth(m)}</th>`;
  }
  headerRow.innerHTML += `<th class="pivot-header-total">Total</th>`;
  thead.appendChild(headerRow);

  // Data rows
  for (const cat of categories) {
    const tr = document.createElement("tr");
    const isIncome = cat === "Entrate";

    tr.innerHTML = `<td class="pivot-cat ${isIncome ? 'pivot-cat-income' : ''}">${cat}</td>`;

    for (const m of months) {
      const val = matrix[cat][m];
      const display = val === 0 ? "—" : `${val.toFixed(2)} &euro;`;
      const colorStyle = cellColor(val);
      tr.innerHTML += `<td class="pivot-cell" style="${colorStyle}">${display}</td>`;
    }

    const rowTotal = rowTotals[cat];
    const rtStyle = cellColor(rowTotal);
    tr.innerHTML += `<td class="pivot-cell pivot-row-total" style="${rtStyle}">${rowTotal.toFixed(2)} &euro;</td>`;

    tbody.appendChild(tr);
  }

  // Total row
  const totalRow = document.createElement("tr");
  totalRow.className = "pivot-total-row";
  totalRow.innerHTML = `<td class="pivot-cat pivot-cat-total">TOTAL</td>`;

  for (const m of months) {
    const val = colTotals[m];
    const display = `${val.toFixed(2)} &euro;`;
    const colorStyle = cellColor(val);
    totalRow.innerHTML += `<td class="pivot-cell pivot-col-total" style="${colorStyle}">${display}</td>`;
  }

  totalRow.innerHTML += `<td class="pivot-cell pivot-grand-total">${grandTotal.toFixed(2)} &euro;</td>`;
  tbody.appendChild(totalRow);
}

// ======================== INVESTMENTS ========================

async function fetchCurrentPrice(ticker, isin) {
  try {
    const params = new URLSearchParams();
    if (ticker) params.set("ticker", ticker);
    if (isin) params.set("isin", isin);

    const response = await fetch(`/api/fetch-price?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return { price: data.price, currency: data.currency || "EUR", source: data.source };
  } catch (e) {
    console.warn(`Fetch price failed (ticker=${ticker}, isin=${isin}):`, e.message);
    return null;
  }
}

async function fetchPriceHistory(ticker, range = "1y") {
  if (!ticker) return null;
  try {
    const params = new URLSearchParams({ ticker, range });
    const response = await fetch(`/api/price-history?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return { timestamps: data.timestamps, prices: data.prices, currency: data.currency || "EUR" };
  } catch (e) {
    console.warn(`Fetch history failed for ${ticker}:`, e.message);
    return null;
  }
}

function renderInvestmentsPage() {
  // Populate selects
  const manualSelect = document.getElementById("inv-manual-select");
  if (manualSelect) {
    manualSelect.innerHTML = "";
    investments.forEach(inv => {
      const opt = document.createElement("option");
      opt.value = inv.id;
      opt.textContent = `${inv.name} (${inv.ticker || inv.isin || "—"})`;
      manualSelect.appendChild(opt);
    });
  }

  // Summary Cards
  let totalInvested = 0;
  let totalCurrent = 0;

  investments.forEach(inv => {
    totalInvested += inv.purchasePrice * inv.quantity;
    totalCurrent += (inv.currentPrice || inv.purchasePrice) * inv.quantity;
  });

  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? ((totalCurrent / totalInvested) - 1) * 100 : 0;

  const summaryDiv = document.getElementById("summary-investments");
  summaryDiv.innerHTML = `
    <div class="card card-inv-invested">
      <div class="card-icon"><i data-lucide="piggy-bank"></i></div>
      <span class="card-label">Total Invested</span>
      <span class="card-value">${totalInvested.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-inv-current">
      <div class="card-icon"><i data-lucide="banknote"></i></div>
      <span class="card-label">Current Value</span>
      <span class="card-value">${totalCurrent.toFixed(2)} &euro;</span>
    </div>
    <div class="card ${totalPnl >= 0 ? 'card-inv-profit' : 'card-inv-loss'}">
      <div class="card-icon"><i data-lucide="${totalPnl >= 0 ? 'trending-up' : 'trending-down'}"></i></div>
      <span class="card-label">Total P&amp;L</span>
      <span class="card-value">${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} &euro;</span>
    </div>
    <div class="card ${totalPnlPct >= 0 ? 'card-inv-profit' : 'card-inv-loss'}">
      <div class="card-icon"><i data-lucide="percent"></i></div>
      <span class="card-label">P&amp;L %</span>
      <span class="card-value">${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%</span>
    </div>
  `;

  // Portfolio Table
  const tbody = document.getElementById("investments-body");
  tbody.innerHTML = "";

  if (investments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-msg">No investments yet. Click "Add Investment" to start.</td></tr>';
    lucide.createIcons();
    return;
  }

  investments.forEach(inv => {
    const invested = inv.purchasePrice * inv.quantity;
    const currentVal = (inv.currentPrice || inv.purchasePrice) * inv.quantity;
    const pnl = currentVal - invested;
    const pnlPct = invested > 0 ? ((currentVal / invested) - 1) * 100 : 0;
    const isPositive = pnl >= 0;

    const tr = document.createElement("tr");
    tr.className = isPositive ? "row-inv-profit" : "row-inv-loss";

    tr.innerHTML = `
      <td class="inv-name-cell">
        <strong>${inv.name}</strong>
        ${inv.isin ? `<small class="inv-isin">${inv.isin}</small>` : ""}
      </td>
      <td><span class="badge">${inv.ticker || inv.isin || "—"}</span></td>
      <td><span class="type-badge-inv type-inv-${inv.type.toLowerCase()}">${inv.type}</span></td>
      <td>${inv.quantity}</td>
      <td>${inv.purchasePrice.toFixed(2)} &euro;</td>
      <td>
        ${inv.currentPrice ? inv.currentPrice.toFixed(2) + " &euro;" : "—"}
        ${inv.lastUpdated ? `<small class="last-updated">${inv.lastUpdated}</small>` : ""}
      </td>
      <td>${invested.toFixed(2)} &euro;</td>
      <td>${currentVal.toFixed(2)} &euro;</td>
      <td class="amount ${isPositive ? 'positive' : 'negative'}">
        ${isPositive ? "+" : ""}${pnl.toFixed(2)} &euro;
      </td>
      <td class="amount ${isPositive ? 'positive' : 'negative'}">
        ${isPositive ? "+" : ""}${pnlPct.toFixed(2)}%
      </td>
      <td>${inv.purchaseDate}</td>
      <td>
        <div class="inv-actions">
          <button class="btn-icon" title="Chart" data-inv-chart="${inv.id}"><i data-lucide="line-chart"></i></button>
          <button class="btn-icon" title="Refresh" data-inv-refresh="${inv.id}"><i data-lucide="refresh-cw"></i></button>
          <button class="btn-icon btn-icon-danger" title="Remove" data-inv-remove="${inv.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Portfolio Allocation Pie Chart
  renderInvestmentsPieChart();

  lucide.createIcons();

  // Bind chart buttons
  document.querySelectorAll("[data-inv-chart]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.invChart);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;
      selectedInvTicker = inv.ticker;
      showInvestmentChart(inv.ticker, selectedInvRange, inv);
    });
  });

  // Bind refresh buttons
  document.querySelectorAll("[data-inv-refresh]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.invRefresh);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      const result = await fetchCurrentPrice(inv.ticker, inv.isin);
      if (result) {
        inv.currentPrice = result.price;
        inv.lastUpdated = new Date().toISOString().split("T")[0];
        saveInvestments();
        renderInvestmentsPage();
        showToast(`${inv.name}: ${result.price.toFixed(2)} ${result.currency} (${result.source})`);
      } else {
        showToast(`Could not fetch price for ${inv.name}`, "warning");
      }
    });
  });

  // Bind remove buttons
  document.querySelectorAll("[data-inv-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.invRemove);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      investments = investments.filter(i => i.id !== id);
      saveInvestments();
      renderInvestmentsPage();
      showToast(`${inv.name} removed!`);
    });
  });
}

const PIE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e11d48", "#7c3aed", "#0ea5e9", "#d946ef", "#facc15"
];

function renderInvestmentsPieChart() {
  const container = document.getElementById("inv-pie-container");
  if (!container) return;

  if (investments.length === 0) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  if (currentChartInvPie) currentChartInvPie.destroy();

  const labels = investments.map(inv => inv.name);
  const values = investments.map(inv => (inv.currentPrice || inv.purchasePrice) * inv.quantity);
  const colors = investments.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]);
  const total = values.reduce((a, b) => a + b, 0);

  const ctx = document.getElementById("chart-inv-pie").getContext("2d");
  currentChartInvPie = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: getChartThemeColors().borderColor
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: "Portfolio Allocation", font: { size: 16, weight: "bold" } },
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${val.toFixed(2)} \u20AC (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

async function showInvestmentChart(ticker, range, inv) {
  const container = document.getElementById("inv-chart-container");
  const titleEl = document.getElementById("inv-chart-title");
  const pnlCard = document.getElementById("inv-pnl-card");

  container.classList.remove("hidden");
  titleEl.textContent = `${inv ? inv.name : ticker} — Price History`;

  if (inv) {
    const pnl = ((inv.currentPrice || inv.purchasePrice) - inv.purchasePrice) * inv.quantity;
    const pnlPct = inv.purchasePrice > 0
      ? (((inv.currentPrice || inv.purchasePrice) / inv.purchasePrice) - 1) * 100 : 0;
    const isPos = pnl >= 0;

    pnlCard.innerHTML = `
      <div class="pnl-stat">
        <span class="pnl-label">Invested</span>
        <span class="pnl-value">${(inv.purchasePrice * inv.quantity).toFixed(2)} &euro;</span>
      </div>
      <div class="pnl-stat">
        <span class="pnl-label">Current Value</span>
        <span class="pnl-value">${((inv.currentPrice || inv.purchasePrice) * inv.quantity).toFixed(2)} &euro;</span>
      </div>
      <div class="pnl-stat ${isPos ? 'pnl-positive' : 'pnl-negative'}">
        <span class="pnl-label">P&amp;L</span>
        <span class="pnl-value">${isPos ? "+" : ""}${pnl.toFixed(2)} &euro; (${isPos ? "+" : ""}${pnlPct.toFixed(2)}%)</span>
      </div>
    `;
  }

  const historyData = await fetchPriceHistory(ticker, range);

  if (currentChartInvestment) currentChartInvestment.destroy();

  const canvas = document.getElementById("chart-investment");
  const ctx = canvas.getContext("2d");

  if (!historyData || historyData.prices.length === 0) {
    pnlCard.innerHTML += '<p class="inv-fetch-error">Could not load price history. The CORS proxy might be temporarily unavailable.</p>';
    return;
  }

  const labels = historyData.timestamps.map(ts => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  });

  const firstPrice = historyData.prices[0];
  const lastPrice = historyData.prices[historyData.prices.length - 1];
  const isUp = lastPrice >= firstPrice;
  const lineColor = isUp ? "#10b981" : "#ef4444";
  const fillColor = isUp ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";

  const purchaseLine = inv ? inv.purchasePrice : null;

  currentChartInvestment = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${ticker} (${historyData.currency})`,
          data: historyData.prices,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
          borderWidth: 2.5
        },
        ...(purchaseLine ? [{
          label: "Purchase Price",
          data: new Array(labels.length).fill(purchaseLine),
          borderColor: "rgba(108, 92, 231, 0.5)",
          borderDash: [8, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }] : [])
      ]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        title: { display: false },
        legend: { display: true, position: "top", labels: { usePointStyle: true, pointStyle: "line" } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${historyData.currency}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 11 } } },
        y: { grid: { color: theme.gridColor }, ticks: { callback: (val) => val.toFixed(2) } }
      }
    }
  });
}

function bindInvestmentActions() {
  // Add Investment
  document.getElementById("btn-add-investment").addEventListener("click", async () => {
    const name = document.getElementById("inv-name").value.trim();
    const ticker = document.getElementById("inv-ticker").value.trim().toUpperCase();
    const isin = document.getElementById("inv-isin").value.trim().toUpperCase();
    const type = document.getElementById("inv-type").value;
    const purchasePrice = parseFloat(document.getElementById("inv-price").value);
    const quantity = parseFloat(document.getElementById("inv-quantity").value);
    const purchaseDate = document.getElementById("inv-date").value;

    if (!name) return showToast("Please enter a name", "error");
    if (!ticker && !isin) return showToast("Please enter a ticker or ISIN", "error");
    if (!purchasePrice || purchasePrice <= 0) return showToast("Please enter a valid price", "error");
    if (!quantity || quantity <= 0) return showToast("Please enter a valid quantity", "error");

    const id = investments.length > 0 ? Math.max(...investments.map(i => i.id)) + 1 : 0;

    const inv = {
      id, name, ticker, isin, type,
      purchasePrice, currentPrice: null,
      quantity, purchaseDate,
      lastUpdated: null
    };

    closeModal("modal-add-inv");
    showToast(`Fetching price for ${ticker || isin}...`, "warning");

    const result = await fetchCurrentPrice(ticker, isin);
    if (result) {
      inv.currentPrice = result.price;
      inv.lastUpdated = new Date().toISOString().split("T")[0];
      showToast(`${name} added! Price: ${result.price.toFixed(2)} ${result.currency} (${result.source})`);
    } else {
      inv.currentPrice = purchasePrice;
      showToast(`${name} added! Could not fetch price.`, "warning");
    }

    investments.push(inv);
    saveInvestments();
    renderInvestmentsPage();

    // Reset form
    document.getElementById("inv-name").value = "";
    document.getElementById("inv-ticker").value = "";
    document.getElementById("inv-isin").value = "";
    document.getElementById("inv-price").value = "0.00";
    document.getElementById("inv-quantity").value = "1";
  });

  // Manual price update
  document.getElementById("btn-manual-price").addEventListener("click", () => {
    const id = parseInt(document.getElementById("inv-manual-select").value);
    const price = parseFloat(document.getElementById("inv-manual-price").value);

    if (isNaN(price) || price <= 0) return showToast("Please enter a valid price", "error");

    const inv = investments.find(i => i.id === id);
    if (!inv) return showToast("Investment not found", "error");

    inv.currentPrice = price;
    inv.lastUpdated = new Date().toISOString().split("T")[0];
    saveInvestments();
    renderInvestmentsPage();
    closeModal("modal-manual-price");
    showToast(`${inv.name} updated to ${price.toFixed(2)} EUR`);
  });

  // Refresh all
  document.getElementById("btn-refresh-all").addEventListener("click", async () => {
    if (investments.length === 0) return showToast("No investments to refresh", "warning");

    showToast("Refreshing all prices...", "warning");
    let updated = 0;
    let failed = 0;

    const promises = investments.map(async (inv) => {
      const result = await fetchCurrentPrice(inv.ticker, inv.isin);
      if (result) {
        inv.currentPrice = result.price;
        inv.lastUpdated = new Date().toISOString().split("T")[0];
        updated++;
      } else {
        failed++;
      }
    });

    await Promise.all(promises);
    saveInvestments();
    renderInvestmentsPage();

    if (failed === 0) {
      showToast(`All ${updated} prices refreshed!`);
    } else {
      showToast(`${updated} updated, ${failed} failed`, "warning");
    }
  });

  // Range selector
  document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      selectedInvRange = btn.dataset.range;

      if (selectedInvTicker) {
        const inv = investments.find(i => i.ticker === selectedInvTicker);
        showInvestmentChart(selectedInvTicker, selectedInvRange, inv);
      }
    });
  });
}
