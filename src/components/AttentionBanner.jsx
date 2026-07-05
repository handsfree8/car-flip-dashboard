import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { money, getVehiclesAtLoss, getPaymentStatus, getAgingInventory } from "@/lib/carCalculations";

export default function AttentionBanner({ cars, onSelectCar }) {
  const [expanded, setExpanded] = useState(false);

  const vehiclesAtLoss = getVehiclesAtLoss(cars);
  const overdue = cars.filter((car) => getPaymentStatus(car).isOverdue);
  const staleInventory = getAgingInventory(cars).filter((entry) => entry.isStale);

  const totalCount = vehiclesAtLoss.length + overdue.length + staleInventory.length;

  if (totalCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
        <CheckCircle2 className="h-5 w-5" /> All Clear
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> {totalCount} vehicle{totalCount === 1 ? "" : "s"} need attention
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-red-100 px-4 py-3">
          {vehiclesAtLoss.length > 0 && (
            <AttentionSection title="At a Loss">
              {vehiclesAtLoss.map(({ car, amount }) => (
                <AttentionRow key={car.id} car={car} detail={money(amount)} onSelectCar={onSelectCar} />
              ))}
            </AttentionSection>
          )}

          {overdue.length > 0 && (
            <AttentionSection title="Overdue Payments">
              {overdue.map((car) => {
                const status = getPaymentStatus(car);
                return (
                  <AttentionRow
                    key={car.id}
                    car={car}
                    detail={`${status.paymentsBehind} payment(s) · ${money(status.amountOverdue)}`}
                    onSelectCar={onSelectCar}
                  />
                );
              })}
            </AttentionSection>
          )}

          {staleInventory.length > 0 && (
            <AttentionSection title="Aging Inventory">
              {staleInventory.map(({ car, days }) => (
                <AttentionRow key={car.id} car={car} detail={`${days}d in inventory`} onSelectCar={onSelectCar} />
              ))}
            </AttentionSection>
          )}
        </div>
      )}
    </div>
  );
}

function AttentionSection({ title, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black uppercase tracking-wide text-red-500">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function AttentionRow({ car, detail, onSelectCar }) {
  return (
    <button
      type="button"
      onClick={() => onSelectCar(car)}
      className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50"
    >
      <span>
        {car.year} {car.model || "Untitled Vehicle"}
      </span>
      <span>{detail}</span>
    </button>
  );
}
