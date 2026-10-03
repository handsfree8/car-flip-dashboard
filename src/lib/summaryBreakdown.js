import {
  money,
  getInvestment,
  getCollectedSoFar,
  getBalanceRemaining,
  getExpectedSaleValue,
  getExpectedProfit,
  getCollectedProfit,
  getInventoryEquity,
  getCarProfitOrEquity,
  isSold,
} from "./carCalculations.js";

export function carLabel(car) {
  return `${car.year ?? ""} ${car.model ?? ""}`.trim() || "Untitled";
}

function statusLabel(car) {
  if (!isSold(car)) return "Available";
  return car.saleType === "finance" ? "Sold · Credit" : "Sold · Cash";
}

function countLabel(n) {
  return `${n} ${n === 1 ? "vehicle" : "vehicles"}`;
}

// Per-car money contribution metrics. `fn` is the same per-car function the
// App summary aggregates, so the modal footer always ties out to the card.
const MONEY_METRICS = {
  invested: { title: "Investment by Vehicle", fn: getInvestment },
  collected: { title: "Collected by Vehicle", fn: getCollectedSoFar },
  expected: { title: "Expected Revenue by Vehicle", fn: getExpectedSaleValue },
  balance: { title: "Pending Balance by Vehicle", fn: getBalanceRemaining, onlyPositive: true },
  expectedProfit: { title: "Expected Profit by Vehicle", fn: getExpectedProfit, signed: true },
  collectedProfit: { title: "Profit Collected by Vehicle", fn: getCollectedProfit, signed: true },
};

export function buildMetricBreakdown(metricKey, cars) {
  const list = Array.isArray(cars) ? cars : [];

  const moneyMetric = MONEY_METRICS[metricKey];
  if (moneyMetric) {
    const { title, fn, onlyPositive, signed } = moneyMetric;
    let rows = list.map((car) => {
      const value = fn(car);
      return {
        id: car.id ?? carLabel(car),
        label: carLabel(car),
        meta: null,
        amount: money(value),
        highlight: signed ? value >= 0 : undefined,
        value,
      };
    });
    if (onlyPositive) rows = rows.filter((row) => row.value > 0);
    rows.sort((a, b) => b.value - a.value);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return { title, kind: "money", rows, footerLabel: "Total", footerValue: money(total) };
  }

  if (metricKey === "cars") {
    const rows = list
      .map((car) => {
        const value = getCarProfitOrEquity(car);
        return {
          id: car.id ?? carLabel(car),
          label: carLabel(car),
          meta: statusLabel(car),
          amount: money(value),
          highlight: value >= 0,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    return { title: "All Vehicles", kind: "count", rows, footerLabel: "Vehicles", footerValue: countLabel(rows.length) };
  }

  if (metricKey === "financedCars") {
    const rows = list
      .filter((car) => isSold(car) && car.saleType === "finance")
      .map((car) => {
        const value = getBalanceRemaining(car);
        return {
          id: car.id ?? carLabel(car),
          label: carLabel(car),
          meta: "Pending balance",
          amount: money(value),
          highlight: undefined,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    return { title: "Financed Vehicles", kind: "count", rows, footerLabel: "Vehicles", footerValue: countLabel(rows.length) };
  }

  if (metricKey === "availableCars") {
    const rows = list
      .filter((car) => !isSold(car))
      .map((car) => {
        const value = getInventoryEquity(car);
        return {
          id: car.id ?? carLabel(car),
          label: carLabel(car),
          meta: "Est. equity",
          amount: money(value),
          highlight: value >= 0,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
    return { title: "Available Vehicles", kind: "count", rows, footerLabel: "Vehicles", footerValue: countLabel(rows.length) };
  }

  return { title: "", kind: "money", rows: [], footerLabel: "Total", footerValue: money(0) };
}
