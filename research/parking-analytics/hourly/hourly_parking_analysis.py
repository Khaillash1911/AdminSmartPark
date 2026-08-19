from pathlib import Path
import json
import re

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


# Keep source and generated evidence paths independent of the working directory.
BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "combined_daily_parking.csv"
OUTPUT_DIR = BASE_DIR / "outputs"
PROFILE_DIR = OUTPUT_DIR / "daily_profiles"
OUTPUT_DIR.mkdir(exist_ok=True)
PROFILE_DIR.mkdir(exist_ok=True)


# Load the five sampled hourly reports without modifying the source CSV.
df = pd.read_csv(INPUT_CSV)
print("SMART PARKING HOURLY DATA VALIDATION")
print("Shape:", df.shape)
print("Columns:", df.columns.tolist())
print("Unique dates:", df["Date"].nunique())
print("Records per date:\n", df.groupby("Date").size())
print("Missing values:\n", df.isnull().sum())
print("Duplicate records:", df.duplicated().sum())
print("Entries data type:", df["Entries"].dtype)
print("Exits data type:", df["Exits"].dtype)

# Stop explicitly if the expected complete sampled dataset is not present.
required_columns = ["Date", "Time", "Entries", "Exits"]
if df.columns.tolist() != required_columns:
    raise ValueError(f"Expected columns {required_columns}, found {df.columns.tolist()}.")
if len(df) != 120 or df["Date"].nunique() != 5:
    raise ValueError("Expected exactly 120 records across five sampled dates.")
records_per_date = df.groupby("Date").size()
if not records_per_date.eq(24).all():
    raise ValueError("Every sampled date must contain exactly 24 hourly records.")
if df.isnull().any().any() or df.duplicated().any():
    raise ValueError("Missing or duplicate records require manual review.")
if not (pd.api.types.is_numeric_dtype(df["Entries"]) and pd.api.types.is_numeric_dtype(df["Exits"])):
    raise TypeError("Entries and Exits must already be numeric.")

# Parse dates and validate the original time-period format.
parsed_dates = pd.to_datetime(df["Date"], errors="coerce")
if parsed_dates.isnull().any():
    raise ValueError("One or more Date values could not be parsed.")
time_pattern = re.compile(r"^(\d{2}):00-(\d{2}):00$")
if not df["Time"].astype(str).map(lambda value: bool(time_pattern.match(value))).all():
    raise ValueError("One or more Time values do not match HH:00-HH:00.")
df["Date"] = parsed_dates

# Derive the starting hour while preserving the original Time label.
df["Hour"] = df["Time"].str.extract(r"^(\d{2})", expand=False).astype(int)
if not df["Hour"].between(0, 23).all():
    raise ValueError("Starting hours must be between 0 and 23.")
expected_hours = set(range(24))
if any(set(group["Hour"]) != expected_hours for _, group in df.groupby("Date")):
    raise ValueError("Each date must contain each starting hour exactly once.")

# Add descriptive calendar fields; they are not used for ML training.
df["DayOfWeek"] = df["Date"].dt.day_name()
df["DayOfWeekNum"] = df["Date"].dt.dayofweek
df["IsWeekend"] = (df["DayOfWeekNum"] >= 5).astype(int)
df = df.sort_values(["Date", "Hour"]).reset_index(drop=True)
print("Hourly dataset validation passed.")

# Calculate hourly traffic statistics across the five sampled reports.
hourly_summary = (
    df.groupby(["Hour", "Time"], as_index=False)
    .agg(
        AverageEntries=("Entries", "mean"),
        AverageExits=("Exits", "mean"),
        MinimumEntries=("Entries", "min"),
        MaximumEntries=("Entries", "max"),
        MinimumExits=("Exits", "min"),
        MaximumExits=("Exits", "max"),
        EntryStandardDeviation=("Entries", "std"),
        ExitStandardDeviation=("Exits", "std"),
    )
    .sort_values("Hour")
    .reset_index(drop=True)
)
hourly_summary.to_csv(OUTPUT_DIR / "hourly_traffic_summary.csv", index=False)

