from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# Resolve every file relative to this script so it works from any directory.
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
INPUT_CSV = OUTPUT_DIR / "monthly_parking_model_ready.csv"
V2_CSV = OUTPUT_DIR / "monthly_parking_model_ready_v2.csv"
OUTPUT_DIR.mkdir(exist_ok=True)


def save_line_chart(columns, title, ylabel, filename):
    """Plot one or more time-series columns and save a readable PNG."""
    plt.figure(figsize=(12, 6))
    for column in columns:
        plt.plot(model_df["Date"], model_df[column], label=column, linewidth=1.5)
    plt.title(title)
    plt.xlabel("Date")
    plt.ylabel(ylabel)
    plt.xticks(rotation=45)
    plt.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close()


# Load, convert, and chronologically order the existing model-ready dataset.
df = pd.read_csv(INPUT_CSV)
df["Date"] = pd.to_datetime(df["Date"])
df = df.sort_values("Date").reset_index(drop=True)
original_records = len(df)
original_missing = df.isnull().sum()
duplicate_count = int(df.duplicated().sum())

print("SMART PARKING DATASET INSPECTION")
print("Dataset shape:", df.shape)
print("Date range:", df["Date"].min().date(), "to", df["Date"].max().date())
print("Column names:", df.columns.tolist())
print("\nMissing values in input dataset:")
print(original_missing)
print("\nDuplicate rows:", duplicate_count)

# Add weekly lag features from the corresponding day one week earlier.
df["EntriesLag7"] = df["Entries"].shift(7)
df["ExitsLag7"] = df["Exits"].shift(7)

# Add short-term rolling averages using only prior observations.
df["EntryRolling3"] = df["Entries"].shift(1).rolling(window=3).mean()
df["ExitRolling3"] = df["Exits"].shift(1).rolling(window=3).mean()

# Add known calendar information for the day being predicted.
target_date = df["Date"] + pd.Timedelta(days=1)
df["TargetDayOfWeekNum"] = target_date.dt.dayofweek
df["TargetIsWeekend"] = (df["TargetDayOfWeekNum"] >= 5).astype(int)
df["TargetMonth"] = target_date.dt.month

# Report feature-induced missing values before removing unusable rows.
print("\nMissing values after final feature engineering:")
print(df.isnull().sum())
model_df = df.dropna().reset_index(drop=True)
model_df.to_csv(V2_CSV, index=False, date_format="%Y-%m-%d")

# Plot daily entry and exit volume.
save_line_chart(
    ["Entries", "Exits"],
    "Daily Parking Entry and Exit Trend",
    "Vehicle Count",
    "daily_entry_exit_trend.png",
)

# Calculate and save monthly descriptive statistics.
monthly_summary = model_df.groupby("Month")[["Entries", "Exits"]].agg(
    ["mean", "sum", "max", "min"]
)
monthly_summary.to_csv(OUTPUT_DIR / "monthly_summary.csv")
print("\nMonthly traffic summary:")
print(monthly_summary)

monthly_means = model_df.groupby("Month")[["Entries", "Exits"]].mean()
monthly_means.plot(kind="bar", figsize=(9, 6))
plt.title("Average Parking Traffic per Month")
plt.xlabel("Month Number")
plt.ylabel("Average Vehicle Count")
plt.xticks(rotation=0)
plt.legend(["Average Entries", "Average Exits"])
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "monthly_average_traffic.png", dpi=150)
plt.close()

# Calculate weekday averages in calendar order.
day_order = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]
weekday_summary = (
    model_df.groupby("DayOfWeek")[["Entries", "Exits"]]
    .mean()
    .reindex(day_order)
)
weekday_summary.to_csv(OUTPUT_DIR / "weekday_summary.csv")
weekday_summary.plot(kind="bar", figsize=(10, 6))
plt.title("Average Parking Traffic by Weekday")
plt.xlabel("Day of Week")
plt.ylabel("Average Vehicle Count")
plt.xticks(rotation=30, ha="right")
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "weekday_average_traffic.png", dpi=150)
plt.close()

