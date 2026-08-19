# Parking analytics research

This directory contains offline research and is not required to run SmartPark.

```text
hourly/   Hourly analysis script and source CSV
monthly/  Source CSV, dataset preparation, EDA, and model comparison
```

Install the optional research dependencies with `pip install -r research/parking-analytics/requirements.txt`.

Each workflow writes charts, reports, intermediate datasets, and trained models into its local `outputs/` directory. Those generated folders are ignored by Git.