# Plot the principal average hourly entry and exit pattern.
plt.figure(figsize=(12, 6))
plt.plot(hourly_summary["Hour"], hourly_summary["AverageEntries"], marker="o", label="Average Entries")
plt.plot(hourly_summary["Hour"], hourly_summary["AverageExits"], marker="o", label="Average Exits")
plt.title("Average Hourly Parking Traffic Across Five Sampled Days")
plt.xlabel("Starting Hour")
plt.ylabel("Average Number of Vehicles")
plt.xticks(range(24))
plt.legend()
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "average_hourly_traffic.png", dpi=150)
plt.close()

# Identify the overall average entry and exit peak periods.
peak_entry = hourly_summary.loc[hourly_summary["AverageEntries"].idxmax()]
peak_exit = hourly_summary.loc[hourly_summary["AverageExits"].idxmax()]
print("\nPEAK ENTRY HOUR")
print("Time:", peak_entry["Time"])
print("Average Entries:", peak_entry["AverageEntries"])
print("Minimum:", peak_entry["MinimumEntries"])
print("Maximum:", peak_entry["MaximumEntries"])
print("\nPEAK EXIT HOUR")
print("Time:", peak_exit["Time"])
print("Average Exits:", peak_exit["AverageExits"])
print("Minimum:", peak_exit["MinimumExits"])
print("Maximum:", peak_exit["MaximumExits"])

# Identify each sampled day's highest entry and exit periods.
daily_peak_rows = []
for date, day in df.groupby("Date", sort=True):
    entry_row = day.loc[day["Entries"].idxmax()]
    exit_row = day.loc[day["Exits"].idxmax()]
    daily_peak_rows.append({
        "Date": date.date(),
        "PeakEntryHour": entry_row["Time"],
        "PeakEntryCount": int(entry_row["Entries"]),
        "PeakExitHour": exit_row["Time"],
        "PeakExitCount": int(exit_row["Exits"]),
    })
daily_peaks = pd.DataFrame(daily_peak_rows)
daily_peaks.to_csv(OUTPUT_DIR / "daily_peak_hours.csv", index=False)

# Count how consistently every period appears as an individual daily peak.
entry_peak_counts = daily_peaks["PeakEntryHour"].value_counts()
exit_peak_counts = daily_peaks["PeakExitHour"].value_counts()
consistency_rows = []
for time_period in hourly_summary["Time"]:
    entry_count = int(entry_peak_counts.get(time_period, 0))
    exit_count = int(exit_peak_counts.get(time_period, 0))
    consistency_rows.append({
        "Time": time_period,
        "PeakEntryDays": entry_count,
        "PeakEntryConsistencyPercent": entry_count / len(daily_peaks) * 100,
        "PeakExitDays": exit_count,
        "PeakExitConsistencyPercent": exit_count / len(daily_peaks) * 100,
    })
consistency = pd.DataFrame(consistency_rows)
consistency.to_csv(OUTPUT_DIR / "peak_hour_consistency.csv", index=False)
overall_entry_consistency = int(entry_peak_counts.get(peak_entry["Time"], 0))
overall_exit_consistency = int(exit_peak_counts.get(peak_exit["Time"], 0))

# Draw entry and exit heatmaps using date-hour matrices.
for measure, filename, title in [
    ("Entries", "entry_hour_heatmap.png", "Hourly Vehicle Entries by Sampled Date"),
    ("Exits", "exit_hour_heatmap.png", "Hourly Vehicle Exits by Sampled Date"),
]:
    matrix = df.pivot(index="Date", columns="Hour", values=measure).sort_index()
    plt.figure(figsize=(14, 5))
    image = plt.imshow(matrix.to_numpy(), aspect="auto", cmap="YlOrRd")
    plt.colorbar(image, label=f"Vehicle {measure}")
    plt.xticks(range(24), matrix.columns)
    plt.yticks(range(len(matrix)), [date.strftime("%Y-%m-%d") for date in matrix.index])
    plt.title(title)
    plt.xlabel("Starting Hour")
    plt.ylabel("Sampled Date")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close()

