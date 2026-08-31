# SmartPark APU Model Building Chapter — Complete LLM Source Pack

## Purpose of this file

This document is a factual source pack and writing prompt for producing a detailed academic report section about the data analytics and machine-learning work in the SmartPark APU Admin project. It is designed to be provided directly to an LLM.

The principal model-building example is the **next-day parking-demand prediction system**. It predicts next-day vehicle entries and next-day vehicle exits using two separate regression models, calculates predicted net flow, and classifies expected demand as Low, Medium, or High.

The generated report should explain the complete analytical lifecycle:

1. problem definition;
2. data collection and source preservation;
3. data understanding;
4. cleaning and preprocessing;
5. exploratory data analysis;
6. feature engineering;
7. time-series-aware training and testing;
8. baseline construction;
9. candidate model development;
10. model evaluation and comparison;
11. final model selection;
12. model interpretation;
13. serialization and system deployment;
14. real-time prediction and recommendation; and
15. limitations and future improvements.

This file distinguishes facts supported by the repository from statements that must not be invented.

---

# Part A — Instructions for the LLM

## Writing assignment

Write a comprehensive academic section titled approximately:

> **Data Analytics and Machine-Learning Model Development**

The section should be suitable for a final-year computing project report. Use formal academic prose, past tense for completed research activities, and present tense when describing how the deployed system currently operates.

The writing should:

- explain why next-day parking entries and exits were predicted;
- present the analysis as a reproducible pipeline rather than a collection of unrelated scripts;
- explain every major preprocessing and modeling decision;
- use the exact dataset sizes, dates, features, estimators and metrics provided below;
- explain why chronological splitting was used instead of random splitting;
- compare the final models against a naive persistence baseline;
- interpret MAE in vehicles, RMSE as sensitivity to large errors, and R² as explained variance;
- explain why Linear Regression was selected even though more complex ensemble models were tested;
- state that two independent models were trained, one for entries and one for exits;
- explain how the serialized models are used by the deployed dashboard;
- distinguish the evaluated test results from the unevaluated demonstration forecast;
- discuss limitations honestly; and
- refer to suggested tables, equations, code listings and figures.

Do not present this as sentiment analysis, classification training, or an LLM model. It is a supervised regression and time-series feature-engineering task implemented with pandas and scikit-learn.

## Facts the LLM must not alter

- The final selected model is **scikit-learn LinearRegression**, not Gradient Boosting, XGBoost, or LightGBM.
- Separate entry and exit estimators were trained.
- The split was chronological 80:20, without shuffling.
- The final model-ready dataset contained 107 rows.
- Training used 85 rows from 15 April 2026 through 8 July 2026.
- Testing used 22 rows from 9 July 2026 through 30 July 2026.
- The primary metrics were MAE, RMSE and R².
- Entry Linear Regression: MAE 226.4830, RMSE 362.0111, R² 0.87640235.
- Exit Linear Regression: MAE 245.5360, RMSE 459.8802, R² 0.76715575.
- The model used 18 features listed later in this document.
- No public-holiday, weather, event, semester, day-of-month or live camera feature was used.
- The forecast for 31 July 2026 was a demonstration only, not observed test-set ground truth.
- The research-model results must not be confused with YOLO detection confidence or EasyOCR confidence.

## Claims the LLM must not invent

Do not invent:

- a public dataset name that is not present in the repository;
- external dataset licenses or collection institutions;
- sensor hardware, camera model, sampling protocol, or ethical approval;
- k-fold cross-validation;
- random train/test splitting;
- hyperparameter grid search or Bayesian optimization;
- feature scaling or normalization before fitting;
- missing-value imputation;
- synthetic rows for missing dates;
- public-holiday or weather variables;
- model accuracy expressed as a percentage;
- statistical significance testing;
- confidence intervals;
- production retraining schedules;
- an unseen result for the 31 July demonstration forecast; or
- ANPR/double-parking evaluation metrics as part of this regression experiment.

If a detail is not available, explicitly identify it as a limitation instead of supplying a plausible-sounding value.

---

# Part B — Project and prediction objective

## B.1 System context

SmartPark APU is a parking administration system. Its dashboard combines live or simulated parking state, Firestore records, vehicle traffic, violations, revenue and research-based predictions. The machine-learning component forecasts the next day's total parking entries and exits. The two forecasts are also used to calculate net vehicle flow and a simple operational demand level.

## B.2 Modeling problem

The supervised-learning problem is:

```text
Input:
    recent daily entry/exit volumes,
    calendar variables,
    lagged traffic,
    rolling traffic statistics

Outputs:
    NextDayEntries
    NextDayExits

Derived outputs:
    PredictedNetFlow = PredictedEntries - PredictedExits
    DemandLevel = LOW, MEDIUM, or HIGH
```

This is a **two-target problem implemented using two independent single-output regression estimators**. It is not implemented as one multi-output estimator.

## B.3 Suggested research objective wording

> The objective of the modeling activity was to develop and evaluate a data-driven method for forecasting the total number of vehicles expected to enter and exit the parking facility on the following day. The forecasts were intended to support the administrative dashboard by indicating likely vehicle movement and categorizing anticipated parking demand into operational Low, Medium, or High levels.

## B.4 Suggested rationale

Predicting entries and exits separately is useful because the two flows have related but distinct operational meanings. Entries represent incoming demand, whereas exits indicate space turnover. Their difference provides predicted net flow:

```text
Predicted Net Flow = Predicted Next-Day Entries - Predicted Next-Day Exits
```

A positive result suggests more vehicles entering than leaving during the predicted day. A negative result suggests the reverse. The value is an aggregate movement estimate and should not be presented as a direct guarantee of end-of-day occupancy because occupancy also depends on the opening state and data boundaries.

---

# Part C — Tools, libraries and reproducibility

## C.1 Technology used

