export const emptyCar = {
  id: null,
  model: "",
  year: "",
  photo: "",
  status: "available",
  estimatedMarketValue: "",
  askingPrice: "",
  saleType: "cash",
  auctionPrice: "",
  repairCost: "",
  adminFees: "",
  transportCost: "",
  partsCost: "",
  detailingCost: "",
  titleFees: "",
  taxes: "",
  advertisingCost: "",
  miscCost: "",
  soldPrice: "",
  purchaseDate: "",
  soldDate: "",
  downPayment: "",
  monthlyPayment: "",
  numberOfPayments: "",
  paymentsReceived: "",
  paymentStartDate: "",
  lateFeesCollected: "",
  repoCost: "",
  financingNotes: "",
  notes: "",
  expenses: [],
};

export const COST_FIELDS = [
  { key: "auctionPrice", label: "Auction Purchase Price" },
  { key: "repairCost", label: "Repairs / Labor" },
  { key: "partsCost", label: "Parts" },
  { key: "transportCost", label: "Transport / Tow" },
  { key: "adminFees", label: "Admin / Auction Fees" },
  { key: "titleFees", label: "Title / Registration" },
  { key: "taxes", label: "Taxes" },
  { key: "detailingCost", label: "Detailing / Cleaning" },
  { key: "advertisingCost", label: "Ads / Marketplace" },
  { key: "repoCost", label: "Repo / Recovery Cost" },
  { key: "miscCost", label: "Miscellaneous" },
];

export function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function numberValue(value) {
  return Number(value || 0);
}

export function getInvestment(car) {
  return COST_FIELDS.reduce((sum, field) => sum + numberValue(car[field.key]), 0);
}

export function isSold(car) {
  return car.status === "sold";
}

export function getEstimatedValue(car) {
  return numberValue(car.estimatedMarketValue || car.askingPrice);
}

export function getExpectedSaleValue(car) {
  if (!isSold(car)) {
    return getEstimatedValue(car);
  }

  if (car.saleType === "finance") {
    return (
      numberValue(car.downPayment) +
      numberValue(car.monthlyPayment) * numberValue(car.numberOfPayments) +
      numberValue(car.lateFeesCollected)
    );
  }
  return numberValue(car.soldPrice);
}

export function getCollectedSoFar(car) {
  if (!isSold(car)) return 0;

  if (car.saleType === "finance") {
    return (
      numberValue(car.downPayment) +
      numberValue(car.monthlyPayment) * numberValue(car.paymentsReceived) +
      numberValue(car.lateFeesCollected)
    );
  }
  return numberValue(car.soldPrice);
}

export function getBalanceRemaining(car) {
  if (!isSold(car)) return 0;
  if (car.saleType !== "finance") return 0;
  return Math.max(getExpectedSaleValue(car) - getCollectedSoFar(car), 0);
}

export function getExpectedProfit(car) {
  return getExpectedSaleValue(car) - getInvestment(car);
}

export function getInventoryEquity(car) {
  if (isSold(car)) return 0;
  return getEstimatedValue(car) - getInvestment(car);
}

export function getCollectedProfit(car) {
  return getCollectedSoFar(car) - getInvestment(car);
}

export function getBreakEvenPayment(car) {
  if (car.saleType !== "finance") return "N/A";
  const monthly = numberValue(car.monthlyPayment);
  const remainingAfterDown = getInvestment(car) - numberValue(car.downPayment);
  if (remainingAfterDown <= 0) return 0;
  if (monthly <= 0) return "N/A";
  return Math.ceil(remainingAfterDown / monthly);
}

export function rowToCar(row) {
  return { ...emptyCar, ...row.data, id: row.id };
}

function daysBetween(start, end) {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
}

export function getDaysInInventory(car, referenceDate = new Date()) {
  if (!car.purchaseDate) return null;
  const start = new Date(car.purchaseDate);
  if (Number.isNaN(start.getTime())) return null;

  const end = isSold(car) && car.soldDate ? new Date(car.soldDate) : referenceDate;
  if (Number.isNaN(end.getTime())) return null;

  return daysBetween(start, end);
}

const NOT_OVERDUE = { isOverdue: false, paymentsBehind: 0, amountOverdue: 0 };

export function getPaymentStatus(car, referenceDate = new Date()) {
  if (!isSold(car) || car.saleType !== "finance") return NOT_OVERDUE;
  if (!car.paymentStartDate) return NOT_OVERDUE;

  const start = new Date(car.paymentStartDate);
  if (Number.isNaN(start.getTime())) return NOT_OVERDUE;

  const monthly = numberValue(car.monthlyPayment);
  const totalPayments = numberValue(car.numberOfPayments);
  if (monthly <= 0 || totalPayments <= 0) return NOT_OVERDUE;

  const monthsElapsed =
    (referenceDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (referenceDate.getUTCMonth() - start.getUTCMonth()) +
    (referenceDate.getUTCDate() >= start.getUTCDate() ? 1 : 0);

  const expectedPayments = Math.min(Math.max(monthsElapsed, 0), totalPayments);
  const received = numberValue(car.paymentsReceived);
  const paymentsBehind = Math.max(expectedPayments - received, 0);

  if (paymentsBehind <= 0) return NOT_OVERDUE;

  return {
    isOverdue: true,
    paymentsBehind,
    amountOverdue: paymentsBehind * monthly,
  };
}

export function getCostBreakdown(cars) {
  return COST_FIELDS.map((field) => {
    const total = cars.reduce((sum, car) => sum + numberValue(car[field.key]), 0);
    const average = cars.length > 0 ? total / cars.length : 0;
    return { key: field.key, label: field.label, total, average };
  });
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function getProfitByMonth(cars) {
  const totals = new Map();

  cars.forEach((car) => {
    if (!isSold(car) || !car.soldDate) return;
    const date = new Date(car.soldDate);
    if (Number.isNaN(date.getTime())) return;

    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) || 0) + getExpectedProfit(car));
  });

  return Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, profit]) => ({ month, label: formatMonthLabel(month), profit }));
}

export function getAgingInventory(cars, thresholdDays = 45, referenceDate = new Date()) {
  return cars
    .filter((car) => !isSold(car))
    .map((car) => ({ car, days: getDaysInInventory(car, referenceDate) }))
    .filter((entry) => entry.days !== null)
    .sort((a, b) => b.days - a.days)
    .map((entry) => ({ ...entry, isStale: entry.days > thresholdDays }));
}

export function getCarProfitOrEquity(car) {
  return isSold(car) ? getExpectedProfit(car) : getInventoryEquity(car);
}

export function getVehiclesAtLoss(cars) {
  return cars
    .map((car) => ({ car, amount: getCarProfitOrEquity(car) }))
    .filter((entry) => entry.amount < 0)
    .sort((a, b) => a.amount - b.amount);
}