# Estimate within-day vehicle accumulation from cumulative gate net flow.
df["NetFlow"] = df["Entries"] - df["Exits"]
df["CumulativeNetFlow"] = df.groupby("Date")["NetFlow"].cumsum()
daily_accumulation_peaks = []
plt.figure(figsize=(12, 7))
for date, day in df.groupby("Date", sort=True):
    plt.plot(day["Hour"], day["CumulativeNetFlow"], marker="o", label=date.strftime("%Y-%m-%d"))
    maximum_row = day.loc[day["CumulativeNetFlow"].idxmax()]
    daily_accumulation_peaks.append({
        "Date": date.date(),
        "MaximumAccumulationHour": maximum_row["Time"],
        "MaximumEstimatedAccumulation": int(maximum_row["CumulativeNetFlow"]),
    })
plt.title("Estimated Vehicle Accumulation by Sampled Day")
plt.xlabel("Starting Hour")
plt.ylabel("Estimated Vehicle Accumulation")
plt.xticks(range(24))
plt.legend()
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "estimated_vehicle_accumulation.png", dpi=150)
plt.close()

# Calculate and plot the average estimated accumulation by hour.
average_accumulation = (
    df.groupby(["Hour", "Time"], as_index=False)["CumulativeNetFlow"]
    .mean()
    .rename(columns={"CumulativeNetFlow": "AverageEstimatedAccumulation"})
    .sort_values("Hour")
)
average_accumulation.to_csv(OUTPUT_DIR / "average_accumulation_by_hour.csv", index=False)
highest_accumulation = average_accumulation.loc[average_accumulation["AverageEstimatedAccumulation"].idxmax()]
plt.figure(figsize=(12, 6))
plt.plot(average_accumulation["Hour"], average_accumulation["AverageEstimatedAccumulation"], marker="o")
plt.scatter(highest_accumulation["Hour"], highest_accumulation["AverageEstimatedAccumulation"], color="red", zorder=3, label="Highest Average")
plt.title("Average Estimated Vehicle Accumulation Pattern")
plt.xlabel("Starting Hour")
plt.ylabel("Average Estimated Vehicle Accumulation")
plt.xticks(range(24))
plt.legend()
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "average_accumulation_pattern.png", dpi=150)
plt.close()

# Classify hourly total movement using quantiles derived from the 24 averages.
hourly_levels = hourly_summary[["Hour", "Time", "AverageEntries", "AverageExits"]].copy()
hourly_levels["AverageTotalMovement"] = hourly_levels["AverageEntries"] + hourly_levels["AverageExits"]
low_threshold = hourly_levels["AverageTotalMovement"].quantile(0.33)
high_threshold = hourly_levels["AverageTotalMovement"].quantile(0.66)
hourly_levels["TrafficLevel"] = np.select(
    [
        hourly_levels["AverageTotalMovement"] < low_threshold,
        hourly_levels["AverageTotalMovement"] < high_threshold,
    ],
    ["LOW", "MEDIUM"],
    default="HIGH",
)
hourly_levels.to_csv(OUTPUT_DIR / "hourly_traffic_levels.csv", index=False)
high_traffic_hours = hourly_levels.loc[hourly_levels["TrafficLevel"] == "HIGH", "Time"].tolist()
low_traffic_hours = hourly_levels.loc[hourly_levels["TrafficLevel"] == "LOW", "Time"].tolist()

# Compare average traffic again while marking the two different peak periods.
plt.figure(figsize=(12, 6))
plt.plot(hourly_summary["Hour"], hourly_summary["AverageEntries"], marker="o", label="Average Entries")
plt.plot(hourly_summary["Hour"], hourly_summary["AverageExits"], marker="o", label="Average Exits")
plt.scatter(peak_entry["Hour"], peak_entry["AverageEntries"], s=100, label=f"Peak Entry: {peak_entry['Time']}")
plt.scatter(peak_exit["Hour"], peak_exit["AverageExits"], s=100, label=f"Peak Exit: {peak_exit['Time']}")
plt.title("Average Entry and Exit Peaks Across Sampled Days")
plt.xlabel("Starting Hour")
plt.ylabel("Average Number of Vehicles")
plt.xticks(range(24))
plt.legend()
plt.tight_layout()
plt.savefig(OUTPUT_DIR / "peak_entry_exit_comparison.png", dpi=150)
plt.close()

