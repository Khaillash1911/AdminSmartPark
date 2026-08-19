from pathlib import Path

import numpy as np
import pandas as pd


# Keep generated datasets separate from source data and scripts.
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# Load the preserved source dataset from this research module.
INPUT_CSV = BASE_DIR / "monthly_parking_source.csv"

# Define output file paths without overwriting the original CSV.
CLEANED_CSV = OUTPUT_DIR / "monthly_parking_cleaned.csv"
MODEL_READY_CSV = OUTPUT_DIR / "monthly_parking_model_ready.csv"


print("Smart Parking Dataset Preparation")
print("=" * 40)
print("Input CSV:", INPUT_CSV)

# Load the original combined parking dataset.
df = pd.read_csv(INPUT_CSV)

# Display basic dataset information for inspection evidence.
print("\nFirst five records:")
print(df.head())

print("\nDataset information:")
df.info()

print("\nMissing values before cleaning:")
print(df.isnull().sum())

# Print basic dataset size and duplicate row count.
print("\nDataset shape:", df.shape)
print("Number of rows:", df.shape[0])
print("Number of columns:", df.shape[1])
print("Duplicate rows:", df.duplicated().sum())

# Convert the Date column into datetime format.
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

# Check whether any dates failed to convert.
invalid_dates = df["Date"].isnull().sum()
print("\nInvalid dates:", invalid_dates)

# Remove rows with invalid dates only if they exist.
if invalid_dates > 0:
    print("Rows with invalid dates:")
    print(df[df["Date"].isnull()])
    df = df.dropna(subset=["Date"]).reset_index(drop=True)

# Convert parking counts to numeric values.
df["Entries"] = pd.to_numeric(df["Entries"], errors="coerce")
df["Exits"] = pd.to_numeric(df["Exits"], errors="coerce")

# Show missing values after numeric conversion before any final cleanup.
print("\nMissing values after numeric conversion:")
print(df[["Date", "Entries", "Exits"]].isnull().sum())

# Sort records chronologically because time-series prediction depends on order.
df = df.sort_values("Date").reset_index(drop=True)

# Check whether the same date appears more than once.
duplicate_dates = df[df.duplicated(subset=["Date"], keep=False)]
print("\nDuplicate dates:")
print(duplicate_dates)

# If duplicate dates exist, aggregate daily entries and exits by date.
if not duplicate_dates.empty:
    print("\nAggregating duplicate dates by summing Entries and Exits.")
    df = (
        df.groupby("Date", as_index=False)[["Entries", "Exits"]]
        .sum()
        .sort_values("Date")
        .reset_index(drop=True)
    )

# Identify missing dates within the dataset period without creating synthetic rows.
full_date_range = pd.date_range(
    start=df["Date"].min(),
    end=df["Date"].max(),
    freq="D",
)
missing_dates = full_date_range.difference(df["Date"])
print("\nMissing dates:")
print(missing_dates)

# Extract month number from the date.
df["Month"] = df["Date"].dt.month

# Extract readable day name.
df["DayOfWeek"] = df["Date"].dt.day_name()

# Monday = 0 and Sunday = 6.
df["DayOfWeekNum"] = df["Date"].dt.dayofweek

# Mark Saturday and Sunday as weekends.
df["IsWeekend"] = (df["DayOfWeekNum"] >= 5).astype(int)

# Calculate the daily net vehicle movement.
df["NetFlow"] = df["Entries"] - df["Exits"]

# Entry count from the previous day.
df["PrevDayEntries"] = df["Entries"].shift(1)

# Exit count from the previous day.
df["PrevDayExits"] = df["Exits"].shift(1)

# Calculate average entries from the previous seven days only.
df["EntryRolling7"] = (
    df["Entries"]
    .shift(1)
    .rolling(window=7)
    .mean()
)

# Calculate average exits from the previous seven days only.
df["ExitRolling7"] = (
    df["Exits"]
    .shift(1)
    .rolling(window=7)
    .mean()
)

# Measure recent variation in parking demand using previous seven days.
df["EntryRollingStd7"] = (
    df["Entries"]
    .shift(1)
    .rolling(window=7)
    .std()
)

# Create next-day prediction targets.
df["NextDayEntries"] = df["Entries"].shift(-1)
df["NextDayExits"] = df["Exits"].shift(-1)

# Display missing-value counts before removing unusable rows.
print("\nMissing values before final cleanup:")
print(df.isnull().sum())

# Remove rows that cannot be used for model training.
model_df = df.dropna().reset_index(drop=True)

# Save all cleaned records with engineered columns.
df.to_csv(CLEANED_CSV, index=False)

# Save the model-ready dataset after removing rows with unusable lag/target values.
model_df.to_csv(MODEL_READY_CSV, index=False)

print("\nOriginal dataset shape:", df.shape)
print("Model-ready dataset shape:", model_df.shape)

print("\nModel-ready columns:")
print(model_df.columns.tolist())

print("\nFirst 10 model-ready records:")
print(model_df.head(10))

print("\nModel-ready summary statistics:")
print(model_df.describe())

# Validation checks to confirm preprocessing was performed correctly.
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
