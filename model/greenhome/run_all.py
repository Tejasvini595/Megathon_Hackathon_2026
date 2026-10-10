"""One command: train + evaluate, benchmark table, tests, explanation-layer evaluation.     python -m greenhome.run_all [--llm]"""
import os, subprocess, sys

def run(*a, env=None):
    print("\n$", " ".join(a), flush=True); r = subprocess.run(list(a), env={**os.environ, **(env or {})})
    if r.returncode: sys.exit(r.returncode)

if __name__ == "__main__":
    py = sys.executable
    run(py, "-W", "ignore", "-m", "greenhome.train")
    run(py, "-W", "ignore", "-m", "greenhome.benchmark")
    run(py, "-W", "ignore", "-m", "pytest", "-q", "tests", env={"PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1"})
    run(py, "-W", "ignore", "-m", "greenhome.llm_eval", *(["--llm"] if "--llm" in sys.argv else []))
    run(py, "-W", "ignore", "-m", "greenhome.whatif_eval", *(["--llm"] if "--llm" in sys.argv else []))
    run(py, "-W", "ignore", "-m", "greenhome.breakit")
    print("\nAll done. Dashboard: streamlit run app.py")
