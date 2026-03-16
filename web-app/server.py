"""
Flask backend for Wallet web-app.
Saves transactions to CSV and config/investments to JSON.

Usage:
    cd web-app
    python server.py
"""

from flask import Flask, request, jsonify, send_from_directory
import csv
import json
import os
import io
import re
import requests

app = Flask(__name__, static_folder=".")

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TRANSACTIONS_CSV = os.path.join(DATA_DIR, "transactions.csv")
CONFIG_JSON = os.path.join(DATA_DIR, "config.json")
INVESTMENTS_JSON = os.path.join(DATA_DIR, "investments.json")
# I conti deposito vengono salvati separatamente per chiarezza
DEPOSITS_JSON = os.path.join(DATA_DIR, "deposits.json")

CSV_FIELDS = ["ID", "Amount", "Category", "Description", "Y", "M", "D", "Conto", "Type"]


# ======================== STATIC FILES ========================


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_files(path):
    # Block access to data directory and server.py from browser
    if path.startswith("data/") or path == "server.py":
        return "Not found", 404
    return send_from_directory(".", path)


# ======================== API ========================


@app.route("/api/load", methods=["GET"])
def api_load():
    result = {
        "transactions": [],
        "categories": None,
        "contiList": None,
        "subscriptions": None,
        "commission": 0,
        "investments": [],
        "depositAccounts": [],   # conti deposito (vincolati/liberi)
        "budgets": {},           # budget mensili per categoria { "categoria": importo_eur }
        "totalBudget": 0,        # budget mensile globale (0 = non impostato)
    }

    # Load transactions from CSV
    if os.path.exists(TRANSACTIONS_CSV):
        with open(TRANSACTIONS_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Salta righe vuote (es. trailing newline nel CSV)
                if not row.get("ID") or not row.get("Amount"):
                    continue

                conto = row.get("Conto", "")
                if conto in ("", "None", "null"):
                    conto = None

                try:
                    result["transactions"].append(
                        {
                            "ID": int(row["ID"]),
                            "Amount": float(row["Amount"]),
                            "Category": row["Category"],
                            "Description": row["Description"],
                            "Y": int(row["Y"]),
                            "M": int(row["M"]),
                            "D": int(row["D"]),
                            "Conto": conto,
                            "Type": int(row["Type"]),
                        }
                    )
                except (ValueError, KeyError) as e:
                    # Stampa la riga problematica e l'errore senza bloccare il caricamento
                    print(f"[WARN] Riga CSV ignorata — errore: {e}")
                    print(f"[WARN] Riga: {dict(row)}")

    # Load config from JSON
    if os.path.exists(CONFIG_JSON):
        with open(CONFIG_JSON, "r", encoding="utf-8") as f:
            config = json.load(f)
            result["categories"] = config.get("categories")
            result["contiList"] = config.get("contiList")
            result["subscriptions"] = config.get("subscriptions")
            result["commission"] = config.get("commission", 0)
            # Carica i budget mensili per categoria (dizionario { "cat": importo })
            result["budgets"] = config.get("budgets", {})
            # Carica il budget mensile totale (numero, 0 = non impostato)
            result["totalBudget"] = config.get("totalBudget", 0)

    # Load investments from JSON
    if os.path.exists(INVESTMENTS_JSON):
        with open(INVESTMENTS_JSON, "r", encoding="utf-8") as f:
            result["investments"] = json.load(f)

    # Load deposit accounts from JSON
    if os.path.exists(DEPOSITS_JSON):
        with open(DEPOSITS_JSON, "r", encoding="utf-8") as f:
            result["depositAccounts"] = json.load(f)

    return jsonify(result)


@app.route("/api/save", methods=["POST"])
def api_save():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400

    # Save transactions to CSV
    transactions = data.get("transactions", [])
    with open(TRANSACTIONS_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for t in transactions:
            writer.writerow(
                {
                    "ID": t["ID"],
                    "Amount": t["Amount"],
                    "Category": t["Category"],
                    "Description": t["Description"],
                    "Y": t["Y"],
                    "M": t["M"],
                    "D": t["D"],
                    "Conto": t.get("Conto") or "",
                    "Type": t["Type"],
                }
            )

    # Save config to JSON (include anche i budget mensili)
    config = {
        "categories": data.get("categories", []),
        "contiList": data.get("contiList", []),
        "subscriptions": data.get("subscriptions", {}),
        "commission": data.get("commission", 0),
        "budgets": data.get("budgets", {}),
        "totalBudget": data.get("totalBudget", 0),
    }
    with open(CONFIG_JSON, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    # Save investments to JSON
    investments = data.get("investments", [])
    with open(INVESTMENTS_JSON, "w", encoding="utf-8") as f:
        json.dump(investments, f, indent=2, ensure_ascii=False)

    # Save deposit accounts to JSON (file separato: data/deposits.json)
    deposit_accounts = data.get("depositAccounts", [])
    with open(DEPOSITS_JSON, "w", encoding="utf-8") as f:
        json.dump(deposit_accounts, f, indent=2, ensure_ascii=False)

    return jsonify({"status": "ok"})


# ======================== PRICE FETCHING ========================

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"
BORSA_ITALIANA_BASE = "https://www.borsaitaliana.it/borsa/obbligazioni/mot/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


def fetch_yahoo(ticker):
    """Fetch current price from Yahoo Finance API."""
    url = f"{YAHOO_BASE}{ticker}?range=1d&interval=1d"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    result = data.get("chart", {}).get("result", [])
    if not result:
        return None
    meta = result[0].get("meta", {})
    price = meta.get("regularMarketPrice")
    currency = meta.get("currency", "EUR")
    if price is None:
        return None
    return {"price": price, "currency": currency, "source": "yahoo"}


BORSA_ITALIANA_BOND_TYPES = ["btp", "bot", "cct", "altri"]


def fetch_borsa_italiana(isin):
    """Fetch bond price from Borsa Italiana (public page). Tries BTP, BOT, CCT, altri."""
    for bond_type in BORSA_ITALIANA_BOND_TYPES:
        url = f"{BORSA_ITALIANA_BASE}{bond_type}/scheda/{isin}.html?lang=it"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            continue
        # Price is inside: <span class="... -formatPrice"><strong>107,64</strong></span>
        match = re.search(r"-formatPrice[^>]*>\s*<strong>([^<]+)</strong>", resp.text)
        if match:
            price_raw = match.group(1).strip()
            # Italian format: 1.234,56 → remove dots, replace comma with dot
            price = float(price_raw.replace(".", "").replace(",", "."))
            return {"price": price, "currency": "EUR", "source": f"borsaitaliana/{bond_type}"}
    return None


@app.route("/api/fetch-price", methods=["GET"])
def api_fetch_price():
    """Fetch current price. Cascade: Yahoo (ticker) → Borsa Italiana (ISIN)."""
    ticker = request.args.get("ticker", "").strip()
    isin = request.args.get("isin", "").strip()

    # 1. Try Yahoo Finance if ticker is available
    if ticker:
        try:
            result = fetch_yahoo(ticker)
            if result:
                return jsonify(result)
        except Exception as e:
            print(f"Yahoo failed for {ticker}: {e}")

    # 2. Try Borsa Italiana if ISIN is available (BTP, BOT, CCT, etc.)
    if isin:
        try:
            result = fetch_borsa_italiana(isin)
            if result:
                return jsonify(result)
        except Exception as e:
            print(f"Borsa Italiana failed for {isin}: {e}")

    return jsonify({"error": "Could not fetch price from any source"}), 404


@app.route("/api/price-history", methods=["GET"])
def api_price_history():
    """Fetch price history from Yahoo Finance (only works with ticker)."""
    ticker = request.args.get("ticker", "").strip()
    range_ = request.args.get("range", "1y")

    if not ticker:
        return jsonify({"error": "Ticker required for price history"}), 400

    interval_map = {
        "1mo": "1d", "3mo": "1d", "6mo": "1wk",
        "1y": "1wk", "5y": "1mo", "max": "1mo"
    }
    interval = interval_map.get(range_, "1wk")

    try:
        url = f"{YAHOO_BASE}{ticker}?range={range_}&interval={interval}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return jsonify({"error": "No data"}), 404

        timestamps = result[0].get("timestamp", [])
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        currency = result[0].get("meta", {}).get("currency", "EUR")

        # Filter out null values
        valid_ts = []
        valid_prices = []
        for ts, price in zip(timestamps, closes):
            if price is not None:
                valid_ts.append(ts)
                valid_prices.append(price)

        return jsonify({
            "timestamps": valid_ts,
            "prices": valid_prices,
            "currency": currency
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ======================== MAIN ========================

if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"Data directory: {DATA_DIR}")
    print(f"Open http://localhost:5001 in your browser")
    # debug=False: disabilita la console interattiva di Werkzeug in caso di errore,
    # che permetterebbe l'esecuzione di codice arbitrario sul server.
    app.run(debug=False, port=8501, host="127.0.0.1")