| Technology | Role in model development |
|---|---|
| Python | Research scripting and deployed inference |
| pandas | CSV loading, chronological sorting, grouping and feature construction |
| NumPy | Numeric operations and RMSE calculation |
| Matplotlib | EDA, prediction comparison, residual and coefficient figures |
| scikit-learn | Regression estimators and evaluation metrics |
| Joblib | Serializing and loading the selected estimators |
| CSV/text outputs | Reproducible evidence, intermediate datasets and summaries |

The repository currently specifies `pandas==3.0.2`, `numpy==2.4.2`, `scikit-learn==1.8.0`, and `joblib==1.5.3` in `requirements.txt`.

## C.2 Main research files

| File | Responsibility |
|---|---|
| `research/parking-analytics/monthly/monthly_parking_source.csv` | Preserved daily source dataset |
| `prepare_parking_dataset.py` | Initial inspection, cleaning, ordering and core features |
| `parking_eda_and_baseline.py` | Additional features, EDA, split and naive baseline |
| `parking_model_comparison.py` | Candidate training, evaluation, selection and serialization |
| `outputs/monthly_parking_cleaned.csv` | Cleaned dataset retaining feature-induced nulls |
| `outputs/monthly_parking_model_ready.csv` | Dataset after initial lag/target cleanup |
| `outputs/monthly_parking_model_ready_v2.csv` | Final model-ready dataset |
| `outputs/train_dataset.csv` | Chronological training partition |
| `outputs/test_dataset.csv` | Chronological testing partition |
| `outputs/model_comparison_results.csv` | Exact model metrics |
| `outputs/model_summary.txt` | Human-readable result summary |
| `outputs/models/*.pkl` | Deployed entry and exit estimators |
| `outputs/models/model_features.txt` | Required ordered feature contract |
| `backend/analytics_model.py` | Production feature preparation and inference |

## C.3 Reproducible execution order

The research pipeline should be described and run in this order:

```bash
python research/parking-analytics/monthly/prepare_parking_dataset.py
python research/parking-analytics/monthly/parking_eda_and_baseline.py
python research/parking-analytics/monthly/parking_model_comparison.py
```

The scripts resolve file paths relative to their own locations and preserve the original source CSV instead of overwriting it.

---

# Part D — Data collection and source dataset

## D.1 Source structure

The source file contains daily aggregate parking movement with three original fields:

| Original field | Type | Meaning |
|---|---|---|
| `Date` | Date | Calendar date of the observation |
| `Entries` | Integer count | Total vehicles entering on that date |
| `Exits` | Integer count | Total vehicles exiting on that date |

## D.2 Verified source dimensions

| Stage | Rows | Columns | Date range |
|---|---:|---:|---|
| Preserved source | 122 | 3 | 1 April 2026 – 31 July 2026 |
| Cleaned with engineered columns | 122 | 15 | 1 April 2026 – 31 July 2026 |
| Initial model-ready | 114 | 15 | 8 April 2026 – 30 July 2026 |
| Final model-ready v2 | 107 | 22 | 15 April 2026 – 30 July 2026 |

The row reductions are expected consequences of past-only lag/rolling windows and next-day targets:

- the first seven dates initially lack seven-day historical features;
- the final source date lacks next-day target values;
- adding seven-day lag features to the already reduced data removes seven more early records;
- rows containing unusable feature or target nulls are removed from the model-ready datasets.

## D.3 Safe wording for the source

The repository establishes that the data is a preserved daily parking source used for SmartPark research. It does not establish enough metadata to claim a specific public benchmark, collection device or licensing body.

Use wording such as:

> The analysis used a project parking-traffic dataset containing daily aggregate vehicle entries and exits. The preserved source contained 122 consecutive dated observations from 1 April 2026 to 31 July 2026. The original source file was retained unchanged, while cleaned and model-ready versions were written to a separate output directory to support reproducibility.

Do not call it a public dataset unless separate evidence is supplied by the project author.

---

# Part E — Data preprocessing

## E.1 Initial inspection

The first script performs explicit inspection before transformations:

- prints the first five records;
- prints the pandas dataframe information;
- reports shape, row count and column count;
- counts full duplicate rows;
- reports missing values;
- checks invalid date conversions;
- checks duplicate calendar dates; and
- identifies missing dates in the observed date range.

These checks provide evidence that modeling did not begin before basic data quality was examined.

## E.2 Type conversion

The transformations are:

```python
df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
df["Entries"] = pd.to_numeric(df["Entries"], errors="coerce")
df["Exits"] = pd.to_numeric(df["Exits"], errors="coerce")
```

Invalid dates are removed only when they exist. Numeric conversion failures become missing values so they can be detected rather than silently interpreted.

## E.3 Duplicate treatment

The dataset is sorted chronologically. If multiple rows share the same date, entries and exits are summed to recover one daily aggregate:

```python
df = (
    df.groupby("Date", as_index=False)[["Entries", "Exits"]]
      .sum()
      .sort_values("Date")
      .reset_index(drop=True)
)
```

The verified generated dataset reported no duplicate full rows in the final analyzed input.

## E.4 Missing-date treatment

The preprocessing script identifies missing dates using a complete `pd.date_range`, but does **not** create synthetic observations. This is important: the report must not claim interpolation, forward filling, mean imputation or fabricated zero-traffic days.

## E.5 Chronological ordering

All records are sorted by `Date`. Chronological order is essential because lag and rolling features represent past information. An unsorted dataframe could allow later observations to appear as if they were earlier history.

## E.6 Missing values caused by feature engineering

Lagged and rolling features naturally produce missing values at the start of the dataset. Next-day targets produce missing values at the end. Rows with incomplete model inputs or targets are removed:

```python
model_df = df.dropna().reset_index(drop=True)
```

This is listwise deletion of unusable engineered rows, not statistical imputation.

