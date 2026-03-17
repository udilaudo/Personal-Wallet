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
let currentChartNetworthPie = null; // doughnut Net Worth Breakdown (dashboard)
let currentChartHeroTrend  = null; // mini bar chart trend 6 mesi (hero section)
// Mappa canvasId → istanza Chart per i Daily Balance (dashboard + analytics)
const dailyBalanceChartInstances = {};

let currentChartTypeMain = "pie-categories";
let currentChartTypeFiltered = "pie-categories";
let excludeSaldoMain = true; // attivo di default: esclude la categoria "Saldo" dai grafici
let excludeSaldoFiltered = false;

let investments = JSON.parse(localStorage.getItem("wallet_investments") || "[]");
let selectedInvTicker = null;
let selectedInvRange = "1mo";

// Modalità visualizzazione portfolio: "table" (default) o "cards".
// Persiste in localStorage così l'utente ritrova la sua preferenza.
let invViewMode = localStorage.getItem("inv-view-mode") || "table";

// Modalità pie chart: false = ogni asset è una slice separata (default),
// true = gli asset vengono raggruppati per tipo (ETF, Crypto, Bond, ecc.)
let invPieGrouped = false;

// ======================== CONTI DEPOSITO — STATO GLOBALE ========================
// Array di conti deposito: ogni elemento ha id, nome, banca, tasso, frequenza,
// date di apertura/scadenza, conto wallet collegato e lista movimenti interni.
let depositAccounts = JSON.parse(localStorage.getItem("wallet_deposits") || "[]");

function saveInvestments() {
  localStorage.setItem("wallet_investments", JSON.stringify(investments));
}

