from GUI import *
from wallet import *
import yaml
from yaml.loader import SafeLoader

with open("./config/config.yaml") as file:
    config_user = yaml.load(file, Loader=SafeLoader)


# crea un objeto della classe Wallet
wallet = Wallet(user=config_user["credentials"]["usernames"]["umberto"])

gui = WalletGUI(wallet)
gui.run()