# Compare weekday and weekend traffic.
model_df["DayType"] = np.where(model_df["IsWeekend"] == 1, "Weekend", "Weekday")
weekend_weekday_summary = (
    model_df.groupby("DayType")[["Entries", "Exits"]]
    .mean()
    .reindex(["Weekday", "Weekend"])
)
weekend_weekday_summary.to_csv(OUTPUT_DIR / "weekend_weekday_summary.csv")
weekend_weekday_summary.plot(kind="bar", figsize=(8, 6))
plt.title("Average Weekday vs Weekend Parking Traffic")
plt.xlabel("Day Type")
plt.ylabel("Average Vehicle Count")
plt.xticks(rotation=0)
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "weekend_vs_weekday.png", dpi=150)
plt.close()

# Analyse daily net vehicle flow.
save_line_chart(["NetFlow"], "Daily Net Parking Flow", "Entries - Exits", "net_flow_trend.png")
print("\nNet flow statistics:")
print("Highest positive NetFlow:", model_df["NetFlow"].max())
print("Lowest NetFlow:", model_df["NetFlow"].min())
print("Average NetFlow:", model_df["NetFlow"].mean())

# Save numerical correlations and print target relationships.
numeric_df = model_df.select_dtypes(include=np.number)
correlation = numeric_df.corr()
correlation.to_csv(OUTPUT_DIR / "correlation_matrix.csv")
print("\nCorrelations with NextDayEntries:")
print(correlation["NextDayEntries"].sort_values(ascending=False))
print("\nCorrelations with NextDayExits:")
print(correlation["NextDayExits"].sort_values(ascending=False))

# Save the ten highest and lowest traffic dates for both measures.
traffic_columns = ["Date", "DayOfWeek", "Entries", "Exits", "NetFlow"]
model_df.nlargest(10, "Entries")[traffic_columns].to_csv(
    OUTPUT_DIR / "highest_entry_days.csv", index=False, date_format="%Y-%m-%d"
)
model_df.nsmallest(10, "Entries")[traffic_columns].to_csv(
    OUTPUT_DIR / "lowest_entry_days.csv", index=False, date_format="%Y-%m-%d"
)
model_df.nlargest(10, "Exits")[traffic_columns].to_csv(
    OUTPUT_DIR / "highest_exit_days.csv", index=False, date_format="%Y-%m-%d"
)
model_df.nsmallest(10, "Exits")[traffic_columns].to_csv(
    OUTPUT_DIR / "lowest_exit_days.csv", index=False, date_format="%Y-%m-%d"
)

# Compare raw traffic with short- and longer-term rolling trends.
save_line_chart(
    ["Entries", "EntryRolling7"],
    "Entries and Previous Seven-Day Rolling Average",
    "Vehicle Entries",
    "entry_rolling7_trend.png",
)
save_line_chart(
    ["Exits", "ExitRolling7"],
    "Exits and Previous Seven-Day Rolling Average",
    "Vehicle Exits",
    "exit_rolling7_trend.png",
)
save_line_chart(
    ["Entries", "EntryRolling3", "EntryRolling7"],
    "Entry Short-Term vs Weekly Trend",
    "Vehicle Entries",
    "entry_short_vs_long_trend.png",
)

# Create a chronological 80/20 split without shuffling.
split_index = int(len(model_df) * 0.80)
train_df = model_df.iloc[:split_index].copy()
test_df = model_df.iloc[split_index:].copy()
train_df.to_csv(OUTPUT_DIR / "train_dataset.csv", index=False, date_format="%Y-%m-%d")
test_df.to_csv(OUTPUT_DIR / "test_dataset.csv", index=False, date_format="%Y-%m-%d")

print("\nCHRONOLOGICAL TRAIN/TEST SPLIT")
print("Training rows:", len(train_df))
print("Testing rows:", len(test_df))
print("Training date range:", train_df["Date"].min().date(), "to", train_df["Date"].max().date())
print("Testing date range:", test_df["Date"].min().date(), "to", test_df["Date"].max().date())

# Declare future model inputs explicitly; no model is trained at this stage.
feature_columns = [
    "Entries", "Exits", "Month", "DayOfWeekNum", "IsWeekend", "NetFlow",
    "PrevDayEntries", "PrevDayExits", "EntryRolling3", "ExitRolling3",
    "EntryRolling7", "ExitRolling7", "EntryRollingStd7", "EntriesLag7",
    "ExitsLag7", "TargetDayOfWeekNum", "TargetIsWeekend", "TargetMonth",
]
print("\nSelected future model features:")
print(feature_columns)

