"""Build the ranked portfolio of poorly performing dataset homes for the advisor view (needs the dataset; writes reports/cache/portfolio.parquet)."""
from greenhome.engine import GreenEngine

if __name__ == "__main__":
    pf = GreenEngine().portfolio(refresh=True)
    print(len(pf), "poorly performing homes ranked")
