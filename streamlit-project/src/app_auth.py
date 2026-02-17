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
    layout='wide',
    )

# ------------------------ Theme -----------------------------

# Personalizzazione del tema
st.markdown(get_style(), unsafe_allow_html=True)


# Controlla lo stato della pagina
if "page" not in st.session_state:
    st.session_state["page"] = "main"  # Imposta la pagina predefinita



st.sidebar.image(repo_path + config_user["path"]["ico_path"], width=50)


# ------------------------ Authentication -----------------------------

# Pre-hashing all plain text passwords once
# stauth.Hasher.hash_passwords(config_user["credentials"])

authenticator = stauth.Authenticate(
    config_user["credentials"],
    config_user["cookie"]["name"],
    config_user["cookie"]["key"],
    config_user["cookie"]["expiry_days"],
    auto_ash=True,
)

# Mostra il modulo di login
try:
    authenticator.login("main",max_login_attempts=3, single_session=False,max_concurrent_users=5)
except Exception as e:
    st.error(e)



if st.session_state.get("authentication_status"):
    authenticator.logout("Logout", "sidebar")
    # Scegli l'utente in base al nome
    if st.session_state.get("username") in config_user["credentials"]["usernames"]:
        #user = users["username"][st.session_state.get("username")]
        # crea dizionario con solo credenzials
        user = config_user["credentials"]["usernames"][st.session_state.get("username")]
    else:
        st.error("User not found in the configuration file.")
        st.stop()
    
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
            if st.button("⚙️ Settings", key="settings_button", help="Change categories or accounts list"):
                st.session_state["page"] = "settings"  # Cambia lo stato della pagina
        
        st.title(f"Wallet App - {st.session_state.get("name").capitalize()}")

        with st.sidebar:
            #st.sidebar.image(config["ico_path"], width=50)
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
            
            # Mostra la pagina di impostazioni
elif st.session_state.get("authentication_status") is False:
    st.error("Username/password is incorrect")
elif st.session_state.get("authentication_status") is None:
    st.warning("Please enter your username and password")


# Saving config file
with open('../../config/config.yaml', 'w', encoding='utf-8') as file:
    yaml.dump(config_user, file, default_flow_style=False, allow_unicode=True)

