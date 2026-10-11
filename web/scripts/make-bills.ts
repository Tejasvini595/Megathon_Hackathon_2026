/**
 * Renders synthetic UK energy bills (made-up people, addresses and numbers) to e2e/fixtures/bills/ with a truth.json of
 * the printed consumption, for testing bill reading and its checks:   bun scripts/make-bills.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

type Row = { start: string; end: string; value: number };
type Section = { fuel: "electricity" | "gas"; unit: "kWh" | "m3"; rows: Row[]; annualTotal?: number; calorificValue?: number };
type Bill = { file: string; description: string; supplier: string; colour: string; customer: string; address: string; account: string; statement?: [string, string]; sections: Section[]; consistent: boolean };

const out = join(import.meta.dir, "../e2e/fixtures/bills");
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthRows = (values: number[]): Row[] => values.map((value, i) => ({ start: iso(2025, i + 1, 1), end: iso(2025, i + 1, lastDay(2025, i + 1)), value }));
const quarterRows = (values: number[]): Row[] => values.map((value, i) => ({ start: iso(2025, i * 3 + 1, 1), end: iso(2025, i * 3 + 3, lastDay(2025, i * 3 + 3)), value }));
const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.value, 0);

const ELEC = [318, 281, 262, 236, 214, 198, 203, 211, 229, 262, 297, 331];
const GAS = [1840, 1630, 1210, 790, 410, 240, 205, 198, 360, 810, 1420, 1930];
const M3 = GAS.map((kwh) => Math.round(kwh / 11.2205));

const quarterlyElec = quarterRows([861, 648, 643, 890]);
const quarterlyGas = quarterRows([4680, 1440, 763, 4160]);
const annualElec = monthRows([402, 351, 318, 270, 244, 219, 226, 238, 257, 301, 366, 412]);
const annualGas = monthRows([2210, 1940, 1480, 960, 520, 310, 260, 255, 470, 1010, 1730, 2290]);

const BILLS: Bill[] = [
  { file: "monthly-both.png", description: "Twelve monthly electricity and gas readings in kWh", supplier: "Brightwell Energy", colour: "#0b6e4f", customer: "Ms P. Ashdown", address: "14 Larkspur Close, Fernbury, ZZ1 4AB", account: "BW-4471920", statement: ["2025-01-01", "2025-12-31"], sections: [{ fuel: "electricity", unit: "kWh", rows: monthRows(ELEC) }, { fuel: "gas", unit: "kWh", rows: monthRows(GAS) }], consistent: true },
  { file: "quarterly.png", description: "Quarterly electricity and gas bills over a year, kWh", supplier: "Corvane Power", colour: "#1d4ed8", customer: "Mr T. Okonkwo-Reed", address: "3 Millrace Row, Haddlesey, ZZ2 7QD", account: "CP-882015", sections: [{ fuel: "electricity", unit: "kWh", rows: quarterlyElec }, { fuel: "gas", unit: "kWh", rows: quarterlyGas }], consistent: true },
  { file: "gas-m3.png", description: "Gas billed in cubic metres (calorific value 39.4 printed), electricity in kWh", supplier: "Tindle & Moor Energy", colour: "#9a3412", customer: "Dr R. Valdane", address: "Flat 2, 61 Quillon Street, Marrowby, ZZ3 9LT", account: "TM-3340871", sections: [{ fuel: "electricity", unit: "kWh", rows: monthRows(ELEC) }, { fuel: "gas", unit: "m3", rows: monthRows(M3), calorificValue: 39.4 }], consistent: true },
  { file: "annual-statement.png", description: "Annual statement with monthly figures and a printed yearly total", supplier: "Sunhollow Energy", colour: "#7c3aed", customer: "Mr & Mrs G. Pellew", address: "22 Orchard Rise, Dunmere, ZZ4 2EF", account: "SH-1029384", statement: ["2025-01-01", "2025-12-31"], sections: [{ fuel: "electricity", unit: "kWh", rows: annualElec, annualTotal: sum(annualElec) }, { fuel: "gas", unit: "kWh", rows: annualGas, annualTotal: sum(annualGas) }], consistent: true },
  { file: "inconsistent.png", description: "Quarterly figures that do not add up to the printed yearly total (about 25% apart)", supplier: "Corvane Power", colour: "#1d4ed8", customer: "Ms L. Tremaine", address: "9 Weaver's Yard, Ottisham, ZZ5 6HJ", account: "CP-557203", statement: ["2025-01-01", "2025-12-31"], sections: [{ fuel: "electricity", unit: "kWh", rows: quarterlyElec, annualTotal: 4600 }, { fuel: "gas", unit: "kWh", rows: quarterlyGas, annualTotal: 14200 }], consistent: false },
  { file: "electricity-only.png", description: "Monthly electricity only (all-electric home, no gas)", supplier: "Brightwell Energy", colour: "#0b6e4f", customer: "Mx J. Farrowdale", address: "5 Kestrel Mews, Lowmoor, ZZ6 1PN", account: "BW-7710442", statement: ["2025-01-01", "2025-12-31"], sections: [{ fuel: "electricity", unit: "kWh", rows: monthRows(ELEC.map((v) => Math.round(v * 2.1))) }], consistent: true },
];

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const unitLabel = (u: Section["unit"]) => (u === "kWh" ? "kWh" : "m³");

function html(b: Bill) {
  const sections = b.sections
    .map(
      (s) => `<h2>${s.fuel === "electricity" ? "Electricity" : "Gas"} usage</h2>
      <table><tr><th>From</th><th>To</th><th class="n">${unitLabel(s.unit)} used</th></tr>
      ${s.rows.map((r) => `<tr><td>${longDate(r.start)}</td><td>${longDate(r.end)}</td><td class="n">${r.value.toLocaleString("en-GB")}</td></tr>`).join("")}
      </table>
      ${s.annualTotal != null ? `<p class="total">Total for the year: <b>${s.annualTotal.toLocaleString("en-GB")} ${unitLabel(s.unit)}</b></p>` : ""}
      ${s.calorificValue ? `<p class="small">Calorific value: ${s.calorificValue} MJ/m³. Volume correction factor: 1.02264.</p>` : ""}`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
  body{font:15px/1.4 Helvetica,Arial,sans-serif;margin:0;padding:36px;width:728px;color:#1f2937;background:#fff}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid ${b.colour};padding-bottom:12px}
  .logo{font-size:26px;font-weight:700;color:${b.colour}} .meta{text-align:right;font-size:13px;color:#4b5563}
  h2{font-size:17px;margin:22px 0 6px;color:${b.colour}} table{width:100%;border-collapse:collapse}
  th,td{padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left} th{background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280}
  .n{text-align:right;font-variant-numeric:tabular-nums} .total{text-align:right;margin:8px 0;font-size:16px} .small{font-size:12px;color:#6b7280}
  .addr{margin-top:16px} .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-top:14px;font-size:13px}
  </style>
  <header><div class="logo">${b.supplier}</div><div class="meta">Account ${b.account}<br>${b.statement ? `Statement: ${longDate(b.statement[0])} to ${longDate(b.statement[1])}` : "Your energy bill"}</div></header>
  <div class="addr"><b>${b.customer}</b><br>${b.address}</div>
  <div class="box">Your energy use. This is a made-up sample document for testing; no real person or account.</div>
  ${sections}
  <p class="small" style="margin-top:24px">Questions? Call 0800 000 0000 (sample number) or visit the ${b.supplier} app.</p>`;
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
for (const b of BILLS) {
  await page.setContent(html(b));
  await page.screenshot({ path: join(out, b.file), fullPage: true });
  console.log("wrote", b.file);
}
await browser.close();

const truth = BILLS.map((b) => ({
  file: b.file,
  description: b.description,
  consistent: b.consistent,
  statement: b.statement ? { start: b.statement[0], end: b.statement[1] } : null,
  fuels: b.sections.map((s) => ({ fuel: s.fuel, unit: s.unit, periods: s.rows.map((r) => ({ start: r.start, end: r.end, consumption: r.value })), annualTotal: s.annualTotal ?? null, calorificValue: s.calorificValue ?? null })),
}));
writeFileSync(join(out, "truth.json"), `${JSON.stringify(truth, null, 2)}\n`);
