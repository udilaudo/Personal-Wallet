import streamlit as st
import pandas as pd
import os
from datetime import datetime
from utils import *
import sys
import matplotlib.pyplot as plt
from dotenv import load_dotenv

# Add the main directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from wallet import *


def filtered_data_page(wallet):
    st.sidebar.title("Filter your data")
    # Display data
    # Filtering options
    with st.sidebar.expander("Filter Data    🕵️‍♂️"):
        categories = wallet.df["Category"].unique().tolist()
        # riordinare le categorie mettendo "Entrate" in fondo
        categories = (
            [x for x in categories if x != "Entrate"] + ["Uscite"] + ["Entrate"]
        )
        selected_category = st.multiselect("Category", options=categories)
        selected_account = st.multiselect(
            "Account", options=wallet.df["Conto"].unique()
        )
        selected_date_range = st.date_input(
            "Date Range",
            [datetime.now() - pd.DateOffset(months=1), datetime.now()],
        )
    # copia il wallet
    wallet_filtered = Wallet(user=wallet.user)
    # wallet_filtered.read_df(wallet.df)

    # Apply filters
    # filtered_df = wallet.df.copy()
    # filtered_df = wallet_filtered.df
    # Convert Y, M, D columns to a single datetime column
    wallet_filtered.df["Date"] = pd.to_datetime(
        wallet_filtered.df[["Y", "M", "D"]].rename(
            columns={"Y": "year", "M": "month", "D": "day"}
        ),
        errors="coerce",  # Ignora le date non valide
    )

    if selected_category:
        if "Uscite" in selected_category:
            selected_category.remove("Uscite")
            uscita_categories = [
                cat
                for cat in categories
                if cat != "Entrate"
                and cat != "Uscite"
                and cat != "Giroconto"
                and cat != "Saldo"
            ]
            selected_category.extend(uscita_categories)
        wallet_filtered.df = wallet_filtered.df[
            wallet_filtered.df["Category"].isin(selected_category)
        ]
    if selected_account:
        wallet_filtered.df = wallet_filtered.df[
            wallet_filtered.df["Conto"].isin(selected_account)
        ]
    if selected_date_range:
        start_date, end_date = selected_date_range
        wallet_filtered.df = wallet_filtered.df[
            (wallet_filtered.df["Date"] >= pd.to_datetime(start_date))
            & (wallet_filtered.df["Date"] <= pd.to_datetime(end_date))
        ]

    # Display the filtered data in a DataFrame with conditional formatting
    st.header("Filtered Data   📊")
    if not wallet_filtered.df.empty:
        wallet_filtered.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        wallet_filtered.df["ID"] = range(0, len(wallet_filtered.df))
        wallet_filtered.df = wallet_filtered.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        wallet_filtered.df = wallet_filtered.df.reset_index(drop=True)
        # Togli la colonna ID, fai una copia del df
        df_to_show = wallet_filtered.df.copy()
        df_to_show = df_to_show.drop(columns=["ID"])

        df_to_show = df_to_show.drop(columns=["Y", "M", "D"])
        cols = list(df_to_show.columns)
        # rimuovo temporaneamente 'date'
        cols.remove("Date")
        # inserisco 'date' in terzultima posizione
        cols.insert(-2, "Date")
        df_to_show = df_to_show[cols]
        df_to_show["Date"] = df_to_show["Date"].dt.date

        st.write(
            df_to_show.style.apply(highlight_rows, axis=1).format({"Amount": "{:.2f}"})
        )
    else:
        st.write("No data available for the selected filters.")

    # -----------------------------------------------------------
    # Update wallet amounts
    wallet_filtered.update_wallet()
    show_amounts(wallet=wallet_filtered)

    # Visualizations
    with st.expander("Visualizations   📈"):
        if st.button("Bar Plot by Categories 📊"):
            fig = wallet_filtered.plot(show=False)
            st.pyplot(fig)
        if st.button("Pie Income/Expenses 🍰"):
            fig = wallet_filtered.plot_pie(show=False)
            st.pyplot(fig)
        if st.button("Pie by Categories 🍰"):
            fig = wallet_filtered.plot_pie_with_all_categories(show=False)
            st.pyplot(fig)
        if st.button("Pie by Account 🍰"):
            fig = wallet_filtered.plot_pie_conto(show=False)
            st.pyplot(fig)
        if st.button("Time Series 📈"):
            fig = wallet_filtered.plot_time(show=False)
            st.pyplot(fig)

    for conto in wallet.saldo_conti.keys():
        saldo = wallet.saldo_conti[conto]
        st.sidebar.write(f"Available {conto.capitalize()}: {round(saldo,2)} €")
