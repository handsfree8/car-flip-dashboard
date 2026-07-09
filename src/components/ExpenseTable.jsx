import { money } from "@/lib/carCalculations";

const CATEGORY_LABELS = {
  repairCost: "Repairs / Labor",
  partsCost: "Parts",
  transportCost: "Transport / Tow",
  adminFees: "Admin / Auction Fees",
  titleFees: "Title / Registration",
  taxes: "Taxes",
  detailingCost: "Detailing / Cleaning",
  advertisingCost: "Ads / Marketplace",
  repoCost: "Repo / Recovery Cost",
  miscCost: "Miscellaneous",
};

// Read-only table of itemized expense line items logged from Telegram.
// Each item: { id, description, category, amount (part cost), labor, date }.
export default function ExpenseTable({ expenses }) {
  const items = Array.isArray(expenses) ? expenses : [];

  if (items.length === 0) {
    return (
      <div className="rounded-3xl bg-[#f7f4fb] p-4 text-sm font-semibold text-[#5b2a86]">
        No itemized expenses yet. Log one from Telegram, e.g. “gasté 300 en un sensor ABS más 80 de
        labor para este carro.”
      </div>
    );
  }

  const totals = items.reduce(
    (acc, item) => {
      acc.part += Number(item.amount || 0);
      acc.labor += Number(item.labor || 0);
      return acc;
    },
    { part: 0, labor: 0 },
  );
  const grandTotal = totals.part + totals.labor;

  return (
    <div className="overflow-x-auto rounded-3xl border border-purple-100">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#efe6f8] text-[#5b2a86]">
          <tr>
            <th className="px-4 py-3 font-black">Article</th>
            <th className="px-4 py-3 font-black">Category</th>
            <th className="px-4 py-3 text-right font-black">Part</th>
            <th className="px-4 py-3 text-right font-black">Labor</th>
            <th className="px-4 py-3 text-right font-black">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id || index} className="border-t border-purple-50">
              <td className="px-4 py-3 font-semibold text-[#221433]">{item.description || "—"}</td>
              <td className="px-4 py-3 text-[#5b2a86]">{CATEGORY_LABELS[item.category] || item.category}</td>
              <td className="px-4 py-3 text-right text-[#221433]">{money(item.amount)}</td>
              <td className="px-4 py-3 text-right text-[#221433]">{money(item.labor)}</td>
              <td className="px-4 py-3 text-right font-bold text-[#3b1b6d]">
                {money(Number(item.amount || 0) + Number(item.labor || 0))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-purple-100 bg-[#f7f4fb] font-black text-[#3b1b6d]">
            <td className="px-4 py-3" colSpan={2}>
              Total ({items.length} {items.length === 1 ? "item" : "items"})
            </td>
            <td className="px-4 py-3 text-right">{money(totals.part)}</td>
            <td className="px-4 py-3 text-right">{money(totals.labor)}</td>
            <td className="px-4 py-3 text-right">{money(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
