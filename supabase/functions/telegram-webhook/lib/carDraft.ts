export interface CarPurchaseDraft {
  model: string | null;
  year: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
}

export function isCarPurchaseDraftComplete(draft: CarPurchaseDraft): boolean {
  return Boolean(draft.model) && Boolean(draft.year) && draft.purchasePrice !== null && draft.purchasePrice !== undefined;
}

const EMPTY_CAR_DATA_TEMPLATE: Record<string, string> = {
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
};

export function buildNewCarRecord(draft: CarPurchaseDraft): Record<string, unknown> {
  if (!isCarPurchaseDraftComplete(draft)) {
    throw new Error("Cannot build a car record from an incomplete draft");
  }
  return {
    ...EMPTY_CAR_DATA_TEMPLATE,
    model: draft.model,
    year: draft.year,
    auctionPrice: String(draft.purchasePrice),
    purchaseDate: draft.purchaseDate ?? "",
  };
}
