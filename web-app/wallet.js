/**
 * ============================================================
 * WALLET.JS - Classe Wallet per la gestione finanziaria
 * ============================================================
 *
 * Replica la logica di wallet.py in JavaScript.
 * Gestisce transazioni, conti, abbonamenti e calcoli.
 *
 * Tipi di transazione:
 *   0 = Spesa (importo negativo nel df)
 *   1 = Entrata (importo positivo)
 *   2 = Saldo iniziale in uscita (negativo, usato nei giroconti)
 *   3 = Saldo iniziale in entrata (positivo, usato nei giroconti)
 *   4 = Giroconto (trasferimento tra conti)
 */

class Wallet {
  /**
   * Costruttore - Inizializza il wallet con i dati utente.
   * @param {Object} user - Configurazione utente dal config (categorie, conti, abbonamenti, ecc.)
   */
  constructor(user) {
    // Dati utente (categorie, conti, abbonamenti, commissioni)
    this.user = user;

    // Array delle transazioni - ogni elemento è un oggetto con:
    // { ID, Amount, Category, Description, Y, M, D, Conto, Type }
    this.transactions = [];

    // Lista categorie e conti prese dalla configurazione utente
    this.categories = [...user.categories_list];
    this.contiList = [...user.conti_list];

    // Abbonamenti attivi/scaduti
    this.subscriptions = JSON.parse(JSON.stringify(user.subscriptions || {}));

    // Commissione per i giroconti (tra conti non contanti)
    this.commission = user.commission || 0;

    // Variabili di riepilogo calcolate da update()
    this.income = 0;        // Somma entrate (Type 1)
    this.outcome = 0;       // Somma uscite (Type 0), valore negativo
    this.initialIn = 0;     // Somma saldi iniziali entrata (Type 3)
    this.initialOut = 0;    // Somma saldi iniziali uscita (Type 2), valore negativo
    this.saldo = 0;         // Saldo totale = income + outcome + initialIn + initialOut
    this.saldoConti = {};   // Saldo per ciascun conto { "bancoposta": 1234.56, ... }

    // Ricalcola tutto
    this.update();

    // Gestisci abbonamenti automatici (come pay_subscription in Python)
    this.paySubscriptions();
  }

  // ======================== AGGIORNAMENTO ========================

  /**
   * Ricalcola tutti i totali e i saldi dei conti.
   * Chiamato dopo ogni modifica ai dati.
   */
  update() {
    // Somma per tipo di transazione
    this.outcome = this.transactions
      .filter(t => t.Type === 0)
      .reduce((sum, t) => sum + t.Amount, 0);

    this.income = this.transactions
      .filter(t => t.Type === 1)
      .reduce((sum, t) => sum + t.Amount, 0);

    this.initialOut = this.transactions
      .filter(t => t.Type === 2)
      .reduce((sum, t) => sum + t.Amount, 0);

    this.initialIn = this.transactions
      .filter(t => t.Type === 3)
      .reduce((sum, t) => sum + t.Amount, 0);

    // Saldo complessivo
    this.saldo = this.income + this.outcome + this.initialIn + this.initialOut;

    // Saldo per ogni conto: somma tutte le transazioni di quel conto
    this.saldoConti = {};
    for (const conto of this.contiList) {
      this.saldoConti[conto] = this.transactions
        .filter(t => t.Conto === conto)
        .reduce((sum, t) => sum + t.Amount, 0);
    }
  }

  // ======================== ORDINAMENTO ========================

  /**
   * Ordina le transazioni per data (più recente prima), poi per categoria e importo.
   * Riassegna gli ID in ordine sequenziale.
   */
  sortAndReindex() {
    this.transactions.sort((a, b) => {
      // Prima per anno (decrescente)
      if (b.Y !== a.Y) return b.Y - a.Y;
      // Poi per mese (decrescente)
      if (b.M !== a.M) return b.M - a.M;
      // Poi per giorno (decrescente)
      if (b.D !== a.D) return b.D - a.D;
      // Poi per categoria (alfabetico inverso)
      if (a.Category !== b.Category) return b.Category.localeCompare(a.Category);
      // Infine per importo (decrescente)
      return b.Amount - a.Amount;
    });

    // Riassegna ID sequenziali (0, 1, 2, ...)
    this.transactions.forEach((t, i) => t.ID = i);
  }

