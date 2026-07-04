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
          <p className="text-sm">Click Add Vehicle para empezar.</p>
        </div>
      ) : visibleCars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No hay carros que coincidan con el filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {visibleCars.map((car) => {
            const days = getDaysInInventory(car);
            const paymentStatus = getPaymentStatus(car);
            return (
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                key={car.id}
                onClick={() => onSelectCar(car)}
                className={`overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition ${
                  selectedCarId === car.id
                    ? "border-[#5b2a86] ring-4 ring-purple-100"
                    : "border-purple-100 hover:border-[#7d3fb2]"
                }`}
              >
                <div className="aspect-[4/3] bg-[#efe6f8]">
                  {car.photo ? (
                    <img src={car.photo} alt={car.model || "Car"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#7d3fb2]">
                      <ImagePlus className="h-9 w-9" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 font-black text-[#221433]">
                    {car.year} {car.model || "Untitled Vehicle"}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase text-[#7d3fb2]">
                    {car.status === "sold" ? (car.saleType === "finance" ? "Credit Sale" : "Cash Sale") : "Available / Not Sold"}
                  </p>
                  <p
                    className={`mt-1 text-sm font-black ${
                      getCarProfitOrEquity(car) >= 0 ? "text-emerald-600" : "text-amber-700"
                    }`}
                  >
                    {money(getCarProfitOrEquity(car))}{" "}
                    {car.status === "sold" ? "expected" : "estimated equity"}
                  </p>
                  {car.saleType === "finance" && car.status === "sold" && (
                    <p className="text-xs text-slate-500">{money(getBalanceRemaining(car))} balance</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {car.status !== "sold" && days !== null && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-[#5b2a86]">
                        {days}d in inventory
                      </span>
                    )}
                    {paymentStatus.isOverdue && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        Atrasado · {paymentStatus.paymentsBehind} pago(s)
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </>
  );
}