// Salva i conti deposito su localStorage (poi il backend override aggiunge il sync)
function saveDepositAccounts() {
  localStorage.setItem("wallet_deposits", JSON.stringify(depositAccounts));
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
        // Includiamo anche i conti deposito nel backup su backend
        depositAccounts: depositAccounts,
        // Budget mensili per categoria e budget totale: salvati nel config.json
        budgets: wallet.budgets || {},
        totalBudget: wallet.totalBudget || 0,
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
    // Ripristina i budget mensili e il budget totale dal backend se presenti
    if (data.budgets) wallet.budgets = data.budgets;
    if (data.totalBudget !== undefined) wallet.totalBudget = data.totalBudget;
    wallet.update();
    wallet.paySubscriptions();

    if (data.investments && data.investments.length > 0) {
      investments = data.investments;
    }

    // Ripristina i conti deposito dal backend se presenti
    if (data.depositAccounts && data.depositAccounts.length > 0) {
      depositAccounts = data.depositAccounts;
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

// Override saveDepositAccounts to also sync to backend
const _originalSaveDepositAccounts = saveDepositAccounts;
saveDepositAccounts = function () {
  _originalSaveDepositAccounts();
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
  // Date iniziali per i modali dei conti deposito
  document.getElementById("dep-start").value = today;
  document.getElementById("dep-transfer-date").value = today;

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
  bindBudgetActions();
  // "View all" naviga ad Analytics e scrolla direttamente alla tabella Transactions
  const viewAllBtn = document.getElementById("btn-view-all-tx");
  if (viewAllBtn) viewAllBtn.addEventListener("click", () => {
    navigateTo("analytics");
    // setTimeout lascia il tempo a renderMainPage() di completare il render
    // prima di scrollare all'elemento target
    setTimeout(() => {
      const tableCard = document.getElementById("transactions-table");
      if (tableCard) tableCard.closest(".table-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  });
  bindInvestmentActions();
  bindDepositAccountActions(); // Binding per la sezione Conti Deposito
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

  // Mostra il FAB container sulla Dashboard e su Analytics
  const fabContainer = document.getElementById("fab-container");
  if (fabContainer) {
    fabContainer.classList.toggle("hidden", page !== "main" && page !== "analytics");
    // Chiudi il menu speed-dial se si cambia pagina
    closeFabMenu();
  }

  // Se si naviga su Analytics, ri-renderizza i dati (grafici, tabella, filtri)
  if (page === "analytics") {
    renderMainPage();
  }

  // Se si naviga su Investments, ri-renderizza il pie chart Portfolio Allocation.
  // Il chart viene creato al startup quando la pagina è ancora hidden, quindi
  // Chart.js non riesce a misurare il canvas e il render è vuoto.
  // Chiamarlo qui garantisce che il canvas sia visibile e abbia dimensioni reali.
  if (page === "investments") {
    renderInvestmentsPieChart();
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

/**
 * closeFabMenu — chiude il menu speed-dial del FAB senza aprire modal.
 */
function closeFabMenu() {
  const menu = document.getElementById("fab-menu");
  const main = document.getElementById("fab-main");
  if (menu) menu.classList.remove("fab-menu-open");
  if (main) main.classList.remove("fab-open");
}

/**
 * bindFAB — gestisce il FAB speed-dial:
 *   click fab-main  → apre/chiude il mini-menu
 *   click fab-add-tx  → apre modal Add Transaction
 *   click fab-transfer → apre modal Transfer
 *   click fuori dal container → chiude il menu
 */
function bindFAB() {
  const fabMain    = document.getElementById("fab-main");
  const fabMenu    = document.getElementById("fab-menu");
  const fabAddTx   = document.getElementById("fab-add-tx");
  const fabTransfer = document.getElementById("fab-transfer");

  fabMain.addEventListener("click", () => {
    const isOpen = fabMenu.classList.contains("fab-menu-open");
    fabMenu.classList.toggle("fab-menu-open", !isOpen);
    fabMain.classList.toggle("fab-open", !isOpen);
  });

  fabAddTx.addEventListener("click", () => {
    closeFabMenu();
    openModal("modal-add");
  });

  fabTransfer.addEventListener("click", () => {
    closeFabMenu();
    openModal("modal-transfer");
  });

  // Click fuori dal fab-container chiude il menu
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#fab-container")) closeFabMenu();
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

  // Pulisci anche la barra di ricerca testuale
  const searchInput = document.getElementById("tx-search");
  if (searchInput) searchInput.value = "";

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
  // Considera attivo anche il campo di ricerca testuale
  const hasSearch = !!(document.getElementById("tx-search")?.value.trim());
  return hasCats || hasAccs || hasDateFrom || hasDateTo || hasSearch;
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
  // Pulsanti hero section (dashboard principale, fuori da Analytics)
  document.getElementById("btn-open-add-hero").addEventListener("click", () => openModal("modal-add"));
  document.getElementById("btn-open-transfer-hero").addEventListener("click", () => openModal("modal-transfer"));
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

  // Budget category select (nella pagina Settings)
  const budgetCatSel = document.getElementById("budget-category");
  if (budgetCatSel) {
    budgetCatSel.innerHTML = "";
    // Mostra solo le categorie di spesa (escludi "Entrate" e simili con emoji positivi)
    wallet.categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      budgetCatSel.appendChild(opt);
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

// ======================== HERO SECTION ========================

/**
 * renderHeroSection — mostra il saldo totale e le statistiche del mese corrente
 * rispetto al mese precedente. Usa sempre i dati non filtrati.
 */
function renderHeroSection() {
  const heroBalance = document.getElementById("hero-balance");
  const heroStats   = document.getElementById("hero-month-stats");
  if (!heroBalance || !heroStats) return;

  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  // Calcola anno/mese precedente gestendo il caso gennaio → dicembre anno prima
  const prevDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear  = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const thisTx = wallet.transactions.filter(t => t.Y === thisYear  && t.M === thisMonth);
  const prevTx = wallet.transactions.filter(t => t.Y === prevYear  && t.M === prevMonth);

  const thisIncome  = thisTx.filter(t => t.Type === 1).reduce((s, t) => s + t.Amount, 0);
  const thisExpense = thisTx.filter(t => t.Type === 0).reduce((s, t) => s + Math.abs(t.Amount), 0);
  const prevIncome  = prevTx.filter(t => t.Type === 1).reduce((s, t) => s + t.Amount, 0);
  const prevExpense = prevTx.filter(t => t.Type === 0).reduce((s, t) => s + Math.abs(t.Amount), 0);

  // Totale netto del mese: income − expenses (positivo = mese in attivo)
  const thisTotal = thisIncome - thisExpense;
  const prevTotal = prevIncome - prevExpense;

  // Saldo totale (sempre aggiornato da wallet.update())
  heroBalance.textContent = wallet.saldo.toFixed(2) + " €";
  heroBalance.className   = "hero-balance " + (wallet.saldo >= 0 ? "positive" : "negative");

  // Badge variazione percentuale rispetto al mese scorso
  function varBadge(current, previous, higherIsBetter) {
    if (previous <= 0) return "";
    const pct = ((current - previous) / previous) * 100;
    const arrow = pct >= 0 ? "↑" : "↓";
    // Per le entrate: salire è buono. Per le spese: scendere è buono.
    const isGood = higherIsBetter ? pct >= 0 : pct <= 0;
    const cls    = isGood ? "hero-var-good" : "hero-var-bad";
    return `<span class="${cls}">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
  }

  const monthName = now.toLocaleString("en-EN", { month: "long" });

  const totalSign  = thisTotal >= 0 ? "+" : "−";
  const totalClass = thisTotal >= 0 ? "positive" : "negative";

  // Differenza netto vs mese precedente in €: sempre leggibile indipendentemente dal segno
  function netDiffBadge(current, previous) {
    if (previous === 0 && current === 0) return "";
    const diff = current - previous;
    if (diff === 0) return "";
    const arrow = diff > 0 ? "↑" : "↓";
    // Migliorare = netto più alto (più positivo o meno negativo)
    const cls   = diff > 0 ? "hero-var-good" : "hero-var-bad";
    const sign  = diff > 0 ? "+" : "−";
    return `<span class="${cls}">${arrow} ${sign}${Math.abs(diff).toFixed(2)} €</span>`;
  }

  heroStats.innerHTML = `
    <div class="hero-stat">
      <span class="hero-stat-label">Income (${monthName})</span>
      <span class="hero-stat-value positive">+${thisIncome.toFixed(2)} €</span>
      ${varBadge(thisIncome, prevIncome, true)}
    </div>
    <div class="hero-stat hero-stat-divider"></div>
    <div class="hero-stat">
      <span class="hero-stat-label">Expenses (${monthName})</span>
      <span class="hero-stat-value negative">−${thisExpense.toFixed(2)} €</span>
      ${varBadge(thisExpense, prevExpense, false)}
    </div>
    <div class="hero-stat hero-stat-divider"></div>
    <div class="hero-stat">
      <span class="hero-stat-label">Net (${monthName})</span>
      <span class="hero-stat-value ${totalClass}">${totalSign}${Math.abs(thisTotal).toFixed(2)} €</span>
      ${netDiffBadge(thisTotal, prevTotal)}
    </div>
  `;

  // ---- Mini bar chart: trend entrate/uscite ultimi 6 mesi ----
  renderHeroTrendChart();
}

/**
 * renderHeroTrendChart — costruisce (o ricrea) il mini grafico a barre
 * nella hero section con entrate e uscite degli ultimi 6 mesi.
 * Distrugge sempre l'istanza precedente per evitare duplicati Chart.js.
 */
function renderHeroTrendChart() {
  const canvas = document.getElementById("chart-hero-trend");
  if (!canvas) return;

  // Distrugge il chart precedente se esiste (evita "Canvas already in use")
  if (currentChartHeroTrend) {
    currentChartHeroTrend.destroy();
    currentChartHeroTrend = null;
  }

  // Determina colori in base al tema attivo (light / dark)
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor    = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const tickColor    = isDark ? "#9b97b0" : "#9ca3af";
  const incomeColor  = isDark ? "rgba(52,211,153,0.85)"  : "rgba(16,185,129,0.85)";
  const expenseColor = isDark ? "rgba(248,113,113,0.85)" : "rgba(239,68,68,0.85)";

  // Costruisce array degli ultimi 6 mesi (dal più vecchio al più recente)
  const labels   = [];
  const incomes  = [];
  const expenses = [];

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    // Calcola anno/mese per ogni slot andando indietro di i mesi
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;

    // Etichetta abbreviata "Mar 25"
    labels.push(d.toLocaleString("en-EN", { month: "short" }) + " " + String(y).slice(2));

    // Somma entrate e uscite del mese (escluse Type 2/3 = saldi iniziali)
    const monthTx = wallet.transactions.filter(t => t.Y === y && t.M === m && t.Type !== 2 && t.Type !== 3);
    incomes.push(monthTx.filter(t => t.Type === 1).reduce((s, t) => s + t.Amount, 0));
    expenses.push(monthTx.filter(t => t.Type === 0).reduce((s, t) => s + Math.abs(t.Amount), 0));
  }

  const ctx = canvas.getContext("2d");
  currentChartHeroTrend = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Income",
          data: incomes,
          backgroundColor: incomeColor,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: "Expenses",
          data: expenses,
          backgroundColor: expenseColor,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: tickColor,
            font: { size: 10, family: "Inter, sans-serif" },
            boxWidth: 10,
            boxHeight: 10,
            padding: 8,
          },
        },
        tooltip: {
          callbacks: {
            // Aggiunge il simbolo € ai valori nel tooltip
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} €`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 10 } },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 10 },
            // Formatta i valori come "1.2k" per risparmiare spazio
            callback: v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v,
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ======================== RECENT TRANSACTIONS ========================

/**
 * renderRecentTransactions — tabella transazioni del mese corrente nella dashboard.
 * Stessa struttura visiva di Analytics (colonne complete + edit/delete).
 * Supporta ricerca testuale via #dash-tx-search (debounce 150ms).
 * Esclude saldi iniziali (Type 2 e 3).
 */
function renderRecentTransactions() {
  const tbody = document.getElementById("recent-tx-body");
  if (!tbody) return;

  // Data corrente per filtrare per mese
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  // Aggiorna titolo con nome mese corrente
  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
  const titleEl = document.getElementById("recent-tx-title");
  if (titleEl) titleEl.textContent = `${monthNames[curM - 1]} ${curY}`;

  // Tutte le transazioni del mese corrente (escluse Type 2/3)
  const monthTx = wallet.transactions.filter(
    t => t.Type !== 2 && t.Type !== 3 && t.Y === curY && t.M === curM
  );

  // Funzione di render rows (usata anche dalla ricerca)
  function renderRows(data) {
    tbody.innerHTML = "";

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No transactions for this month.</td></tr>';
      return;
    }

    const typeLabels = { 0: "Expense", 1: "Income", 2: "Balance Out", 3: "Balance In", 4: "Transfer" };

    for (const t of data) {
      const tr = document.createElement("tr");
      if (t.Type === 1 || t.Type === 3) tr.className = "row-income";
      else if (t.Type === 4) tr.className = "row-transfer";

      const dateStr = `${String(t.D).padStart(2,"0")}/${String(t.M).padStart(2,"0")}/${t.Y}`;
      tr.innerHTML = `
        <td class="amount ${t.Amount >= 0 ? "positive" : "negative"}">${t.Amount.toFixed(2)} &euro;</td>
        <td>${t.Category}</td>
        <td>${t.Description || "—"}</td>
        <td>${dateStr}</td>
        <td><span class="badge">${t.Conto || "—"}</span></td>
        <td><span class="type-badge type-${t.Type}">${typeLabels[t.Type] || t.Type}</span></td>
        <td>
          <div class="row-actions">
            ${t.Type !== 4 ? `<button class="btn-icon" title="Edit" data-dash-edit-id="${t.ID}"><i data-lucide="pencil"></i></button>` : ""}
            <button class="btn-icon btn-icon-danger" title="Delete" data-dash-delete-id="${t.ID}"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }

    lucide.createIcons();

    // Bind edit
    tbody.querySelectorAll("[data-dash-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const t = wallet.transactions.find(t => t.ID === parseInt(btn.dataset.dashEditId));
        if (!t) return;
        document.getElementById("edit-id").value = t.ID;
        document.getElementById("edit-type").value = t.Type === 1 ? "1" : "0";
        document.getElementById("edit-amount").value = Math.abs(t.Amount).toFixed(2);
        document.getElementById("edit-category").value = t.Category;
        document.getElementById("edit-description").value = t.Description;
        document.getElementById("edit-account").value = t.Conto;
        document.getElementById("edit-date").value = `${t.Y}-${String(t.M).padStart(2,"0")}-${String(t.D).padStart(2,"0")}`;
        openModal("modal-edit");
      });
    });

    // Bind delete
    tbody.querySelectorAll("[data-dash-delete-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.dashDeleteId);
        const t = wallet.transactions.find(t => t.ID === id);
        document.getElementById("delete-id").value = id;
        // Mostra descrizione nel modal di conferma se disponibile
        const descEl = document.getElementById("delete-description");
        if (descEl) descEl.textContent = t ? (t.Description || t.Category) : id;
        openModal("modal-confirm-delete");
      });
    });
  }

  // Prima render senza filtro ricerca
  renderRows(monthTx);

  // Ricerca testuale con debounce 150ms
  const searchInput = document.getElementById("dash-tx-search");
  if (searchInput) {
    // Svuota ricerca ad ogni re-render (cambio mese, salvataggio, ecc.)
    searchInput.value = "";

    // Rimuove il vecchio listener (rimpiazza il nodo per sicurezza)
    const fresh = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(fresh, searchInput);

    let debounceTimer;
    fresh.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = fresh.value.trim().toLowerCase();
        const filtered = q
          ? monthTx.filter(t =>
              (t.Description || "").toLowerCase().includes(q) ||
              t.Category.toLowerCase().includes(q)
            )
          : monthTx;
        renderRows(filtered);
      }, 150);
    });
  }
}

// ======================== ANALYTICS PAGE ========================
// La sezione Analytics è ora una pagina di navigazione dedicata (#page-analytics).
// Il binding del pulsante "View all" avviene direttamente in DOMContentLoaded
// tramite: viewAllBtn.addEventListener("click", () => navigateTo("analytics"))
// navigateTo("analytics") chiama renderMainPage() per aggiornare dati e grafici.

// ======================== RENDER MAIN PAGE ========================

/**
 * renderMainPage — unica funzione di rendering per la Dashboard.
 * Usa getFilteredData() per ottenere i dati: se nessun filtro è attivo
 * restituisce tutte le transazioni (= totale), altrimenti le filtra.
 * In questo modo "nessun filtro" è semplicemente un filtro vuoto.
 */
function renderMainPage() {
  wallet.sortAndReindex();

  // --- Hero section: saldo totale + stats mese corrente (dati non filtrati) ---
  renderHeroSection();

  // --- Recent transactions: ultime 7 senza filtri ---
  renderRecentTransactions();

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

  // Aggiorna il badge con il numero di transazioni mostrate
  const txBadge = document.getElementById("tx-count-badge");
  if (txBadge) txBadge.textContent = data.length;

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

  // Calcolo Net Worth: saldo wallet + valore investimenti a prezzi correnti + saldo conti deposito
  const investmentsValue = investments.reduce((sum, inv) => sum + (inv.currentPrice || 0) * inv.quantity, 0);
  const depositsValue    = depositAccounts.reduce((sum, dep) => sum + calcDepositBalance(dep), 0);
  const netWorth         = wallet.saldo + investmentsValue + depositsValue;

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
    <div class="card card-networth">
      <div class="card-icon"><i data-lucide="landmark"></i></div>
      <span class="card-label">Net Worth</span>
      <span class="card-value">${netWorth.toFixed(2)} &euro;</span>
      <span class="card-sub">
        wallet ${wallet.saldo.toFixed(0)}&euro;
        &nbsp;·&nbsp; inv ${investmentsValue.toFixed(0)}&euro;
        &nbsp;·&nbsp; dep ${depositsValue.toFixed(0)}&euro;
      </span>
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

  // --- Daily Balance Chart: Analytics page (usa tutte le transazioni, non filtrate) ---
  renderDailyBalanceChart("chart-daily-balance");

  // --- Net Worth Breakdown Pie Chart (dashboard, prima del Daily Balance) ---
  renderNetworthPieChart();

  // --- Daily Balance Chart: Dashboard (stesso grafico, canvas separato) ---
  renderDailyBalanceChart("chart-daily-balance-dash");

  // --- Account Overview list in Analytics (saldi affiancati al pie chart) ---
  renderAccountsOverview();

  // --- Budget Overview (usa il mese corrente, non i dati filtrati) ---
  renderBudgetSection();

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

    // Snapshot delle transazioni da eliminare, necessario per il ripristino con Undo.
    // Per un giroconto salviamo l'intera coppia Type 4 (stessa descrizione/data).
    let snapshot;
    if (isTransfer) {
      snapshot = wallet.transactions.filter(tr =>
        tr.ID === id ||
        (tr.Type === 4 && tr.Description === t.Description &&
         tr.Y === t.Y && tr.M === t.M && tr.D === t.D)
      ).map(tr => ({ ...tr })); // deep copy
    } else {
      snapshot = t ? [{ ...t }] : [];
    }

    const success = isTransfer ? wallet.deleteTransferGroup(id) : wallet.delete(id);
    if (success) {
      renderMainPage();
      closeModal("modal-confirm-delete");

      // Toast con Undo: se cliccato entro 5s, reinserisce le transazioni salvate
      showToastWithUndo(
        isTransfer ? "Transfer deleted!" : "Transaction deleted!",
        () => {
          // Reinserisce le transazioni snapshot nell'array e ricalcola
          snapshot.forEach(tr => wallet.transactions.push(tr));
          wallet.sortAndReindex();
          wallet.update();
          wallet.save();
          renderMainPage();
        }
      );
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

  // --- Ricerca testuale: aggiorna la tabella in tempo reale (debounce 150ms) ---
  const txSearch = document.getElementById("tx-search");
  if (txSearch) {
    let searchTimeout;
    txSearch.addEventListener("input", () => {
      // Piccolo debounce per non ri-renderizzare ad ogni tasto su testi lunghi
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        updateFilterBadge();
        renderMainPage();
      }, 150);
    });
  }
}

// ======================== BUDGET ========================

/**
/**
 * calcNetSpentCurrentMonth — calcola la spesa netta per categoria nel mese corrente.
 *
 * Logica:
 *   1. Considera solo le categorie che hanno almeno una spesa (Type 0) quel mese.
 *   2. Per quelle categorie, sottrae le entrate (Type 1) della stessa categoria
 *      nello stesso mese (es. rimborsi, restituzioni).
 *   3. Esclude la categoria Investimenti (spese di investimento non sono "spese correnti").
 *   4. Il netto non può scendere sotto 0 (se ti rimborsano più di quanto hai speso,
 *      la spesa netta è 0, non negativa).
 *
 * @returns {Object} mappa { "categoria": spesaNetta } con tutti i valori >= 0
 */
function calcNetSpentCurrentMonth() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Identifica il nome della categoria investimenti (cerca "investimenti" case-insensitive)
  // così funziona sia con emoji che senza
  const investCat = wallet.categories.find(c => c.toLowerCase().includes("investimenti")) || "";

  // Tutte le transazioni del mese corrente (escludi giroconti Type 4)
  const monthTx = wallet.transactions.filter(t =>
    t.Y === currentYear && t.M === currentMonth && t.Type !== 4
  );

  // Step 1: trova le categorie con almeno una spesa (Type 0), esclusa la categoria Investimenti
  const catsWithExpenses = new Set(
    monthTx
      .filter(t => t.Type === 0 && t.Category !== investCat)
      .map(t => t.Category)
  );

  // Step 2: per ogni categoria con spese, calcola netto = spese - rimborsi (Type 1)
  const netByCategory = {};
  for (const cat of catsWithExpenses) {
    const expenses = monthTx
      .filter(t => t.Type === 0 && t.Category === cat)
      .reduce((sum, t) => sum + Math.abs(t.Amount), 0);

    // Entrate della stessa categoria nello stesso mese (rimborsi/restituzioni)
    const refunds = monthTx
      .filter(t => t.Type === 1 && t.Category === cat)
      .reduce((sum, t) => sum + t.Amount, 0);

    // La spesa netta non può essere negativa
    netByCategory[cat] = Math.max(expenses - refunds, 0);
  }

  return netByCategory;
}

/**
 * budgetBarColor — restituisce un colore HSL sfumato in base alla percentuale di budget usata.
 * La tinta scorre continuamente da verde (0%) → giallo (50%) → rosso (100%+)
 * usando l'interpolazione lineare della componente Hue in HSL.
 *   hue 120 = verde, hue 60 = giallo, hue 0 = rosso
 *
 * @param {number} pct - percentuale 0–100 (può superare 100 se over budget)
 * @returns {string} colore CSS hsl(...)
 */
function budgetBarColor(pct) {
  // Clamp a 100 per il calcolo del colore (oltre il 100% resta rosso pieno)
  const clamped = Math.min(pct, 100);
  const hue = Math.round(120 * (1 - clamped / 100)); // 120 → 0
  return `hsl(${hue}, 70%, 42%)`;
}

/**
 * renderBudgetSection — renderizza le barre di avanzamento budget nella Dashboard.
 * Usa sempre il mese corrente (non i filtri attivi) per mostrare lo stato reale.
 * Se nessun budget è impostato, la sezione rimane nascosta.
 */
function renderBudgetSection() {
  const section = document.getElementById("budget-overview-section");
  const barsDiv = document.getElementById("budget-bars");
  const monthLabel = document.getElementById("budget-month-label");
  if (!section || !barsDiv) return;

  const budgets = wallet.budgets || {};
  const budgetEntries = Object.entries(budgets).filter(([, limit]) => limit > 0);
  const totalBudget = wallet.totalBudget || 0;

  // Nasconde la sezione se non ci sono né budget per categoria né budget totale
  if (budgetEntries.length === 0 && totalBudget <= 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  // Etichetta mese corrente in italiano
  const now = new Date();
  if (monthLabel) {
    monthLabel.textContent = now.toLocaleString("it-IT", { month: "long", year: "numeric" });
  }

  barsDiv.innerHTML = "";

  // Calcola le spese nette per categoria (con logica rimborsi, senza Investimenti)
  const netByCategory = calcNetSpentCurrentMonth();

  // ——— Barra TOTALE (se impostata): mostrata per prima, più grande ———
  if (totalBudget > 0) {
    // Totale = somma di tutte le spese nette per le categorie con spese quel mese
    const totalSpent = Object.values(netByCategory).reduce((sum, v) => sum + v, 0);

    const totalPct = Math.min((totalSpent / totalBudget) * 100, 100);
    const totalIsOver = totalSpent > totalBudget;

    const totalBarColor = budgetBarColor(totalPct);

    const totalItem = document.createElement("div");
    totalItem.className = "budget-item budget-item-total";
    totalItem.innerHTML = `
      <div class="budget-item-header">
        <span class="budget-cat-name budget-total-label">Total spending</span>
        <span class="budget-amounts ${totalIsOver ? "budget-over" : ""}">
          ${totalSpent.toFixed(2)} / ${totalBudget.toFixed(2)} &euro;
          ${totalIsOver
            ? '<span class="budget-over-badge">Over!</span>'
            : `(${(totalBudget - totalSpent).toFixed(2)} € left)`}
        </span>
      </div>
      <div class="budget-bar-track budget-bar-track-total">
        <div class="budget-bar-fill" style="width:${totalPct.toFixed(1)}%; background:${totalBarColor}"></div>
      </div>
    `;
    barsDiv.appendChild(totalItem);

    // ——— Tooltip breakdown categorie al hover sulla barra totale ———
    // Mostra una finestra flottante con le spese nette divise per categoria
    const tooltip = document.getElementById("budget-breakdown-tooltip");
    const barTrack = totalItem.querySelector(".budget-bar-track-total");

    if (tooltip && barTrack && Object.keys(netByCategory).length > 0) {
      // Costruisce il contenuto HTML del tooltip (lista categorie con spesa e %)
      function buildBreakdownHTML() {
        const sorted = Object.entries(netByCategory)
          .filter(([, v]) => v > 0)
          .sort(([, a], [, b]) => b - a);

        const rows = sorted.map(([cat, spent]) => {
          const pct = totalSpent > 0 ? ((spent / totalSpent) * 100).toFixed(1) : "0.0";
          return `<div class="bbt-row">
            <span class="bbt-cat">${cat}</span>
            <span class="bbt-pct">${pct}%</span>
            <span class="bbt-amount">${spent.toFixed(2)} €</span>
          </div>`;
        }).join("");

        return `
          <div class="bbt-header">Spending by category</div>
          ${rows}
          <div class="bbt-total">
            <span>Total spent</span>
            <span>${totalSpent.toFixed(2)} € / ${totalBudget.toFixed(2)} €</span>
          </div>`;
      }

      barTrack.addEventListener("mouseenter", () => {
        tooltip.innerHTML = buildBreakdownHTML();
        tooltip.classList.remove("hidden");
      });

      barTrack.addEventListener("mousemove", (e) => {
        // Posiziona il tooltip vicino al cursore con offset per non coprirlo
        const x = e.clientX + 14;
        const y = e.clientY - 10;
        // Evita che esca dal bordo destro dello schermo
        const maxX = window.innerWidth - tooltip.offsetWidth - 16;
        tooltip.style.left = `${Math.min(x, maxX)}px`;
        tooltip.style.top = `${y}px`;
      });

      barTrack.addEventListener("mouseleave", () => {
        tooltip.classList.add("hidden");
      });
    }

    // Divisore visivo se ci sono anche budget per categoria
    if (budgetEntries.length > 0) {
      const sep = document.createElement("hr");
      sep.className = "budget-separator";
      barsDiv.appendChild(sep);
    }
  }

  // ——— Barre per categoria ———
  budgetEntries.forEach(([cat, limit]) => {
    // Usa la spesa netta calcolata dall'helper (già depurata da rimborsi)
    const spent = netByCategory[cat] || 0;

    const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    const isOver = spent > limit;

    const barColor = budgetBarColor(pct);

    const item = document.createElement("div");
    item.className = "budget-item";
    item.innerHTML = `
      <div class="budget-item-header">
        <span class="budget-cat-name">${cat}</span>
        <span class="budget-amounts ${isOver ? "budget-over" : ""}">
          ${spent.toFixed(2)} / ${limit.toFixed(2)} &euro;
          ${isOver ? '<span class="budget-over-badge">Over!</span>' : `(${(100 - pct).toFixed(0)}% left)`}
        </span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill" style="width:${pct.toFixed(1)}%; background:${barColor}"></div>
      </div>
    `;
    barsDiv.appendChild(item);
  });
}

/**
 * renderSettingsBudgets — renderizza la lista dei budget impostati nella pagina Settings.
 * Ogni riga mostra categoria, importo limite e pulsante per rimuovere il budget.
 */
function renderSettingsBudgets() {
  const listEl = document.getElementById("budget-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  // Mostra il budget totale corrente in cima alla lista
  const totalBudget = wallet.totalBudget || 0;
  const totalRow = document.createElement("div");
  totalRow.className = "budget-settings-row budget-settings-total-row";
  totalRow.innerHTML = `
    <span class="budget-settings-cat">Total monthly budget</span>
    <span class="budget-settings-amount">${totalBudget > 0 ? totalBudget.toFixed(2) + " €/month" : "Not set"}</span>
  `;
  listEl.appendChild(totalRow);

  const entries = Object.entries(wallet.budgets || {});
  if (entries.length === 0) {
    listEl.innerHTML = '<p class="settings-desc" style="padding: 0.25rem 0;">No budgets set yet.</p>';
    return;
  }

  entries.forEach(([cat, limit]) => {
    const row = document.createElement("div");
    row.className = "budget-settings-row";
    row.innerHTML = `
      <span class="budget-settings-cat">${cat}</span>
      <span class="budget-settings-amount">${Number(limit).toFixed(2)} &euro;/month</span>
      <button class="btn-icon btn-icon-danger btn-icon-sm" data-remove-budget="${cat}" title="Remove budget">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    // Bind rimozione budget inline (per ogni riga)
    row.querySelector(`[data-remove-budget]`).addEventListener("click", () => {
      delete wallet.budgets[cat];
      wallet.save();
      renderSettingsBudgets();
      renderBudgetSection();
      showToast(`Budget for "${cat}" removed`);
    });
    listEl.appendChild(row);
  });

  lucide.createIcons();
}

/**
 * bindBudgetActions — collega il pulsante "Set Budget" nella pagina Settings.
 * Legge categoria e importo, salva in wallet.budgets e aggiorna UI.
 */
function bindBudgetActions() {
  // Salva budget per categoria
  document.getElementById("btn-set-budget").addEventListener("click", () => {
    const cat = document.getElementById("budget-category").value;
    const amount = parseFloat(document.getElementById("budget-amount").value);

    if (!cat) return showToast("Select a category", "error");
    if (!amount || amount <= 0) return showToast("Enter a valid amount (> 0)", "error");

    if (!wallet.budgets) wallet.budgets = {};
    wallet.budgets[cat] = amount;
    wallet.save();

    document.getElementById("budget-amount").value = "";
    renderSettingsBudgets();
    renderBudgetSection();
    showToast(`Budget for "${cat}": ${amount.toFixed(2)} €/month`);
  });

  // Salva budget mensile totale
  document.getElementById("btn-set-total-budget").addEventListener("click", () => {
    const amount = parseFloat(document.getElementById("total-budget-amount").value);
    if (isNaN(amount) || amount < 0) return showToast("Enter a valid amount (≥ 0)", "error");

    // amount = 0 significa "rimuovi il budget totale"
    wallet.totalBudget = amount;
    wallet.save();

    document.getElementById("total-budget-amount").value = "";
    renderSettingsBudgets();
    renderBudgetSection();
    showToast(amount > 0 ? `Total budget: ${amount.toFixed(2)} €/month` : "Total budget removed");
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

  // Budget mensili: aggiorna la lista nella card Budget
  renderSettingsBudgets();
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
 * renderAccountsOverview — popola la lista saldi per conto nella pagina Analytics.
 * Mostra ogni conto con nome, saldo in €, e la percentuale sul totale assoluto.
 * Appare affiancata al pie chart conti nel blocco account-overview-card.
 */
/**
 * renderAccountsOverview — popola i chip saldi nella pagina Analytics.
 * Riusa gli stessi .balance-chip della dashboard per coerenza visiva.
 */
function renderAccountsOverview() {
  const listEl = document.getElementById("account-overview-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  for (const [conto, saldo] of Object.entries(wallet.saldoConti)) {
    const chip = document.createElement("div");
    chip.className = "balance-chip";
    chip.innerHTML = `
      <span class="balance-chip-name">${conto.charAt(0).toUpperCase() + conto.slice(1)}</span>
      <span class="balance-chip-value ${saldo >= 0 ? 'positive' : 'negative'}">${saldo.toFixed(2)} &euro;</span>
    `;
    listEl.appendChild(chip);
  }
}

/**
 * renderNetworthPieChart — disegna il doughnut chart "Net Worth Breakdown" nella dashboard.
 *
 * Mostra la ripartizione del patrimonio netto in tre voci:
 *   - Liquidità:    saldo totale del wallet (wallet.saldo)
 *   - Investimenti: valore a prezzi correnti del portafoglio (currentPrice * quantity)
 *   - Depositi:     saldo composto dei conti deposito (calcDepositBalance)
 *
 * Lato sinistro → canvas doughnut chart
 * Lato destro   → righe etichetta + valore (€) + percentuale
 *
 * Il chart viene distrutto e ricreato ad ogni render per evitare duplicati.
 */
function renderNetworthPieChart() {
  // ——— Calcola i tre valori ———
  const liquidita      = Math.max(0, wallet.saldo);
  const investmentsVal = investments.reduce((s, inv) => s + (inv.currentPrice || 0) * inv.quantity, 0);
  const depositsVal    = depositAccounts.reduce((s, dep) => s + calcDepositBalance(dep), 0);
  const total          = liquidita + investmentsVal + depositsVal;

  // Palette coerente con il tema dell'app
  const colors = ["#6c5ce7", "#10b981", "#f59e0b"]; // viola (wallet), verde (inv), giallo (dep)

  // ——— Popola il lato destro con le cifre ———
  const valuesDiv = document.getElementById("networth-values");
  if (valuesDiv) {
    // nav: pagina di destinazione al click
    const items = [
      { label: "Cash",            value: liquidita,      color: colors[0], nav: "main"        },
      { label: "Investments",     value: investmentsVal, color: colors[1], nav: "investments" },
      { label: "Deposit Accounts",value: depositsVal,    color: colors[2], nav: "investments" }
    ];

    valuesDiv.innerHTML = items.map(item => {
      const pct = total > 0 ? (item.value / total * 100).toFixed(1) : "0.0";
      return `
        <div class="networth-item networth-item-link" data-nav="${item.nav}" title="Go to ${item.label}">
          <div class="networth-item-dot" style="background:${item.color}"></div>
          <span class="networth-item-label">${item.label}</span>
          <div>
            <div class="networth-item-value">${item.value.toFixed(2)} &euro;</div>
            <div class="networth-item-pct">${pct}%</div>
          </div>
        </div>
      `;
    }).join("") + `
      <div class="networth-total-row">
        <span class="networth-item-label">Net Worth</span>
        <span class="networth-item-value">${total.toFixed(2)} &euro;</span>
      </div>
    `;

    // Naviga alla pagina corrispondente al click sulla riga
    valuesDiv.querySelectorAll(".networth-item-link").forEach(el => {
      el.addEventListener("click", () => navigateTo(el.dataset.nav));
    });
  }

  // ——— Disegna il doughnut chart ———
  const canvas = document.getElementById("chart-networth-pie");
  if (!canvas) return;

  // Distruggi istanza precedente per evitare memory leak
  if (currentChartNetworthPie) {
    currentChartNetworthPie.destroy();
    currentChartNetworthPie = null;
  }

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  currentChartNetworthPie = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["Liquidità", "Investimenti", "Depositi"],
      datasets: [{
        data: [liquidita, investmentsVal, depositsVal],
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: isDark ? "#1a1a2e" : "#ffffff",  // bordo separatore segmenti
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "60%",             // foro centrale: lascia spazio per un valore
      plugins: {
        legend: { display: false },  // legenda sostituita dalle righe a destra
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed;
              const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
              return ` ${val.toFixed(2)} € (${pct}%)`;
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
/**
 * renderDailyBalanceChart — disegna il grafico del saldo giornaliero cumulativo.
 * Accetta un canvasId opzionale per poter essere usata sia in Analytics
 * ("chart-daily-balance") sia nella Dashboard ("chart-daily-balance-dash").
 * Le istanze Chart sono gestite dalla mappa dailyBalanceChartInstances.
 */
function renderDailyBalanceChart(canvasId = "chart-daily-balance") {
  // Distruggi il chart precedente su questo canvas per evitare memory leak
  if (dailyBalanceChartInstances[canvasId]) {
    dailyBalanceChartInstances[canvasId].destroy();
    delete dailyBalanceChartInstances[canvasId];
  }

  const canvas = document.getElementById(canvasId);
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

  dailyBalanceChartInstances[canvasId] = new Chart(ctx, {
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

  // Applica prima i filtri strutturati (categorie, conti, date)
  let result = wallet.filter({
    categories: selectedCats,
    accounts: selectedAccs,
    dateFrom: document.getElementById("filter-date-from").value || null,
    dateTo: document.getElementById("filter-date-to").value || null
  });

  // Poi applica il filtro testuale: cerca in Description e Category (case-insensitive)
  const searchText = (document.getElementById("tx-search")?.value || "").trim().toLowerCase();
  if (searchText) {
    result = result.filter(t =>
      t.Description.toLowerCase().includes(searchText) ||
      t.Category.toLowerCase().includes(searchText)
    );
  }

  return result;
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

/**
 * Mostra un toast con un bottone "Undo" che rimane visibile per 5 secondi.
 * Se l'utente clicca "Undo" prima che scompaia, viene eseguita la callback onUndo.
 *
 * @param {string} message - Testo del toast
 * @param {Function} onUndo - Callback da eseguire se l'utente clicca Undo
 */
function showToastWithUndo(message, onUndo) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast toast-success";

  // Testo del messaggio
  const span = document.createElement("span");
  span.textContent = message;
  toast.appendChild(span);

  // Bottone Undo
  const btn = document.createElement("button");
  btn.className = "toast-undo-btn";
  btn.textContent = "Undo";
  toast.appendChild(btn);

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  // Timeout per la rimozione automatica (5s, più lungo del toast normale)
  let undone = false;
  const timer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 5000);

  // Click su Undo: cancella il timer, esegue la callback e chiude il toast
  btn.addEventListener("click", () => {
    if (undone) return;
    undone = true;
    clearTimeout(timer);
    onUndo();
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
    showToast("Action undone!");
  });
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

  // ---- Mostra/nascondi i due container in base alla modalità attiva ----
  const tableContainer = document.getElementById("investments-table-container");
  const cardsContainer = document.getElementById("investments-cards-grid");
  if (tableContainer) tableContainer.classList.toggle("hidden", invViewMode !== "table");
  if (cardsContainer) cardsContainer.classList.toggle("hidden", invViewMode !== "cards");

  // ---- Aggiorna lo stato attivo dei pulsanti toggle ----
  document.querySelectorAll(".inv-view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === invViewMode);
  });

  // ---- Stato vuoto: uguale per entrambe le viste ----
  if (investments.length === 0) {
    const emptyRow = '<tr><td colspan="12" class="empty-msg">No investments yet. Click "Add Investment" to start.</td></tr>';
    const emptyCard = `<div class="inv-cards-empty">
      <i data-lucide="bar-chart-2"></i>
      <p>No investments yet.<br>Click <strong>Add Investment</strong> to start.</p>
    </div>`;
    document.getElementById("investments-body").innerHTML = emptyRow;
    if (cardsContainer) cardsContainer.innerHTML = emptyCard;
    lucide.createIcons();
    return;
  }

  // ======================== VISTA TABELLA ========================
  // Popola il <tbody id="investments-body"> con le righe originali.
  const tbody = document.getElementById("investments-body");
  tbody.innerHTML = "";

  investments.forEach(inv => {
    const invested   = inv.purchasePrice * inv.quantity;
    const currentVal = (inv.currentPrice || inv.purchasePrice) * inv.quantity;
    const pnl        = currentVal - invested;
    const pnlPct     = invested > 0 ? ((currentVal / invested) - 1) * 100 : 0;
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
      <td class="amount ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "+" : ""}${pnl.toFixed(2)} &euro;
      </td>
      <td class="amount ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "+" : ""}${pnlPct.toFixed(2)}%
      </td>
      <td>${inv.purchaseDate}</td>
      <td>
        <div class="inv-actions">
          <button class="btn-icon" title="Chart" data-inv-chart="${inv.id}"><i data-lucide="line-chart"></i></button>
          <button class="btn-icon" title="Refresh" data-inv-refresh="${inv.id}"><i data-lucide="refresh-cw"></i></button>
          <button class="btn-icon" title="Edit" data-inv-edit="${inv.id}"><i data-lucide="pencil"></i></button>
          <button class="btn-icon btn-icon-danger" title="Remove" data-inv-remove="${inv.id}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // ======================== VISTA CARD ========================
  // Popola il div#investments-cards-grid con le card compatte.
  if (cardsContainer) {
    cardsContainer.innerHTML = "";
    investments.forEach(inv => {
      const invested   = inv.purchasePrice * inv.quantity;
      const currentVal = (inv.currentPrice || inv.purchasePrice) * inv.quantity;
      const pnl        = currentVal - invested;
      const pnlPct     = invested > 0 ? ((currentVal / invested) - 1) * 100 : 0;
      const isPositive = pnl >= 0;
      const pnlClass   = isPositive ? "inv-card-pnl--profit" : "inv-card-pnl--loss";
      const arrow      = isPositive ? "↑" : "↓";
      const currentPriceHtml = inv.currentPrice
        ? `${inv.currentPrice.toFixed(2)} €${inv.lastUpdated ? `<span class="inv-card-updated">${inv.lastUpdated}</span>` : ""}`
        : `<span class="inv-card-no-price">—</span>`;

      const card = document.createElement("div");
      card.className = `inv-card ${isPositive ? "inv-card--profit" : "inv-card--loss"}`;
      card.innerHTML = `
        <div class="inv-card-header">
          <div class="inv-card-identity">
            <span class="inv-card-name">${inv.name}</span>
            <span class="inv-card-ticker">${inv.ticker || inv.isin || "—"}</span>
          </div>
          <span class="type-badge-inv type-inv-${inv.type.toLowerCase()}">${inv.type}</span>
        </div>
        <div class="inv-card-pnl ${pnlClass}">
          <span class="inv-card-pnl-euro">${arrow} ${isPositive ? "+" : ""}${pnl.toFixed(2)} €</span>
          <span class="inv-card-pnl-pct">${isPositive ? "+" : ""}${pnlPct.toFixed(2)}%</span>
        </div>
        <div class="inv-card-data">
          <div class="inv-card-row">
            <span class="inv-card-label">Qty</span>
            <span class="inv-card-val">${inv.quantity}</span>
          </div>
          <div class="inv-card-row">
            <span class="inv-card-label">Avg price</span>
            <span class="inv-card-val">${inv.purchasePrice.toFixed(2)} €</span>
          </div>
          <div class="inv-card-row">
            <span class="inv-card-label">Current</span>
            <span class="inv-card-val">${currentPriceHtml}</span>
          </div>
          <div class="inv-card-row">
            <span class="inv-card-label">Invested</span>
            <span class="inv-card-val">${invested.toFixed(2)} €</span>
          </div>
          <div class="inv-card-row">
            <span class="inv-card-label">Value</span>
            <span class="inv-card-val inv-card-val--value">${currentVal.toFixed(2)} €</span>
          </div>
          <div class="inv-card-row">
            <span class="inv-card-label">Since</span>
            <span class="inv-card-val">${inv.purchaseDate}</span>
          </div>
        </div>
        <div class="inv-card-actions">
          <button class="btn-icon" title="Price history" data-inv-chart="${inv.id}">
            <i data-lucide="line-chart"></i>
          </button>
          <button class="btn-icon" title="Refresh price" data-inv-refresh="${inv.id}">
            <i data-lucide="refresh-cw"></i>
          </button>
          <button class="btn-icon" title="Edit" data-inv-edit="${inv.id}">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon btn-icon-danger" title="Remove" data-inv-remove="${inv.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  // Portfolio Allocation Pie Chart
  renderInvestmentsPieChart();

  // Renderizza la sezione conti deposito (sotto il portafoglio)
  renderDepositAccountsSection();

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

  // Bind edit buttons: apre il modal pre-popolato con i dati dell'investimento
  document.querySelectorAll("[data-inv-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id  = parseInt(btn.dataset.invEdit);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      // Popola tutti i campi del modal con i valori attuali dell'investimento
      document.getElementById("inv-edit-id").value       = inv.id;
      document.getElementById("inv-edit-name").value     = inv.name;
      document.getElementById("inv-edit-ticker").value   = inv.ticker  || "";
      document.getElementById("inv-edit-isin").value     = inv.isin    || "";
      document.getElementById("inv-edit-type").value     = inv.type;
      document.getElementById("inv-edit-price").value    = inv.purchasePrice;
      document.getElementById("inv-edit-quantity").value = inv.quantity;
      document.getElementById("inv-edit-date").value     = inv.purchaseDate || "";

      openModal("modal-edit-inv");
    });
  });

  // Bind del pulsante "Save Changes" nel modal edit
  // Clona il nodo per rimuovere eventuali listener precedenti (evita duplicati al re-render)
  const btnSaveEdit = document.getElementById("btn-save-inv-edit");
  if (btnSaveEdit) {
    const freshBtn = btnSaveEdit.cloneNode(true);
    btnSaveEdit.parentNode.replaceChild(freshBtn, btnSaveEdit);

    freshBtn.addEventListener("click", () => {
      const id  = parseInt(document.getElementById("inv-edit-id").value);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      // Legge i valori dal form e aggiorna l'oggetto investimento
      const name     = document.getElementById("inv-edit-name").value.trim();
      const ticker   = document.getElementById("inv-edit-ticker").value.trim();
      const isin     = document.getElementById("inv-edit-isin").value.trim();
      const type     = document.getElementById("inv-edit-type").value;
      const price    = parseFloat(document.getElementById("inv-edit-price").value);
      const quantity = parseFloat(document.getElementById("inv-edit-quantity").value);
      const date     = document.getElementById("inv-edit-date").value;

      // Validazione minima
      if (!name || isNaN(price) || isNaN(quantity) || price < 0 || quantity <= 0) {
        showToast("Please fill in all required fields correctly.", "warning");
        return;
      }

      // Applica le modifiche (currentPrice e lastUpdated rimangono invariati)
      inv.name          = name;
      inv.ticker        = ticker || null;
      inv.isin          = isin   || null;
      inv.type          = type;
      inv.purchasePrice = price;
      inv.quantity      = quantity;
      inv.purchaseDate  = date;

      saveInvestments();
      closeModal("modal-edit-inv");
      renderInvestmentsPage();
      showToast(`"${name}" updated successfully!`);
    });
  }

  // Bind remove buttons: invece di cancellare subito, apre un modal di conferma
  document.querySelectorAll("[data-inv-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.invRemove);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      // Imposta l'ID dell'investimento nel campo nascosto del modal
      document.getElementById("inv-remove-id").value = id;
      // Mostra il nome dell'investimento nel testo di conferma
      document.getElementById("inv-remove-confirm-text").textContent =
        `Are you sure you want to remove "${inv.name}"? This action cannot be undone.`;
      // Apre il modal di conferma invece di cancellare immediatamente
      openModal("modal-confirm-inv-remove");
    });
  });

  // Listener per il pulsante di conferma nel modal di rimozione investimento
  const btnConfirmInvRemove = document.getElementById("btn-confirm-inv-remove");
  if (btnConfirmInvRemove) {
    // Rimuove eventuali listener precedenti clonando il nodo (evita duplicati al re-render)
    const freshBtn = btnConfirmInvRemove.cloneNode(true);
    btnConfirmInvRemove.parentNode.replaceChild(freshBtn, btnConfirmInvRemove);

    freshBtn.addEventListener("click", () => {
      const id = parseInt(document.getElementById("inv-remove-id").value);
      const inv = investments.find(i => i.id === id);
      if (!inv) return;

      // Snapshot dell'investimento prima della rimozione, usato per l'Undo
      const snapshot = { ...inv };

      // Rimuove l'investimento dall'array e salva
      investments = investments.filter(i => i.id !== id);
      saveInvestments();
      closeModal("modal-confirm-inv-remove");
      renderInvestmentsPage();

      // Toast con Undo: se cliccato entro 5s, reinserisce l'investimento
      showToastWithUndo(`${inv.name} removed!`, () => {
        investments.push(snapshot);
        // Riordina per ID per mantenere l'ordine originale
        investments.sort((a, b) => a.id - b.id);
        saveInvestments();
        renderInvestmentsPage();
      });
    });
  }
}

const PIE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e11d48", "#7c3aed", "#0ea5e9", "#d946ef", "#facc15"
];

function renderInvestmentsPieChart() {
  const container = document.getElementById("inv-pie-container");
  if (!container) return;

  // ---- Aggiorna label e stile del bottone toggle ----
  const toggleBtn   = document.getElementById("btn-toggle-pie-group");
  const toggleLabel = document.getElementById("btn-toggle-pie-group-label");
  if (toggleBtn && toggleLabel) {
    toggleLabel.textContent = invPieGrouped ? "Show individual" : "Group by type";
    toggleBtn.classList.toggle("btn-primary", invPieGrouped);
    toggleBtn.classList.toggle("btn-outline", !invPieGrouped);
  }

  // Palette colori depositaccounts (toni teal/verde per distinguerli)
  const DEPOSIT_COLORS = [
    "#10b981", "#14b8a6", "#6ee7b7", "#34d399", "#059669",
    "#0d9488", "#047857", "#065f46"
  ];

  // Colori fissi per tipo di investimento (usati in modalità grouped)
  const TYPE_COLORS = {
    "ETF":    "#6366f1",
    "BTP":    "#f472b6",
    "Stock":  "#f59e0b",
    "Fund":   "#8b5cf6",
    "Bond":   "#f97316",
    "Crypto": "#facc15",
  };

  let allItems = [];

  if (invPieGrouped) {
    // ---- MODALITÀ RAGGRUPPATA: aggrega per tipo ----
    // Accumula il valore corrente di tutti gli asset dello stesso tipo
    const typeMap = {};
    investments.forEach(inv => {
      const val = (inv.currentPrice || inv.purchasePrice) * inv.quantity;
      typeMap[inv.type] = (typeMap[inv.type] || 0) + val;
    });
    // Converte la mappa in array ordinato per valore decrescente
    Object.entries(typeMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, value]) => {
        allItems.push({ label: type, value, isDeposit: false, type });
      });
    // I depositi vengono raggruppati come voce unica "Deposits"
    const totalDep = depositAccounts.reduce((s, dep) => {
      const bal = calcDepositBalance(dep);
      return s + (bal > 0 ? bal : 0);
    }, 0);
    if (totalDep > 0) {
      allItems.push({ label: "Deposits", value: totalDep, isDeposit: true });
    }
  } else {
    // ---- MODALITÀ INDIVIDUALE: ogni asset è una slice separata (default) ----
    investments.forEach(inv => {
      allItems.push({
        label: inv.name,
        value: (inv.currentPrice || inv.purchasePrice) * inv.quantity,
        isDeposit: false,
        type: inv.type
      });
    });
    depositAccounts.forEach(dep => {
      const bal = calcDepositBalance(dep);
      if (bal > 0) {
        allItems.push({ label: `${dep.name} (Dep.)`, value: bal, isDeposit: true });
      }
    });
  }

  // Nascondi il container se non ci sono voci
  if (allItems.length === 0) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  if (currentChartInvPie) currentChartInvPie.destroy();

  const labels = allItems.map(it => it.label);
  const values = allItems.map(it => it.value);
  const total  = values.reduce((a, b) => a + b, 0);

  // Assegna colori: in modalità grouped usa i colori fissi per tipo,
  // in modalità individuale usa la palette PIE_COLORS (o teal per depositi)
  const colors = allItems.map((it, i) => {
    if (it.isDeposit) return DEPOSIT_COLORS[i % DEPOSIT_COLORS.length];
    if (invPieGrouped) return TYPE_COLORS[it.type] || PIE_COLORS[i % PIE_COLORS.length];
    return PIE_COLORS[investments.findIndex(inv => it.label === inv.name) % PIE_COLORS.length];
  });

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
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${val.toFixed(2)} € (${pct}%)`;
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
  // Toggle visualizzazione portfolio: tabella ↔ card.
  // Al click salva la preferenza in localStorage e ri-renderizza.
  document.querySelectorAll(".inv-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      invViewMode = btn.dataset.view;
      localStorage.setItem("inv-view-mode", invViewMode);
      renderInvestmentsPage();
    });
  });

  // Toggle pie chart raggruppato per tipo / per singolo asset.
  // Non persiste in localStorage: è una preferenza di sessione.
  const btnPieGroup = document.getElementById("btn-toggle-pie-group");
  if (btnPieGroup) {
    btnPieGroup.addEventListener("click", () => {
      invPieGrouped = !invPieGrouped;
      renderInvestmentsPieChart();
    });
  }

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

// ======================== CONTI DEPOSITO ========================

/**
 * Genera tutte le date di pagamento interessi dall'apertura del conto fino a `end` incluso.
 * Usata da calcDepositBalance e computeDepositTimeline per non duplicare la logica.
 *
 * @param {Object} dep   - Oggetto conto deposito
 * @param {Date}   start - Data apertura (mezzanotte locale)
 * @param {Date}   end   - Data limite (mezzanotte locale, inclusa)
 * @returns {Date[]} array di Date ordinate cronologicamente
 */
function generateDepositPaymentDates(dep, start, end) {
  const dates = [];

  if (dep.paymentFrequency === "giornaliero") {
    // Un tick al giorno: dal giorno dopo l'apertura fino a end incluso
    let cur = new Date(start);
    cur.setDate(cur.getDate() + 1);
    while (cur <= end) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Frequenze mensili e derivate
    const monthMap = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 };
    const months = monthMap[dep.paymentFrequency] || 12;
    let cur = new Date(start);
    cur.setMonth(cur.getMonth() + months);
    while (cur <= end) {
      dates.push(new Date(cur));
      cur = new Date(cur);
      cur.setMonth(cur.getMonth() + months);
    }
  }

  return dates;
}

/**
 * Calcola il saldo attuale del conto deposito usando capitalizzazione composta.
 *
 * Modello:
 *   - INVESTED (capitale netto): somma depositi meno prelievi — NON cresce con gli interessi
 *   - CURRENT BALANCE: ad ogni periodo di pagamento cresce secondo:
 *       balance = balance * (1 + ratePerPeriod)
 *     dove ratePerPeriod = annualNetRate / periodsPerYear
 *   - Gli interessi NON vengono salvati come transazioni nel JSON:
 *     vengono calcolati matematicamente al volo ogni volta.
 *
 * Esempio (giornaliero, 1.5% lordo, 26% tassa → 1.11% netto):
 *   Giorno 0 (apertura): deposito 10€ → balance = 10
 *   Giorno 1: balance = 10 * (1 + 0.0111/365) ≈ 10.000304
 *   Giorno 2: balance = 10.000304 * (1 + 0.0111/365) ≈ 10.000608
 *   ...
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {number} saldo attuale (€)
 */
function calcDepositBalance(dep) {
  // Tasso netto annuale come decimale (es. 1.5% lordo, 26% tassa → 0.01110)
  const netAnnualRate = dep.annualRate * (1 - (dep.taxRate ?? 26) / 100) / 100;

  // Numero di periodi per anno in base alla frequenza di pagamento
  const periodsPerYear = {
    giornaliero: 365,
    mensile:     12,
    trimestrale:  4,
    semestrale:   2,
    annuale:      1
  }[dep.paymentFrequency] || 1;

  // Tasso applicato ad ogni singolo periodo (es. daily → 0.01110/365 ≈ 0.0000304)
  const ratePerPeriod = netAnnualRate / periodsPerYear;

  // Considera solo i flussi di cassa (depositi e prelievi).
  // Eventuali vecchie transazioni "interessi" salvate nel JSON vengono ignorate —
  // gli interessi ora si calcolano al volo e non si salvano più.
  const cashFlows = dep.transactions
    .filter(t => t.type === "deposito" || t.type === "prelievo")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (cashFlows.length === 0) return 0;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(dep.startDate); startDate.setHours(0, 0, 0, 0);

  // Genera tutte le date di pagamento interessi dall'apertura ad oggi incluso
  const paymentDates = generateDepositPaymentDates(dep, startDate, today);

  // Costruisce la timeline unificata: cashflow (ordine 0) + interest tick (ordine 1)
  // Stesso giorno → il cashflow viene processato PRIMA dell'interesse:
  // un deposito effettuato oggi porta già interesse da domani, non da ieri.
  const timeline = [];

  cashFlows.forEach(t => {
    const d = new Date(t.date); d.setHours(0, 0, 0, 0);
    timeline.push({
      ms:    d.getTime(),
      order: 0,                // cashflow prima degli interessi nello stesso giorno
      type:  "cashflow",
      delta: t.type === "deposito" ? t.amount : -t.amount
    });
  });

  paymentDates.forEach(d => {
    timeline.push({
      ms:    d.getTime(),
      order: 1,                // interesse dopo i cashflow nello stesso giorno
      type:  "interest"
    });
  });

  // Ordina cronologicamente; parità → cashflow prima
  timeline.sort((a, b) => a.ms - b.ms || a.order - b.order);

  // Simula il saldo applicando ogni evento in ordine
  let balance = 0;
  for (const ev of timeline) {
    if (ev.type === "cashflow") {
      balance += ev.delta;                       // deposito o prelievo
    } else {
      balance *= (1 + ratePerPeriod);            // capitalizzazione composta
    }
  }

  return Math.max(0, balance);
}

/**
 * Calcola il capitale netto investito (depositi meno prelievi, senza interessi).
 * Questa cifra rappresenta il denaro effettivamente versato/prelevato dall'utente
 * e NON cresce con gli interessi — rimane stabile tra un deposito e l'altro.
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {number} capitale netto (€)
 */
function calcInvested(dep) {
  return dep.transactions.reduce((sum, t) => {
    if (t.type === "deposito") return sum + t.amount;
    if (t.type === "prelievo") return sum - t.amount;
    return sum; // ignora le eventuali vecchie "interessi" salvate
  }, 0);
}

/**
 * Calcola il tasso netto annuo dopo tassazione.
 * Formula: tassoNetto = tassoLordo * (1 - aliquota/100)
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {number} tasso netto (percentuale, es. 1.11)
 */
function calcNetRate(dep) {
  return dep.annualRate * (1 - (dep.taxRate ?? 26) / 100);
}

/**
 * Calcola gli interessi netti maturati fino ad oggi.
 * Formula: interessi = saldo_corrente - capitale_netto_investito
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {number} interessi maturati (€)
 */
function calcAccruedInterest(dep) {
  return Math.max(0, calcDepositBalance(dep) - calcInvested(dep));
}

/**
 * Calcola la data del prossimo pagamento interessi.
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {string} data in formato YYYY-MM-DD oppure "—"
 */
function calcNextInterestDate(dep) {
  if (!dep.startDate) return "—";

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Frequenza giornaliera: il prossimo pagamento è sempre domani
  if (dep.paymentFrequency === "giornaliero") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }

  // Frequenze mensili: avanziamo di N mesi finché superiamo oggi
  const freqMap = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 };
  const months = freqMap[dep.paymentFrequency] || 12;

  let next = new Date(dep.startDate); next.setHours(0, 0, 0, 0);
  while (next <= today) {
    next.setMonth(next.getMonth() + months);
  }

  return next.toISOString().split("T")[0];
}

/**
 * Ricostruisce la timeline completa del conto deposito per la visualizzazione dello storico.
 * Restituisce tutti gli eventi (depositi, prelievi, interessi CALCOLATI) con saldo progressivo.
 *
 * Gli interessi NON sono salvati nel JSON — vengono generati al volo da questa funzione
 * usando la stessa logica di calcDepositBalance.
 *
 * @param {Object} dep - Oggetto conto deposito
 * @returns {Array<{date: string, type: string, amount: number, balance: number, note: string}>}
 */
function computeDepositTimeline(dep) {
  const netAnnualRate = dep.annualRate * (1 - (dep.taxRate ?? 26) / 100) / 100;
  const periodsPerYear = {
    giornaliero: 365, mensile: 12, trimestrale: 4, semestrale: 2, annuale: 1
  }[dep.paymentFrequency] || 1;
  const ratePerPeriod = netAnnualRate / periodsPerYear;

  const cashFlows = dep.transactions
    .filter(t => t.type === "deposito" || t.type === "prelievo")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (cashFlows.length === 0) return [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(dep.startDate); startDate.setHours(0, 0, 0, 0);

  const paymentDates = generateDepositPaymentDates(dep, startDate, today);

  // Stessa struttura di calcDepositBalance: cashflow (0) prima degli interessi (1)
  const timeline = [];
  cashFlows.forEach(t => {
    const d = new Date(t.date); d.setHours(0, 0, 0, 0);
    timeline.push({
      ms:     d.getTime(),
      order:  0,
      type:   t.type,
      delta:  t.type === "deposito" ? t.amount : -t.amount,
      note:   t.note || ""
    });
  });
  paymentDates.forEach(d => {
    timeline.push({ ms: d.getTime(), order: 1, type: "interessi" });
  });
  timeline.sort((a, b) => a.ms - b.ms || a.order - b.order);

  const result = [];
  let balance = 0;

  for (const ev of timeline) {
    const dateStr = new Date(ev.ms).toISOString().split("T")[0];

    if (ev.type === "interessi") {
      // Calcola l'interesse maturato in questo periodo e aggiornalo al saldo
      const interestAmt = balance * ratePerPeriod;
      balance *= (1 + ratePerPeriod);
      result.push({
        date:    dateStr,
        type:    "interessi",
        amount:  interestAmt,
        balance: balance,
        note:    `Net rate ${calcNetRate(dep).toFixed(3)}% annual`
      });
    } else {
      // Deposito o prelievo: aggiorna il saldo
      balance += ev.delta;
      result.push({
        date:    dateStr,
        type:    ev.type,
        amount:  Math.abs(ev.delta),
        balance: balance,
        note:    ev.note
      });
    }
  }

  return result;
}

/**
 * Popola i <select> dei modali deposito con i dati aggiornati.
 * - dep-linked-conto: lista conti wallet
 * - dep-transfer-account: lista conti deposito esistenti
 */
function populateDepositSelects() {
  // Conto wallet collegato (per il modal aggiunta conto)
  const linkedContoSel = document.getElementById("dep-linked-conto");
  if (linkedContoSel) {
    linkedContoSel.innerHTML = "";
    wallet.contiList.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      linkedContoSel.appendChild(opt);
    });
  }

  // Selezione conto deposito (per il modal trasferimento)
  const transferAccSel = document.getElementById("dep-transfer-account");
  if (transferAccSel) {
    transferAccSel.innerHTML = depositAccounts.length === 0
      ? '<option value="">Nessun conto disponibile</option>'
      : "";
    depositAccounts.forEach(dep => {
      const opt = document.createElement("option");
      opt.value = dep.id;
      opt.textContent = `${dep.name} (${dep.bank || "—"}) — ${calcDepositBalance(dep).toFixed(2)} €`;
      transferAccSel.appendChild(opt);
    });
  }
}

/**
 * Renderizza la sezione "Conti Deposito" nella pagina Investments.
 * Prima di renderizzare, aggiorna i saldi tramite calcDepositBalance() (no scrittura su disco).
 * per capitalizzare automaticamente gli interessi scaduti.
 * Mostra le summary cards globali e la tabella con tutti i conti.
 */
function renderDepositAccountsSection() {
  // Gli interessi vengono calcolati al volo da calcDepositBalance — nessuna scrittura su disco.

  // ——— Summary cards globali ———
  const summaryDiv = document.getElementById("summary-deposits");
  if (!summaryDiv) return;

  let totalInvested = 0;
  let totalBalance = 0;
  let totalInterest = 0;
  let weightedRate = 0;
  let weightSum = 0;

  depositAccounts.forEach(dep => {
    const invested  = calcInvested(dep);
    const bal       = calcDepositBalance(dep);   // saldo composto aggiornato
    const interest  = bal - invested;            // = calcAccruedInterest(dep)
    totalInvested += invested;
    totalBalance  += bal;
    totalInterest += interest;
    // Media pesata del tasso (peso = saldo corrente)
    weightedRate += dep.annualRate * bal;
    weightSum += bal;
  });

  const avgRate = weightSum > 0 ? weightedRate / weightSum : 0;

  summaryDiv.innerHTML = `
    <div class="card card-dep-invested">
      <div class="card-icon"><i data-lucide="piggy-bank"></i></div>
      <span class="card-label">Total Invested</span>
      <span class="card-value">${totalInvested.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-dep-balance">
      <div class="card-icon"><i data-lucide="vault"></i></div>
      <span class="card-label">Current Balance</span>
      <span class="card-value">${totalBalance.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-dep-interest">
      <div class="card-icon"><i data-lucide="trending-up"></i></div>
      <span class="card-label">Interest (net)</span>
      <span class="card-value">+${totalInterest.toFixed(2)} &euro;</span>
    </div>
    <div class="card card-dep-rate">
      <div class="card-icon"><i data-lucide="percent"></i></div>
      <span class="card-label">Avg. Rate</span>
      <span class="card-value">${avgRate.toFixed(2)}%</span>
    </div>
  `;

  // ——— Tabella conti deposito ———
  const tbody = document.getElementById("deposits-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (depositAccounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-msg">
      No deposit accounts yet. Click "Add Account" to get started.
    </td></tr>`;
    lucide.createIcons();
    return;
  }

  depositAccounts.forEach(dep => {
    const invested = calcInvested(dep);
    const balance  = calcDepositBalance(dep);    // saldo composto aggiornato
    const interest = balance - invested;         // interessi maturati
    const nextDate = calcNextInterestDate(dep);

    // Badge colore per la frequenza
    const freqColors = {
      giornaliero:  "dep-freq-daily",
      mensile:      "dep-freq-monthly",
      trimestrale:  "dep-freq-quarterly",
      semestrale:   "dep-freq-semiannual",
      annuale:      "dep-freq-annual"
    };
    const freqClass = freqColors[dep.paymentFrequency] || "dep-freq-annual";

    // Calcola il tasso netto per visualizzazione
    const netRate = calcNetRate(dep);
    const taxRate = dep.taxRate ?? 26;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="dep-name-cell">
        <strong>${dep.name}</strong>
        ${dep.linkedConto ? `<small class="dep-linked-tag">${dep.linkedConto}</small>` : ""}
      </td>
      <td>${dep.bank || "—"}</td>
      <td>
        <span class="dep-rate-badge">${dep.annualRate.toFixed(2)}% gross</span>
        <small class="dep-rate-net">${netRate.toFixed(2)}% net (${taxRate}% tax)</small>
      </td>
      <td><span class="dep-freq-badge ${freqClass}">${{ giornaliero: "Daily", mensile: "Monthly", trimestrale: "Quarterly", semestrale: "Semi-annual", annuale: "Annual" }[dep.paymentFrequency] || dep.paymentFrequency}</span></td>
      <td class="amount">${invested.toFixed(2)} &euro;</td>
      <td class="amount positive"><strong>${balance.toFixed(2)} &euro;</strong></td>
      <td class="amount positive">+${interest.toFixed(2)} &euro;</td>
      <td>${nextDate}</td>
      <td>${dep.startDate || "—"}</td>
      <td>${dep.endDate || "—"}</td>
      <td>
        <div class="inv-actions">
          <button class="btn-icon" title="Transaction history" data-dep-history="${dep.id}">
            <i data-lucide="history"></i>
          </button>
          <button class="btn-icon" title="Transfer" data-dep-transfer="${dep.id}">
            <i data-lucide="arrow-left-right"></i>
          </button>
          <button class="btn-icon btn-icon-danger" title="Remove account" data-dep-remove="${dep.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();

  // Bind bottone storico dalla riga
  document.querySelectorAll("[data-dep-history]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.depHistory);
      openDepositHistoryModal(id);
    });
  });

  // Bind bottone trasferisci dalla riga (precompila il select sul conto corretto)
  document.querySelectorAll("[data-dep-transfer]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.depTransfer);
      populateDepositSelects();
      // Seleziona automaticamente il conto corrispondente nel modal
      const sel = document.getElementById("dep-transfer-account");
      if (sel) sel.value = id;
      document.getElementById("dep-transfer-date").value = new Date().toISOString().split("T")[0];
      openModal("modal-deposit-transfer");
    });
  });

  // Bind bottone elimina dalla riga
  document.querySelectorAll("[data-dep-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.depRemove);
      const dep = depositAccounts.find(d => d.id === id);
      if (!dep) return;

      // Conferma prima di eliminare
      if (!confirm(`Remove account "${dep.name}"? This action cannot be undone.`)) return;

      depositAccounts = depositAccounts.filter(d => d.id !== id);
      saveDepositAccounts();
      renderDepositAccountsSection();
      showToast(`Account "${dep.name}" removed.`);
    });
  });

}

/**
 * Apre il modal storico movimenti per un conto deposito specifico.
 * Usa computeDepositTimeline per ricostruire l'intera storia inclusi gli interessi calcolati.
 *
 * @param {number} depId - ID del conto deposito
 */
function openDepositHistoryModal(depId) {
  const dep = depositAccounts.find(d => d.id === depId);
  if (!dep) return;

  const balance  = calcDepositBalance(dep);
  const invested = calcInvested(dep);
  const interest = calcAccruedInterest(dep);

  // Titolo modal
  document.getElementById("dep-history-title").textContent = `History — ${dep.name}`;

  // Riepilogo del conto
  document.getElementById("dep-history-summary").innerHTML = `
    <div class="dep-history-cards">
      <div class="dep-hist-card">
        <span class="dep-hist-label">Current Balance</span>
        <span class="dep-hist-value">${balance.toFixed(2)} €</span>
      </div>
      <div class="dep-hist-card">
        <span class="dep-hist-label">Invested</span>
        <span class="dep-hist-value">${invested.toFixed(2)} €</span>
      </div>
      <div class="dep-hist-card">
        <span class="dep-hist-label">Accrued Interest</span>
        <span class="dep-hist-value positive">+${interest.toFixed(4)} €</span>
      </div>
      <div class="dep-hist-card">
        <span class="dep-hist-label">Net Rate</span>
        <span class="dep-hist-value">${calcNetRate(dep).toFixed(2)}%</span>
      </div>
      <div class="dep-hist-card">
        <span class="dep-hist-label">Payment</span>
        <span class="dep-hist-value">${{ giornaliero: "Daily", mensile: "Monthly", trimestrale: "Quarterly", semestrale: "Semi-annual", annuale: "Annual" }[dep.paymentFrequency] || dep.paymentFrequency}</span>
      </div>
    </div>
  `;

  // Ricostruisce la timeline completa (cashflow + interessi calcolati al volo)
  const tbody = document.getElementById("dep-history-body");
  tbody.innerHTML = "";

  const timeline = computeDepositTimeline(dep);

  if (timeline.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No transactions recorded.</td></tr>';
  } else {
    // Mostra dal più recente al più vecchio
    const sorted = [...timeline].reverse();

    const typeConfig = {
      deposito:  { label: "Deposit",    icon: "arrow-down-circle", cls: "positive" },
      prelievo:  { label: "Withdrawal", icon: "arrow-up-circle",   cls: "negative" },
      interessi: { label: "Interest",   icon: "sparkles",          cls: "positive" }
    };

    sorted.forEach(t => {
      const tr = document.createElement("tr");
      const isPositive = t.type !== "prelievo";
      const cfg = typeConfig[t.type] || { label: t.type, icon: "circle", cls: "" };

      // Per gli interessi mostriamo 4 decimali per evidenziare la crescita composta
      const amtStr = t.type === "interessi"
        ? t.amount.toFixed(4)
        : t.amount.toFixed(2);

      tr.innerHTML = `
        <td>${t.date}</td>
        <td>
          <span class="dep-type-badge dep-type-${t.type}">
            <i data-lucide="${cfg.icon}"></i> ${cfg.label}
          </span>
        </td>
        <td class="amount ${cfg.cls}">
          ${isPositive ? "+" : "-"}${amtStr} &euro;
        </td>
        <td>${t.note || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  lucide.createIcons();
  openModal("modal-deposit-history");
}

/**
 * Collega tutti gli event listener per la sezione Conti Deposito.
 * Chiamato una sola volta al DOMContentLoaded.
 */
function bindDepositAccountActions() {

  // ——— Apertura modal aggiunta conto ———
  document.getElementById("btn-open-add-deposit").addEventListener("click", () => {
    // Popola il select dei conti wallet prima di aprire
    populateDepositSelects();
    // Reset form
    document.getElementById("dep-name").value = "";
    document.getElementById("dep-bank").value = "";
    document.getElementById("dep-rate").value = "2.00";
    document.getElementById("dep-tax-rate").value = "26"; // aliquota default 26%
    document.getElementById("dep-frequency").value = "annuale";
    document.getElementById("dep-start").value = new Date().toISOString().split("T")[0];
    document.getElementById("dep-end").value = "";
    document.getElementById("dep-initial").value = "0.00";
    openModal("modal-add-deposit");
  });

  // ——— Apertura modal trasferimento (da action bar) ———
  document.getElementById("btn-open-deposit-transfer").addEventListener("click", () => {
    if (depositAccounts.length === 0) {
      return showToast("No deposit accounts available. Add one first.", "warning");
    }
    populateDepositSelects();
    document.getElementById("dep-transfer-amount").value = "0.00";
    document.getElementById("dep-transfer-note").value = "";
    document.getElementById("dep-transfer-date").value = new Date().toISOString().split("T")[0];
    openModal("modal-deposit-transfer");
  });

  // ——— Conferma aggiunta nuovo conto deposito ———
  document.getElementById("btn-add-deposit").addEventListener("click", () => {
    const name = document.getElementById("dep-name").value.trim();
    const bank = document.getElementById("dep-bank").value.trim();
    const annualRate = parseFloat(document.getElementById("dep-rate").value);
    // Tasso di tassazione sugli interessi (default 26% — aliquota italiana)
    const taxRate = parseFloat(document.getElementById("dep-tax-rate").value) || 26;
    const paymentFrequency = document.getElementById("dep-frequency").value;
    const startDate = document.getElementById("dep-start").value;
    const endDate = document.getElementById("dep-end").value;
    const linkedConto = document.getElementById("dep-linked-conto").value;
    const initialAmount = parseFloat(document.getElementById("dep-initial").value) || 0;

    // Validazione input
    if (!name) return showToast("Please enter an account name.", "error");
    if (isNaN(annualRate) || annualRate < 0) return showToast("Please enter a valid rate.", "error");
    if (!startDate) return showToast("Please enter the opening date.", "error");

    // Crea il nuovo conto deposito
    const id = depositAccounts.length > 0
      ? Math.max(...depositAccounts.map(d => d.id)) + 1
      : 0;

    const newDep = {
      id,
      name,
      bank,
      annualRate,
      taxRate,          // aliquota fiscale sugli interessi (es. 26%)
      paymentFrequency,
      startDate,
      endDate: endDate || null,
      linkedConto,
      // Lista movimenti: include il deposito iniziale se > 0
      transactions: []
    };

    // Se c'è un deposito iniziale, registriamo il primo movimento e la transazione nel wallet
    if (initialAmount > 0) {
      newDep.transactions.push({
        id: 0,
        date: startDate,
        type: "deposito",
        amount: initialAmount,
        note: "Initial deposit"
      });

      // Registra anche la spesa nel wallet (uscita dal conto collegato).
      // wallet.add con type=0 nega già l'importo internamente, quindi passiamo il valore positivo.
      const [y, m, d] = startDate.split("-").map(Number);
      wallet.add(initialAmount, "📈 Investimenti", `→ ${name} (deposit account opening)`, y, m, d, linkedConto, 0);
      wallet.save();
    }

    depositAccounts.push(newDep);
    saveDepositAccounts();

    closeModal("modal-add-deposit");
    renderInvestmentsPage();
    showToast(`Account "${name}" created successfully!`);
  });

  // ——— Conferma trasferimento da/verso conto deposito ———
  document.getElementById("btn-deposit-transfer").addEventListener("click", () => {
    const depId = parseInt(document.getElementById("dep-transfer-account").value);
    const direction = document.getElementById("dep-transfer-direction").value; // "in" o "out"
    const amount = parseFloat(document.getElementById("dep-transfer-amount").value);
    const date = document.getElementById("dep-transfer-date").value;
    const note = document.getElementById("dep-transfer-note").value.trim();

    // Validazione input
    if (isNaN(depId)) return showToast("Please select a deposit account.", "error");
    if (isNaN(amount) || amount <= 0) return showToast("Please enter a valid amount.", "error");
    if (!date) return showToast("Please enter the transfer date.", "error");

    const dep = depositAccounts.find(d => d.id === depId);
    if (!dep) return showToast("Deposit account not found.", "error");

    // Se si sta prelevando, verifica che il saldo sia sufficiente.
    // Il saldo disponibile è il Current Balance calcolato con capitalizzazione composta.
    if (direction === "out") {
      const currentBal = calcDepositBalance(dep);
      if (amount > currentBal) {
        return showToast(`Insufficient balance. Available: ${currentBal.toFixed(2)} €`, "error");
      }
    }

    // Calcola il nuovo ID per il movimento interno
    const newMovId = dep.transactions.length > 0
      ? Math.max(...dep.transactions.map(t => t.id)) + 1
      : 0;

    // Aggiungi il movimento al conto deposito
    dep.transactions.push({
      id: newMovId,
      date,
      type: direction === "in" ? "deposito" : "prelievo",
      amount,
      note: note || (direction === "in" ? "Transfer in" : "Withdrawal")
    });

    // Registra la transazione corrispondente nel wallet
    const [y, m, d2] = date.split("-").map(Number);

    if (direction === "in") {
      // Uscita dal conto wallet (spesa classificata come investimento).
      // wallet.add con type=0 nega già internamente, quindi passiamo l'importo positivo.
      wallet.add(amount, "📈 Investimenti", `→ ${dep.name}`, y, m, d2, dep.linkedConto, 0);
    } else {
      // Entrata nel conto wallet (rimborso/prelievo)
      wallet.add(amount, "📈 Investimenti", `← ${dep.name}`, y, m, d2, dep.linkedConto, 1);
    }

    wallet.save();
    saveDepositAccounts();

    closeModal("modal-deposit-transfer");

    // Aggiorna sia la pagina investments che il dashboard
    renderInvestmentsPage();
    renderMainPage();

    const dirLabel = direction === "in" ? "deposited into" : "withdrawn from";
    showToast(`${amount.toFixed(2)} € ${dirLabel} "${dep.name}"`);
  });
}