## E.7 Validation assertions

The preprocessing code verifies:

- all entry counts are non-negative;
- all exit counts are non-negative;
- `IsWeekend` contains only 0 or 1;
- next-day targets are present;
- seven-day rolling entry values are present; and
- seven-day rolling exit values are present.

## E.8 Suggested preprocessing explanation

> The preprocessing stage converted dates and traffic counts into suitable data types, ordered all observations chronologically and examined missing values and duplicate dates. Duplicate dates, if present, were designed to be aggregated by summing their entry and exit totals. Missing calendar dates were identified but were not synthetically generated. Past-only lag and rolling features naturally introduced missing values at the beginning of the series, while construction of next-day targets introduced missing values at the end. Only rows with complete predictors and targets were retained in the final modeling dataset.

---

# Part F — Feature engineering

## F.1 Prediction targets

Two supervised targets were generated by shifting daily totals one row backward:

```python
df["NextDayEntries"] = df["Entries"].shift(-1)
df["NextDayExits"] = df["Exits"].shift(-1)
```

For a row dated day `t`, the targets contain vehicle entries and exits on day `t+1`.

## F.2 Leakage prevention

Rolling statistics use `.shift(1)` before `.rolling(...)`. Therefore, the rolling value for a source day excludes that day’s outcome and uses only preceding observations where intended.

Examples:

```python
df["EntryRolling7"] = df["Entries"].shift(1).rolling(7).mean()
df["EntryRolling3"] = df["Entries"].shift(1).rolling(3).mean()
```

The model comparison code also verifies:

```python
assert not set(target_columns).intersection(feature_columns)
assert "Date" not in feature_columns
assert "DayOfWeek" not in feature_columns
assert train_df["Date"].max() < test_df["Date"].min()
```

## F.3 Complete 18-feature contract

Both the entry and exit models use the same ordered inputs:

| No. | Feature | Category | Calculation/meaning |
|---:|---|---|---|
| 1 | `Entries` | Current traffic | Entries on source/current day |
| 2 | `Exits` | Current traffic | Exits on source/current day |
| 3 | `Month` | Calendar | Month number of source day |
| 4 | `DayOfWeekNum` | Calendar | Monday 0 through Sunday 6 for source day |
| 5 | `IsWeekend` | Calendar | 1 for Saturday/Sunday, otherwise 0 |
| 6 | `NetFlow` | Derived traffic | Entries minus exits on source day |
| 7 | `PrevDayEntries` | Lag | Entries from preceding observation/day |
| 8 | `PrevDayExits` | Lag | Exits from preceding observation/day |
| 9 | `EntryRolling7` | Rolling | Mean of preceding seven entry observations |
| 10 | `ExitRolling7` | Rolling | Mean of preceding seven exit observations |
| 11 | `EntryRollingStd7` | Variation | Standard deviation of preceding seven entry observations |
| 12 | `EntriesLag7` | Weekly lag | Entries seven observations earlier |
| 13 | `ExitsLag7` | Weekly lag | Exits seven observations earlier |
| 14 | `EntryRolling3` | Rolling | Mean of preceding three entry observations |
| 15 | `ExitRolling3` | Rolling | Mean of preceding three exit observations |
| 16 | `TargetDayOfWeekNum` | Known future calendar | Weekday number for predicted day |
| 17 | `TargetIsWeekend` | Known future calendar | Weekend flag for predicted day |
| 18 | `TargetMonth` | Known future calendar | Month number for predicted day |

The exact order is written to `outputs/models/model_features.txt` and reused during production inference.

## F.4 Features not used

The model does not use:

- day of month;
- public-holiday status;
- APU academic calendar or semester week;
- examination periods;
- weather;
- special events;
- parking price;
- violations;
- occupancy-camera imagery;
- user identity; or
- personally identifiable information.

This absence should be discussed as an opportunity for future work, not concealed.

## F.5 Feature rationale

- Current entries/exits describe the latest traffic level.
- Net flow captures imbalance between incoming and outgoing traffic.
- Previous-day features represent short-term persistence.
- Three-day rolling means describe the recent short-term trend.
- Seven-day rolling means smooth daily noise.
- Seven-day lag variables capture weekly recurrence.
- Rolling standard deviation describes recent volatility.
- Source and target calendar variables allow the models to distinguish weekdays, weekends and month changes.

---

# Part G — Data understanding and exploratory analysis

## G.1 Verified descriptive findings

The final 107-record model-ready dataset produced these results:

| Finding | Value |
|---|---:|
| Average daily entries | 1,820.94 |
| Average daily exits | 1,618.70 |
| Highest entry day | 18 May 2026: 3,269 entries |
| Highest exit day | 18 May 2026: 3,027 exits |
| Most active weekday by average entries | Thursday |
| Least active weekday | Sunday |
| Average weekday entries | 2,447.91 |
| Average weekend entries | 211.73 |
| Weekend entry difference from weekdays | −91.35% |
| Entries/exits Pearson correlation | 0.9993 |

## G.2 Weekday profile

| Day | Average entries | Average exits |
|---|---:|---:|
| Monday | 2,529.53 | 2,270.33 |
| Tuesday | 2,464.93 | 2,198.80 |
| Wednesday | 2,362.63 | 2,111.50 |
| Thursday | 2,551.31 | 2,269.88 |
| Friday | 2,329.93 | 2,059.27 |
| Saturday | 292.80 | 243.33 |
| Sunday | 130.67 | 101.53 |

## G.3 Interpretation guidance

The weekday/weekend contrast is one of the clearest patterns and supports inclusion of weekday and weekend indicators. The near-perfect entry/exit correlation indicates that daily incoming and outgoing movement rise and fall together. However, the LLM must not automatically claim causation. It should also note that very high correlation among current, lagged and rolling entry/exit features may create multicollinearity in Linear Regression. This does not invalidate predictive use, but it makes raw coefficient interpretation unstable. The research therefore ranks standardized coefficients as influence evidence, while avoiding causal interpretation.

