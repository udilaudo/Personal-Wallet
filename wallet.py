import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from cycler import cycler
from datetime import datetime, timedelta
import yaml
from yaml.loader import SafeLoader
import os

# path current
current_path = os.path.dirname(os.path.abspath(__file__))

# Load the configuration file
with open(current_path + "/config/config.yaml") as file:
    config = yaml.load(file, Loader=SafeLoader)


# Description: This file contains the class wallet, which is used to manage the wallet of the user.
class Wallet:
    def __init__(self, user: dict = config["credentials"]["usernames"]["umberto"]):
        self.df = pd.DataFrame(
            columns=[
                "ID",
                "Amount",
                "Category",
                "Description",
                "Y",
                "M",
                "D",
                "Conto",
                "Type",
            ]
        )
        self.wallet_path = current_path + user["wallet_path"]
        self.wallet_name = (current_path + user["wallet_path"]).split("/")[-1]
        self.plots_path = current_path + "/plots/"
        if user:
            self.user = user
            self.define_wallet(self.wallet_path)
        self.user = user
        # Type 0 = spesa, Type 1 = entrata, Type 2 = saldo iniziale uscita, Type 3 = saldo iniziale entrata, Type 4 = giroconto
        self.outcome = self.df[self.df["Type"] == 0]["Amount"].sum()  # sono negativi
        self.income = self.df[self.df["Type"] == 1]["Amount"].sum()
        self.inital_saldo_out = self.df[(self.df["Type"] == 2)][
            "Amount"
        ].sum()  # sono negativi
        self.inital_saldo_in = self.df[(self.df["Type"] == 3)]["Amount"].sum()
        # Saldo totale
        self.saldo = (
            self.income + self.outcome + self.inital_saldo_in + self.inital_saldo_out
        )
        # lista dei conti
        self.conti_list = user["conti_list"]

        # definisciamo le variabili saldo per i vari account contenuti in user["conti_list"]
        self.saldo_conti = {}
        for conto in user["conti_list"]:
            self.saldo_conti[conto] = self.df[self.df["Conto"] == conto]["Amount"].sum()

        # lista delle categorie
        self.categories = user["categories_list"]

        self.amount = (
            self.income - self.outcome + self.inital_saldo_in - self.inital_saldo_out
        )  #! non serve secondo me
        self.start_date = (
            self.df["Y"].min(),
            self.df[self.df["Y"] == self.df["Y"].min()]["M"].min(),
        )
        self.end_date = (
            self.df["Y"].max(),
            self.df[self.df["Y"] == self.df["Y"].max()]["M"].max(),
        )

        # subsctiption
        self.subscriptions = self.user["subscriptions"]

        self.pay_subscription()

    # ------------------------- WALLET FUNCTIONS -----------------------------

    def define_wallet(self, path):
        self.df = pd.read_csv(path)
        # sorta per data dalla piu recente alla meno recente
        self.df = self.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        #
        self.df = self.df.reset_index(drop=True)
        # riordina gli ID
        self.df["ID"] = self.df.index

    def update_wallet(self):
        self.outcome = self.df[self.df["Type"] == 0]["Amount"].sum()
        self.income = self.df[self.df["Type"] == 1]["Amount"].sum()
        self.inital_saldo_out = self.df[(self.df["Type"] == 2)]["Amount"].sum()
        self.inital_saldo_in = self.df[(self.df["Type"] == 3)]["Amount"].sum()
        self.saldo = (
            self.income + self.outcome + self.inital_saldo_in + self.inital_saldo_out
        )
        # saldo totale del Conto==bancoposta
        self.saldo_bancoposta = self.df[self.df["Conto"] == "bancoposta"][
            "Amount"
        ].sum()
        # saldo totale del Conto==evolution
        self.saldo_evolution = self.df[self.df["Conto"] == "evolution"]["Amount"].sum()
        # saldo totale del Conto==contanti
        self.saldo_contanti = self.df[self.df["Conto"] == "contanti"]["Amount"].sum()

        for conto in self.user["conti_list"]:
            self.saldo_conti[conto] = self.df[self.df["Conto"] == conto]["Amount"].sum()

        self.amount = (
            self.income - self.outcome + self.inital_saldo_in - self.inital_saldo_out
        )
        self.categories = self.df["Category"].unique()
        self.start_date = (
            self.df["Y"].min(),
            self.df[self.df["Y"] == self.df["Y"].min()]["M"].min(),
        )
        self.end_date = (
            self.df["Y"].max(),
            self.df[self.df["Y"] == self.df["Y"].max()]["M"].max(),
        )
        self.pay_subscription()

    def add(
        self,
        amount: float,
        category: str,
        description: str,
        y: int,
        m: int,
        d: int,
        conto: str = "Conto",
        type: bool = 0,
    ):
        split_amount = False

        # aumenta di 1 l'indice ID di ogni riga
        self.df["ID"] = self.df["ID"].apply(lambda x: x + 1)

        if conto == "paypal":
            if amount > self.saldo_conti["paypal"]:
                split_amount = True
                amount_paypal = self.saldo_conti["paypal"]
                amount_remaining = round(amount - amount_paypal, 2)

        if split_amount:
            if type == 0:
                amount = -amount
                amount_paypal = -amount_paypal
                amount_remaining = -amount_remaining

            # non usare append, è lento
            self.df = pd.concat(
                [
                    self.df,
                    pd.DataFrame(
                        {
                            "ID": [0],
                            "Amount": [amount_paypal],
                            "Category": [category],
                            "Description": [description + "Splitted"],
                            "Y": [y],
                            "M": [m],
                            "D": [d],
                            "Conto": [conto],
                            "Type": [type],
                        }
                    ),
                ],
                ignore_index=True,
            )

            # non usare append, è lento
            self.df = pd.concat(
                [
                    self.df,
                    pd.DataFrame(
                        {
                            "ID": [0],
                            "Amount": [amount_remaining],
                            "Category": [category],
                            "Description": [description + "Splitted"],
                            "Y": [y],
                            "M": [m],
                            "D": [d],
                            "Conto": [self.conti_list[0]],
                            "Type": [type],
                        }
                    ),
                ],
                ignore_index=True,
            )
            self.update_wallet()

        else:
            if type == 0:
                amount = -amount
            # non usare append, è lento
            self.df = pd.concat(
                [
                    self.df,
                    pd.DataFrame(
                        {
                            "ID": [0],
                            "Amount": [amount],
                            "Category": [category],
                            "Description": [description],
                            "Y": [y],
                            "M": [m],
                            "D": [d],
                            "Conto": [conto],
                            "Type": [type],
                        }
                    ),
                ],
                ignore_index=True,
            )

            self.update_wallet()

    def edit_transaction(
        self,
        index: int,
        amount: float,
        category: str,
        description: str,
        y: int,
        m: int,
        d: int,
        conto: str = "Conto",
        type: bool = 0,
    ):
        # Modifica la transazione esistente
        self.df.at[index, "Amount"] = amount if type == 1 else -amount
        self.df.at[index, "Category"] = category
        self.df.at[index, "Description"] = description
        self.df.at[index, "Y"] = y
        self.df.at[index, "M"] = m
        self.df.at[index, "D"] = d
        self.df.at[index, "Conto"] = conto
        self.df.at[index, "Type"] = type

        # Riordina gli ID
        self.df["ID"] = range(0, len(self.df))

        self.update_wallet()

    def delete(self, index):
        self.df = self.df.drop(index)
        self.update_wallet()

    def filter_dataset_from_date(self, n_days_ago: int) -> pd.DataFrame:
        # Data attuale
        now = datetime.now()
        year, month, day = now.year, now.month, now.day

        thirty_days_ago = now - timedelta(days=n_days_ago)
        # plotta i dati del mese corrente
        self.df = self.df[self.df["Y"] >= int(thirty_days_ago.year)]
        self.df = self.df[self.df["M"] >= int(thirty_days_ago.month)]
        if thirty_days_ago.year == now.year:
            self.df = self.df[self.df["M"] >= int(thirty_days_ago.month)]
        else:
            self.df = self.df[
                (
                    (
                        (self.df["M"] >= thirty_days_ago.day)
                        & (self.df["Y"] == thirty_days_ago.month)
                    )
                    | ((self.df["M"] <= now.day) & (self.df["Y"] == now.month))
                )
            ]
        if thirty_days_ago.month == now.month:
            self.df = self.df[self.df["D"] >= int(thirty_days_ago.day)]
        self.df = self.df[
            (
                (
                    (self.df["D"] >= thirty_days_ago.day)
                    & (self.df["M"] == thirty_days_ago.month)
                )
                | ((self.df["D"] <= now.day) & (self.df["M"] == now.month))
            )
        ]

        self.df = self.df.reset_index(drop=True)

    def giroconto(
        self,
        amount,
        conto_out,
        conto_in,
        y,
        m,
        d,
        y_firts=2023,
        m_first=12,
        d_first=31,
    ):
        category = "Saldo"
        description = f"da {conto_out} a {conto_in}"
        self.add(amount, "Giroconto", description, y, m, d, None, 4)

        # se il conto out è bancoposta o evolution, e il conto in è evolution o bancoposta, togli 1 euro di commissione
        if conto_out != "contanti" and conto_in != "contanti":
            self.add(
                -amount - self.user["commission"],
                category,
                description,
                y_firts,
                m_first,
                d_first,
                conto_out,
                2,
            )
        else:
            self.add(
                -amount, category, description, y_firts, m_first, d_first, conto_out, 2
            )
        self.add(amount, category, description, y_firts, m_first, d_first, conto_in, 3)

        self.update_wallet()

    def pay_subscription(
        self,
    ):
        split_amount = False
        now = datetime.now().date()
        d, m, y = now.day, now.month, now.year
        # controlla se le date delle subscriptions sono passate

        for subscription in self.user["subscriptions"]:
            # Controlla se la subscription esiste
            details = self.user["subscriptions"][subscription]
            amount = details["amount"]
            conto = details["conto"]
            start_date = details["start_date"]
            end_date = details["end_date"]
            if start_date <= now <= end_date:
                # aggiorna status in active
                self.user["subscriptions"][subscription]["status"] = "active"
            else:
                # aggiorna status in inactive
                self.user["subscriptions"][subscription]["status"] = "expired"

        for subscription in self.user["subscriptions"]:
            # Controlla se la subscription esiste
            if self.user["subscriptions"][subscription]["status"] == "active":
                # Ottieni i dettagli della subscription
                details = self.user["subscriptions"][subscription]
                amount = details["amount"]
                conto = details["conto"]
                start_date = details["start_date"]
                end_date = details["end_date"]

                if conto == "paypal":
                    if amount > self.saldo_conti["paypal"]:
                        split_amount = True
                        amount_paypal = self.saldo_conti["paypal"]
                        amount_remaining = round(amount - amount_paypal, 2)

                # check if in the current month c'è una pagamento

                # Controlla se nel mese corrente c'è un pagamento nel df a nome subscription
                df = self.df[
                    (self.df["M"] == m)
                    & (self.df["Y"] == y)
                    & (self.df["Description"] == f"Subscription {subscription}")
                ]
                if df.empty and d >= start_date.day:

                    if split_amount:
                        self.add(
                            amount_paypal,
                            "🔁 Abbonamenti",
                            f"Subscription {subscription} + Splitted",
                            y,
                            m,
                            start_date.day,
                            conto,
                            0,
                        )
                        self.add(
                            amount_remaining,
                            "🔁 Abbonamenti",
                            f"Subscription {subscription} + Splitted",
                            y,
                            m,
                            start_date.day,
                            self.conti_list[0],
                            0,
                        )
                    else:
                        self.add(
                            amount,
                            "🔁 Abbonamenti",
                            f"Subscription {subscription}",
                            y,
                            m,
                            start_date.day,
                            conto,
                            0,
                        )
                    # Aggiorna il saldo totale
                    self.update_wallet()

    # ----------------------- UPLOAD WALLET FUNCTIONS --------------------------

    def read_csv(self, path):
        self.df = pd.read_csv(path)
        # sorta per data dalla piu recente alla meno recente
        self.df = self.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        #
        self.df = self.df.reset_index(drop=True)
        # riordina gli ID
        self.df["ID"] = self.df.index
        # sprta per amount dalla piu grande alla piu piccola

        self.update_wallet()
        self.wallet_path = path
        self.wallet_name = path.split("/")[-1]

    def read_excel(self, path):
        self.df = pd.read_excel(path)
        self.update_wallet()
        self.wallet_path = path
        self.wallet_name = path.split("/")[-1]

    def read_df(self, df):
        self.df = df
        self.update_wallet()

    # ------------------------- PLOTTING FUNCTIONS -----------------------------

    def plot(self, show=True):
        # Copia il DataFrame e prendi il valore assoluto di Amount
        temp_df = self.df.copy()
        # temp_df["Amount"] = temp_df["Amount"].abs()

        # Mappa Type: 2 → 0 (Expenses), 3 → 1 (Income)
        temp_df["Type"] = temp_df["Type"].replace({2: 0, 3: 1})
        # Filtra i valori di Type diversi da 4
        temp_df = temp_df[temp_df["Type"] != 4]

        # Somma le spese per categoria
        temp_df = temp_df.groupby(["Category"])["Amount"].sum().reset_index()

        # aggiungi colonna Type con 0 se sono negativi o 1 se sono positivi
        temp_df["Type"] = temp_df["Amount"].apply(lambda x: 0 if x < 0 else 1)
        # prendi i valori assoluti
        temp_df["Amount"] = temp_df["Amount"].abs()

        # Dizionario per rinominare i valori di Type nella legenda
        type_labels = {0: "Expenses", 1: "Income"}

        # Imposta lo stile del grafico
        sns.set_theme(style="whitegrid", palette="muted")
        fig, ax = plt.subplots(
            figsize=(12, 7)
        )  # Aumenta la dimensione per maggiore eleganza

        # Colori raffinati per il grafico
        refined_palette = [
            "#E57373",
            "#81C784",
        ]  # Rosso scuro per Expenses, Verde scuro per Income

        # Crea il grafico a barre con Seaborn
        sns.barplot(
            x="Category",
            y="Amount",
            data=temp_df,
            hue="Type",
            dodge=False,
            palette=refined_palette,  # Colori più raffinati
            ax=ax,
        )

        # Aggiunta di etichette e titolo con font elegante
        ax.set_title(
            "Expenses by Category", fontsize=16, fontweight="bold", color="#333333"
        )
        ax.set_xlabel("Categories", fontsize=14, color="#666666")
        ax.set_ylabel("Amount", fontsize=14, color="#666666")
        ax.set_xticklabels(
            ax.get_xticklabels(), rotation=45, ha="right", fontsize=12, color="#333333"
        )

        # Modifica manualmente le etichette della legenda
        handles, labels = ax.get_legend_handles_labels()
        new_labels = [
            type_labels[int(label)] for label in labels
        ]  # Sostituisce 0,1 con i nomi corretti
        ax.legend(
            handles,
            new_labels,
            title="Type",
            title_fontsize=13,
            fontsize=12,
            frameon=False,
        )

        # Aggiungi una griglia sottile per una finitura più elegante
        ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.7)

        # Layout e salvataggio del grafico
        plt.tight_layout()

        # Salva il grafico
        plt.savefig(
            f"{current_path + config["path"]['img_path']}/category_bar_plot.png"
        )

        # Gestione della visualizzazione
        if show:
            plt.show()
        else:
            plt.close()

        return fig

    def plot_time(self, show=True):
        df = self.df.copy()
        df["Type"] = df["Type"].replace({2: 0, 3: 1})
        df = df[df["Type"] != 4]

        # Creazione della colonna "Month-Year"
        df["Month-Year"] = df["Y"].astype(str) + "-" + df["M"].astype(str).str.zfill(2)

        # Raggruppamento per "Month-Year" e "Type"
        df_grouped = (
            df.groupby(["Month-Year", "Type"])["Amount"].sum().unstack(fill_value=0)
        )

        # Ordinamento temporale
        df_grouped = df_grouped.sort_index()

        # Plot
        fig, ax = plt.subplots(figsize=(12, 7))

        refined_palette = [
            "#E57373",  # Expenses
            "#81C784",  # Income
        ]

        df_grouped.plot(kind="bar", stacked=True, color=refined_palette, ax=ax)

        ax.set_ylabel("Amount", fontsize=14, color="#666666")
        ax.set_xlabel("Month-Year", fontsize=14, color="#666666")
        ax.set_title(
            "Absolute Amount of Expenses and Income by Month-Year",
            fontsize=16,
            fontweight="bold",
            color="#333333",
        )

        ax.legend(
            title="Type",
            labels=["Expenses", "Income"],
            title_fontsize=13,
            fontsize=12,
            frameon=False,
        )

        ax.set_xticklabels(
            df_grouped.index, rotation=45, ha="right", fontsize=12, color="#333333"
        )

        ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.7)
        plt.tight_layout()

        # Salva il grafico
        plt.savefig(f"{current_path + config["path"]['img_path']}/time_plot.png")

        if show:
            plt.show()
        else:
            plt.close()

        return fig

    def plot_pie(self, show=True):
        # Crea il grafico a torta per le entrate e le uscite
        fig, ax = plt.subplots(figsize=(10, 6))

        # Verifica che le somme non siano zero
        if (self.income + self.inital_saldo_in) != 0 and (
            self.outcome + self.inital_saldo_out
        ) != 0:
            temp_df = self.df.copy()
            temp_df["Amount"] = temp_df["Amount"].abs()
            # Sostituisci i valori 2 e 3 con 0 (spesa) e 1 (entrata)
            temp_df["Type"] = temp_df["Type"].replace({2: 0, 3: 1})
            temp_df = temp_df[temp_df["Type"] != 4]

            # Raggruppa per Type e somma le Amount
            temp_df = temp_df.groupby("Type")["Amount"].sum().reset_index()

            # Colori più chiari e raffinati
            refined_colors = [
                "#E57373",
                "#81C784",
            ]  # Rosso chiaro per Expenses, Verde chiaro per Income

            # Crea il grafico a torta
            ax.pie(
                temp_df["Amount"],
                labels=["Expenses", "Income"],
                autopct="%1.1f%%",
                colors=refined_colors,
                startangle=90,  # Inizia la torta dall'alto
                wedgeprops={
                    "edgecolor": "black",
                    "linewidth": 1.2,
                },  # Aggiungi un bordo sottile per eleganza
            )
            ax.set_title(
                "Income and Expenses", fontsize=16, fontweight="bold", color="#333333"
            )

        # Se solo le entrate o le uscite sono presenti
        elif (self.outcome + self.inital_saldo_out) == 0:
            ax.pie(
                [1],
                labels=["Income"],
                autopct="%1.1f%%",
                colors=["#81C784"],
                startangle=90,
            )
            ax.set_title(
                "Income and Expenses", fontsize=16, fontweight="bold", color="#333333"
            )
        elif (self.income + self.inital_saldo_in) == 0:
            ax.pie(
                [1],
                labels=["Expenses"],
                autopct="%1.1f%%",
                colors=["#E57373"],
                startangle=90,
            )
            ax.set_title(
                "Income and Expenses", fontsize=16, fontweight="bold", color="#333333"
            )

        # Salva il grafico
        plt.savefig(
            f"{current_path + config["path"]['img_path']}/Income_Expenses_Pie_plot.png"
        )

        # Mostra il grafico
        if show:
            plt.show()
        else:
            plt.close()

        return fig

    def plot_pie_with_all_categories(self, show=True):
        temp_df = self.df.copy()
        temp_df["Amount"] = temp_df["Amount"].abs()
        temp_df = temp_df[temp_df["Type"] != 4]
        temp_df = temp_df.groupby("Category")["Amount"].sum().reset_index()

        # Seleziona un colore verde per le Entrate
        color_cycler = cycler(
            color=plt.get_cmap("tab20c").colors
        )  # Usa una mappa di colori per molte categorie
        colors = [
            "green" if category == "Entrate" else color_cycler.by_key()["color"][i % 20]
            for i, category in enumerate(temp_df["Category"])
        ]

        # Soglia per raggruppare categorie con percentuale piccola come "Altre"
        threshold = 2  # Percentuale minima per visualizzare una categoria individuale
        temp_df["Percentage"] = (temp_df["Amount"] / temp_df["Amount"].sum()) * 100
        small_categories = temp_df[temp_df["Percentage"] < threshold]

        if len(small_categories) == 1:
            # Se c'è solo una categoria piccola, non raggrupparla
            small_categories = small_categories.iloc[0]
        elif len(small_categories) > 1:
            # Raggruppa le categorie piccole in "Altre"
            small_amount = small_categories["Amount"].sum()
            temp_df = temp_df[~temp_df["Category"].isin(small_categories["Category"])]
            # Usa pd.concat() al posto di append
            temp_df = pd.concat(
                [
                    temp_df,
                    pd.DataFrame({"Category": ["Altre"], "Amount": [small_amount]}),
                ],
                ignore_index=True,
            )
            colors.append("gray")  # Colore per "Altre"

        # Crea il grafico a torta
        fig, ax = plt.subplots(figsize=(12, 7))  # Ingrandito per miglior visibilità
        ax.pie(
            temp_df["Amount"],
            labels=temp_df["Category"],
            autopct="%1.1f%%",
            startangle=140,
            colors=colors,
            wedgeprops={
                "edgecolor": "black",
                "linewidth": 1.2,
            },  # Bordo sottile per un aspetto elegante
        )
        ax.set_title(
            "Expenses by Category", fontsize=16, fontweight="bold", color="#333333"
        )

        # Salva il grafico
        plt.savefig(
            f"{current_path + config["path"]['img_path']}/category_pie_plot.png"
        )

        # Mostra il grafico
        if show:
            plt.show()
        else:
            plt.close()

        return fig

    def plot_pie_conto(self, show=True):
        temp_df = self.df.copy()
        temp_df["Amount"] = temp_df["Amount"].abs()
        temp_df = temp_df.groupby("Conto")["Amount"].sum().reset_index()

        # Seleziona un colore verde per le Entrate
        color_cycler = cycler(
            color=plt.get_cmap("tab20c").colors
        )  # Usa una mappa di colori per molte categorie
        colors = [
            "green" if category == "Entrate" else color_cycler.by_key()["color"][i % 20]
            for i, category in enumerate(temp_df["Conto"])
        ]

        # Crea il grafico a torta
        fig, ax = plt.subplots(figsize=(12, 7))  # Ingrandito per miglior visibilità
        ax.pie(
            temp_df["Amount"],
            labels=temp_df["Conto"],
            autopct="%1.1f%%",
            startangle=140,
            colors=colors,
            wedgeprops={
                "edgecolor": "black",
                "linewidth": 1.2,
            },  # Bordo sottile per un aspetto elegante
        )
        ax.set_title(
            "Expenses Across Different Accounts",
            fontsize=16,
            fontweight="bold",
            color="#333333",
        )

        # Salva il grafico
        plt.savefig(f"{current_path + config["path"]['img_path']}/conto_pie_plot.png")

        # Mostra il grafico
        if show:
            plt.show()
        else:
            plt.close()

        return fig

    # ------------------------- DATAFRAME FUNCTIONS -----------------------------

    def total(self):
        return self.df["Amount"].sum()

    def total_category(self, category):
        return self.df[self.df["Category"] == category]["Amount"].sum()

    def total_month(self, m):
        return self.df[self.df["M"] == m]["Amount"].sum()

    def list_category(self, category):
        return self.df[self.df["Category"] == category]

    def list_month(self, m):
        return self.df[self.df["M"] == m]

    def list_all(self):
        return self.df

    def list_income(self):
        return self.df[self.df["Type"] == 1]

    def list_outcome(self):
        return self.df[self.df["Type"] == 0]

    def get_income_category(self, category):
        return self.df[(self.df["Type"] == 1) & (self.df["Category"] == category)]

    def get_outcome_category(self, category):
        return self.df[(self.df["Type"] == 0) & (self.df["Category"] == category)]

    def sort_values_class(self, by, ascending=False):
        self.df = self.df.sort_values(by=by, ascending=ascending)

    # ------------------------- DATAFRAME FUNCTIONS -----------------------------

    def __repr__(self) -> str:
        return self.df.__repr__()

    def __str__(self) -> str:
        return self.df.__str__()

    def __len__(self):
        return self.df.__len__()

    def __iter__(self):
        return self.df.__iter__()
