from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# Keep generated evidence and models beside this script.
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
INPUT_CSV = OUTPUT_DIR / "monthly_parking_model_ready_v2.csv"
MODEL_DIR = OUTPUT_DIR / "models"
OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_DIR.mkdir(exist_ok=True)


# Calculate the three required regression evaluation metrics.
def evaluate_model(y_true, y_pred):
    return {
        "MAE": mean_absolute_error(y_true, y_pred),
        "RMSE": np.sqrt(mean_squared_error(y_true, y_pred)),
        "R2": r2_score(y_true, y_pred),
    }


# Produce an actual-versus-predicted line chart for one target and model.
def plot_predictions(dates, actual, predicted, title, filename):
    plt.figure(figsize=(11, 6))
    plt.plot(dates, actual, label="Actual", marker="o")
    plt.plot(dates, predicted, label="Predicted", marker="o")
    plt.title(title)
    plt.xlabel("Date")
    plt.ylabel("Vehicle Count")
    plt.xticks(rotation=45)
    plt.legend()
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close()


# Save a feature importance or coefficient table and horizontal chart.
def save_explanation(values, csv_name, png_name, value_column, title):
    explanation = pd.DataFrame({"Feature": feature_columns, value_column: values})
    explanation = explanation.sort_values(value_column, ascending=False).reset_index(drop=True)
    explanation.to_csv(OUTPUT_DIR / csv_name, index=False)
    chart_data = explanation.sort_values(value_column)
    plt.figure(figsize=(10, 8))
    plt.barh(chart_data["Feature"], chart_data[value_column])
    plt.title(title)
    plt.xlabel(value_column)
    plt.ylabel("Feature")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / png_name, dpi=150)
    plt.close()
    return explanation


# Generate next-day entry and exit predictions from a feature row.
def predict_next_day(entry_model, exit_model, feature_values):
    predicted_entries = entry_model.predict(feature_values)[0]
    predicted_exits = exit_model.predict(feature_values)[0]
    return {
        "predicted_entries": round(predicted_entries),
        "predicted_exits": round(predicted_exits),
    }


# Classify predicted entry demand using training-set quantiles.
def classify_demand(predicted_entries, low_threshold, high_threshold):
    if predicted_entries < low_threshold:
        return "LOW"
    if predicted_entries < high_threshold:
        return "MEDIUM"
    return "HIGH"


# Load and validate the final model-ready dataset without changing it.
df = pd.read_csv(INPUT_CSV)
df["Date"] = pd.to_datetime(df["Date"])
df = df.sort_values("Date").reset_index(drop=True)

print("SMART PARKING MODEL DATA VALIDATION")
print("Dataset shape:", df.shape)
print("Date range:", df["Date"].min().date(), "to", df["Date"].max().date())
print("Missing values:\n", df.isnull().sum())
print("Duplicate rows:", df.duplicated().sum())
print("Available columns:", df.columns.tolist())

# Define the same candidate inputs for entry and exit prediction.
feature_columns = [
    "Entries", "Exits", "Month", "DayOfWeekNum", "IsWeekend", "NetFlow",
    "PrevDayEntries", "PrevDayExits", "EntryRolling7", "ExitRolling7",
    "EntryRollingStd7", "EntriesLag7", "ExitsLag7", "EntryRolling3",
    "ExitRolling3", "TargetDayOfWeekNum", "TargetIsWeekend", "TargetMonth",
]
target_columns = ["NextDayEntries", "NextDayExits"]
missing_features = [feature for feature in feature_columns if feature not in df.columns]
if missing_features:
    raise ValueError(f"Required features are missing: {missing_features}")
if df[feature_columns + target_columns].isnull().any().any():
    raise ValueError("Model inputs or targets contain missing values.")

# Apply the same chronological 80/20 split as the baseline analysis.
split_index = int(len(df) * 0.80)
train_df = df.iloc[:split_index].copy()
test_df = df.iloc[split_index:].copy()
print("\nTraining rows:", len(train_df))
print("Testing rows:", len(test_df))
print("Training date range:", train_df["Date"].min().date(), "to", train_df["Date"].max().date())
print("Testing date range:", test_df["Date"].min().date(), "to", test_df["Date"].max().date())

# Explicitly validate the safeguards against target and chronological leakage.
assert not set(target_columns).intersection(feature_columns)
assert "Date" not in feature_columns and "DayOfWeek" not in feature_columns
assert train_df["Date"].max() < test_df["Date"].min()
assert {"TargetDayOfWeekNum", "TargetIsWeekend", "TargetMonth"}.issubset(feature_columns)
print("Data leakage checks passed.")

