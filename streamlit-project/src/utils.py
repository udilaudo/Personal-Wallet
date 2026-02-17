import sys
import os
import streamlit as st

# Add the main directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from wallet import *


def show_amounts(wallet: Wallet):
    # Amount totals
    total_income = wallet.income + wallet.inital_saldo_in
    total_outcome = wallet.outcome + wallet.inital_saldo_out
    start_date = wallet.start_date
    end_date = wallet.end_date
    saldo = wallet.saldo
    start_date_formatted = f"{start_date[0]}/{start_date[1]}"
    end_date_formatted = f"{end_date[0]}/{end_date[1]}"

    st.write(f"# Total Amount: {round(saldo,2)} €")
    st.write(f"### Total Income: {round(total_income,2)} €")
    st.write(f"### Total Expenses: {round(total_outcome,2)} €")
    st.markdown(f"Date: from **{start_date_formatted}** to **{end_date_formatted}**")
    st.write(f"Total Transactions: {len(wallet.df)}")


def show_amounts_from_df(df):
    outcome = df[df["Type"] == 0]["Amount"].sum()  # sono negativi
    income = df[df["Type"] == 1]["Amount"].sum()
    inital_saldo_out = df[(df["Type"] == 2)]["Amount"].sum()  # sono negativi
    inital_saldo_in = df[(df["Type"] == 3)]["Amount"].sum()
    amount = income + outcome + inital_saldo_in + inital_saldo_out
    total_income = income + inital_saldo_in
    total_outcome = outcome + inital_saldo_out
    start_date = (
        df["Y"].min(),
        df[df["Y"] == df["Y"].min()]["M"].min(),
    )
    end_date = (
        df["Y"].max(),
        df[df["Y"] == df["Y"].max()]["M"].max(),
    )
    st.write(f"# Total Amount: {round(amount,2)} €")
    st.write(f"## Total Income: {round(total_income,2)} €")
    st.write(f"## Total Expenses: {round(total_outcome,2)} €")
    st.write(f"Date: {start_date} - {end_date}")


# Define a function to apply conditional formatting
def highlight_rows(row):
    return [
        (
            "background-color: #b3ffb3"  # Verde più chiaro
            if row["Type"] == 1 or row["Type"] == 3
            else (
                "background-color: #ffcc99"  # Arancione chiaro
                if row["Type"] == 4
                else ""
            )
        )
        for _ in row
    ]


def get_style():
    return """
    <style>
    .stApp {
        background-color: #f8f6fb;
        color: #3a3a3a;
        font-family: 'Segoe UI', sans-serif;
    }

    .stSidebar {
        background-color: #eae4f2;
        border-right: 1px solid #cbbbe2;
    }

    .stButton>button {
        background-color: #d8c4f0;
        color: 3a3a3a;
        border: 3a3a3a;
        padding: 0.4em 1.2em;
        border-radius: 8px;
        font-weight: 500;
        transition: background-color 0.3s ease, transform 0.2s ease;
    }

    .stButton>button:hover {
        background-color: #e6d8f7;
        transform: scale(1.06);
    }

    /* Etichette */
    .css-1cpxqw2,
    .css-16huue1,
    .css-10trblm,
    label {
        color: #4b3f57 !important;
    }

    /* Input */
    .stTextInput input,
    .stNumberInput input,
    .stSelectbox div[data-baseweb="select"],
    .stDateInput input {
        background-color: #ffffff !important;
        color: #4b3f57 !important;
        border: 1px solid #d6c9eb !important;
        border-radius: 8px;
        padding: 0.4em; /* spazio nei bottoni ma crea problemi quando inserisci i soldi */
        box-shadow: none !important;
    }

    .stTextInput, .stNumberInput, .stSelectbox, .stDateInput {
        box-shadow: none !important;
    }

    /* Spaziatura compatta */
    div[data-testid="stVerticalBlock"] > div {
        margin-bottom: 0.0rem !important;
    }

    /* Titoli */
    h1, h2, h3, h4 {
        color: #5a4473;
        font-weight: 600;
    }

    /* Expander */
    details > summary {
        background-color: #f2ecf9 !important;
        border: 1px solid #cbbbe2 !important;
        color: #4b3f57 !important;
        border-radius: 6px;
        padding: 0.75rem 1rem;
        font-weight: 600;
        list-style: none;
        transition: all 0.3s ease;
        cursor: pointer;
    }

    details[open] > div {
        background-color: none !important;
        border-top: none !important;
        border-radius: 0 0 6px 6px;
        padding: 1rem;
        margin-bottom: 1rem;
    }

    header {visibility: hidden;}

    .block-container {
        padding-top: 0rem; /* Rimuove il padding superiore */
    }

    </style>
    """