  // ======================== AGGIUNTA TRANSAZIONE ========================

  /**
   * Aggiunge una nuova transazione al wallet.
   * Gestisce la logica di split PayPal: se il conto PayPal non ha abbastanza fondi,
   * divide la transazione tra PayPal e il primo conto della lista.
   *
   * @param {number} amount - Importo positivo della transazione
   * @param {string} category - Categoria
   * @param {string} description - Descrizione
   * @param {number} y - Anno
   * @param {number} m - Mese
   * @param {number} d - Giorno
   * @param {string} conto - Nome del conto
   * @param {number} type - Tipo (0=spesa, 1=entrata, 2=saldo_out, 3=saldo_in, 4=giroconto)
   */
  add(amount, category, description, y, m, d, conto, type) {
    let splitAmount = false;

    // Incrementa l'ID di tutte le transazioni esistenti
    // (la nuova transazione avrà ID 0, come in Python)
    this.transactions.forEach(t => t.ID += 1);

    // Logica split PayPal: se il conto è paypal e l'importo supera il saldo disponibile
    let amountPaypal = 0;
    let amountRemaining = 0;

    if (conto === "paypal") {
      const paypalBalance = this.saldoConti["paypal"] || 0;
      if (amount > paypalBalance) {
        splitAmount = true;
        amountPaypal = paypalBalance;
        amountRemaining = Math.round((amount - amountPaypal) * 100) / 100;
      }
    }

    if (splitAmount) {
      // Se è una spesa, invertiamo il segno
      if (type === 0) {
        amount = -amount;
        amountPaypal = -amountPaypal;
        amountRemaining = -amountRemaining;
      }

      // Prima transazione: parte pagata con PayPal
      this.transactions.push({
        ID: 0,
        Amount: amountPaypal,
        Category: category,
        Description: description + "Splitted",
        Y: y, M: m, D: d,
        Conto: conto,
        Type: type
      });

      // Seconda transazione: parte rimanente pagata con il primo conto
      this.transactions.push({
        ID: 0,
        Amount: amountRemaining,
        Category: category,
        Description: description + "Splitted",
        Y: y, M: m, D: d,
        Conto: this.contiList[0],
        Type: type
      });
    } else {
      // Transazione normale: se è una spesa, invertiamo il segno
      if (type === 0) {
        amount = -amount;
      }

      this.transactions.push({
        ID: 0,
        Amount: amount,
        Category: category,
        Description: description,
        Y: y, M: m, D: d,
        Conto: conto,
        Type: type
      });
    }

    // Ricalcola i totali
    this.update();
  }

  // ======================== MODIFICA TRANSAZIONE ========================

  /**
   * Modifica una transazione esistente cercandola per ID.
   * @param {number} index - ID della transazione da modificare
   * @param {number} amount - Nuovo importo (positivo)
   * @param {string} category - Nuova categoria
   * @param {string} description - Nuova descrizione
   * @param {number} y - Nuovo anno
   * @param {number} m - Nuovo mese
   * @param {number} d - Nuovo giorno
   * @param {string} conto - Nuovo conto
   * @param {number} type - Nuovo tipo (0=spesa, 1=entrata)
   */
  editTransaction(index, amount, category, description, y, m, d, conto, type) {
    const t = this.transactions.find(t => t.ID === index);
    if (!t) return false;

    // Se è una spesa, l'importo viene negato. Per le entrate resta positivo.
    t.Amount = type === 1 ? amount : -amount;
    t.Category = category;
    t.Description = description;
    t.Y = y;
    t.M = m;
    t.D = d;
    t.Conto = conto;
    t.Type = type;

    // Riordina e riassegna gli ID
    this.sortAndReindex();
    this.update();
    return true;
  }

  // ======================== ELIMINAZIONE ========================

  /**
   * Elimina una transazione per ID.
   * @param {number} index - ID della transazione da eliminare
   */
  delete(index) {
    const idx = this.transactions.findIndex(t => t.ID === index);
    if (idx === -1) return false;
    this.transactions.splice(idx, 1);
    this.sortAndReindex();
    this.update();
    return true;
  }

  // ======================== GIROCONTO ========================