# Produce a supporting entry/exit traffic profile for each sampled date.
for date, day in df.groupby("Date", sort=True):
    plt.figure(figsize=(11, 5))
    plt.plot(day["Hour"], day["Entries"], marker="o", label="Entries")
    plt.plot(day["Hour"], day["Exits"], marker="o", label="Exits")
    plt.title(f"Hourly Parking Traffic Profile: {date.date()}")
    plt.xlabel("Starting Hour")
    plt.ylabel("Number of Vehicles")
    plt.xticks(range(24))
    plt.legend()
    plt.tight_layout()
    plt.savefig(PROFILE_DIR / f"{date.date()}_traffic_profile.png", dpi=150)
    plt.close()

# Save calculated periods in machine-readable form for later integration.
profile = {
    "sampled_days": len(daily_peaks),
    "peak_entry_hour": peak_entry["Time"],
    "peak_exit_hour": peak_exit["Time"],
    "high_traffic_hours": high_traffic_hours,
    "low_traffic_hours": low_traffic_hours,
    "low_total_movement_threshold": float(low_threshold),
    "high_total_movement_threshold": float(high_threshold),
    "highest_average_accumulation_hour": highest_accumulation["Time"],
}
(OUTPUT_DIR / "peak_hour_profile.json").write_text(json.dumps(profile, indent=4), encoding="utf-8")

# Calculate daily totals and write the documented sampled-analysis summary.
daily_totals = df.groupby("Date")[["Entries", "Exits"]].sum()
limitation = (
    "Only five complete hourly reports were available for the hourly traffic analysis. "
    "Therefore, the results are used to identify recurring peak-hour patterns within the "
    "available samples rather than to train a separate hourly machine-learning prediction model."
)
summary = f"""SMART PARKING HOURLY TRAFFIC ANALYSIS

Number of Sampled Days: {df['Date'].nunique()}
Total Hourly Records: {len(df)}

Date Range: {df['Date'].min().date()} to {df['Date'].max().date()}

Average Daily Entries: {daily_totals['Entries'].mean():.2f}
Average Daily Exits: {daily_totals['Exits'].mean():.2f}

Overall Peak Entry Hour: {peak_entry['Time']}
Average Entries During Peak: {peak_entry['AverageEntries']:.2f}

Overall Peak Exit Hour: {peak_exit['Time']}
Average Exits During Peak: {peak_exit['AverageExits']:.2f}

Peak Entry Consistency: {overall_entry_consistency}/{len(daily_peaks)} sampled days ({overall_entry_consistency / len(daily_peaks) * 100:.2f}%)
Peak Exit Consistency: {overall_exit_consistency}/{len(daily_peaks)} sampled days ({overall_exit_consistency / len(daily_peaks) * 100:.2f}%)

Highest Estimated Parking Accumulation Period: {highest_accumulation['Time']} (average estimated accumulation {highest_accumulation['AverageEstimatedAccumulation']:.2f})

High Traffic Hours: {', '.join(high_traffic_hours)}
Low Traffic Hours: {', '.join(low_traffic_hours)}

Interpretation: Historical hourly traffic analysis identified recurring intraday patterns within the sampled reports. Estimated vehicle accumulation is based on cumulative gate movements and is not actual physical parking occupancy.

Limitation: {limitation}
"""
(OUTPUT_DIR / "hourly_analysis_summary.txt").write_text(summary, encoding="utf-8")

print("\n" + summary)
print("Daily estimated accumulation peaks:")
print(pd.DataFrame(daily_accumulation_peaks).to_string(index=False))
print("\nGenerated output folder:", OUTPUT_DIR)