# Build common input matrices and target vectors.
X_train = train_df[feature_columns]
X_test = test_df[feature_columns]
y_train_entries = train_df["NextDayEntries"]
y_test_entries = test_df["NextDayEntries"]
y_train_exits = train_df["NextDayExits"]
y_test_exits = test_df["NextDayExits"]

# Re-evaluate the persistence baseline on the unchanged testing period.
predictions = {
    "Naive Baseline": {
        "Entries": test_df["Entries"].to_numpy(),
        "Exits": test_df["Exits"].to_numpy(),
    }
}

# Create independent estimators for each target and model family.
models = {
    "Linear Regression": {
        "Entries": LinearRegression(),
        "Exits": LinearRegression(),
    },
    "Random Forest": {
        "Entries": RandomForestRegressor(
            n_estimators=300, max_depth=None, min_samples_split=2,
            min_samples_leaf=1, random_state=42
        ),
        "Exits": RandomForestRegressor(
            n_estimators=300, max_depth=None, min_samples_split=2,
            min_samples_leaf=1, random_state=42
        ),
    },
    "Gradient Boosting": {
        "Entries": GradientBoostingRegressor(
            n_estimators=200, learning_rate=0.05, max_depth=3, random_state=42
        ),
        "Exits": GradientBoostingRegressor(
            n_estimators=200, learning_rate=0.05, max_depth=3, random_state=42
        ),
    },
}

# Fit every trained model using training records only and predict the test period.
for model_name, target_models in models.items():
    target_models["Entries"].fit(X_train, y_train_entries)
    target_models["Exits"].fit(X_train, y_train_exits)
    predictions[model_name] = {
        "Entries": target_models["Entries"].predict(X_test),
        "Exits": target_models["Exits"].predict(X_test),
    }

# Evaluate all baseline and trained predictions in one comparison table.
result_rows = []
for model_name, target_predictions in predictions.items():
    for target, actual in [("Entries", y_test_entries), ("Exits", y_test_exits)]:
        result_rows.append({
            "Model": model_name,
            "Target": target,
            **evaluate_model(actual, target_predictions[target]),
        })
results_df = pd.DataFrame(result_rows)
results_df.to_csv(OUTPUT_DIR / "model_comparison_results.csv", index=False)

# Pivot metrics into an FYP-ready one-row-per-model summary.
summary_rows = []
for model_name in predictions:
    entry_result = results_df.query("Model == @model_name and Target == 'Entries'").iloc[0]
    exit_result = results_df.query("Model == @model_name and Target == 'Exits'").iloc[0]
    summary_rows.append({
        "Model": model_name,
        "Entry_MAE": entry_result["MAE"], "Entry_RMSE": entry_result["RMSE"],
        "Entry_R2": entry_result["R2"], "Exit_MAE": exit_result["MAE"],
        "Exit_RMSE": exit_result["RMSE"], "Exit_R2": exit_result["R2"],
    })
comparison_summary = pd.DataFrame(summary_rows)
comparison_summary.to_csv(OUTPUT_DIR / "model_comparison_summary.csv", index=False)

# Select consistent winners by aggregate metric rank, then MAE and RMSE.
def select_best_model(target):
    candidates = results_df[(results_df["Target"] == target) & (results_df["Model"] != "Naive Baseline")].copy()
    candidates["MAE_rank"] = candidates["MAE"].rank(method="min")
    candidates["RMSE_rank"] = candidates["RMSE"].rank(method="min")
    candidates["R2_rank"] = candidates["R2"].rank(ascending=False, method="min")
    candidates["Total_rank"] = candidates[["MAE_rank", "RMSE_rank", "R2_rank"]].sum(axis=1)
    return candidates.sort_values(["Total_rank", "MAE", "RMSE"], ascending=[True, True, True]).iloc[0]


best_entry_result = select_best_model("Entries")
best_exit_result = select_best_model("Exits")
best_entry_name = best_entry_result["Model"]
best_exit_name = best_exit_result["Model"]
best_entry_model = models[best_entry_name]["Entries"]
best_exit_model = models[best_exit_name]["Exits"]
print("\nBEST ENTRY MODEL:", best_entry_name)
print("BEST EXIT MODEL:", best_exit_name)

# Create separate actual-versus-predicted plots for every trained model.
file_stems = {
    "Linear Regression": "linear", "Random Forest": "random_forest",
    "Gradient Boosting": "gradient_boosting",
}
for model_name, stem in file_stems.items():
    for target, actual in [("Entries", y_test_entries), ("Exits", y_test_exits)]:
        plot_predictions(
            test_df["Date"], actual, predictions[model_name][target],
            f"{model_name}: Actual vs Predicted {target}",
            f"{stem}_{target.lower()}_actual_vs_predicted.png",
        )