  /**
   * Trasferimento di denaro tra due conti.
   * Crea 2 transazioni Type 4 (una per conto) con date e conti reali,
   * più un'eventuale commissione come spesa separata (Type 0).
   *
   * @param {number} amount - Importo da trasferire
   * @param {string} contoOut - Conto di origine
   * @param {string} contoIn - Conto di destinazione
   * @param {number} y - Anno
   * @param {number} m - Mese
   * @param {number} d - Giorno
   */
  giroconto(amount, contoOut, contoIn, y, m, d) {
    const description = `${contoOut} → ${contoIn}`;

    // 1) Uscita dal conto di origine (Type 4, importo negativo)
    this.transactions.push({
      ID: 0,
      Amount: -amount,
      Category: "Giroconto",
      Description: description,
      Y: y, M: m, D: d,
      Conto: contoOut,
      Type: 4
    });

    // 2) Entrata sul conto di destinazione (Type 4, importo positivo)
    this.transactions.push({
      ID: 0,
      Amount: amount,
      Category: "Giroconto",
      Description: description,
      Y: y, M: m, D: d,
      Conto: contoIn,
      Type: 4
    });

    // 3) Commissione come spesa reale (Type 0) se applicabile
    if (contoOut !== "contanti" && contoIn !== "contanti" && this.commission > 0) {
      this.transactions.push({
        ID: 0,
        Amount: -this.commission,
        Category: "Commissioni",
        Description: `Commissione ${description}`,
        Y: y, M: m, D: d,
        Conto: contoOut,
        Type: 0
      });
    }

    this.sortAndReindex();
    this.update();
  }

  /**
   * Elimina un giroconto e tutte le transazioni collegate (la coppia Type 4 + eventuale commissione).
   * Per transazioni non-giroconto, elimina solo la singola transazione.
   *
   * @param {number} id - ID della transazione da eliminare
   * @returns {boolean} true se trovata e eliminata
   */
  deleteTransferGroup(id) {
    const t = this.transactions.find(t => t.ID === id);
    if (!t) return false;

    // Se non è un giroconto, elimina normalmente
    if (t.Type !== 4) {
      return this.delete(id);
    }

    // Rimuovi la coppia Type 4 (stessa descrizione e data) + eventuale commissione
    this.transactions = this.transactions.filter(tr => {
      // La transazione stessa
      if (tr.ID === id) return false;

      // La controparte (Type 4, stessa descrizione e data, ID diverso)
      if (tr.Type === 4 && tr.Description === t.Description &&
          tr.Y === t.Y && tr.M === t.M && tr.D === t.D && tr.ID !== id) {
        return false;
      }

      // La commissione collegata (Type 0, "Commissioni", stessa data)
      if (tr.Type === 0 && tr.Category === "Commissioni" &&
          tr.Description === `Commissione ${t.Description}` &&
          tr.Y === t.Y && tr.M === t.M && tr.D === t.D) {
        return false;
      }

      return true;
    });

    this.sortAndReindex();
    this.update();
    return true;
  }

  // ======================== ABBONAMENTI ========================

  /**
   * Controlla e paga automaticamente gli abbonamenti attivi.
   * Se la data odierna è compresa tra start_date e end_date dell'abbonamento,
   * e non esiste già un pagamento per il mese corrente, aggiunge la transazione.
   *
   * Gestisce anche la logica split PayPal per abbonamenti.
   */
  paySubscriptions() {
    const now = new Date();
    const d = now.getDate();
    const m = now.getMonth() + 1; // getMonth() è 0-based
    const y = now.getFullYear();

    // Prima passata: aggiorna lo status di ogni abbonamento
    for (const [name, details] of Object.entries(this.subscriptions)) {
      const start = new Date(details.start_date);
      const end = new Date(details.end_date);
      const today = new Date(y, m - 1, d);

      if (today >= start && today <= end) {
        details.status = "active";
      } else {
        details.status = "expired";
      }
    }

    // Seconda passata: per ogni abbonamento attivo, verifica se serve un pagamento
    for (const [name, details] of Object.entries(this.subscriptions)) {
      if (details.status !== "active") continue;

      const amount = details.amount;
      const conto = details.conto;
      const startDate = new Date(details.start_date);

      // Controlla se esiste già un pagamento per questo mese.
      // NOTA: il controllo include anche la variante "+ Splitted" perché nel caso
      // di split PayPal la descrizione salvata è "Subscription X + Splitted", non
      // "Subscription X". Senza questo controllo, la transazione verrebbe aggiunta
      // ad ogni ricarica della pagina se il pagamento era stato splittato.
      const alreadyPaid = this.transactions.some(
        t => t.M === m && t.Y === y && (
          t.Description === `Subscription ${name}` ||
          t.Description === `Subscription ${name} + Splitted`
        )
      );

      // Se non è stato ancora pagato e siamo oltre il giorno di inizio
      if (!alreadyPaid && d >= startDate.getDate()) {
        let splitAmount = false;
        let amountPaypal = 0;
        let amountRemaining = 0;

        // Logica split PayPal per abbonamenti
        if (conto === "paypal") {
          const paypalBalance = this.saldoConti["paypal"] || 0;
          if (amount > paypalBalance) {
            splitAmount = true;
            amountPaypal = paypalBalance;
            amountRemaining = Math.round((amount - amountPaypal) * 100) / 100;
          }
        }

        if (splitAmount) {
          this.add(amountPaypal, "🔁 Abbonamenti", `Subscription ${name} + Splitted`, y, m, startDate.getDate(), conto, 0);
          this.add(amountRemaining, "🔁 Abbonamenti", `Subscription ${name} + Splitted`, y, m, startDate.getDate(), this.contiList[0], 0);
        } else {
          this.add(amount, "🔁 Abbonamenti", `Subscription ${name}`, y, m, startDate.getDate(), conto, 0);
        }

        this.update();
      }
    }
  }