## G.4 EDA outputs available for figures

Suggested figures generated by the scripts include:

| File | Suggested caption |
|---|---|
| `daily_entry_exit_trend.png` | Daily vehicle entry and exit trends |
| `monthly_average_traffic.png` | Average parking traffic by month |
| `weekday_average_traffic.png` | Average entries and exits by weekday |
| `weekend_vs_weekday.png` | Comparison of weekday and weekend parking traffic |
| `net_flow_trend.png` | Daily net vehicle flow |
| `entry_rolling7_trend.png` | Actual entries and preceding seven-day rolling mean |
| `exit_rolling7_trend.png` | Actual exits and preceding seven-day rolling mean |
| `entry_short_vs_long_trend.png` | Three-day and seven-day entry trends |
| `correlation_matrix.csv` | Numerical correlation evidence; can be converted to a heatmap if required |

## G.5 Suggested EDA narrative

> Exploratory analysis identified a strong weekday pattern. Average weekday entry traffic was 2,447.91 vehicles, compared with 211.73 vehicles on weekends, representing a 91.35% reduction. Thursday recorded the highest average entry activity, whereas Sunday recorded the lowest. Daily entries and exits were also strongly correlated (r = 0.9993), indicating that high-activity days generally produced both greater incoming and outgoing movement. These findings supported the inclusion of calendar indicators, current traffic values, lag variables and rolling summaries in the forecasting models.

---

# Part H — Training and testing strategy

## H.1 Final split

| Partition | Records | Percentage | Date range |
|---|---:|---:|---|
| Training | 85 | approximately 80% | 15 April 2026 – 8 July 2026 |
| Testing | 22 | approximately 20% | 9 July 2026 – 30 July 2026 |

The split index is:

```python
split_index = int(len(df) * 0.80)
train_df = df.iloc[:split_index].copy()
test_df = df.iloc[split_index:].copy()
```

## H.2 Why chronological splitting matters

A random split would allow later dates to enter the training partition while earlier dates entered testing. That can produce optimistic results in time-dependent data because the model effectively learns from the future relative to some test observations. The chronological holdout more closely represents deployment: the model learns from earlier records and predicts a later unseen period.

## H.3 No cross-validation claim

The implementation uses one chronological holdout. It does not implement rolling-origin validation, `TimeSeriesSplit`, k-fold cross-validation or repeated experiments. Recommend these as future improvements, but do not state that they were completed.

## H.4 Suggested split wording

> Following chronological ordering, the final 107 observations were divided using an 80:20 holdout. The earliest 85 observations, covering 15 April to 8 July 2026, formed the training set. The latest 22 observations, covering 9 July to 30 July 2026, formed the unseen test set. Shuffling was deliberately disabled because the prediction task was temporal and the intended deployment scenario required models trained on past observations to forecast later dates.

---

# Part I — Baseline model

## I.1 Persistence baseline

Before evaluating machine-learning models, the research defines a naive persistence forecast:

```text
Predicted next-day entries = current-day entries
Predicted next-day exits   = current-day exits
```

This is a meaningful benchmark: a trained model should improve on simply assuming tomorrow will repeat today.

## I.2 Baseline results

| Target | MAE | RMSE | R² |
|---|---:|---:|---:|
| Next-day entries | 773.5455 | 1,215.4709 | −0.3933 |
| Next-day exits | 715.5000 | 1,121.4496 | −0.3846 |

Negative R² means the persistence forecast performed worse on the test set than predicting the test target mean. It must not be described as “−39.33% accuracy.” R² is not accuracy.

## I.3 Suggested baseline narrative

> A persistence baseline was evaluated before training the candidate regressors. It predicted that the following day's entry and exit totals would equal the current day's totals. The baseline produced entry and exit MAEs of 773.55 and 715.50 vehicles respectively, with negative R² values for both targets. This result demonstrated that simple day-to-day persistence was insufficient for the pronounced weekday and weekend changes in the dataset.

---

# Part J — Candidate model building

## J.1 Candidate families

Three scikit-learn model families were evaluated for each target:

1. Linear Regression;
2. Random Forest Regressor; and
3. Gradient Boosting Regressor.

Because entry and exit targets were separate, six trained estimators were created in total: three entry estimators and three exit estimators.

## J.2 Linear Regression

Implementation:

```python
LinearRegression()
```

The final selected models used the estimator defaults:

```text
copy_X=True
fit_intercept=True
n_jobs=None
positive=False
tol=1e-06
```

No deliberate Linear Regression hyperparameter tuning was performed.

General equation:

```text
ŷ = β₀ + β₁x₁ + β₂x₂ + ... + β₁₈x₁₈
```

where `ŷ` is the predicted entry or exit count, `β₀` is the intercept, each `βᵢ` is a learned coefficient, and each `xᵢ` is one of the 18 features.

## J.3 Random Forest Regressor

Configured parameters:

```python
RandomForestRegressor(
    n_estimators=300,
    max_depth=None,
    min_samples_split=2,
    min_samples_leaf=1,
    random_state=42,
)
```

The forest models nonlinear relationships by averaging the predictions of 300 regression trees. `random_state=42` makes stochastic construction reproducible.

## J.4 Gradient Boosting Regressor

Configured parameters:

```python
GradientBoostingRegressor(
    n_estimators=200,
    learning_rate=0.05,
    max_depth=3,
    random_state=42,
)
```

This is scikit-learn's `GradientBoostingRegressor`. It is not XGBoost and not LightGBM. It constructs an additive sequence of shallow regression trees, where later trees attempt to correct residual errors from the existing ensemble.

## J.5 Model fitting

Each target is fitted independently:

