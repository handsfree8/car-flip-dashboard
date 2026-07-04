import {
  getInvestment,
  getExpectedSaleValue,
  getCollectedSoFar,
  getBalanceRemaining,
  getExpectedProfit,
  getCollectedProfit,
  getDaysInInventory,
} from "./carCalculations.js";

const HEADERS = [
  "Model",
  "Year",
  "Status",
  "Sale Type",
  "Purchase Date",
  "Sold Date",
  "Investment",
  "Expected Sale Value",
  "Collected So Far",
  "Balance Remaining",
  "Expected Profit",
  "Collected Profit",
  "Days In Inventory",
];

function escapeCell(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function carRow(car) {
  return [
    car.model || "",
    car.year || "",
    car.status || "",
    car.saleType || "",
    car.purchaseDate || "",
    car.soldDate || "",
    getInvestment(car),
    getExpectedSaleValue(car),
    getCollectedSoFar(car),
    getBalanceRemaining(car),
    getExpectedProfit(car),
    getCollectedProfit(car),
    getDaysInInventory(car) ?? "",
  ];
}

export function carsToCsv(cars) {
  const rows = [HEADERS, ...cars.map(carRow)];
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadCarsCsv(cars, filename = "inventory.csv") {
  const csv = carsToCsv(cars);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
