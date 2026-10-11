"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { importReadings, inspect, isReady, type Inspected, type Reading, type Role } from "./csv";

const ROLES: { value: Role; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "elec", label: "Electricity kWh" },
  { value: "gas", label: "Gas kWh" },
  { value: "fuel", label: "Fuel type" },
  { value: "value", label: "kWh (by fuel)" },
  { value: "ignore", label: "Ignore" },
];

const MAX_BYTES = 5 * 1024 * 1024;

/** Drop a supplier or smart-meter CSV: shows a preview, lets the user fix which column is which, then imports. */
export function CsvDrop({ onImport }: { onImport: (months: Reading[], note: string) => void }) {
  const [file, setFile] = useState<{ name: string; data: Inspected } | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (f.size > MAX_BYTES) return setError("That file is over 5 MB.");
    const data = inspect(await f.text());
    if (!data) return setError("We couldn't find dates and kWh in that file. Type the readings below instead.");
    setFile({ name: f.name, data });
  }

  const setRole = (col: number, role: Role) => setFile((cur) => cur && { ...cur, data: { ...cur.data, roles: cur.data.roles.map((r, i) => (i === col ? role : r === role && role !== "ignore" && (role === "date" || role === "fuel") ? "ignore" : r)) } });

  if (file) {
    const { headers, rows, roles } = file.data;
    const ready = isReady(roles);
    return (
      <div className="rounded-2xl bg-surface-2 p-3 ring-1 ring-hairline">
        <p className="text-xs text-muted-foreground">
          {file.name}: {rows.length.toLocaleString()} rows. {ready ? "Check which column is which." : "Say which column is the date and which holds electricity or gas."}
        </p>
        <div className="-mx-1 mt-2 overflow-x-auto px-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="min-w-28 pb-2 pr-2 align-bottom font-normal">
                    <span className="block truncate text-muted-foreground">{h || `Column ${i + 1}`}</span>
                    <select aria-label={`Column ${h || i + 1}`} value={roles[i]} onChange={(e) => setRole(i, e.target.value as Role)} className="mt-1 w-full rounded-lg bg-background px-1.5 py-1 text-foreground ring-1 ring-hairline">
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 4).map((r, i) => (
                <tr key={i} className="border-t hairline">
                  {headers.map((_, c) => (
                    <td key={c} className={cn("truncate py-1 pr-2 tabular-nums", roles[c] === "ignore" && "text-muted-foreground/50")}>{r[c]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={!ready}
            onClick={() => {
              const { months, skipped } = importReadings(file.data);
              if (!months.length) return setError("No full months found in that file.");
              onImport(months, `Imported ${months.length} months${skipped.length ? `. Left out partial months: ${skipped.join(", ")}` : ""}.`);
              setFile(null);
              setError(null);
            }}
            className="rounded-full bg-volt px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
          >
            Use these readings
          </button>
          <button onClick={() => setFile(null)} className="rounded-full px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-hairline">
            Cancel
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-ember">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void load(e.dataTransfer.files[0]);
        }}
        className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-5 text-center transition-colors", over ? "border-volt bg-volt/10" : "border-foreground/20 hover:bg-surface-2")}
      >
        <FileUp className="size-5 text-volt" />
        <span className="text-sm font-medium">Upload a CSV from your supplier or smart meter</span>
        <span className="text-xs text-muted-foreground">Monthly, daily or half-hourly. It stays in your browser until you confirm.</span>
        <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Upload readings CSV" onChange={(e) => void load(e.target.files?.[0])} />
      </label>
      {error && <p className="mt-2 text-xs text-ember">{error}</p>}
    </div>
  );
}