```python
target_models["Entries"].fit(X_train, y_train_entries)
target_models["Exits"].fit(X_train, y_train_exits)
```

All candidate families use the same training rows, testing rows and 18 features, enabling a fair comparison.

## J.6 Hyperparameter-selection limitation

The Random Forest and Gradient Boosting settings were deliberately configured, but the repository does not contain evidence of exhaustive grid search, random search or Bayesian optimization. Describe them as configured experimental parameters, not as globally optimal hyperparameters.

---

# Part K — Evaluation metrics

## K.1 Mean Absolute Error

```text
MAE = (1/n) Σ |yᵢ - ŷᵢ|
```

MAE expresses the average absolute prediction error in vehicles. It is especially understandable for stakeholders. For example, entry MAE 226.48 means that the next-day entry forecast differed from the actual test value by about 226 vehicles per day on average.

## K.2 Root Mean Squared Error

```text
RMSE = √[(1/n) Σ (yᵢ - ŷᵢ)²]
```

RMSE also uses vehicle units but penalizes large errors more strongly. A considerably larger RMSE than MAE indicates that some test dates had much larger errors than the typical absolute deviation.

## K.3 Coefficient of determination

```text
R² = 1 - [Σ(yᵢ - ŷᵢ)² / Σ(yᵢ - ȳ)²]
```

R² describes performance relative to predicting the mean target value. Values closer to 1 are better. Negative values are possible and indicate performance worse than the mean baseline. Do not describe R² as percentage accuracy.

## K.4 Why all three are reported

- MAE provides intuitive average error in vehicles.
- RMSE exposes sensitivity to large errors.
- R² measures how well predictions reproduce variation relative to a mean prediction.

Model selection ranks all three metrics rather than choosing a winner from R² alone.

---

# Part L — Complete model results

## L.1 Comparison table

| Model | Target | MAE | RMSE | R² |
|---|---|---:|---:|---:|
| Naive baseline | Entries | 773.5455 | 1,215.4709 | −0.3933 |
| Naive baseline | Exits | 715.5000 | 1,121.4496 | −0.3846 |
| **Linear Regression** | **Entries** | **226.4830** | **362.0111** | **0.8764** |
| **Linear Regression** | **Exits** | **245.5360** | **459.8802** | **0.7672** |
| Random Forest | Entries | 251.3382 | 381.3083 | 0.8629 |
| Random Forest | Exits | 260.9991 | 480.6142 | 0.7457 |
| Gradient Boosting | Entries | 269.9182 | 412.1438 | 0.8398 |
| Gradient Boosting | Exits | 267.7604 | 493.2374 | 0.7322 |

## L.2 Baseline improvement

| Target | Selected model | MAE improvement | RMSE improvement |
|---|---|---:|---:|
| Entries | Linear Regression | 70.72% | 70.22% |
| Exits | Linear Regression | 65.68% | 58.99% |

Improvement is calculated as:

```text
Improvement (%) = [(Baseline error - Model error) / Baseline error] × 100
```

## L.3 Reader-friendly interpretation

> The selected entry model achieved an MAE of 226.48 vehicles and an R² of 0.8764 on the later 22-day test period. The selected exit model achieved an MAE of 245.54 vehicles and an R² of 0.7672. Therefore, the entry model explained approximately 87.64% of the test-period variance and the exit model explained approximately 76.72%, while their typical absolute errors were approximately 226 and 246 vehicles per day respectively.

Use “variance explained” rather than “accuracy.”

## L.4 Comparison interpretation

Linear Regression produced the lowest MAE and RMSE and highest R² for both targets. Random Forest was the next strongest candidate, followed by Gradient Boosting. The result demonstrates that model complexity did not guarantee better generalization on this relatively small daily dataset. The combination of engineered rolling, lag and calendar variables allowed a linear estimator to model much of the observable pattern.

Do not claim that Linear Regression is universally superior. State that it was superior **for this dataset and holdout period**.

---

# Part M — Model selection procedure

## M.1 Rank-based selection

The code excludes the naive baseline from trained-model selection. For each target, it ranks candidates by:

- MAE ascending;
- RMSE ascending; and
- R² descending.

The ranks are summed. Ties are resolved using MAE and then RMSE. Linear Regression ranked first for both targets.

## M.2 Final selected artifacts

```text
best_entry_prediction_model.pkl -> sklearn.linear_model.LinearRegression
best_exit_prediction_model.pkl  -> sklearn.linear_model.LinearRegression
model_features.txt              -> ordered 18-feature contract
```

## M.3 Selection rationale paragraph

> Linear Regression was selected independently for both next-day targets because it achieved the best aggregate ranking across MAE, RMSE and R². For entries, it reduced MAE from the persistence baseline's 773.55 vehicles to 226.48 vehicles. For exits, it reduced MAE from 715.50 to 245.54 vehicles. It also slightly outperformed the Random Forest and Gradient Boosting alternatives on every reported test metric. Given the limited dataset size, its lower complexity and stronger holdout performance further supported its deployment.

---

# Part N — Model interpretation

## N.1 Standardized coefficients

Raw Linear Regression coefficients cannot be fairly ranked when features operate on different scales. The research therefore calculates standardized influence:

```text
standardized coefficient =
    raw coefficient × feature standard deviation
    ÷ target standard deviation
```

## N.2 Strongest entry-model coefficients

| Rank | Feature | Standardized coefficient |
|---:|---|---:|
| 1 | `ExitRolling3` | +5.9958 |
| 2 | `EntryRolling3` | −5.9787 |
| 3 | `ExitRolling7` | −2.2350 |
| 4 | `EntryRolling7` | +2.1714 |
| 5 | `PrevDayExits` | −1.9868 |

## N.3 Strongest exit-model coefficients