# Plot signed residuals for the selected entry and exit models.
for target, actual, model_name, filename in [
    ("Entries", y_test_entries, best_entry_name, "best_entry_model_errors.png"),
    ("Exits", y_test_exits, best_exit_name, "best_exit_model_errors.png"),
]:
    errors = np.asarray(actual) - predictions[model_name][target]
    plt.figure(figsize=(11, 5))
    plt.axhline(0, color="black", linewidth=1)
    plt.plot(test_df["Date"], errors, marker="o")
    plt.title(f"{model_name} {target}: Actual - Predicted Error")
    plt.xlabel("Date")
    plt.ylabel("Prediction Error")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close()

# Save tree-based feature importance evidence and charts.
explanations = {}
for model_name, prefix in [("Random Forest", "random_forest"), ("Gradient Boosting", "gradient")]:
    explanations[model_name] = {}
    for target in ["Entries", "Exits"]:
        target_slug = "entry" if target == "Entries" else "exit"
        explanations[model_name][target] = save_explanation(
            models[model_name][target].feature_importances_,
            f"{prefix}_{target_slug}_feature_importance.csv",
            f"{prefix}_{target_slug}_feature_importance.png",
            "Importance", f"{model_name} {target} Feature Importance",
        )

# Standardize Linear Regression coefficients using training data for fair influence ranking.
for target in ["Entries", "Exits"]:
    target_slug = "entry" if target == "Entries" else "exit"
    estimator = models["Linear Regression"][target]
    target_training_values = y_train_entries if target == "Entries" else y_train_exits
    feature_standard_deviation = X_train.std(ddof=0).to_numpy()
    target_standard_deviation = target_training_values.std(ddof=0)
    standardized_coefficients = (
        estimator.coef_ * feature_standard_deviation / target_standard_deviation
    )
    coefficients = pd.DataFrame({
        "Feature": feature_columns,
        "Coefficient": estimator.coef_,
        "StandardizedCoefficient": standardized_coefficients,
        "AbsoluteStandardizedCoefficient": np.abs(standardized_coefficients),
    }).sort_values("AbsoluteStandardizedCoefficient", ascending=False).reset_index(drop=True)
    coefficients.to_csv(OUTPUT_DIR / f"linear_{target_slug}_coefficients.csv", index=False)
    chart_data = coefficients.sort_values("StandardizedCoefficient")
    plt.figure(figsize=(10, 8))
    plt.barh(chart_data["Feature"], chart_data["StandardizedCoefficient"])
    plt.title(f"Linear Regression {target} Standardized Coefficients")
    plt.xlabel("Standardized Coefficient")
    plt.ylabel("Feature")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / f"linear_{target.lower()}_coefficients.png", dpi=150)
    plt.close()
    explanations.setdefault("Linear Regression", {})[target] = coefficients

# Calculate the selected models' percentage improvement over the baseline.
baseline_entry = results_df.query("Model == 'Naive Baseline' and Target == 'Entries'").iloc[0]
baseline_exit = results_df.query("Model == 'Naive Baseline' and Target == 'Exits'").iloc[0]
improvement_rows = []
for target, baseline, best in [
    ("Entries", baseline_entry, best_entry_result), ("Exits", baseline_exit, best_exit_result)
]:
    improvement_rows.append({
        "Target": target, "BestModel": best["Model"],
        "MAE_Improvement_Percent": (baseline["MAE"] - best["MAE"]) / baseline["MAE"] * 100,
        "RMSE_Improvement_Percent": (baseline["RMSE"] - best["RMSE"]) / baseline["RMSE"] * 100,
    })
improvement_df = pd.DataFrame(improvement_rows)
improvement_df.to_csv(OUTPUT_DIR / "baseline_improvement_summary.csv", index=False)
print("\nImprovement over naive baseline:")
print(improvement_df.to_string(index=False))

# Save the selected estimators and their required ordered feature list.
joblib.dump(best_entry_model, MODEL_DIR / "best_entry_prediction_model.pkl")
joblib.dump(best_exit_model, MODEL_DIR / "best_exit_prediction_model.pkl")
(MODEL_DIR / "model_features.txt").write_text("\n".join(feature_columns) + "\n", encoding="utf-8")

# Derive LOW/MEDIUM/HIGH demand thresholds from training entry quantiles only.
low_threshold = train_df["Entries"].quantile(0.33)
high_threshold = train_df["Entries"].quantile(0.66)
threshold_text = f"LOW: predicted entries < {low_threshold:.2f}\nMEDIUM: {low_threshold:.2f} <= predicted entries < {high_threshold:.2f}\nHIGH: predicted entries >= {high_threshold:.2f}\n"
(OUTPUT_DIR / "demand_thresholds.txt").write_text(threshold_text, encoding="utf-8")
print("\nDemand thresholds:\n" + threshold_text)

