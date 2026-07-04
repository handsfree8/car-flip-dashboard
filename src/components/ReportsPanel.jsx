import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  money,
  getCostBreakdown,
  getProfitByMonth,
  getAgingInventory,
  getPaymentStatus,
  getBalanceRemaining,
} from "@/lib/carCalculations";
import { downloadCarsCsv } from "@/lib/exportCsv";

export default function ReportsPanel({ cars }) {
  const costBreakdown = getCostBreakdown(cars);
  const profitByMonth = getProfitByMonth(cars);
  const aging = getAgingInventory(cars);
  const overdue = cars.filter((car) => getPaymentStatus(car).isOverdue);

  const maxCost = Math.max(1, ...costBreakdown.map((row) => row.total));
  const maxProfit = Math.max(1, ...profitByMonth.map((row) => Math.abs(row.profit)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#3b1b6d]">Reportes</h2>
        <Button
          onClick={() => downloadCarsCsv(cars)}
          className="rounded-2xl bg-[#5b2a86] px-4 py-5 text-sm font-bold text-white hover:bg-[#3b1b6d]"
        >
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Desglose de Costos (Total)</h3>
        <div className="space-y-2">
          {costBreakdown.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-xs font-bold text-[#5b2a86]">{row.label}</span>
              <div className="h-3 flex-1 rounded-full bg-[#f7f4fb]">
                <div
                  className="h-3 rounded-full bg-[#7d3fb2]"
                  style={{ width: `${(row.total / maxCost) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-bold text-[#221433]">{money(row.total)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Ganancia por Mes</h3>
        {profitByMonth.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">Aún no hay carros vendidos.</p>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto pb-2">
            {profitByMonth.map((row) => (
              <div key={row.month} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-lg ${row.profit >= 0 ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ height: `${Math.max((Math.abs(row.profit) / maxProfit) * 120, 4)}px` }}
                />
                <span className="text-[10px] font-bold text-[#5b2a86]">{row.label}</span>
                <span className="text-[10px] font-bold text-[#221433]">{money(row.profit)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Inventario Envejecido</h3>
        {aging.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No hay carros disponibles en inventario.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase text-[#7d3fb2]">
                <th className="pb-2">Vehicle</th>
                <th className="pb-2">Days</th>
              </tr>
            </thead>
            <tbody>
              {aging.map(({ car, days, isStale }) => (
                <tr key={car.id} className={isStale ? "text-amber-700" : "text-[#221433]"}>
                  <td className="py-1 font-bold">
                    {car.year} {car.model || "Untitled Vehicle"}
                  </td>
                  <td className="py-1 font-bold">{days}d{isStale ? " · Stale" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Pagos Atrasados</h3>
        {overdue.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No hay pagos atrasados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase text-[#7d3fb2]">
                <th className="pb-2">Vehicle</th>
                <th className="pb-2">Pagos Atrasados</th>
                <th className="pb-2">Monto Atrasado</th>
                <th className="pb-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((car) => {
                const status = getPaymentStatus(car);
                return (
                  <tr key={car.id} className="text-amber-700">
                    <td className="py-1 font-bold">
                      {car.year} {car.model || "Untitled Vehicle"}
                    </td>
                    <td className="py-1 font-bold">{status.paymentsBehind}</td>
                    <td className="py-1 font-bold">{money(status.amountOverdue)}</td>
                    <td className="py-1 font-bold">{money(getBalanceRemaining(car))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