| Rank | Feature | Standardized coefficient |
|---:|---|---:|
| 1 | `ExitRolling3` | +5.9617 |
| 2 | `EntryRolling3` | −5.9538 |
| 3 | `PrevDayExits` | −2.1251 |
| 4 | `PrevDayEntries` | +2.1037 |
| 5 | `ExitRolling7` | −2.0420 |

## N.4 Interpretation caution

The large positive and negative values among similar rolling entry/exit features likely reflect strong multicollinearity. Coefficients describe behavior within the fitted model; they must not be presented as causal effects. For instance, a negative coefficient does not prove that increasing entries causes lower demand. It describes the conditional model relationship when other correlated features are held fixed.

---

# Part O — Demand recommendation logic

## O.1 Threshold derivation

Demand thresholds were calculated from the entry distribution in the **training partition only**, avoiding test-set leakage:

```python
low_threshold = train_df["Entries"].quantile(0.33)
high_threshold = train_df["Entries"].quantile(0.66)
```

## O.2 Deployed rules

```text
LOW:    predicted entries < 580.84
MEDIUM: 580.84 <= predicted entries < 2631.20
HIGH:   predicted entries >= 2631.20
```

Implementation:

```python
def classify_demand(predicted_entries, low_threshold, high_threshold):
    if predicted_entries < low_threshold:
        return "LOW"
    if predicted_entries < high_threshold:
        return "MEDIUM"
    return "HIGH"
```

This is a rule-based interpretation layer applied after regression. It is not a separately trained classification model.

## O.3 Operational interpretation

- Low indicates an entry forecast in the lower third of observed training demand.
- Medium indicates a forecast in the middle range.
- High indicates a forecast in the upper third.

Avoid claiming exact staffing or allocation actions unless those recommendations are actually implemented. The dashboard currently displays the level rather than autonomously reallocating resources.

---

# Part P — Demonstration forecast

The research script produced this example from the newest available feature row:

| Output | Value |
|---|---:|
| Prediction date | 31 July 2026 |
| Predicted entries | 2,188 |
| Predicted exits | 1,880 |
| Predicted net flow | +308 |
| Predicted demand | Medium |

The script explicitly states:

> This is a model demonstration, not observed ground truth.

Therefore, do not calculate an error for this date and do not use it as additional test evidence unless the actual 31 July value is separately supplied and verified.

---

# Part Q — Deployment in SmartPark

## Q.1 Serialization

The selected estimators are saved with Joblib:

```python
joblib.dump(best_entry_model, MODEL_DIR / "best_entry_prediction_model.pkl")
joblib.dump(best_exit_model, MODEL_DIR / "best_exit_prediction_model.pkl")
```

The feature names are stored separately to preserve inference order.

## Q.2 Production loading

`backend/analytics_model.py` loads:

- the entry model;
- the exit model;
- the ordered feature names;
- monthly research history;
- cumulative hourly progress; and
- an hourly research profile.

## Q.3 Live and research data combination

The dashboard sends daily traffic to `/api/parking/analytics/predict`. If it does not supply traffic, the hosted parking simulator supplies recent daily traffic from Firestore-backed history.

Production inference:

1. normalizes dates and non-negative traffic counts;
2. aggregates duplicate dates in the submitted list;
3. projects a partial current day using cumulative hourly research progress when needed;
4. adds research baseline history if fewer than eight live days are available;
5. constructs the same 18 features used during training;
6. creates a pandas DataFrame in the saved feature order;
7. runs both serialized estimators;
8. clamps negative forecasts to zero;
9. rounds results to whole vehicles;
10. calculates predicted net flow; and
11. assigns the demand level.

## Q.4 API endpoint

```text
POST /api/parking/analytics/predict
```

The route requires an authenticated administrator. It accepts a `dailyTraffic` array or falls back to simulator history.

## Q.5 Dashboard output

The returned JSON contains:

- prediction date;
- predicted entries;
- predicted exits;
- predicted net flow;
- Low/Medium/High demand;
- model name;
- stored entry and exit R² values;
- number of live and research days used;
- whether the current day was projected;
- current observed/projected totals;
- hourly profile; and
- constructed features.

The dashboard visualizes the forecast in the “Today vs Tomorrow's Model Forecast” and hourly traffic sections.

---

# Part R — Recommended report structure

Use a structure similar to the following. Adjust numbering to match the report chapter.

## X.1 Introduction to Parking-Demand Analytics

Explain the administrative problem, predicted variables and expected system value.

## X.2 Data Collection and Dataset Description

Describe the three original columns, 122 observations and source date range. State the provenance limitation honestly.

## X.3 Data Preprocessing

Cover inspection, type conversion, duplicate-date aggregation design, chronological sorting, missing-date detection, no synthetic filling, feature-induced missing rows, saved intermediate datasets and validation assertions.

## X.4 Exploratory Data Analysis

Present trends, weekday/weekend difference, busiest day, averages, correlation, rolling behavior and appropriate figures.

## X.5 Feature Engineering

Explain targets, calendar variables, lag features, rolling features, net flow, target-day variables, feature order and leakage controls.

## X.6 Training and Testing Strategy

Explain chronological 80:20 split, exact records/date ranges, and why random shuffling would be inappropriate.

## X.7 Baseline Forecast

Define persistence and present negative R² results.

## X.8 Candidate Regression Models

Discuss Linear Regression, Random Forest and Gradient Boosting, including actual parameters.

## X.9 Evaluation Metrics

Give equations and interpretations for MAE, RMSE and R².

## X.10 Model Comparison and Selection

Present full result table, baseline improvements and rationale for selecting Linear Regression.

## X.11 Model Interpretation

Discuss standardized coefficients and multicollinearity caution.

## X.12 Demand Recommendation

Explain training quantiles and Low/Medium/High mapping.

## X.13 Integration with the SmartPark Dashboard