# Demonstrate inference with the newest available feature row, not as ground truth.
demo_features = df.iloc[[-1]][feature_columns]
demo_prediction = predict_next_day(best_entry_model, best_exit_model, demo_features)
demo_level = classify_demand(demo_prediction["predicted_entries"], low_threshold, high_threshold)
demo_date = df.iloc[-1]["Date"] + pd.Timedelta(days=1)
demo_text = f"""DEMONSTRATION PREDICTION
Prediction date: {demo_date.date()}
Predicted Next-Day Entries: {demo_prediction['predicted_entries']}
Predicted Next-Day Exits: {demo_prediction['predicted_exits']}
Predicted Demand Level: {demo_level}
This is a model demonstration, not observed ground truth.
"""
(OUTPUT_DIR / "demo_prediction.txt").write_text(demo_text, encoding="utf-8")
print(demo_text)

# Extract model-specific top-five explanations for the selected estimators.
top_entry_explanations = explanations[best_entry_name]["Entries"].head(5)
top_exit_explanations = explanations[best_exit_name]["Exits"].head(5)


def format_selected_explanations(model_name, explanation_rows):
    if model_name == "Linear Regression":
        return [
            f"{number}. {row.Feature}: standardized coefficient {row.StandardizedCoefficient:.4f}"
            for number, row in enumerate(explanation_rows.itertuples(), 1)
        ]
    return [
        f"{number}. {row.Feature}: tree feature importance {row.Importance:.4f}"
        for number, row in enumerate(explanation_rows.itertuples(), 1)
    ]


entry_explanation_lines = format_selected_explanations(best_entry_name, top_entry_explanations)
exit_explanation_lines = format_selected_explanations(best_exit_name, top_exit_explanations)
entry_evidence_method = (
    "Ranked by absolute standardized Linear Regression coefficient."
    if best_entry_name == "Linear Regression" else "Ranked by tree feature importance."
)
exit_evidence_method = (
    "Ranked by absolute standardized Linear Regression coefficient."
    if best_exit_name == "Linear Regression" else "Ranked by tree feature importance."
)

# Write a calculated final report containing every model result and selected finding.
lines = [
    "SMART PARKING PREDICTION MODEL SUMMARY", "",
    f"Training Records: {len(train_df)}", f"Testing Records: {len(test_df)}", "",
    f"Training Date Range: {train_df['Date'].min().date()} to {train_df['Date'].max().date()}",
    f"Testing Date Range: {test_df['Date'].min().date()} to {test_df['Date'].max().date()}", "",
]
for target in ["Entries", "Exits"]:
    for model_name in predictions:
        row = results_df.query("Model == @model_name and Target == @target").iloc[0]
        lines.extend([
            f"{model_name} {target}:", f"MAE: {row['MAE']:.4f}",
            f"RMSE: {row['RMSE']:.4f}", f"R²: {row['R2']:.4f}", "",
        ])
    selected = best_entry_name if target == "Entries" else best_exit_name
    target_label = "Entry" if target == "Entries" else "Exit"
    lines.extend([f"Best {target_label} Model: {selected}", ""])
lines.extend([
    f"Entry MAE Improvement Over Baseline: {improvement_df.iloc[0]['MAE_Improvement_Percent']:.2f}%",
    f"Entry RMSE Improvement Over Baseline: {improvement_df.iloc[0]['RMSE_Improvement_Percent']:.2f}%",
    f"Exit MAE Improvement Over Baseline: {improvement_df.iloc[1]['MAE_Improvement_Percent']:.2f}%",
    f"Exit RMSE Improvement Over Baseline: {improvement_df.iloc[1]['RMSE_Improvement_Percent']:.2f}%", "",
    f"Selected Entry Model Influence ({best_entry_name} evidence):",
    entry_evidence_method,
    *entry_explanation_lines, "",
    f"Selected Exit Model Influence ({best_exit_name} evidence):",
    exit_evidence_method,
    *exit_explanation_lines, "",
    "Demand Thresholds:", threshold_text.rstrip(), "", demo_text.rstrip(), "",
])
(OUTPUT_DIR / "model_summary.txt").write_text("\n".join(lines), encoding="utf-8")

print("\nMODEL COMPARISON RESULTS")
print(results_df.to_string(index=False))
print("\nSaved model files:")
for path in sorted(MODEL_DIR.iterdir()):
    print(path)
