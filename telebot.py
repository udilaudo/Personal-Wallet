# Stati per la conversazione
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import pandas as pd
from tabulate import tabulate
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    CallbackContext,
    filters,
)
from wallet import Wallet
import yaml
from yaml.loader import SafeLoader

# path current
current_path = os.path.dirname(os.path.abspath(__file__))

# Load the configuration file
with open(current_path + "/config/config.yaml") as file:
    config = yaml.load(file, Loader=SafeLoader)


load_dotenv()

# Token del bot
TOKEN = os.getenv("TELEGRAM_TOKEN_WALLET")

# Chat ID autorizzato
AUTHORIZED_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Percorso del file csv
"""dir_path = os.path.dirname(os.path.realpath(__file__))
CSV_FILE_PATH = os.path.join(dir_path, "dati", "wallet_simulation.csv")"""
CSV_FILE_PATH = current_path + config["credentials"]["usernames"]["umberto"]["wallet_path"]
print(CSV_FILE_PATH)

# data odierna
NOW = datetime.now()
YEAR, MONTH, DAY = NOW.year, NOW.month, NOW.day

# Stati per la conversazione
START, COLUMN1, COLUMN2, COLUMN3, COLUMN4 = range(5)

# ---------------------------- Funzioni ----------------------------


def is_authorized(chat_id: int) -> bool:
    return str(chat_id) == AUTHORIZED_CHAT_ID


