import pandas as pd
import tkinter as tk
from tkinter import ttk, messagebox
from tkinter import filedialog
import os
from datetime import datetime
import pandas as pd
from wallet import Wallet
from tkinter import PhotoImage
import yaml
from yaml.loader import SafeLoader

# path current
current_path = os.path.dirname(os.path.abspath(__file__))

# Load the configuration file
with open(current_path + "/config/config.yaml") as file:
    config = yaml.load(file, Loader=SafeLoader)


class WalletGUI:
    """
    Questa classe crea una GUI per visualizzare e modificare i dati di un wallet.
    """

    def __init__(self, wallet: Wallet):
        self.wallet = wallet
        self.categories_list = wallet.categories

        # setup GUI
        self.root = self._setup_root()
        self._set_up_wallet_name()
        self.tree = self._setup_tree()
        self.button_frame = self._setup_buttons()
        self.menu_bar = self._setup_menu_bar()
        self.category_menu, self.month_menu, self.year_menu = (
            self._setup_category_month_year_menus()
        )
        self.conto_menu = self._setup_conto_menu()
        self.default_botton = self._setup_default_button()
        self.label_frame = self._setup_label_frame()
        self._setup_key_bindings()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ------------------ GUI SETUP ------------------

    def _setup_key_bindings(self):
        # comandi da tastiera e mouse
        self.root.bind("<Delete>", self.delete_expense)
        self.root.bind("<Return>", self.edit_expense)
        self.tree.bind("<Double-1>", self.edit_expense)
        self.root.bind("<Control-e>", self.edit_expense)
        self.root.bind("<Control-s>", self.save_wallet_fast)
        self.root.bind("<Control-o>", self.upload_wallet)
        self.root.bind("<Control-n>", self.new_wallet)
        self.root.bind("<Control-a>", self.add_expense)
        # col tasto destro del mouse apri il menu contestuale
        self.tree.bind("<Button-3>", self.show_popup_menu)

    def _setup_root(self):
        root = tk.Tk()
        icon = PhotoImage(file=current_path + config["path"]["ico_path"])
        root.iconphoto(True, icon)
        root.configure(bg="lightgrey")
        root.geometry("1500x820+0+0")
        root.title("Wallet")
        return root

    def _set_up_wallet_name(self):
        self.wallet_name_label = tk.Label(
            self.root, text=self.wallet.wallet_name, font=("Helvetica", 16, "bold")
        )
        self.wallet_name_label.pack(pady=10)

    def _edit_wallet_name(self):
        self.wallet_name_label.config(text=self.wallet.wallet_name)

    def _setup_tree(self):
        style = ttk.Style()
        style.theme_use("clam")
        tree = ttk.Treeview(self.root)
        tree["columns"] = list(self.wallet.df.columns)
        tree["show"] = "headings"
        for column in tree["columns"]:
            tree.heading(column, text=column)
            tree.column(column, width=100)
        tree.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        return tree

    def _setup_buttons(self):
        button_frame = tk.Frame(self.root)
        button_frame.pack()
        self._add_buttons_to_frame(button_frame)
        return button_frame

    def _add_buttons_to_frame(self, frame):
        buttons = [
            ("Nuova Spesa", self.add_expense, "lightblue", 0, 0),
            ("Default Tempo", self.default_view_time, None, 1, 1),
            ("Cancella Spesa", self.delete_expense, "pink", 0, 1),
            ("Default Categorie", self.default_view, None, 1, 0),
            ("Giroconto", self.giroconto, None, 0, 4),
        ]
        for text, command, bg, row, column in buttons:
            button = tk.Button(
                frame, text=text, command=command, bg=bg, width=16, height=1
            )
            if row == 0:  # If it's the first row
                button.grid(
                    row=row, column=column, pady=(10, 3), padx=5
                )  # Add padding at the top
            else:
                button.grid(row=row, column=column)

    def _setup_menu_bar(self):
        menu_bar = tk.Menu(self.root)
        self._add_menus_to_menu_bar(menu_bar)
        self.root.config(menu=menu_bar)
        return menu_bar

    def _add_menus_to_menu_bar(self, menu_bar):
        self._add_upload_menu(menu_bar)
        self._add_options_menu(menu_bar)
        self._add_sort_menu(menu_bar)
        self._add_time_menu(menu_bar)

    def _add_upload_menu(self, menu_bar):
        upload_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="File", menu=upload_menu)
        upload_menu.add_command(
            label="Carica Wallet   (ctrl+O)", command=self.upload_wallet
        )
        upload_menu.add_command(
            label="Salva Wallet    (ctrl+S)", command=self.save_wallet
        )
        upload_menu.add_command(
            label="Nuovo Wallet    (ctrl+N)", command=self.new_wallet
        )

    def _add_options_menu(self, menu_bar):
        options_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="Grafici", menu=options_menu)
        options_menu.add_command(label="Categorie a Barre", command=self.plot_static)
        options_menu.add_command(label="Temporale a Barre", command=self.plot_time)
        options_menu.add_command(label="Torta in-out", command=self.plot_pie)
        options_menu.add_command(
            label="Torta Categorie", command=self.plot_pie_with_all_categories
        )
        options_menu.add_command(label="Torta Conto", command=self.plot_pie_conto)

    def _add_sort_menu(self, menu_bar):
        sort_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="Ordina per ...", menu=sort_menu)
        sort_menu.add_command(
            label="Categoria", command=lambda: self.sort_values_gui("Category")
        )
        sort_menu.add_command(
            label="Importo", command=lambda: self.sort_values_gui("Amount")
        )

    def _add_time_menu(self, menu_bar):
        time_menu = tk.Menu(menu_bar, tearoff=0)
        menu_bar.add_cascade(label="Range Temporale", menu=time_menu)
        time_menu.add_command(
            label="Seleziona range", command=lambda: self.select_time()
        )

    def _setup_category_month_year_menus(self):
        category_menu = self._setup_category_menu()
        month_menu = self._setup_month_menu()
        year_menu = self._setup_year_menu()
        return category_menu, month_menu, year_menu

    def _setup_category_menu(self):
        self.category_label = tk.Label(self.root, text="Category:")
        self.category_label.pack(side=tk.LEFT)
        self.category_var_filter = tk.StringVar(self.root)
        self.category_var_filter.set("All")
        category_options = (
            ["All"] + self.categories_list + ["Saldo", "Giroconto", "Uscite"]
        )
        category_menu = tk.OptionMenu(
            self.root, self.category_var_filter, *category_options
        )
        self.category_var_filter.trace("w", self.view_expenses)
        category_menu.pack(side=tk.LEFT)
        return category_menu

    def _setup_conto_menu(self):
        self.conto_label = tk.Label(self.root, text="Conto:")
        self.conto_label.pack(side=tk.LEFT)
        self.conto_var_filter = tk.StringVar(self.root)
        self.conto_var_filter.set("All")
        conto_options = ["All"] + self.wallet.conti_list
        conto_menu = tk.OptionMenu(self.root, self.conto_var_filter, *conto_options)
        self.conto_var_filter.trace("w", self.view_expenses)
        conto_menu.pack(side=tk.LEFT)
        return conto_menu

    def _setup_month_menu(self):
        self.month_var = tk.StringVar(self.root)
        self.month_var.set(datetime.now().month)
        month_options = ["All"] + list(range(1, 13))
        month_menu = tk.OptionMenu(self.root, self.month_var, *month_options)
        self.month_var.trace("w", self.view_expenses)
        month_menu.pack(side=tk.RIGHT)
        month_label = tk.Label(self.root, text="Month:")
        month_label.pack(side=tk.RIGHT)
        return month_menu

    def _setup_year_menu(self):
        self.year_var = tk.StringVar(self.root)
        self.year_var.set(datetime.now().year)
        year_options = ["All"] + list(self.wallet.df["Y"].unique())
        year_menu = tk.OptionMenu(self.root, self.year_var, *year_options)
        self.year_var.trace("w", self.view_expenses)
        year_menu.pack(side=tk.RIGHT)
        year_label = tk.Label(self.root, text="Year:")
        year_label.pack(side=tk.RIGHT)
        return year_menu

    def _setup_default_button(self):
        default_botton = tk.Button(
            self.root, text="Mese corrente", command=self.corrent_month_view
        )
        default_botton.pack(side=tk.RIGHT)
        return default_botton

    def _setup_label_frame(self):
        self.label_frame = tk.LabelFrame(self.root, text="Totals")
        self.label_frame.pack(padx=30, pady=30)
        # canvas = tk.Canvas(self.label_frame, width=200, height=200)
        # canvas.pack()
        expenses = self.wallet.df
        expenses = self.draw_table(expenses)
        self.write_totals(expenses)
        return self.label_frame

    # ------------------ GUI FUNCTIONALITY ------------------

    def on_close(self):
        # Ask the user if they have saved
        # se il titolo della finestra e' "Wallet" allora non ha salvato
        # se ha salvato il titolo e' "Wallet •"
        if self.root.title() == "Wallet":
            self.root.destroy()
        else:
            # apri una finestra con "salva" "non salvare" "annulla"
            self.on_close_window = tk.Toplevel(self.root)
            self.on_close_window.title("Salva prima di uscire?")
            self.on_close_window.geometry("300x150+600+400")
            self.on_close_label = tk.Label(
                self.on_close_window, text="Vuoi salvare prima di uscire?"
            )
            self.on_close_label.pack(pady=20)
            self.yes_button = tk.Button(
                self.on_close_window, text="Si", command=self.on_close_ok
            )
            self.yes_button.pack(side=tk.LEFT, expand=True)

            self.annulla_button = tk.Button(
                self.on_close_window, text="Annulla", command=self.on_close_undo
            )
            self.annulla_button.pack(side=tk.RIGHT, expand=True)

            self.no_button = tk.Button(
                self.on_close_window, text="No", command=self.on_close_cancel
            )
            self.no_button.pack(side=tk.BOTTOM, expand=True)

    def on_close_ok(self):
        self.save_wallet_fast()
        self.on_close_window.destroy()
        self.root.destroy()

    def on_close_cancel(self):
        self.on_close_window.destroy()
        self.root.destroy()

    def on_close_undo(self):
        self.on_close_window.destroy()

    def write_totals(self, expenses):
        # Add labels to the frame
        entrate = expenses[expenses["Type"] == 1]["Amount"].sum()
        uscite = expenses[expenses["Type"] == 0]["Amount"].sum()
        saldo_old_out = expenses[expenses["Type"] == 2]["Amount"].sum()
        saldo_old_in = expenses[expenses["Type"] == 3]["Amount"].sum()
        saldo = entrate + uscite + saldo_old_out + saldo_old_in
        self.total_expenses_label = tk.Label(
            self.label_frame,
            text=f"Saldo: {round(saldo,2)}",
            fg="white",
            font=("Helvetica", 12, "bold"),
            bg="grey",
        )
        self.total_expenses_label.pack(pady=10)

        self.total_expenses_label_in = tk.Label(
            self.label_frame,
            text=f"Totale Entrate: {round(entrate + saldo_old_in,2)}",
            font=("Helvetica", 18, "bold"),
        )
        self.total_expenses_label_in.pack(padx=10)

        self.total_expenses_label_out = tk.Label(
            self.label_frame,
            text=f"Totale Uscite: {round(uscite + saldo_old_out,2)}",
            font=("Helvetica", 12, "bold"),
        )
        self.total_expenses_label_out.pack(padx=10)

        self.total_len = tk.Label(
            self.label_frame,
            text=f"Numero di spese: {len(expenses)}",
            font=("Helvetica", 12, "bold"),
        )
        self.total_len.pack(pady=10)

    def select_time(self):
        self.add_windows_range = tk.Toplevel(self.root)
        self.add_windows_range.title("Seleziona Range Temporale")
        self.add_windows_range.geometry("400x200+700+350")

        self.title = tk.Label(
            self.add_windows_range, text="Seleziona il range temporale che preferisci:"
        )
        self.title.pack()

        self.month_label = tk.Label(self.add_windows_range, text="Da:")
        self.month_label.pack(side=tk.LEFT, expand=True)

        self.month_var_range = tk.StringVar(self.add_windows_range)
        this_month = datetime.now().month
        self.month_var_range.set(this_month)
        self.month_options = list(range(1, 13))
        self.month_menu_range = tk.OptionMenu(
            self.add_windows_range, self.month_var_range, *self.month_options
        )
        self.month_menu_range.pack(side=tk.LEFT)

        self.year_var_range = tk.StringVar(self.add_windows_range)
        this_year = datetime.now().year
        self.year_var_range.set(this_year)
        self.year_options = list(range(2020, this_year + 1))
        self.year_menu_range = tk.OptionMenu(
            self.add_windows_range, self.year_var_range, *self.year_options
        )
        self.year_menu_range.pack(side=tk.LEFT)

        self.month_label = tk.Label(self.add_windows_range, text="a:")
        self.month_label.pack(side=tk.LEFT, expand=True)

        self.month_var_range_end = tk.StringVar(self.add_windows_range)
        self.month_var_range_end.set(this_month)
        self.month_options = list(range(1, 13))
        self.month_menu_range_end = tk.OptionMenu(
            self.add_windows_range, self.month_var_range_end, *self.month_options
        )
        self.month_menu_range_end.pack(side=tk.LEFT)

        self.year_var_range_end = tk.StringVar(self.add_windows_range)
        self.year_var_range_end.set(this_year)
        self.year_options = list(range(2020, this_year + 1))
        self.year_menu_range_end = tk.OptionMenu(
            self.add_windows_range, self.year_var_range_end, *self.year_options
        )
        self.year_menu_range_end.pack(side=tk.LEFT)

        self.ok_button = tk.Button(
            self.add_windows_range, text="Filtra", command=self.filter_time
        )
        self.ok_button.configure(bg="lightgreen")
        self.ok_button.pack(side=tk.BOTTOM)

    def filter_time(self):
        self.add_windows_range.destroy()
        self.month_var.set("All")
        self.year_var.set("All")

        # pulisci la tabella
        for item in self.tree.get_children():
            self.tree.delete(item)

        expenses = self.wallet.df
        # filtra per range temporale
        # Crea una nuova colonna "Date" che combina "Y" e "M"
        expenses["Date"] = pd.to_datetime(
            expenses["Y"].astype(str) + "-" + expenses["M"].astype(str)
        )

        # Ottieni le date di inizio e fine dal range
        start_date = pd.to_datetime(
            str(self.year_var_range.get()) + "-" + str(self.month_var_range.get())
        )
        end_date = pd.to_datetime(
            str(self.year_var_range_end.get())
            + "-"
            + str(self.month_var_range_end.get())
        )

        # Filtra il DataFrame per le date nel range
        expenses = expenses[
            (expenses["Date"] >= start_date) & (expenses["Date"] <= end_date)
        ]

        expenses = self.draw_table(expenses)
        # cancella il vecchio label e aggiungi il nuovo
        for widget in self.label_frame.winfo_children():
            widget.destroy()

        self.write_totals(expenses)

    def add_expense(self, event=None):
        self.add_expense_window = tk.Toplevel(self.root)
        self.add_expense_window.title("Nuova Spesa")
        # set the size of the window

        self.add_expense_window.geometry("330x400+600+250")

        self.amount_label = tk.Label(self.add_expense_window, text="Amount")
        self.amount_label.pack()
        self.amount_entry = tk.Entry(self.add_expense_window)
        self.amount_entry.pack()

        self.category_label = tk.Label(self.add_expense_window, text="Category")
        self.category_label.pack()

        self.category_new_expense = tk.StringVar(self.add_expense_window)
        self.category_new_expense.set("Spesa")  # default value
        self.category_options = self.categories_list
        self.category_menu = tk.OptionMenu(
            self.add_expense_window, self.category_new_expense, *self.category_options
        )
        self.category_menu.pack()

        self.description_label = tk.Label(self.add_expense_window, text="Description *")
        self.description_label.pack()
        self.description_entry = tk.Entry(self.add_expense_window)
        self.description_entry.pack()

        self.date_label = tk.Label(self.add_expense_window, text="Date (YYYY-MM-DD) *")
        self.date_label.pack()

        self.date_entry = tk.Entry(self.add_expense_window)
        self.date_entry.pack()

        self.conto_info = tk.Label(self.add_expense_window, text="Con cosa hai pagato?")
        # sposta un po in basso il label

        self.conto_info.pack()

        self.conto_var = tk.StringVar(value="bancoposta")
        self.conto_var.set("bancoposta")
        self.conto_options = self.wallet.conti_list
        self.conto_menu = tk.OptionMenu(
            self.add_expense_window, self.conto_var, *self.conto_options
        )
        self.conto_menu.pack()

        self.type_label = tk.Label(self.add_expense_window, text="Type")
        self.type_label.pack()

        self.type_var = tk.StringVar(value="expense")
        self.expense_radiobutton = tk.Radiobutton(
            self.add_expense_window,
            text="In uscita",
            variable=self.type_var,
            value="expense",
        )
        self.expense_radiobutton.pack()
        self.income_radiobutton = tk.Radiobutton(
            self.add_expense_window,
            text="In entrata",
            variable=self.type_var,
            value="income",
        )
        self.income_radiobutton.pack()

        self.information = tk.Label(self.add_expense_window, text="* opzionale")
        # sposta un po in basso il label

        self.information.pack(pady=10)

        self.submit_button = tk.Button(
            self.add_expense_window, text="Aggiungi", command=self.submit_expense
        )
        self.submit_button.configure(bg="lightgreen")
        self.submit_button.pack(side=tk.BOTTOM)

    def submit_expense(self):
        amount = float(self.amount_entry.get())
        category = self.category_new_expense.get()
        description = self.description_entry.get()
        date = self.date_entry.get()
        conto = self.conto_var.get()
        if date:
            year, month, day = map(int, date.split("-"))
        else:
            now = datetime.now()
            year, month, day = now.year, now.month, now.day

        if self.type_var.get() == "income":
            type = 1
        else:
            type = 0

        self.wallet.add(amount, category, description, year, month, day, conto, type)
        self.add_expense_window.destroy()

        # self.wallet.df.to_csv("wallet.csv", index=False)

        # ordina per data dalla piu recente alla meno recente
        self.wallet.df = self.wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        self.reorganize_table()
        self.view_expenses()
        self.root.title("Wallet •")

    def reorganize_table(self):
        # ridefinisci ID a seconda della posizione
        self.wallet.df["ID"] = range(0, len(self.wallet.df))
        self.wallet.df = self.wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        self.wallet.df = self.wallet.df.reset_index(drop=True)

    def view_expenses(self, *args):
        # pulisci la tabella
        for item in self.tree.get_children():
            self.tree.delete(item)

        expenses = self.wallet.df

        expenses = self.draw_table(expenses)

        # cancella il vecchio label e aggiungi il nuovo
        for widget in self.label_frame.winfo_children():
            widget.destroy()

        self.write_totals(expenses)

    def draw_table(self, expenses):

        if self.category_var_filter.get() == "Entrate":
            expenses = expenses[expenses["Type"] == 1]
        elif self.category_var_filter.get() == "Uscite":
            expenses = expenses[expenses["Type"] == 0]
        elif self.category_var_filter.get() != "All":
            expenses = expenses[expenses["Category"] == self.category_var_filter.get()]

        if self.month_var.get() != "All":
            expenses = expenses[expenses["M"] == int(self.month_var.get())]

        if self.year_var.get() != "All":
            expenses = expenses[expenses["Y"] == int(self.year_var.get())]

        if self.conto_var_filter.get() != "All":
            expenses = expenses[expenses["Conto"] == self.conto_var_filter.get()]

        if expenses.empty:
            # messagebox.showinfo("Info", "No expenses found.")
            pass
        else:
            # evidenzia le righe di Type 1 di verde chiarissimo
            self.tree.tag_configure("income", background="lightgreen")
            self.tree.tag_configure("giro", background="pink")
            self.tree.tag_configure("giro+", background="green")
            self.tree.tag_configure("giro-", background="lightcoral")
            # evidenzia le righe di Type 0 di rosso chiarissimo
            # self.tree.tag_configure("expense", background="lightcoral")

            # disegna la tabella senza la colonn Type
            self.tree["columns"] = list(expenses.columns[:-1])
            for column in self.tree["columns"]:
                self.tree.heading(column, text=column)

            ## Imposta la larghezza della prima colonna
            # colonna data
            self.tree.column("ID", width=10)
            self.tree.column("Y", width=10)
            self.tree.column("M", width=10)
            self.tree.column("D", width=10)

            for index, row in expenses.iterrows():
                if row["Type"] == 1:
                    self.tree.insert("", "end", values=list(row)[:-1], tags="income")
                elif row["Type"] == 2:
                    self.tree.insert("", "end", values=list(row)[:-1], tags="giro-")
                elif row["Type"] == 3:
                    self.tree.insert("", "end", values=list(row)[:-1], tags="giro+")
                elif row["Type"] == 4:
                    self.tree.insert("", "end", values=list(row)[:-1], tags="giro")
                else:
                    self.tree.insert("", "end", values=list(row)[:-1])

        self.expenses_show = expenses

        return expenses

    def giroconto(self):
        self.giroconto_window = tk.Toplevel(self.root)
        self.giroconto_window.title("Giroconto")
        self.giroconto_window.geometry("330x300+600+350")

        self.title = tk.Label(self.giroconto_window, text="Vuoi fare un giroconto?")
        self.title.pack()

        self.amount_label = tk.Label(self.giroconto_window, text="Amount")
        self.amount_label.pack()
        self.amount_entry = tk.Entry(self.giroconto_window)
        self.amount_entry.pack()

        self.conto_info = tk.Label(self.giroconto_window, text="Da dove a dove?")
        # sposta un po in basso il label

        self.conto_info.pack()

        self.conto_var = tk.StringVar(value="bancoposta")
        self.conto_var.set("bancoposta")
        self.conto_options = self.wallet.conti_list
        self.conto_menu = tk.OptionMenu(
            self.giroconto_window, self.conto_var, *self.conto_options
        )
        self.conto_menu.pack()

        self.conto_var_end = tk.StringVar(value="bancoposta")
        self.conto_var_end.set("bancoposta")
        self.conto_options = self.wallet.conti_list
        self.conto_menu_end = tk.OptionMenu(
            self.giroconto_window, self.conto_var_end, *self.conto_options
        )
        self.conto_menu_end.pack()

        # data
        self.date_label = tk.Label(self.giroconto_window, text="Date (YYYY-MM-DD) *")
        self.date_label.pack()

        self.date_entry = tk.Entry(self.giroconto_window)
        self.date_entry.pack()

        self.submit_button = tk.Button(
            self.giroconto_window, text="Giroconto", command=self.submit_giroconto
        )
        self.submit_button.configure(bg="lightgreen")
        self.submit_button.pack(side=tk.BOTTOM)

    def submit_giroconto(self):
        amount = float(self.amount_entry.get())
        conto = self.conto_var.get()
        conto_end = self.conto_var_end.get()
        # prendi la data
        date = self.date_entry.get()
        if date:
            year, month, day = map(int, date.split("-"))
        else:
            now = datetime.now()
            year, month, day = now.year, now.month, now.day

        self.wallet.giroconto(amount, conto, conto_end, year, month, day)
        self.giroconto_window.destroy()

        # ordina per data dalla piu recente alla meno recente
        self.wallet.df = self.wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        self.reorganize_table()
        self.view_expenses()
        self.root.title("Wallet •")

    def default_view(self):
        self.category_var_filter.set("All")
        self.conto_var_filter.set("All")
        # self.view_expenses() # la fa in automatico perche c'e il trace

    def default_view_time(self):
        self.month_var.set("All")
        self.year_var.set("All")
        self.view_expenses()

    def corrent_month_view(self):
        now = datetime.now()
        self.year_var.set(now.year)
        self.month_var.set(now.month)
        # self.view_expenses() # la fa in automatico perche c'e il trace

    def sort_values_gui(self, column):

        # pulisci la tabella
        for item in self.tree.get_children():
            self.tree.delete(item)

        expenses = self.wallet.df
        new_wallet = Wallet()
        new_wallet.read_df(expenses)
        new_wallet.sort_values_class(column, ascending=False)

        expenses = new_wallet.df

        expenses = self.draw_table(expenses)

    def show_info_enter(self, event=None):
        # apri una finestra con le informazioni della riga selezionata
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Errore", "Nessuna riga selezionata")
            return
        row_index = self.tree.item(selected[0])["values"][0]
        row = self.wallet.df.iloc[row_index]
        messagebox.showinfo(
            "Info",
            f"Amount: {row['Amount']}\nCategory: {row['Category']}\nDescription: {row['Description']}\nDate: {row['Y']}-{row['M']}-{row['D']}",
        )

    def show_popup_menu(self, event):
        # crea un menu contestuale
        popup = tk.Menu(self.root, tearoff=0)
        popup.add_command(label="Info", command=self.show_info_enter)
        popup.add_command(label="Modifica", command=self.edit_expense)
        popup.add_command(label="Cancella", command=self.delete_expense)
        popup.tk_popup(event.x_root, event.y_root)

    def edit_expense(self, event=None):
        # apri una finestra per modificare la spesa
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Errore", "Nessuna riga selezionata")
            return
        row_index = self.tree.item(selected[0])["values"][0]
        row = self.wallet.df.iloc[row_index]

        self.edit_expense_window = tk.Toplevel(self.root)
        self.edit_expense_window.title("Modifica Spesa")
        self.edit_expense_window.geometry("330x400+600+250")

        self.amount_label = tk.Label(self.edit_expense_window, text="Amount")
        self.amount_label.pack()
        self.amount_entry = tk.Entry(self.edit_expense_window)
        self.amount_entry.insert(
            0, -row["Amount"] if row["Type"] == 0 else row["Amount"]
        )
        self.amount_entry.pack()

        self.category_label = tk.Label(self.edit_expense_window, text="Category")
        self.category_label.pack()

        self.category_new_expense = tk.StringVar(self.edit_expense_window)
        self.category_new_expense.set(row["Category"])

        self.category_options = self.categories_list
        self.category_menu = tk.OptionMenu(
            self.edit_expense_window, self.category_new_expense, *self.category_options
        )
        self.category_menu.pack()

        self.date_label = tk.Label(self.edit_expense_window, text="Date (YYYY-MM-DD)")
        self.date_label.pack()

        self.date_entry = tk.Entry(self.edit_expense_window)
        self.date_entry.insert(0, f"{row['Y']}-{row['M']}-{row['D']}")
        self.date_entry.pack()

        self.description_label = tk.Label(self.edit_expense_window, text="Description")
        self.description_label.pack()

        self.description_entry = tk.Entry(self.edit_expense_window)
        self.description_entry.insert(0, row["Description"])
        self.description_entry.pack()

        self.conto_label = tk.Label(
            self.edit_expense_window, text="Con cosa hai pagato?"
        )
        self.conto_label.pack()

        self.conto_var = tk.StringVar(value=row["Conto"])
        self.conto_var.set(row["Conto"])
        self.conto_options = self.wallet.conti_list
        self.conto_menu = tk.OptionMenu(
            self.edit_expense_window, self.conto_var, *self.conto_options
        )
        self.conto_menu.pack()

        self.type_label = tk.Label(self.edit_expense_window, text="Type")
        self.type_label.pack()

        self.type_var = tk.StringVar(value="income" if row["Type"] == 1 else "expense")
        self.expense_radiobutton = tk.Radiobutton(
            self.edit_expense_window,
            text="In uscita",
            variable=self.type_var,
            value="expense",
        )
        self.expense_radiobutton.pack()
        self.income_radiobutton = tk.Radiobutton(
            self.edit_expense_window,
            text="In entrata",
            variable=self.type_var,
            value="income",
        )
        self.income_radiobutton.pack()

        self.information = tk.Label(self.edit_expense_window, text="* opzionale")
        # sposta un po in basso il label

        self.information.pack(pady=10)

        self.submit_button = tk.Button(
            self.edit_expense_window, text="Modifica", command=self.submit_edit
        )
        # colora di arancione chiaro
        self.submit_button.configure(bg="lightblue")
        self.submit_button.pack()

    def submit_edit(self):
        amount = float(self.amount_entry.get())
        category = self.category_new_expense.get()
        description = self.description_entry.get()
        date = self.date_entry.get()
        conto = self.conto_var.get()
        if date:
            year, month, day = map(int, date.split("-"))
        else:
            now = datetime.now()
            year, month, day = now.year, now.month, now.day

        if self.type_var.get() == "income":
            type = 1
        else:
            type = 0

        selected = self.tree.selection()
        row_index = self.tree.item(selected[0])["values"][0]
        self.wallet.delete(self.wallet.df[self.wallet.df["ID"] == row_index].index[0])
        self.wallet.add(amount, category, description, year, month, day, conto, type)
        self.edit_expense_window.destroy()

        # self.wallet.df.to_csv("wallet.csv", index=False)

        # ordina per data dalla piu recente alla meno recente
        self.wallet.df = self.wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        self.reorganize_table()
        self.view_expenses()
        self.root.title("Wallet •")

    def delete_expense(self, event=None):

        # prendi il numero della riga selezionata
        selected = self.tree.selection()

        # open a dialog box to confirm the deletion
        if not selected:
            messagebox.showerror("Errore", "Nessuna riga selezionata")
            return

        row_index = self.tree.item(selected[0])["values"][0]
        self.delete_window = tk.Toplevel(self.root)
        self.delete_window.title("Cancella la spesa")
        self.delete_window.geometry("300x150+600+400")
        self.delete_label = tk.Label(
            self.delete_window, text="Sei sicuro di voler cancellare la spesa?"
        )
        self.delete_label.pack(pady=20)
        self.yes_button = tk.Button(
            self.delete_window,
            text="Si",
            command=lambda: self.delete_expense_ok(row_index=row_index),
        )
        self.yes_button.configure(bg="lightgreen")
        self.yes_button.pack(side=tk.LEFT, expand=True)
        self.no_button = tk.Button(
            self.delete_window, text="No", command=self.delete_expense_cancel
        )
        self.no_button.configure(bg="pink")
        self.no_button.pack(side=tk.RIGHT, expand=True)

    def delete_expense_cancel(self):
        self.delete_window.destroy()

    def delete_expense_ok(self, row_index):
        self.wallet.delete(row_index)
        # self.wallet.df.to_csv(self.wallet.wallet_path, index=False)
        self.reorganize_table_del()

        self.view_expenses()
        self.delete_window.destroy()
        self.root.title("Wallet •")

    def reorganize_table_del(self):
        # ridefinisci ID a seconda della posizione
        self.wallet.df["ID"] = range(0, len(self.wallet.df))
        self.wallet.df = self.wallet.df.sort_values(
            by=["Y", "M", "D", "Category", "Amount"], ascending=False
        )
        self.wallet.df = self.wallet.df.reset_index(drop=True)

    def plot_static(self):
        expenses = self.expenses_show
        # escludi la categoria "Giroconto"

        new_wallet = Wallet()
        new_wallet.read_df(expenses[expenses["Category"] != "Giroconto"])

        fig = new_wallet.plot()

    def plot_time(self):
        expenses = self.expenses_show
        # escludi la categoria "Giroconto"

        new_wallet = Wallet()
        new_wallet.read_df(expenses[expenses["Category"] != "Giroconto"])

        fig = new_wallet.plot_time()

    def plot_pie(self):
        expenses = self.expenses_show
        # escludi la categoria "Giroconto"

        new_wallet = Wallet()
        new_wallet.read_df(expenses[expenses["Category"] != "Giroconto"])

        fig = new_wallet.plot_pie()

    def plot_pie_with_all_categories(self):
        expenses = self.expenses_show
        # escludi la categoria "Giroconto"

        new_wallet = Wallet()
        new_wallet.read_df(expenses[expenses["Category"] != "Giroconto"])

        fig = new_wallet.plot_pie_with_all_categories()

    def plot_pie_conto(self):
        expenses = self.expenses_show
        # escludi la categoria "Giroconto"

        new_wallet = Wallet()
        new_wallet.read_df(expenses[expenses["Category"] != "Giroconto"])

        fig = new_wallet.plot_pie_conto()

    def upload_wallet(self, event=None):
        # Apri la finestra di dialogo per selezionare il file

        # apri la finestra a un path di default nella cartella dati
        path_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "dati")
        file_path = filedialog.askopenfilename(initialdir=path_dir)

        # Controlla se l'utente ha selezionato un file
        if file_path:
            # Qui puoi caricare il file nel modo che preferisci.
            # Ad esempio, se è un file CSV, potresti utilizzare pandas per caricarlo in un DataFrame.
            self.wallet.read_csv(file_path)
            self._edit_wallet_name()
            self.view_expenses()

    def save_wallet(self, event=None):
        # Apri la finestra di dialogo per selezionare la cartella in cui salvare il file
        folder_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "dati")
        file_name = filedialog.asksaveasfilename(
            initialdir=folder_path,
            title="Save as",
            filetypes=(
                ("CSV files", "*.csv"),
                ("Excel files", "*.xlsx"),
                ("all files", "*.*"),
            ),
            defaultextension=".csv",
        )

        # Controlla l'estensione del file_name
        _, extension = os.path.splitext(file_name)

        # Se l'estensione è .xlsx, salva il DataFrame in un file Excel
        if extension == ".xlsx":
            self.wallet.df.to_excel(file_name, index=False)
        # Altrimenti, salva il DataFrame in un file CSV
        else:
            self.wallet.df.to_csv(file_name, index=False)

        self.root.title("Wallet")

    def save_wallet_fast(self, event=None):
        # Salva il file in modo veloce
        self.wallet.df.to_csv(self.wallet.wallet_path, index=False)
        # fai apparire un messaggio di conferma senza finestra visivo
        self.save_label = tk.Label(
            self.root, text="Wallet salvato con successo!", bg="lightgreen"
        )
        self.save_label.pack()
        self.save_label.after(2000, self.save_label.destroy)
        self.root.title("Wallet")

    def new_wallet(self, event=None):
        # apri una finestra di dialogo per confermare la creazione di un nuovo wallet
        self.new_wallet_window = tk.Toplevel(self.root)
        self.new_wallet_window.title("Nuovo Wallet?")
        self.new_wallet_window.geometry("250x200+600+400")

        # aggiungi una informazione
        self.new_wallet_label = tk.Label(
            self.new_wallet_window,
            text="Vuoi creare un nuovo wallet?",
        )
        self.new_wallet_label.pack(pady=20)
        self.new_wallet_label = tk.Label(
            self.new_wallet_window,
            text="Tutti i dati non salvati verranno persi.",
        )
        self.new_wallet_label.pack()

        self.new_wallet_window.geometry("300x200")
        self.yes_button = tk.Button(
            self.new_wallet_window, text="Si", command=self.new_wallet_ok
        )
        self.yes_button.configure(bg="lightgreen")
        self.yes_button.pack(side=tk.LEFT, expand=True)
        self.no_button = tk.Button(
            self.new_wallet_window, text="No", command=self.new_wallet_cancel
        )
        self.no_button.configure(bg="pink")
        self.no_button.pack(side=tk.RIGHT, expand=True)

    def new_wallet_ok(self):
        self.wallet = Wallet()
        self.wallet.df = pd.DataFrame(
            columns=["ID", "Amount", "Category", "Description", "Y", "M", "D", "Type"]
        )
        self.view_expenses()
        self.new_wallet_window.destroy()

    def new_wallet_cancel(self):
        self.new_wallet_window.destroy()

    def run(self):
        self.root.mainloop()
