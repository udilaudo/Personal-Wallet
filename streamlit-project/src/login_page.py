import streamlit as st
import pandas as pd
import os
from datetime import datetime
from utils import *
import sys
import matplotlib.pyplot as plt
from dotenv import load_dotenv
import signal
import copy

# Add the main directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from wallet import *


def login_page(wallet: Wallet):
    st.sidebar.title("Menage Wallet")

    # Sidebar for user input
    with st.sidebar.expander("Add Transaction   💸"):
        transaction_type = st.selectbox("Transaction Type", ["Expense", "Income"])
        amount = st.number_input("Amount", min_value=0.0, format="%.2f")
        category = st.selectbox("Category", wallet.categories)
        description = st.text_input("Description")
        conto = st.selectbox("Account", wallet.conti_list)
        date = st.date_input("Date", datetime.now())

        if st.button("Add Transaction"):
            if transaction_type == "Expense":
                entry_type = 0
            else:
                entry_type = 1

            y, m, d = date.year, date.month, date.day

            # Write the new entry to the CSV file
            wallet.add(
                category=category,
                amount=amount,
                description=description,
                y=y,
                m=m,
                d=d,
                conto=conto,
                type=entry_type,
            )

            wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df["ID"] = range(0, len(wallet.df))
            wallet.df = wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df = wallet.df.reset_index(drop=True)

            # save the updated DataFrame to the CSV file
            wallet.df.to_csv(wallet.wallet_path, index=False)

            st.success("Transaction added successfully!")

    # add giroconto
    with st.sidebar.expander("Money Transfer   🔄"):
        account_from = st.selectbox("From", wallet.conti_list)

        # sposta il primo e il secondo elemento della lista
        conti_list = copy.deepcopy(wallet.conti_list)
        conti_list[0], conti_list[1] = conti_list[1], conti_list[0]

        account_to = st.selectbox("To", conti_list)
        giroconto_amount = st.number_input(
            "Transfer Amount", min_value=0.0, format="%.2f"
        )
        giroconto_date = st.date_input("Transfer Date", datetime.now())
        if st.button("Transfer"):
            wallet.giroconto(
                giroconto_amount,
                account_from,
                account_to,
                giroconto_date.year,
                giroconto_date.month,
                giroconto_date.day,
            )
            st.success("Giroconto added successfully!")
            wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df["ID"] = range(0, len(wallet.df))
            wallet.df = wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df = wallet.df.reset_index(drop=True)

            # save the updated DataFrame to the CSV file
            wallet.df.to_csv(wallet.wallet_path, index=False)

        # wallet.df = wallet.df.drop(columns=["ID"])
        # save the updated DataFrame to the CSV file

    # Display data
    st.header("Transaction Data   📊")
    # Display the data in a DataFrame
    if wallet.df is not None:
        wallet.df.sort_values(by=["Y", "M", "D", "Category", "Amount"], ascending=False)
        wallet.df["ID"] = range(0, len(wallet.df))
        wallet.df = wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        wallet.df = wallet.df.reset_index(drop=True)
        # save the updated DataFrame to the CSV file
        wallet.df.to_csv(wallet.wallet_path, index=False)
        # toglio la colonna ID
        # fai una copia del df
        df_to_show = wallet.df.copy()
        df_to_show = df_to_show.drop(columns=["ID"])

        # cambia formato di data
        df_to_show["Date"] = pd.to_datetime(
            dict(year=df_to_show["Y"], month=df_to_show["M"], day=df_to_show["D"])
        ).dt.date
        df_to_show = df_to_show.drop(columns=["Y", "M", "D"])
        cols = list(df_to_show.columns)
        # rimuovo temporaneamente 'date'
        cols.remove("Date")
        # inserisco 'date' in terzultima posizione
        cols.insert(-2, "Date")
        df_to_show = df_to_show[cols]

        st.write(
            df_to_show.style.apply(highlight_rows, axis=1).format({"Amount": "{:.2f}"})
        )
        # st.dataframe(wallet.df)

    show_amounts(wallet=wallet)

    with st.expander("Visualizations   📈"):
        if st.button("Bar Plot by Categories 📊"):
            fig = wallet.plot(show=False)
            st.pyplot(fig)
        if st.button("Pie Income/Expenses 🍰"):
            fig = wallet.plot_pie(show=False)
            st.pyplot(fig)
        if st.button("Pie by Categories 🍰"):
            fig = wallet.plot_pie_with_all_categories(show=False)
            st.pyplot(fig)
        if st.button("Pie by Account 🍰"):
            fig = wallet.plot_pie_conto(show=False)
            st.pyplot(fig)
        if st.button("Time Series 📈"):
            fig = wallet.plot_time(show=False)
            st.pyplot(fig)
            # ----------------------------------------------------------

    # delete a transiction
    with st.sidebar.expander("Delete Transaction   🗑️"):
        transaction_id = st.number_input("Transaction ID", min_value=0)
        if st.button("Delete Transaction"):
            wallet.delete(transaction_id)
            wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df["ID"] = range(0, len(wallet.df))
            wallet.df = wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df = wallet.df.reset_index(drop=True)
            # save the updated DataFrame to the CSV file
            wallet.df.to_csv(wallet.wallet_path, index=False)

            st.success("Transaction deleted successfully!")

            # scrivi di riavviare l'app per vedere i cambiamenti
            st.write("Please restart the app to see the changes.")

    with st.sidebar.expander("Edit Transaction ✏️"):
        transaction_id = st.number_input("Transaction ID to edit", min_value=0)
        transaction_type = st.selectbox("New Transaction Type", ["Expense", "Income"])
        amount = st.number_input("New Amount", min_value=0.0, format="%.2f")
        category = st.selectbox("New Category", wallet.categories)
        description = st.text_input("New Description")
        conto = st.selectbox("New Account", wallet.conti_list)
        date = st.date_input("New Date", datetime.now())
        if st.button("Edit Transaction"):
            if transaction_type == "Expense":
                entry_type = 0
            else:
                entry_type = 1
            wallet.edit_transaction(
                index=transaction_id,
                amount=amount,
                category=category,
                description=description,
                conto=conto,
                type=entry_type,
                y=date.year,
                m=date.month,
                d=date.day,
            )
            wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df["ID"] = range(0, len(wallet.df))
            wallet.df = wallet.df.sort_values(
                by=["Y", "M", "D", "Category", "Amount"], ascending=False
            )
            wallet.df = wallet.df.reset_index(drop=True)
            # save the updated DataFrame to the CSV file
            wallet.df.to_csv(wallet.wallet_path, index=False)

            st.success("Transaction edited successfully!")

    # Show available accounts
    for conto in wallet.saldo_conti.keys():
        saldo = wallet.saldo_conti[conto]
        st.sidebar.write(f"Available {conto.capitalize()}: {round(saldo,2)} €")