async def start(update: Update, context: CallbackContext) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("Non sei autorizzato a usare questo bot.")
        return ConversationHandler.END

    keyboard = [
        [InlineKeyboardButton("Aggiungi spesa", callback_data="modifica")],
        [InlineKeyboardButton("Aggiungi entrata", callback_data="entrata")],
        [InlineKeyboardButton("Visualizza Dati", callback_data="dati")],
        [InlineKeyboardButton("Grafico In-Out", callback_data="grafico_totale")],
        [InlineKeyboardButton("Grafico Uscite", callback_data="grafico_solo_uscite")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.message:
        await update.message.reply_text("Cosa vuoi fare?", reply_markup=reply_markup)
    else:
        await update.callback_query.edit_message_text(
            "Cosa vuoi fare?", reply_markup=reply_markup
        )
    return START


async def button(update: Update, context: CallbackContext) -> int:
    query = update.callback_query
    await query.answer()

    # salva il risultato della query
    context.user_data["query"] = query

    if query.data == "modifica":
        await query.edit_message_text(
            text='Quanto hai speso? (Scrivi "Cancel" per annullare)'
        )
        return COLUMN1
    elif query.data == "entrata":
        await query.edit_message_text(
            text='Quanto hai ricevuto?  (Scrivi "Cancel" per annullare)'
        )
        return COLUMN1
    elif query.data == "dati":
        # legge i dati dal file csv
        df = pd.read_csv(CSV_FILE_PATH)

        # df = filter_dataset(df, thirty_days_ago)

        w = Wallet()
        w.read_df(df)
        w.filter_dataset_from_date(n_days_ago=30)
        df = w.df

        # crea una nuova colonna con la data
        df["Date"] = (
            df["D"].astype(str) + "/" + df["M"].astype(str) + "/" + df["Y"].astype(str)
        )
        # elimina le colonne Y, M e D
        df = df.drop(columns=["Y", "M", "D"])

        # elimina le colonne ID e Type
        df = df.drop(columns=["ID", "Type"])

        table = tabulate(df, headers="keys", tablefmt="pretty", showindex="never")

        await query.edit_message_text(text="Ecco i dati degli ultimi 30 giorni:")

        # if table is too long, split it into chunks
        max_length = 4096
        if len(table) > max_length:
            # split the table into chunks
            chunks = [table[i : i + max_length] for i in range(0, len(table), max_length)]
            for chunk in chunks:
                await query.message.reply_text(f"```\n{chunk}\n```", parse_mode="MarkdownV2")
        else:
            # send the table as a single message
            
            await query.message.reply_text(f"```\n{table}\n```", parse_mode="MarkdownV2")

        return ConversationHandler.END

    elif query.data == "grafico_totale":
        # legge i dati dal file csv
        df = pd.read_csv(CSV_FILE_PATH)

        # plotta i dati del mese corrente
        # df = filter_dataset(df, thirty_days_ago)

        w = Wallet()
        w.read_df(df)
        w.filter_dataset_from_date(n_days_ago=30)

        fig = w.plot_pie_with_all_categories(show=False)

        # calcola il totale delle spese in uscita
        total_out = round(w.outcome, 2)
        total_in = round(w.income, 2)
        saldo = total_in - total_out

        await query.edit_message_text(text="Ecco il grafico delle tue spese:")

        # invia il grafico
        await query.message.reply_photo(
            photo=open(f"{current_path + config["path"]["img_path"]}/category_pie_plot.png", "rb"),
            caption=f"Uscite: {total_out} € \nEntrate: {total_in} € \nSaldo: {saldo} €",
        )

        return ConversationHandler.END

    elif query.data == "grafico_solo_uscite":
        # legge i dati dal file csv
        df = pd.read_csv(CSV_FILE_PATH)

        # plotta i dati del mese corrente
        # df = filter_dataset(df, thirty_days_ago)

        # elimina le entrate
        df = df[df["Type"] == 0]

        w = Wallet()
        w.read_df(df)
        w.filter_dataset_from_date(n_days_ago=30)
        fig = w.plot_pie_with_all_categories(show=False)

        # calcola il totale delle spese in uscita
        total_out = round(w.outcome, 2)
        # calcola le spese per ogni categoria
        all_tot = []
        for category in w.categories:
            tot = round(w.df[w.df["Category"] == category]["Amount"].sum(), 2)
            all_tot.append((category, tot))

        all_tot = sorted(all_tot, key=lambda x: x[1])

        string_to_print = ""
        for cat, tot in all_tot:
            string_to_print += f"{cat}: {tot} € \n"

        await query.edit_message_text(text="Ecco il grafico delle tue uscite:")

        # invia il grafico
        await query.message.reply_photo(
            photo=open(f"{current_path + config["path"]["img_path"]}/category_pie_plot.png", "rb"),
            caption=f"Uscite totali: {total_out} € \n{string_to_print}",
        )

        return ConversationHandler.END


async def column1(update: Update, context: CallbackContext) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("Non sei autorizzato a usare questo bot.")
        return ConversationHandler.END

    if update.message.text.lower() == "cancel" or update.message.text == "/start":
        await update.message.reply_text("Operazione annullata.")
        return ConversationHandler.END

    context.user_data["column1"] = update.message.text

    keyboard = [
        [InlineKeyboardButton(category, callback_data=category)]
        for category in config["credentials"]["usernames"]["umberto"]["categories_list"]
    ]

    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        "Seleziona la categoria:", reply_markup=reply_markup
    )
    return COLUMN2


async def column2(update: Update, context: CallbackContext) -> int:
    query_category = update.callback_query
    await query_category.answer()

    # context.user_data["column2"] = update.message.text
    context.user_data["column2"] = update.callback_query.data
    await query_category.edit_message_text(text="Inserisci la descrizione:")
    return COLUMN3


async def column3(update: Update, context: CallbackContext) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("Non sei autorizzato a usare questo bot.")
        return ConversationHandler.END

    context.user_data["column3"] = update.message.text

    keyboard = [
        [InlineKeyboardButton(category, callback_data=category)]
        for category in config["credentials"]["usernames"]["umberto"]["conti_list"]
    ]

    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text("Con cosa hai pagato?", reply_markup=reply_markup)
    return COLUMN4


async def column4(update: Update, context: CallbackContext) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("Non sei autorizzato a usare questo bot.")
        return ConversationHandler.END

    query_conto = update.callback_query
    await query_conto.answer()

    # context.user_data["column2"] = update.message.text
    context.user_data["column4"] = update.callback_query.data

    if context.user_data["query"].data == "modifica":
        costo = -float(context.user_data["column1"])
        tipo = 0
    elif context.user_data["query"].data == "entrata":
        costo = float(context.user_data["column1"])
        tipo = 1

    new_row = {
        "ID": 0,
        "Amount": costo,
        "Category": context.user_data["column2"],
        "Description": context.user_data["column3"],
        "Y": YEAR,
        "M": MONTH,
        "D": DAY,
        "Conto": context.user_data["column4"],
        "Type": tipo,
    }

    # Assicurati che il file esista e abbia la struttura corretta
    if os.path.exists(CSV_FILE_PATH):
        df = pd.read_csv(CSV_FILE_PATH)
    else:
        df = pd.DataFrame(
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

    # df = df.append(new_row, ignore_index=True)
    # usa concat per aggiungere la nuova riga al dataframe
    new_row_df = pd.DataFrame([new_row])

    # Usa concat per aggiungere la nuova riga al dataframe
    df = pd.concat([df, new_row_df], ignore_index=True)

    # riordina il dataframe per Y, M, D e rinomina gli indici da 0 a n
    df = df.sort_values(by=["Y", "M", "D", "Category", "Amount"], ascending=False)
    df["ID"] = range(0, len(df))

    # rinomina gli indici da 0 a n
    df = df.reset_index(drop=True)

    df.to_csv(CSV_FILE_PATH, index=False)

    # riepilogo spesa
    await query_conto.edit_message_text(
        text=f"Spesa aggiunta: {context.user_data['column1']}€, {context.user_data['column2']}, {context.user_data['column3']}, {context.user_data['column4']}"
    )
    return ConversationHandler.END


async def cancel(update: Update, context: CallbackContext) -> int:
    if not is_authorized(update.effective_chat.id):
        await update.message.reply_text("Non sei autorizzato a usare questo bot.")
        return ConversationHandler.END

    await update.message.reply_text("Operazione annullata.")
    return ConversationHandler.END


# ---------------------------- Main ----------------------------


def main():
    application = Application.builder().token(TOKEN).build()

    # Gestore di conversazione
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            START: [CallbackQueryHandler(button)],
            COLUMN1: [MessageHandler(filters.TEXT & ~filters.COMMAND, column1)],
            COLUMN2: [CallbackQueryHandler(column2)],
            COLUMN3: [MessageHandler(filters.TEXT & ~filters.COMMAND, column3)],
            COLUMN4: [CallbackQueryHandler(column4)],
        },
        fallbacks=[CommandHandler("start", start), CommandHandler("cancel", cancel)],
    )
    application.add_handler(conv_handler)
    application.run_polling()


if __name__ == "__main__":
    main()