  // ======================== FILTRAGGIO ========================

  /**
   * Restituisce una copia filtrata delle transazioni.
   * @param {Object} filters - Filtri da applicare
   * @param {string[]} [filters.categories] - Categorie selezionate
   * @param {string[]} [filters.accounts] - Conti selezionati
   * @param {Date} [filters.dateFrom] - Data inizio
   * @param {Date} [filters.dateTo] - Data fine
   * @returns {Object[]} Array di transazioni filtrate
   */
  filter(filters = {}) {
    let data = [...this.transactions];

    // Filtra per categorie selezionate
    if (filters.categories && filters.categories.length > 0) {
      let cats = [...filters.categories];
      const hasUscite = cats.includes("Uscite");
      const hasEntrate = cats.includes("Entrate");
      // Rimuovi i meta-filtri dalla lista categorie
      cats = cats.filter(c => c !== "Uscite" && c !== "Entrate");

      data = data.filter(t => {
        // Escludi saldi (Type 2, 3) e giroconti (Type 4) dai filtri Uscite/Entrate
        const isExcluded = t.Type === 2 || t.Type === 3 || t.Type === 4;
        // Match per categoria specifica
        if (cats.includes(t.Category)) return true;
        // Uscite: tutti i valori negativi, esclusi saldi e giroconti
        if (hasUscite && !isExcluded && t.Amount < 0) return true;
        // Entrate: tutti i valori positivi, esclusi saldi e giroconti
        if (hasEntrate && !isExcluded && t.Amount > 0) return true;
        return false;
      });
    }

    // Filtra per conti selezionati
    if (filters.accounts && filters.accounts.length > 0) {
      data = data.filter(t => filters.accounts.includes(t.Conto));
    }

    // Filtra per intervallo date
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      data = data.filter(t => {
        const tDate = new Date(t.Y, t.M - 1, t.D);
        return tDate >= from;
      });
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      data = data.filter(t => {
        const tDate = new Date(t.Y, t.M - 1, t.D);
        return tDate <= to;
      });
    }