# Evaluate persistence baselines: tomorrow is predicted to equal today.
baseline_entry_prediction = test_df["Entries"]
baseline_exit_prediction = test_df["Exits"]


def calculate_metrics(actual, predicted):
    return {
        "MAE": mean_absolute_error(actual, predicted),
        "RMSE": np.sqrt(mean_squared_error(actual, predicted)),
        "R2": r2_score(actual, predicted),
    }


entry_metrics = calculate_metrics(test_df["NextDayEntries"], baseline_entry_prediction)
exit_metrics = calculate_metrics(test_df["NextDayExits"], baseline_exit_prediction)
baseline_results = pd.DataFrame([
    {"Target": "NextDayEntries", **entry_metrics},
    {"Target": "NextDayExits", **exit_metrics},
])
baseline_results.to_csv(OUTPUT_DIR / "baseline_results.csv", index=False)

# Plot actual next-day values against the naive predictions.
for target, prediction, label, filename in [
    ("NextDayEntries", baseline_entry_prediction, "Entries", "baseline_entries_actual_vs_predicted.png"),
    ("NextDayExits", baseline_exit_prediction, "Exits", "baseline_exits_actual_vs_predicted.png"),
]:
    plt.figure(figsize=(11, 6))
    plt.plot(test_df["Date"], test_df[target], label=f"Actual Next-Day {label}", marker="o")
    plt.plot(test_df["Date"], prediction, label="Naive Prediction", marker="o")
    plt.title(f"Actual vs Naive Baseline: Next-Day {label}")
    plt.xlabel("Prediction Date")
    plt.ylabel("Vehicle Count")
    plt.xticks(rotation=45)
    plt.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close()

# Calculate final facts for the console and written summary.
highest_entry_row = model_df.loc[model_df["Entries"].idxmax()]
highest_exit_row = model_df.loc[model_df["Exits"].idxmax()]
most_active_weekday = weekday_summary["Entries"].idxmax()
least_active_weekday = weekday_summary["Entries"].idxmin()
weekday_entries = weekend_weekday_summary.loc["Weekday", "Entries"]
weekend_entries = weekend_weekday_summary.loc["Weekend", "Entries"]
weekend_difference_pct = (weekend_entries - weekday_entries) / weekday_entries * 100
entry_exit_correlation = correlation.loc["Entries", "Exits"]

summary_text = f"""SMART PARKING EDA SUMMARY

Original Records: {original_records}
Model-Ready Records: {len(model_df)}
Input Missing Values: {int(original_missing.sum())}
Input Duplicate Rows: {duplicate_count}

Date Range: {model_df['Date'].min().date()} to {model_df['Date'].max().date()}

Average Daily Entries: {model_df['Entries'].mean():.2f}
Average Daily Exits: {model_df['Exits'].mean():.2f}

Highest Entry Day: {highest_entry_row['Date'].date()} ({int(highest_entry_row['Entries'])})
Highest Exit Day: {highest_exit_row['Date'].date()} ({int(highest_exit_row['Exits'])})

Most Active Weekday: {most_active_weekday}
Least Active Weekday: {least_active_weekday}

Average Weekday Entries: {weekday_entries:.2f}
Average Weekend Entries: {weekend_entries:.2f}
Weekend Entry Difference vs Weekdays: {weekend_difference_pct:.2f}%
Entries/Exits Correlation: {entry_exit_correlation:.4f}

Training Rows: {len(train_df)}
Testing Rows: {len(test_df)}
Training Date Range: {train_df['Date'].min().date()} to {train_df['Date'].max().date()}
Testing Date Range: {test_df['Date'].min().date()} to {test_df['Date'].max().date()}

Baseline Entry MAE: {entry_metrics['MAE']:.4f}
Baseline Entry RMSE: {entry_metrics['RMSE']:.4f}
Baseline Entry R²: {entry_metrics['R2']:.4f}

Baseline Exit MAE: {exit_metrics['MAE']:.4f}
Baseline Exit RMSE: {exit_metrics['RMSE']:.4f}
Baseline Exit R²: {exit_metrics['R2']:.4f}
"""
(OUTPUT_DIR / "eda_summary.txt").write_text(summary_text, encoding="utf-8")

print("\n" + summary_text)
print("Generated model-ready dataset:", V2_CSV)
print("Generated output folder:", OUTPUT_DIR)
