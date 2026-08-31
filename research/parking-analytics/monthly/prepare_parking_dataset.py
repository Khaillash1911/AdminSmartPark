from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

INPUT_CSV = BASE_DIR / "monthly_parking_source.csv"

CLEANED_CSV = OUTPUT_DIR / "monthly_parking_cleaned.csv"
MODEL_READY_CSV = OUTPUT_DIR / "monthly_parking_model_ready.csv"


print("Smart Parking Dataset Preparation")
print("=" * 40)
print("Input CSV:", INPUT_CSV)

df = pd.read_csv(INPUT_CSV)

print("\nFirst five records:")
print(df.head())

print("\nDataset information:")
df.info()

print("\nMissing values before cleaning:")
print(df.isnull().sum())

print("\nDataset shape:", df.shape)
print("Number of rows:", df.shape[0])
print("Number of columns:", df.shape[1])
print("Duplicate rows:", df.duplicated().sum())

df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

invalid_dates = df["Date"].isnull().sum()
print("\nInvalid dates:", invalid_dates)

if invalid_dates > 0:
    print("Rows with invalid dates:")
    print(df[df["Date"].isnull()])
    df = df.dropna(subset=["Date"]).reset_index(drop=True)

df["Entries"] = pd.to_numeric(df["Entries"], errors="coerce")
df["Exits"] = pd.to_numeric(df["Exits"], errors="coerce")

print("\nMissing values after numeric conversion:")
print(df[["Date", "Entries", "Exits"]].isnull().sum())

df = df.sort_values("Date").reset_index(drop=True)

duplicate_dates = df[df.duplicated(subset=["Date"], keep=False)]
print("\nDuplicate dates:")
print(duplicate_dates)

if not duplicate_dates.empty:
    print("\nAggregating duplicate dates by summing Entries and Exits.")
    df = (
        df.groupby("Date", as_index=False)[["Entries", "Exits"]]
        .sum()
        .sort_values("Date")
        .reset_index(drop=True)
    )

full_date_range = pd.date_range(
    start=df["Date"].min(),
    end=df["Date"].max(),
    freq="D",
)
missing_dates = full_date_range.difference(df["Date"])
print("\nMissing dates:")
print(missing_dates)

df["Month"] = df["Date"].dt.month

df["DayOfWeek"] = df["Date"].dt.day_name()

df["DayOfWeekNum"] = df["Date"].dt.dayofweek

df["IsWeekend"] = (df["DayOfWeekNum"] >= 5).astype(int)

df["NetFlow"] = df["Entries"] - df["Exits"]

df["PrevDayEntries"] = df["Entries"].shift(1)

df["PrevDayExits"] = df["Exits"].shift(1)

df["EntryRolling7"] = (
    df["Entries"]
    .shift(1)
    .rolling(window=7)
    .mean()
)

df["ExitRolling7"] = (
    df["Exits"]
    .shift(1)
    .rolling(window=7)
    .mean()
)

df["EntryRollingStd7"] = (
    df["Entries"]
    .shift(1)
    .rolling(window=7)
    .std()
)

df["NextDayEntries"] = df["Entries"].shift(-1)
df["NextDayExits"] = df["Exits"].shift(-1)

print("\nMissing values before final cleanup:")
print(df.isnull().sum())

model_df = df.dropna().reset_index(drop=True)

df.to_csv(CLEANED_CSV, index=False)

model_df.to_csv(MODEL_READY_CSV, index=False)

print("\nOriginal dataset shape:", df.shape)
print("Model-ready dataset shape:", model_df.shape)

print("\nModel-ready columns:")
print(model_df.columns.tolist())

print("\nFirst 10 model-ready records:")
print(model_df.head(10))

print("\nModel-ready summary statistics:")
print(model_df.describe())

assert model_df["Entries"].ge(0).all()
assert model_df["Exits"].ge(0).all()
assert model_df["IsWeekend"].isin([0, 1]).all()
assert model_df["NextDayEntries"].notnull().all()
assert model_df["NextDayExits"].notnull().all()
assert model_df["EntryRolling7"].notnull().all()
assert model_df["ExitRolling7"].notnull().all()

print("\nAll preprocessing validation checks passed.")

print("\nSaved files:")
print(CLEANED_CSV)
print(MODEL_READY_CSV)

print("\nSummary:")
print(f"- Original records loaded: {df.shape[0]}")
print(f"- Duplicate full rows found: {df.duplicated().sum()}")
print(f"- Duplicate dates found before aggregation: {len(duplicate_dates)}")
print(f"- Missing calendar dates found: {len(missing_dates)}")
print(f"- Model-ready rows remaining: {model_df.shape[0]}")
print("- New features created: Month, DayOfWeek, DayOfWeekNum, IsWeekend, NetFlow,")
print("  PrevDayEntries, PrevDayExits, EntryRolling7, ExitRolling7, EntryRollingStd7,")
print("  NextDayEntries, and NextDayExits.")
print("- Lag and rolling-average features use past observations only to avoid data leakage.")
print("- Chronological order is important because future parking demand is predicted from past records.")
