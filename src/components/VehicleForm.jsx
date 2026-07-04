import { useRef, useState } from "react";
import { Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, getInvestment, getEstimatedValue, getInventoryEquity } from "@/lib/carCalculations";

const SUB_TABS = [
  { value: "info", label: "Info" },
  { value: "costs", label: "Costos" },
  { value: "sale", label: "Venta / Financiamiento" },
  { value: "notes", label: "Notas" },
];

export default function VehicleForm({ form, formTotals, onChange, onSave, onDelete, saving }) {
  const [activeSubTab, setActiveSubTab] = useState("info");
  const fileInputRef = useRef(null);

  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      onChange("photo", reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-start">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-48 w-full overflow-hidden rounded-3xl border-2 border-dashed border-purple-200 bg-[#efe6f8] sm:h-56 md:h-44 md:w-56 md:flex-none"
        >
          {form.photo ? (
            <img src={form.photo} alt="Vehicle" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-[#5b2a86]">
              <Upload className="mb-2 h-8 w-8" />
              <span className="text-sm font-bold">Upload Image</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-[#3b1b6d]/85 p-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
            Click to change image
          </div>
        </button>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase text-[#7d3fb2]">Vehicle Details</p>
          <h2 className="break-words text-2xl font-black text-[#3b1b6d] sm:text-3xl">
            {form.year} {form.model || "New Vehicle"}
          </h2>
          <p
            className={`mt-2 text-lg font-black sm:text-xl ${
              formTotals.expectedProfit >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            Expected Profit: {money(formTotals.expectedProfit)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <MiniTotal title="Investment" value={money(formTotals.investment)} />
        <MiniTotal title="Collected" value={money(formTotals.collected)} />
        <MiniTotal title="Balance" value={money(formTotals.balance)} />
        <MiniTotal title="ROI" value={`${formTotals.roi.toFixed(1)}%`} />
      </section>

      <div className="flex flex-wrap gap-2 border-b border-purple-100 pb-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveSubTab(tab.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activeSubTab === tab.value
                ? "bg-[#5b2a86] text-white"
                : "bg-[#efe6f8] text-[#5b2a86] hover:bg-purple-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "info" && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <Input label="Model" value={form.model} onChange={(v) => onChange("model", v)} />
          <Input label="Year" value={form.year} onChange={(v) => onChange("year", v)} />
          <Input label="Purchase Date" type="date" value={form.purchaseDate} onChange={(v) => onChange("purchaseDate", v)} />
          <Input label="Sold Date" type="date" value={form.soldDate} onChange={(v) => onChange("soldDate", v)} />
          <StatusSelect label="Vehicle Status" value={form.status} onChange={(v) => onChange("status", v)} />
          <Select label="Sale Type" value={form.saleType} onChange={(v) => onChange("saleType", v)} />
          {form.status !== "sold" && (
            <>
              <Input
                label="Estimated Market Value"
                type="number"
                value={form.estimatedMarketValue}
                onChange={(v) => onChange("estimatedMarketValue", v)}
              />
              <Input label="Asking Price / List Price" type="number" value={form.askingPrice} onChange={(v) => onChange("askingPrice", v)} />
            </>
          )}
        </section>
      )}

      {activeSubTab === "costs" && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
            <Input label="Auction Purchase Price" type="number" value={form.auctionPrice} onChange={(v) => onChange("auctionPrice", v)} />
            <Input label="Repairs / Labor" type="number" value={form.repairCost} onChange={(v) => onChange("repairCost", v)} />
            <Input label="Parts" type="number" value={form.partsCost} onChange={(v) => onChange("partsCost", v)} />
            <Input label="Transport / Tow" type="number" value={form.transportCost} onChange={(v) => onChange("transportCost", v)} />
            <Input label="Admin / Auction Fees" type="number" value={form.adminFees} onChange={(v) => onChange("adminFees", v)} />
            <Input label="Title / Registration" type="number" value={form.titleFees} onChange={(v) => onChange("titleFees", v)} />
            <Input label="Taxes" type="number" value={form.taxes} onChange={(v) => onChange("taxes", v)} />
            <Input label="Detailing / Cleaning" type="number" value={form.detailingCost} onChange={(v) => onChange("detailingCost", v)} />
            <Input label="Ads / Marketplace" type="number" value={form.advertisingCost} onChange={(v) => onChange("advertisingCost", v)} />
            <Input label="Repo / Recovery Cost" type="number" value={form.repoCost} onChange={(v) => onChange("repoCost", v)} />
            <Input label="Miscellaneous" type="number" value={form.miscCost} onChange={(v) => onChange("miscCost", v)} />
          </section>
          {form.status !== "sold" && (
            <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
              <MiniTotal title="Money Invested" value={money(getInvestment(form))} />
              <MiniTotal title="Estimated Value" value={money(getEstimatedValue(form))} />
              <MiniTotal title="Estimated Equity" value={money(getInventoryEquity(form))} />
            </section>
          )}
        </>
      )}

      {activeSubTab === "sale" && (
        <>
          {form.status !== "sold" ? (
            <p className="rounded-3xl bg-[#f7f4fb] p-4 text-sm text-[#5b2a86]">
              Este vehículo aún no está vendido. Cambia el estatus a "Sold" en la pestaña Info para capturar los datos de venta.
            </p>
          ) : form.saleType === "cash" ? (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
              <Input label="Sold Price" type="number" value={form.soldPrice} onChange={(v) => onChange("soldPrice", v)} />
              <MiniTotal title="Cash Profit" value={money(formTotals.expectedProfit)} />
            </section>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
                <Input label="Down Payment" type="number" value={form.downPayment} onChange={(v) => onChange("downPayment", v)} />
                <Input label="Monthly Payment" type="number" value={form.monthlyPayment} onChange={(v) => onChange("monthlyPayment", v)} />
                <Input label="Number of Payments" type="number" value={form.numberOfPayments} onChange={(v) => onChange("numberOfPayments", v)} />
                <Input label="Payments Received" type="number" value={form.paymentsReceived} onChange={(v) => onChange("paymentsReceived", v)} />
                <Input label="Payment Start Date" type="date" value={form.paymentStartDate} onChange={(v) => onChange("paymentStartDate", v)} />
                <Input label="Late Fees Collected" type="number" value={form.lateFeesCollected} onChange={(v) => onChange("lateFeesCollected", v)} />
              </section>

              <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                <MiniTotal title="Total Contract" value={money(formTotals.expected)} />
                <MiniTotal title="Balance Remaining" value={money(formTotals.balance)} />
                <MiniTotal title="Break Even Payment #" value={formTotals.breakEvenPayment} />
                <MiniTotal title="Profit If Fully Paid" value={money(formTotals.expectedProfit)} />
                <MiniTotal title="Profit Today" value={money(formTotals.collectedProfit)} />
              </section>

              <div className="mt-4">
                <Textarea label="Financing Notes" value={form.financingNotes} onChange={(v) => onChange("financingNotes", v)} />
              </div>
            </>
          )}
        </>
      )}

      {activeSubTab === "notes" && <Textarea label="General Notes" value={form.notes} onChange={(v) => onChange("notes", v)} />}

      <section className="sticky bottom-2 z-10 flex flex-col gap-3 rounded-3xl border border-purple-100 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row">
        <Button disabled={saving} onClick={onSave} className="rounded-2xl bg-[#5b2a86] py-6 text-base font-bold hover:bg-[#3b1b6d] disabled:opacity-60">
          <Save className="mr-2 h-5 w-5" /> {saving ? "Saving..." : "Save Vehicle"}
        </Button>
        <Button
          disabled={saving}
          onClick={onDelete}
          variant="outline"
          className="rounded-2xl border-red-200 py-6 text-base font-bold text-red-600 hover:text-red-700 disabled:opacity-60"
        >
          <Trash2 className="mr-2 h-5 w-5" /> Delete
        </Button>
      </section>
    </div>
  );
}

function MiniTotal({ title, value }) {
  return (
    <div className="rounded-3xl bg-[#efe6f8] p-4">
      <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
      <p className="mt-1 break-words text-lg font-black text-[#3b1b6d] sm:text-xl">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <input
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      />
    </div>
  );
}

function Select({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      >
        <option value="cash">Cash Sale</option>
        <option value="finance">Credit / Monthly Payments</option>
      </select>
    </div>
  );
}

function StatusSelect({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      >
        <option value="available">Available / Not Sold Yet</option>
        <option value="listed">Listed For Sale</option>
        <option value="sold">Sold</option>
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-none rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      />
    </div>
  );
}
