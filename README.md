# Personal Wallet Manager

A personal finance management application with multiple interfaces: a web app, a desktop GUI, a Streamlit web interface, and a Telegram bot.

## Web App (HTML / JS / CSS + Flask Backend)

The main interface of the project is a **Single Page Application** built with HTML, CSS, and vanilla JavaScript, served by a **Flask** (Python) backend.

### Key Features

- **Dashboard** — Full overview with summary cards (total balance, income, expenses, transaction count), per-account balances with pie chart, transactions table with inline actions (edit, delete), and monthly pivot table with heatmap
- **Analytics** — Filtered analysis page with quick date presets (this month, last 2/3/6 months, this year, all time), category and account filters via selectable chips, filtered table and charts
- **Investments** — Portfolio management (ETF, BTP, stocks, funds, bonds, crypto) with automatic price fetching from Yahoo Finance and Borsa Italiana, historical price charts with range selector (1M, 3M, 6M, 1Y, 5Y, MAX), and P&L tracking
- **Settings** — Recurring subscriptions management, categories, accounts, transfer commissions, and CSV import/export
- **Light/Dark Theme** — Toggle with saved preference
- **Responsive** — Adaptive layout for desktop and mobile with hamburger navigation

### Interactive Charts (Chart.js)

- Pie/Doughnut charts for categories, income vs expense, accounts, portfolio allocation
- Bar charts for categories and monthly timeline (stacked)
- Line chart for investment price history with purchase price reference line
- Toggle to exclude the "Saldo" category from charts

### Flask Backend (`server.py`)

- Serves the web app static files
- REST API for saving/loading data (transactions as CSV, config and investments as JSON)
- Price fetching proxy for **Yahoo Finance** (by ticker) and **Borsa Italiana** (by ISIN for BTP, BOT, CCT)
- Price history API with configurable intervals

### Tech Stack

- **Frontend**: HTML5, CSS3 (custom properties, dark mode, responsive), vanilla JavaScript
- **Backend**: Python / Flask
- **Frontend Libraries**: Chart.js (charts), Lucide (icons), Google Fonts (Inter)
- **Persistence**: localStorage (frontend) + CSV/JSON (backend), with automatic sync
- **Financial Data**: Yahoo Finance API, Borsa Italiana scraping

### How to Run

```bash
cd web-app
python server.py
```

Open your browser at `http://localhost:8501`

### File Structure

- `index.html` — HTML structure of the SPA (dashboard, analytics, investments, settings, modals)
- `app.js` — UI logic, navigation, bindings, charts, investment management, and backend sync
- `wallet.js` — `Wallet` class with financial logic (transactions, filters, calculations, import/export)
- `style.css` — Complete design system with CSS variables, dark mode, responsive layout
- `server.py` — Flask backend with REST API and financial data proxy

---

## Other Interfaces

### Web Interface (Streamlit)

Alternative web interface built with Streamlit.

- **`streamlit-project/src/app_auth.py`** — Version with login (username + password)
- **`streamlit-project/src/app.py`** — Version without authentication
- **`streamlit-project/src/app_with_password.py`** — Version with password-only authentication
- **`streamlit-project/src/login_page.py`** — Login handling
- **`streamlit-project/src/filtered_data_page.py`** — Filtered data visualization

```bash
streamlit run streamlit-project/src/app_auth.py
```

### Telegram Bot

Telegram bot to add expenses and check reports directly from chat.

```bash
python telebot.py
```

### GUI (Desktop)

Desktop graphical interface for wallet management.

```bash
python main.py
```

## Supporting Files

- **`config.py`** — User configuration dictionaries
- **`wallet.py`** — Python `Wallet` class with expense management functions
- **`GUI.py`** — Functions and interface for the desktop GUI
- **`main.py`** — Entry point for the GUI
- **`telebot.py`** — Telegram bot implementation
