import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Car, ImagePlus } from "lucide-react";
import {
  money,
  getCarProfitOrEquity,
  getBalanceRemaining,
  getDaysInInventory,
  getPaymentStatus,
} from "@/lib/carCalculations";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "listed", label: "Listed" },
  { value: "sold", label: "Sold" },
];

const SALE_TYPE_OPTIONS = [
  { value: "all", label: "All Sale Types" },
  { value: "cash", label: "Cash" },
  { value: "finance", label: "Credit" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "year", label: "Year" },
  { value: "profit", label: "Profit (High to Low)" },
  { value: "aging", label: "Days In Inventory" },
];

function matchesSearch(car, query) {
  if (!query) return true;
  const haystack = `${car.model || ""} ${car.year || ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortCars(cars, sortBy) {
  const sorted = [...cars];
  if (sortBy === "year") {
    return sorted.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }
  if (sortBy === "profit") {
    return sorted.sort((a, b) => getCarProfitOrEquity(b) - getCarProfitOrEquity(a));
  }
  if (sortBy === "aging") {
    return sorted.sort((a, b) => (getDaysInInventory(b) ?? -1) - (getDaysInInventory(a) ?? -1));
  }
  return sorted; // "recent" — keep incoming (Supabase created_at desc) order
}

export default function VehicleGrid({ cars, selectedCarId, onSelectCar }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saleTypeFilter, setSaleTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const visibleCars = useMemo(() => {
    const filtered = cars.filter((car) => {
      if (statusFilter !== "all" && car.status !== statusFilter) return false;
      if (saleTypeFilter !== "all" && car.saleType !== saleTypeFilter) return false;
      return matchesSearch(car, search);
    });
    return sortCars(filtered, sortBy);
  }, [cars, search, statusFilter, saleTypeFilter, sortBy]);

  const profitableCars = visibleCars.filter((car) => getCarProfitOrEquity(car) >= 0);
  const nonProfitableCars = visibleCars.filter((car) => getCarProfitOrEquity(car) < 0);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search model or year..."
          className="min-w-0 flex-1 rounded-2xl border border-purple-100 bg-white px-4 py-2 text-sm font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={saleTypeFilter}
          onChange={(event) => setSaleTypeFilter(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {SALE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {cars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No cars yet</p>
          <p className="text-sm">Click Add Vehicle to get started.</p>
        </div>
      ) : visibleCars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No vehicles match your filters</p>
        </div>
      ) : (
        <div className="space-y-8">
          {profitableCars.length > 0 && (
            <VehicleGroup
              title="Profitable"
              cars={profitableCars}
              selectedCarId={selectedCarId}
              onSelectCar={onSelectCar}
            />
          )}
          {nonProfitableCars.length > 0 && (
            <VehicleGroup
              title="Non-Profitable"
              cars={nonProfitableCars}
              selectedCarId={selectedCarId}
              onSelectCar={onSelectCar}
            />
          )}
        </div>
      )}
    </>
  );
}

function VehicleGroup({ title, cars, selectedCarId, onSelectCar }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-base font-black text-[#3b1b6d]">{title}</h3>
        <span className="rounded-full bg-[#efe6f8] px-2 py-0.5 text-xs font-bold text-[#5b2a86]">
          {cars.length} {cars.length === 1 ? "car" : "cars"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cars.map((car) => {
          const days = getDaysInInventory(car);
          const paymentStatus = getPaymentStatus(car);
          return (
            <motion.button
              layoutId={`vehicle-card-${car.id}`}
              whileHover={{ y: -8, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              key={car.id}
              type="button"
              onClick={() => onSelectCar(car)}
              className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white to-[#f7f2ff] text-left shadow-sm transition-shadow duration-300 hover:shadow-[0_20px_50px_-12px_rgba(139,92,246,0.45)] ${
                selectedCarId === car.id
                  ? "border-[#5b2a86] ring-4 ring-purple-100"
                  : "border-purple-100 hover:border-[#a879ff]"
              }`}
            >
              <div className="relative h-48 overflow-hidden bg-[#efe6f8] sm:h-56">
                {car.photo ? (
                  <img
                    src={car.photo}
                    alt={car.model || "Car"}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#7d3fb2]">
                    <ImagePlus className="h-12 w-12" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="p-5">
                <p className="line-clamp-1 text-lg font-black text-[#221433]">
                  {car.year} {car.model || "Untitled Vehicle"}
                </p>
                <p className="mt-1 text-xs font-bold uppercase text-[#7d3fb2]">
                  {car.status === "sold" ? (car.saleType === "finance" ? "Credit Sale" : "Cash Sale") : "Available / Not Sold"}
                </p>
                <p
                  className={`mt-2 text-base font-black ${
                    getCarProfitOrEquity(car) >= 0 ? "text-emerald-600" : "text-amber-700"
                  }`}
                >
                  {money(getCarProfitOrEquity(car))}{" "}
                  {car.status === "sold" ? "expected" : "estimated equity"}
                </p>
                {car.saleType === "finance" && car.status === "sold" && (
                  <p className="text-xs text-slate-500">{money(getBalanceRemaining(car))} balance</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {car.status !== "sold" && days !== null && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-[#5b2a86]">
                      {days}d in inventory
                    </span>
                  )}
                  {paymentStatus.isOverdue && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                      Overdue · {paymentStatus.paymentsBehind} payment(s)
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
