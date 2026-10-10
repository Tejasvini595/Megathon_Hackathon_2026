# Optional thermostat signal (`setpoint_reported_c`)
Apply to the `data/` folder of the `web` branch:
    cp data_patch/telemetry.py data/gen/telemetry.py
    patch -p1 < data_patch/thermostat.patch      # run from the repo root
It adds a noisy, partial report of the usual heating temperature (30% of homes), on its own random stream, so no other number in the dataset changes (verified by a full rebuild compared table by table). See the end of `data/DATA.md` after patching.