Explain Joblib, the Flask API, live/Firestore history, feature construction and Angular visualization.

## X.14 Limitations and Future Enhancement

Discuss dataset length, single holdout, missing external factors, simulated/live mixture, retraining, drift monitoring and uncertainty.

## X.15 Chapter Summary

Summarize the final models and their measured test performance without overstating generalizability.

---

# Part S — Recommended tables

## Table X.1: Source and processed dataset stages

Use the verified stage table in Part D.

## Table X.2: Engineered model features

Use the complete 18-feature table in Part F.

## Table X.3: Training and testing split

Use the partition table in Part H.

## Table X.4: Candidate model configurations

| Model | Important configuration |
|---|---|
| Linear Regression | scikit-learn defaults |
| Random Forest | 300 trees; unlimited depth; split 2; leaf 1; random state 42 |
| Gradient Boosting | 200 estimators; learning rate 0.05; depth 3; random state 42 |

## Table X.5: Model evaluation

Use the complete comparison table in Part L.

## Table X.6: Improvement over persistence baseline

Use the improvement table in Part L.

## Table X.7: Demand categories

Use the threshold table in Part O.

---

# Part T — Recommended figures

Suggested figures and purposes:

1. **Machine-learning workflow diagram** — source CSV → preprocessing → EDA → feature engineering → chronological split → candidates → evaluation → Joblib → Flask API → Angular dashboard.
2. **Daily entry and exit trend** — demonstrates time variation and shared movement patterns.
3. **Average traffic by weekday** — supports calendar features.
4. **Weekday versus weekend traffic** — demonstrates the strong weekend reduction.
5. **Short-term versus seven-day trend** — supports rolling features.
6. **Actual versus predicted next-day entries** — use Linear Regression test output.
7. **Actual versus predicted next-day exits** — use Linear Regression test output.
8. **Entry-model residuals** — show signed error across test dates.
9. **Exit-model residuals** — show signed error across test dates.
10. **Standardized Linear Regression coefficients** — discuss influence carefully.
11. **Dashboard forecast screenshot** — demonstrate deployment, not model evaluation.

Do not use a dashboard screenshot as evidence of test accuracy. Evaluation figures must come from the held-out test data.

---

# Part U — Recommended code listings

## Listing X.1: Chronological preparation and lag construction

Source: `prepare_parking_dataset.py`

Show sorting, `.shift(1)`, seven-day rolling values and shifted next-day targets.

## Listing X.2: Chronological train/test split

Source: `parking_eda_and_baseline.py`

Show:

```python
split_index = int(len(model_df) * 0.80)
train_df = model_df.iloc[:split_index].copy()
test_df = model_df.iloc[split_index:].copy()
```

## Listing X.3: Candidate model definitions

Source: `parking_model_comparison.py`

Show all three model families and their exact parameters.

## Listing X.4: Model evaluation

Show the function returning MAE, RMSE and R².

## Listing X.5: Selection and serialization

Show aggregate ranking and the Joblib outputs.

## Listing X.6: Production prediction

Source: `backend/analytics_model.py`

Show feature construction, ordered DataFrame, separate entry/exit inference, net flow and demand level.

---

# Part V — Limitations and threats to validity

The report should explicitly discuss the following.

## V.1 Dataset size

Only 107 complete final observations were available, with 22 observations in the holdout. This is adequate for a project demonstration but limited for strong generalization claims.

## V.2 Short observation period

The data covers approximately four months. It may not represent full annual seasonality, semester changes, public holidays or long-term behavioral changes.

## V.3 Single holdout

Only one chronological test period was used. Results may depend on the selected final 22 dates. Rolling-origin evaluation would provide stronger temporal evidence.

## V.4 Missing contextual predictors

No weather, public holidays, university events, examination periods or academic-semester indicators were included. These factors may explain traffic changes not captured by traffic history alone.

## V.5 Multicollinearity

Entries, exits and their rolling summaries are strongly correlated. Predictive performance can remain good, but individual Linear Regression coefficients may be unstable and should not be interpreted causally.

## V.6 Point forecasts only

The model returns one predicted value for entries and exits. It does not provide confidence or prediction intervals.

## V.7 Research fallback in production

When insufficient live history is available, deployment combines live data with research baseline days. The dashboard reports whether this fallback occurred. Predictions using more live history may differ from those relying on research fill data.

## V.8 Partial-day projection

The deployed API may extrapolate an incomplete current day using the historical hourly cumulative profile. This makes real-time forecasting possible, but errors in the hourly profile can propagate into the next-day forecast.

## V.9 No automated drift/retraining

The deployed estimator artifacts are static. The current repository does not implement scheduled retraining, drift tests or automatic model replacement.

## V.10 Safe conclusion wording

> The findings demonstrate that the selected Linear Regression models performed well on the defined later 22-day holdout and substantially improved over the persistence baseline. However, the limited observation period and single chronological test split mean that the results should be interpreted as evidence for the project dataset rather than proof of equivalent performance across all future parking conditions.

---

# Part W — Future improvements

Recommend, without claiming implementation:

- extend collection across multiple semesters and a complete year;
- add public-holiday, examination, academic-calendar and event indicators;
- incorporate weather where relevant and legally obtainable;
- use rolling-origin or expanding-window evaluation;
- compare regularized linear models such as Ridge, Lasso and Elastic Net;
- tune ensembles using time-series-aware validation;
- add prediction intervals or quantile regression;
- monitor production MAE, RMSE and data drift once actual future values become available;
- retrain only after accumulating sufficient verified new history;
- version models, feature contracts, metrics and training data together; and
- evaluate whether section-level forecasts are possible if reliable section histories become available.

---

# Part X — Ready-to-use academic result narrative

The LLM may adapt the following without changing its numerical meaning:

