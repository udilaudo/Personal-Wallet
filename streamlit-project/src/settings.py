import streamlit as st
import pandas as pd
import os
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from utils import *
import sys
import matplotlib.pyplot as plt
from dotenv import load_dotenv
import signal
import copy

# Add the main directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from wallet import *


def settings(wallet: Wallet):
    config_user = wallet.user

    with st.sidebar.expander("List active subsctiptions", expanded=False):

        # metti in ordina, prima gli attivi, poi gli inattivi
        active_subscriptions = [
            sub
            for sub, details in config_user["subscriptions"].items()
            if details["status"] == "active"
        ]
        inactive_subscriptions = [
            sub
            for sub, details in config_user["subscriptions"].items()
            if details["status"] != "active"
        ]
        all_subscriptions = active_subscriptions + inactive_subscriptions
        for subscription in all_subscriptions:
            details = config_user["subscriptions"][subscription]
            if details["status"] == "active":
                st.markdown(
                    f"<span style='color:green;'>Subscription: {subscription}</span>",
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    f"<span style='color:red;'>Subscription: {subscription}</span>",
                    unsafe_allow_html=True,
                )
            st.write(f"Start date: {details['start_date']}")
            st.write(f"End date: {details['end_date']}")
            st.write(f"Amount: {details['amount']}")
            st.write(f"Account: {details['conto']}")
            # scrivi in verde se la subscription è attiva
            if details["status"] == "active":
                st.markdown(
                    f"<span style='color:green;'>Status: {details['status']}</span>",
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    f"<span style='color:red;'>Status: {details['status']}</span>",
                    unsafe_allow_html=True,
                )
            st.write("---")

    with st.expander("Categories 🗂️", expanded=False):
        st.markdown(
            "Manage your categories. You can add or remove categories for your transactions."
        )
        # Aggiungi un form per aggiungere nuove categorie
        with st.form(key="add_category_form"):
            new_category = st.text_input("Add a new category 🗂️")
            new_category = new_category.strip()
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Add Category")
            if submit_button:
                if new_category:
                    # Controlla se la categoria esiste già
                    if new_category in config_user["categories_list"]:
                        st.warning("Category already exists.")
                    else:
                        # Aggiungi la nuova categoria alla lista
                        config_user["categories_list"].append(new_category)
                        st.success(f"Category '{new_category}' added successfully!")
                else:
                    st.error("Please enter a valid category name.")
        # Aggiungi un form per rimuovere categorie
        with st.form(key="remove_category_form"):
            remove_category = st.selectbox(
                "Select a category to remove 🗑️",
                config_user["categories_list"],
            )
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Remove Category")
            if submit_button:
                # Controlla se la categoria esiste già
                if remove_category:
                    # Rimuovi la categoria dalla lista
                    config_user["categories_list"].remove(remove_category)
                    st.success(f"Category '{remove_category}' removed successfully!")
                else:
                    st.error("Please select a valid category name.")

    with st.expander("Manage Accounts 💳", expanded=False):
        st.markdown(
            "Manage your accounts. You can add or remove accounts for your transactions."
        )
        # Aggiungi un form per aggiungere nuovi conti
        with st.form(key="add_account_form"):
            new_account = st.text_input("Add a new account 💳")
            new_account = new_account.strip()
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Add Account")
            if submit_button:
                if new_account:
                    # Controlla se il conto esiste già
                    if new_account in config_user["conti_list"]:
                        st.warning("Account already exists.")
                    else:
                        # Aggiungi il nuovo conto alla lista
                        config_user["conti_list"].append(new_account)
                        st.success(f"Account '{new_account}' added successfully!")
                else:
                    st.error("Please enter a valid account name.")
        # Aggiungi un form per rimuovere conti
        with st.form(key="remove_account_form"):
            remove_account = st.selectbox(
                "Select an account to remove 🗑️",
                config_user["conti_list"],
            )
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Remove Account")
            if submit_button:
                # Controlla se il conto esiste già
                if remove_account:
                    # Rimuovi il conto dalla lista
                    config_user["conti_list"].remove(remove_account)
                    st.success(f"Account '{remove_account}' removed successfully!")
                else:
                    st.error("Please select a valid account name.")

    with st.expander("Subscriptions 📅", expanded=False):
        st.markdown(
            "Manage your subscriptions. You can add or remove subscriptions for your transactions."
        )
        # Aggiungi subscription
        with st.form(key="subscription_form"):
            # scegli sub_name, end_date, start_date,amount, conto
            subscription_name = st.text_input("Add a new subscription 🗂️")
            subscription_name = subscription_name.strip()
            start_date = st.date_input("Start date", datetime.today())
            duration = st.number_input(
                "Duration in months", min_value=1, max_value=36, value=1
            )
            end_date = start_date + relativedelta(months=duration)
            amount = st.number_input(
                "Amount", min_value=0.0, max_value=10000.0, step=0.5
            )
            account = st.selectbox(
                "Select an account",
                config_user["conti_list"],
            )
            sub_dict = {
                subscription_name: {
                    "start_date": start_date,
                    "end_date": end_date,
                    "amount": amount,
                    "conto": account,
                    "status": "active",
                }
            }
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Add Subscription")
            if submit_button:
                if subscription_name:
                    # Controlla se la subscription esiste già
                    if subscription_name in config_user["subscriptions"]:
                        st.warning("Subscription already exists.")
                    else:
                        # Aggiungi la nuova subscription alla lista
                        config_user["subscriptions"].update(sub_dict)
                        st.success(
                            f"Subscription '{subscription_name}' added successfully!"
                        )
                else:
                    st.error("Please enter a valid subscription name.")

        # rimuovi subscription
        with st.form(key="remove_subscription_form"):
            remove_subscription = st.selectbox(
                "Select a subscription to remove 🗑️",
                config_user["subscriptions"],
            )
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Remove Subscription")
            if submit_button:
                # Controlla se la subscription esiste già
                if remove_subscription:
                    # Rimuovi la subscription dalla lista
                    del config_user["subscriptions"][remove_subscription]
                    st.success(
                        f"Subscription '{remove_subscription}' removed successfully!"
                    )
                else:
                    st.error("Please select a valid subscription name.")

            # Bottone per rendere inattiva la subscription
            expired_botton = st.form_submit_button(
                "Make inactive subscription", help="Make inactive subscription"
            )
            if expired_botton:
                # Controlla se la subscription esiste già
                if remove_subscription:
                    # Rendi inattiva la subscription
                    config_user["subscriptions"][remove_subscription][
                        "status"
                    ] = "expired"
                    # Cambia la data di fine
                    config_user["subscriptions"][remove_subscription][
                        "end_date"
                    ] = datetime.now().date() - timedelta(days=1)
                    st.success(
                        f"Subscription '{remove_subscription}' made inactive successfully!"
                    )
                else:
                    st.error("Please select a valid subscription name.")

    # Cambia la commissione
    with st.expander("Money Transfer Commission 💸", expanded=False):
        # scrivi il valore attuale
        st.write(
            f"Current commission for money transfer: {config_user['commission']} €"
        )

        # Inserisci la commission per il money transfer
        with st.form(key="commission_form"):
            commission = st.number_input(
                "Insert the commission for money transfer 💸",
                min_value=0.0,
                max_value=1000.0,
                step=0.5,
                format="%.2f",
            )
            # Usa form_submit_button invece di st.button
            submit_button = st.form_submit_button("Save Commission")
            if submit_button:
                # Salva la commissione nel file di configurazione
                config_user["commission"] = commission
                st.success(f"Commission saved successfully! {commission}")
