import streamlit as st
import os
from utils import *
import sys
from dotenv import load_dotenv
import json
import bcrypt

# Add the main directory to the system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from wallet import *
from login_page import *
from filtered_data_page import *


import yaml
from yaml.loader import SafeLoader

with open("../../config/config.yaml") as file:
    config_user = yaml.load(file, Loader=SafeLoader)

# Path Due livelli sopra (main repo)
repo_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ----------------------------- Check password -----------------------------
load_dotenv()

# Ottieni il dizionario come stringa JSON
password_list_json = os.getenv("USERS_DICT")
# Converti la stringa JSON in un dizionario Python
if password_list_json:
    USERS_DICT = json.loads(password_list_json)
else:
    USERS_DICT = {}


# Funzione per fare l'hash delle password
def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# Funzione per verificare la password
def verify_password(password, hashed_password):
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


# Hash delle password nel dizionario USERS_DICT
for user, password in USERS_DICT.items():
    USERS_DICT[user] = hash_password(password)

# Carica e visualizza un'immagine
st.set_page_config(
    page_title="Wallet App",
    page_icon=repo_path + config_user["path"]["ico_path"],
    layout="wide",
)

# Personalizzazione del tema
st.markdown(get_style(), unsafe_allow_html=True)


# Password input
def check_password():
    def password_entered():
        # Verifica la password inserita
        selected_user = None
        for user, hashed_password in USERS_DICT.items():
            if verify_password(st.session_state["password"], hashed_password):
                selected_user = user
                break

        if selected_user:
            st.session_state["selected_user"] = selected_user
            st.session_state["password_correct"] = True
            del st.session_state["password"]  # Non memorizzare la password
        else:
            st.session_state["password_correct"] = False

    if "password_correct" not in st.session_state:
        # Primo avvio, mostra il campo per la password
        st.text_input(
            "Password", type="password", on_change=password_entered, key="password"
        )
        st.sidebar.image(repo_path + config_user["path"]["ico_path"], width=50)
        return False
    elif not st.session_state["password_correct"]:
        # Password non corretta, mostra errore
        st.text_input(
            "Password", type="password", on_change=password_entered, key="password"
        )
        st.error("Password incorrect")
        st.sidebar.image(repo_path + config_user["path"]["ico_path"], width=50)
        return False
    else:
        # Password corretta
        return True


if check_password():
    # Leggi il file CSV
    if st.session_state["selected_user"] in config_user["credentials"]["usernames"]:
        user = config_user["credentials"]["usernames"][
            st.session_state["selected_user"]
        ]
    else:
        st.error("User not found in the configuration file.")
        st.stop()

    # Crea oggetto della classe Wallet
    wallet = Wallet(user=user)

    # Imposta il titolo dell'app
    st.title(f"Wallet App - {st.session_state['selected_user'].capitalize()}")

    # ----------------------------- Main Page -----------------------------
    # Sidebar per la navigazione
    with st.sidebar:
        st.sidebar.image(repo_path + config_user["path"]["ico_path"], width=50)
        if st.button("Logout"):
            st.session_state["password_correct"] = False
            st.session_state["selected_user"] = None
        page = st.selectbox("Select Page", ["Main", "Filtered Data"])

    # ----------------------------- Main Page -----------------------------
    if page == "Main":
        login_page(wallet)
    # ----------------------------- Filtered Data Page -----------------------------
    elif page == "Filtered Data":
        filtered_data_page(wallet)
