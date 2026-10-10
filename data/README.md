# data/: Green Home Twin dataset

```bash
uv run python gen/fetch_postcodes.py   # once; already cached in raw/postcodes/
uv run python build.py                 # ~3 min, seed 42 -> out/ and hidden/
uv run python validate.py              # -> out/validation_report.md
```

Start with `DATA.md` (schema, rules, limitations) and `out/validation_report.md`.

```python
import pandas as pd
props  = pd.read_parquet("data/out/properties.parquet")     # 129,318 homes, one row each
energy = pd.read_parquet("data/out/energy_usage.parquet")   # 24 months per home, NaN = missing reading
splits = pd.read_parquet("data/out/splits.parquet")         # train / val / test / geo_test (Liverpool)
```

`hidden/` is for evaluation only: never use it for features or in the app.
