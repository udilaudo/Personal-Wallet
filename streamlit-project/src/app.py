import pandas as pd
from utils import *
from wallet import *
from login_page import *
from filtered_data_page import *
from settings import *
import streamlit as st
import streamlit_authenticator as stauth
import yaml
from yaml.loader import SafeLoader

with open("../../config/config.yaml") as file:
    config_user = yaml.load(file, Loader=SafeLoader)

# Path Due livelli sopra (main repo)
repo_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# Set the title of the app
st.set_page_config(
    page_title="Wallet App",
    page_icon=repo_path + config_user["path"]["ico_path"],
    layout="wide",
)

# ------------------------ Theme -----------------------------

# Personalizzazione del tema
st.markdown(get_style(), unsafe_allow_html=True)


# Controlla lo stato della pagina
if "page" not in st.session_state:
    st.session_state["page"] = "main"  # Imposta la pagina predefinita


st.sidebar.image(repo_path + config_user["path"]["ico_path"], width=50)

user_name = "umberto"
user = config_user["credentials"]["usernames"][user_name]

# crea oggetto della classe Wallet
wallet = Wallet(user=user)

# ----------------------------- Main Page -----------------------------
if st.session_state["page"] == "main":
    # Simula una barra superiore con colonne
    col1, col2 = st.columns([8, 2])  # Colonne con proporzioni 8:2

    with col1:
        st.markdown("### 👨‍💻 Track your money")  # Titolo o icona

    with col2:
        # bottone per passare alla pagina di impostazioni
        if st.button(
            "⚙️ Settings",
            key="settings_button",
            help="Change categories or accounts list",
        ):
            st.session_state["page"] = "settings"  # Cambia lo stato della pagina

    # st.title(f"Wallet App - {st.session_state.get("name").capitalize()}")
    st.session_state["name"] = user_name
    st.title(f"Wallet App - {st.session_state.get('name').capitalize()}")

    with st.sidebar:
        # st.sidebar.image(config["ico_path"], width=50)
        page = st.selectbox("Select Page", ["Main", "Filtered Data"])

    if page == "Main":
        login_page(wallet)
    # ----------------------------- Filtered Data Page -----------------------------
    elif page == "Filtered Data":
        filtered_data_page(wallet)

elif st.session_state["page"] == "settings":
    # Simula una barra superiore con colonne
    col1, col2 = st.columns([8, 2])  # Colonne con proporzioni 8:2

    with col1:
        st.markdown("### 👨‍🔧 Manage your wallet")  # Titolo o icona

    with col2:
        # bottone per passare alla pagina di impostazioni
        if st.button("Home", key="Torna indientro", help="Back to home"):
            st.session_state["page"] = "main"  # Cambia lo stato della pagina

    settings(wallet=wallet)
    if st.button("Home", help="Back to home"):
        st.session_state["page"] = "main"  # Torna alla pagina principale
        # ricarica la pagina


# Saving config file
with open("../../config/config.yaml", "w", encoding="utf-8") as file:
    yaml.dump(config_user, file, default_flow_style=False, allow_unicode=True)