> Three regression approaches—Linear Regression, Random Forest and Gradient Boosting—were developed for each of the two next-day targets. All estimators used the same 18 predictors and were fitted using the earliest 85 observations. Performance was then measured on the later 22 observations, which were not used during training. A persistence baseline, which assumed that the following day would repeat the current day's traffic, was also evaluated.
>
> Linear Regression produced the strongest result for both targets. The entry model achieved an MAE of 226.48 vehicles, an RMSE of 362.01 vehicles and an R² of 0.8764. The exit model achieved an MAE of 245.54 vehicles, an RMSE of 459.88 vehicles and an R² of 0.7672. In comparison, the Random Forest entry and exit R² values were 0.8629 and 0.7457, while the corresponding Gradient Boosting results were 0.8398 and 0.7322.
>
> Relative to the persistence baseline, Linear Regression reduced entry MAE by 70.72% and exit MAE by 65.68%. It also reduced entry and exit RMSE by 70.22% and 58.99% respectively. Linear Regression was consequently serialized as two independent Joblib artifacts and integrated into the Flask analytics API. The API reconstructs the ordered feature vector from recent parking history, predicts next-day entries and exits, calculates net flow, and categorizes the expected entry demand using thresholds derived from the training distribution.

---

# Part Y — Short answer bank for likely examiner questions

## What type of machine learning was used?

Supervised regression using scikit-learn. Two numeric next-day targets were predicted.

## What was the final algorithm?

Two separate scikit-learn `LinearRegression` estimators: one for entries and one for exits.

## Why not Gradient Boosting?

It was evaluated, but Linear Regression produced lower MAE/RMSE and higher R² for both targets on the chronological holdout.

## Was the data randomly split?

No. It was ordered by date and split chronologically, earliest 80% for training and latest 20% for testing.

## How many observations were used?

107 final model-ready daily observations: 85 training and 22 testing.

## What features were used?

Eighteen current traffic, calendar, net-flow, previous-day, rolling, weekly-lag and target-calendar variables.

## Was a public-holiday feature used?

No.

## Were the models evaluated using accuracy?

No. Regression was evaluated with MAE, RMSE and R². R² must not be called accuracy.

## What does entry MAE 226.48 mean?

Across the 22 test days, the predicted entry count differed from the actual next-day entry count by approximately 226 vehicles per day on average.

## Did one model predict two outputs?

No. Separate entry and exit estimators were fitted and serialized.

## Was cross-validation performed?

No. One chronological holdout was used.

## Was the 31 July prediction verified?

No. It is explicitly stored as a demonstration prediction, not observed ground truth.

## How is demand categorized?

Using the 33rd and 66th percentile entry thresholds derived only from training data: below 580.84 is Low, below 2631.20 is Medium, and values at or above 2631.20 are High.

---

# Part Z — Final master prompt to give another LLM

Copy the prompt below together with this entire file:

```text
Using only the factual SmartPark model-building source pack provided, write a complete final-year-project report section titled “Data Analytics and Machine-Learning Model Development.”

Requirements:
1. Use formal academic prose and coherent transitions rather than bullet points alone.
2. Cover problem definition, data collection, source preservation, preprocessing, exploratory analysis, feature engineering, leakage prevention, chronological splitting, baseline evaluation, model construction, hyperparameters, evaluation metrics, full results, model selection, interpretation, serialization, deployed inference, recommendation logic, limitations and future improvements.
3. Use every exact dataset size, date range, feature definition, model configuration and metric from the source pack.
4. Explain the row reduction from 122 source rows to 114 initial model-ready rows and 107 final rows.
5. Explain that 85 earlier records were used for training and 22 later records for testing without shuffling.
6. State clearly that two independent scikit-learn LinearRegression estimators were selected, one for entries and one for exits.
7. Include properly introduced tables for dataset stages, features, split, candidate configurations, complete metrics, baseline improvements and demand thresholds.
8. Include equations and plain-language interpretation for MAE, RMSE and R².
9. Explain why R² is not accuracy.
10. Discuss the strong weekday/weekend effect and entry/exit correlation without claiming causation.
11. Explain that the Low/Medium/High result is a quantile-based rule applied to a regression forecast, not a separate classification model.
12. Distinguish held-out evaluation results from the 31 July 2026 demonstration forecast.
13. Include figure and code-listing placeholders with informative captions based on the supplied recommendations.
14. Discuss limitations candidly, especially the 107-record dataset, 22-day test set, single holdout, approximately four-month period, absent holiday/weather/academic features, multicollinearity and lack of uncertainty intervals or automated retraining.
15. Do not invent data origin, sensor hardware, public datasets, cross-validation, tuning searches, imputation, feature scaling, recognition accuracy, false-positive rates, citations or experiments.
16. If references are required, insert [CITATION REQUIRED] beside general methodological claims rather than fabricating a source.
17. End with a concise chapter summary explaining how the research model is integrated into the SmartPark Flask API and Angular dashboard.

Target length: adapt to the report format, ideally 2,500–4,000 words unless another word limit is supplied.
```

---

# Evidence paths for fact checking

- `research/parking-analytics/monthly/prepare_parking_dataset.py`
- `research/parking-analytics/monthly/parking_eda_and_baseline.py`
- `research/parking-analytics/monthly/parking_model_comparison.py`
- `research/parking-analytics/monthly/outputs/eda_summary.txt`
- `research/parking-analytics/monthly/outputs/model_summary.txt`
- `research/parking-analytics/monthly/outputs/model_comparison_results.csv`
- `research/parking-analytics/monthly/outputs/baseline_improvement_summary.csv`
- `research/parking-analytics/monthly/outputs/demand_thresholds.txt`
- `research/parking-analytics/monthly/outputs/models/model_features.txt`
- `backend/analytics_model.py`
- `backend/routes/parking_routes.py`

When the generated report conflicts with these evidence files, the evidence files take precedence.
