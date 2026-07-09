import { money, COST_FIELDS, numberValue } from "@/lib/carCalculations";

// Lightweight per-car cost-by-category bar chart (CSS bars, no chart library).
// Reads the flat category totals on the car so it reflects both itemized and
// manually-entered costs.
export default function CostBreakdownChart({ car }) {
  const rows = COST_FIELDS.map((field) => ({ label: field.label, value: numberValue(car[field.key]) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) {
    return null;
  }

  const max = Math.max(...rows.map((row) => row.value));

  return (
    <div className="rounded-3xl border border-purple-100 p-4">
      <p className="mb-3 text-sm font-black uppercase tracking-wide text-[#7d3fb2]">Cost Breakdown</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-36 flex-none truncate text-xs font-bold text-[#5b2a86] sm:w-44">{row.label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#efe6f8]">
              <div
                className="h-full rounded-full bg-[#7d3fb2]"
                style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
              />
            </div>
            <span className="w-20 flex-none text-right text-xs font-black text-[#3b1b6d]">{money(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