    return data;
  }

  // ======================== IMPORT/EXPORT CSV ========================

  /**
   * Carica transazioni da una stringa CSV.
   * Il formato atteso: ID,Amount,Category,Description,Y,M,D,Conto,Type
   * @param {string} csvString - Contenuto del file CSV
   */
  importCSV(csvString) {
    const lines = csvString.trim().split("\n");
    if (lines.length < 2) return;

    // La prima riga è l'header
    const header = lines[0].split(",");
    this.transactions = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",");
      if (values.length < 9) continue;

      this.transactions.push({
        ID: parseInt(values[0]),
        Amount: parseFloat(values[1]),
        Category: values[2],
        Description: values[3],
        Y: parseInt(values[4]),
        M: parseInt(values[5]),
        D: parseInt(values[6]),
        Conto: values[7],
        Type: parseInt(values[8])
      });
    }

    this.sortAndReindex();
    this.update();
  }

  /**
   * Esporta le transazioni come stringa CSV.
   * @returns {string} Contenuto CSV
   */
  exportCSV() {
    let csv = "ID,Amount,Category,Description,Y,M,D,Conto,Type\n";
    for (const t of this.transactions) {
      csv += `${t.ID},${t.Amount},${t.Category},${t.Description},${t.Y},${t.M},${t.D},${t.Conto},${t.Type}\n`;
    }
    return csv;
  }

  // ======================== PERSISTENZA LOCALE ========================

  /**
   * Salva tutti i dati nel localStorage del browser.
   * Salviamo sia le transazioni che la configurazione (categorie, conti, abbonamenti, commissione).
   */
  save() {
    const data = {
      transactions: this.transactions,
      categories: this.categories,
      contiList: this.contiList,
      subscriptions: this.subscriptions,
      commission: this.commission
    };
    localStorage.setItem("wallet_data", JSON.stringify(data));
  }

  /**
   * Carica i dati dal localStorage.
   * Restituisce true se c'erano dati salvati, false altrimenti.
   * @returns {boolean}
   */
  load() {
    const raw = localStorage.getItem("wallet_data");
    if (!raw) return false;

    try {
      const data = JSON.parse(raw);
      this.transactions = data.transactions || [];
      this.categories = data.categories || this.categories;
      this.contiList = data.contiList || this.contiList;
      this.subscriptions = data.subscriptions || this.subscriptions;
      this.commission = data.commission || 0;
      this.update();
      return true;
    } catch (e) {
      console.error("Errore nel caricare i dati salvati:", e);
      return false;
    }
  }

  // ======================== UTILITY PER GRAFICI ========================

  /**
   * Calcola i dati per il grafico a barre per categoria.
   * Raggruppa per categoria, distingue entrate e uscite.
   * @param {Object[]} data - Array di transazioni (può essere filtrato)
   * @returns {Object} { labels, expenses, incomes }
   */
  static chartBarData(data) {
    // Mappa Type 2→0 (spesa) e Type 3→1 (entrata), esclude Type 4
    const mapped = data.filter(t => t.Type !== 4);

    // Calcola il netto per categoria (somma algebrica)
    const groups = {};
    for (const t of mapped) {
      if (!groups[t.Category]) groups[t.Category] = 0;
      groups[t.Category] += t.Amount;
    }

    const labels = Object.keys(groups);
    // Se il netto è negativo → spesa, se positivo → entrata
    const expenses = labels.map(l => groups[l] < 0 ? Math.abs(groups[l]) : 0);
    const incomes = labels.map(l => groups[l] > 0 ? groups[l] : 0);

    return { labels, expenses, incomes };
  }

  /**
   * Calcola i dati per il grafico a torta entrate/uscite.
   * @param {Object[]} data - Array di transazioni
   * @returns {Object} { totalIncome, totalExpense }
   */
  static chartPieIncomeExpense(data) {
    const mapped = data.filter(t => t.Type !== 4);

    // Calcola il netto per categoria, poi classifica come entrata/uscita
    const groups = {};
    for (const t of mapped) {
      if (!groups[t.Category]) groups[t.Category] = 0;
      groups[t.Category] += t.Amount;
    }

    let totalIncome = 0;
    let totalExpense = 0;
    for (const net of Object.values(groups)) {
      if (net >= 0) totalIncome += net;
      else totalExpense += Math.abs(net);
    }

    return { totalIncome, totalExpense };
  }

  /**
   * Calcola i dati per il grafico a torta per tutte le categorie.
   * Raggruppa le categorie con meno del 2% sotto "Altre".
   * @param {Object[]} data - Array di transazioni
   * @returns {Object} { labels, values, colors }
   */
  static chartPieCategories(data) {
    const mapped = data.filter(t => t.Type !== 4);
    const groups = {};
    for (const t of mapped) {
      if (!groups[t.Category]) groups[t.Category] = 0;
      groups[t.Category] += t.Amount; // somma algebrica (netto)
    }

    // Per la torta usiamo il valore assoluto del netto
    const total = Object.values(groups).reduce((s, v) => s + Math.abs(v), 0);

    // Colori predefiniti per le categorie (tab20c-style)
    const palette = [
      "#3182bd", "#6baed6", "#9ecae1", "#c6dbef",
      "#e6550d", "#fd8d3c", "#fdae6b", "#fdd0a2",
      "#31a354", "#74c476", "#a1d99b", "#c7e9c0",
      "#756bb1", "#9e9ac8", "#bcbddc", "#dadaeb",
      "#636363", "#969696", "#bdbdbd", "#d9d9d9"
    ];

    let labels = [];
    let values = [];
    let nets = [];
    let otherSum = 0;
    let otherNet = 0;

    // Soglia del 2%: categorie sotto questa soglia vengono raggruppate
    const threshold = total * 0.02;

    for (const [cat, val] of Object.entries(groups)) {
      const absVal = Math.abs(val);
      if (absVal < threshold) {
        otherSum += absVal;
        otherNet += val;
      } else {
        labels.push(cat);
        values.push(absVal);
        nets.push(val);
      }
    }

    if (otherSum > 0) {
      labels.push("Altre");
      values.push(otherSum);
      nets.push(otherNet);
    }

    // Genera colori: "Entrate" è verde, il resto segue la palette
    const colors = labels.map((l, idx) =>
      l === "Entrate" ? "#31a354" : palette[idx % palette.length]
    );

    return { labels, values, colors, nets };
  }

  /**
   * Calcola i dati per il grafico a torta per conto.
   * @param {Object[]} data - Array di transazioni
   * @returns {Object} { labels, values, colors }
   */
  static chartPieAccounts(data) {
    const groups = {};
    for (const t of data) {
      const conto = t.Conto || "N/A";
      if (!groups[conto]) groups[conto] = 0;
      groups[conto] += t.Amount; // somma algebrica (netto)
    }

    const palette = [
      "#3182bd", "#e6550d", "#31a354", "#756bb1",
      "#636363", "#6baed6", "#fd8d3c", "#74c476"
    ];

    const labels = Object.keys(groups);
    const nets = labels.map(l => groups[l]);
    const values = nets.map(n => Math.abs(n));
    const colors = labels.map((_, i) => palette[i % palette.length]);

    return { labels, values, colors, nets };
  }

  /**
   * Calcola i dati per il grafico time series (barre impilate per mese-anno).
   * @param {Object[]} data - Array di transazioni
   * @returns {Object} { labels, expenses, incomes }
   */
  static chartTimeSeries(data) {
    const mapped = data.filter(t => t.Type !== 4);

    // Calcola il netto per categoria per mese, poi classifica
    const catMonth = {};
    for (const t of mapped) {
      const key = `${t.Y}-${String(t.M).padStart(2, "0")}`;
      const catKey = `${key}|${t.Category}`;
      if (!catMonth[catKey]) catMonth[catKey] = { month: key, amount: 0 };
      catMonth[catKey].amount += t.Amount;
    }

    // Raggruppa per mese: netto positivo → income, netto negativo → expense
    const groups = {};
    for (const entry of Object.values(catMonth)) {
      if (!groups[entry.month]) groups[entry.month] = { expense: 0, income: 0 };
      if (entry.amount >= 0) {
        groups[entry.month].income += entry.amount;
      } else {
        groups[entry.month].expense += Math.abs(entry.amount);
      }
    }

    // Ordina le chiavi cronologicamente
    const sortedKeys = Object.keys(groups).sort();

    return {
      labels: sortedKeys,
      expenses: sortedKeys.map(k => groups[k].expense),
      incomes: sortedKeys.map(k => groups[k].income)
    };
  }

  /**
   * Calcola i totali per un sottoinsieme di transazioni (usato per i dati filtrati).
   * @param {Object[]} data - Array di transazioni
   * @returns {Object} { saldo, totalIncome, totalOutcome, count }
   */
  static computeSummary(data) {
    const income = data.filter(t => t.Type === 1).reduce((s, t) => s + t.Amount, 0);
    const outcome = data.filter(t => t.Type === 0).reduce((s, t) => s + t.Amount, 0);
    const initialIn = data.filter(t => t.Type === 3).reduce((s, t) => s + t.Amount, 0);
    const initialOut = data.filter(t => t.Type === 2).reduce((s, t) => s + t.Amount, 0);

    return {
      saldo: income + outcome + initialIn + initialOut,
      totalIncome: income + initialIn,
      totalOutcome: outcome + initialOut,
      count: data.length
    };
  }
}
