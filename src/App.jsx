import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Car,
  DollarSign,
  Truck,
  Wrench,
  FileText,
  Save,
  Trash2,
  ImagePlus,
  CreditCard,
  CalendarDays,
  Upload,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const emptyCar = {
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
};

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function numberValue(value) {
  return Number(value || 0);
}

function getInvestment(car) {
  return (
    numberValue(car.auctionPrice) +
    numberValue(car.repairCost) +
    numberValue(car.adminFees) +
    numberValue(car.transportCost) +
    numberValue(car.partsCost) +
    numberValue(car.detailingCost) +
    numberValue(car.titleFees) +
    numberValue(car.taxes) +
    numberValue(car.advertisingCost) +
    numberValue(car.miscCost) +
    numberValue(car.repoCost)
  );
}

function isSold(car) {
  return car.status === "sold";
}

function getEstimatedValue(car) {
  return numberValue(car.estimatedMarketValue || car.askingPrice);
}

function getExpectedSaleValue(car) {
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

function getCollectedSoFar(car) {
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

function getBalanceRemaining(car) {
  if (!isSold(car)) return 0;
  if (car.saleType !== "finance") return 0;
  return Math.max(getExpectedSaleValue(car) - getCollectedSoFar(car), 0);
}

function getExpectedProfit(car) {
  return getExpectedSaleValue(car) - getInvestment(car);
}

function getInventoryEquity(car) {
  if (isSold(car)) return 0;
  return getEstimatedValue(car) - getInvestment(car);
}

function getCollectedProfit(car) {
  return getCollectedSoFar(car) - getInvestment(car);
}

function getBreakEvenPayment(car) {
  if (car.saleType !== "finance") return "N/A";
  const monthly = numberValue(car.monthlyPayment);
  const remainingAfterDown = getInvestment(car) - numberValue(car.downPayment);
  if (remainingAfterDown <= 0) return 0;
  if (monthly <= 0) return "N/A";
  return Math.ceil(remainingAfterDown / monthly);
}

function rowToCar(row) {
  return { ...emptyCar, ...row.data, id: row.id };
}

export default function CarSalesInventoryDashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [form, setForm] = useState(emptyCar);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadCarsFromSupabase();
  }, []);

  async function loadCarsFromSupabase() {
    setLoading(true);
    setStatus("Loading from Supabase...");

    const { data, error } = await supabase
      .from("cars")
      .select("id, data, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Supabase error: ${error.message}`);
      setLoading(false);
      return;
    }

    setCars((data || []).map(rowToCar));
    setStatus("Synced with Supabase");
    setLoading(false);
  }

  const formTotals = useMemo(() => {
    const investment = getInvestment(form);
    const expected = getExpectedSaleValue(form);
    const collected = getCollectedSoFar(form);
    const expectedProfit = expected - investment;
    const collectedProfit = collected - investment;
    const roi = investment > 0 ? (expectedProfit / investment) * 100 : 0;

    return {
      investment,
      expected,
      collected,
      balance: getBalanceRemaining(form),
      expectedProfit,
      collectedProfit,
      breakEvenPayment: getBreakEvenPayment(form),
      roi,
    };
  }, [form]);

  const summary = useMemo(() => {
    const invested = cars.reduce((sum, car) => sum + getInvestment(car), 0);
    const expected = cars.reduce((sum, car) => sum + getExpectedSaleValue(car), 0);
    const collected = cars.reduce((sum, car) => sum + getCollectedSoFar(car), 0);
    const balance = cars.reduce((sum, car) => sum + getBalanceRemaining(car), 0);

    return {
      cars: cars.length,
      financedCars: cars.filter((car) => car.status === "sold" && car.saleType === "finance").length,
      availableCars: cars.filter((car) => car.status !== "sold").length,
      invested,
      expected,
      collected,
      balance,
      expectedProfit: expected - invested,
      collectedProfit: collected - invested,
    };
  }, [cars]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({ ...prev, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  function handleNewCar() {
    setSelectedCarId("new");
    setForm({ ...emptyCar, id: null });
    setStatus("New vehicle ready");
  }

  function handleSelectCar(car) {
    setSelectedCarId(car.id);
    setForm(car);
  }

  async function handleSave() {
    setSaving(true);
    setStatus("Saving to Supabase...");

    const { id, ...carData } = form;

    if (!id) {
      const { data, error } = await supabase
        .from("cars")
        .insert([{ data: carData }])
        .select("id, data, created_at")
        .single();

      if (error) {
        setStatus(`Save error: ${error.message}`);
        setSaving(false);
        return;
      }

      const savedCar = rowToCar(data);
      setCars((prev) => [savedCar, ...prev]);
      setForm(savedCar);
      setSelectedCarId(savedCar.id);
      setStatus("Vehicle saved to Supabase");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("cars")
      .update({ data: carData })
      .eq("id", id)
      .select("id, data, created_at")
      .single();

    if (error) {
      setStatus(`Update error: ${error.message}`);
      setSaving(false);
      return;
    }

    const updatedCar = rowToCar(data);
    setCars((prev) => prev.map((car) => (car.id === updatedCar.id ? updatedCar : car)));
    setForm(updatedCar);
    setStatus("Vehicle updated in Supabase");
    setSaving(false);
  }

  async function handleDelete() {
    if (!form.id) {
      setSelectedCarId(null);
      setForm(emptyCar);
      return;
    }

    setSaving(true);
    setStatus("Deleting from Supabase...");

    const { error } = await supabase.from("cars").delete().eq("id", form.id);

    if (error) {
      setStatus(`Delete error: ${error.message}`);
      setSaving(false);
      return;
    }

    setCars((prev) => prev.filter((car) => car.id !== form.id));
    setSelectedCarId(null);
    setForm(emptyCar);
    setStatus("Vehicle deleted");
    setSaving(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f4fb] p-3 text-[#221433] sm:p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#3b1b6d] via-[#5b2a86] to-[#7d3fb2] p-5 text-white shadow-xl sm:p-6 md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-purple-100">
                <Cloud className="h-4 w-4" /> Rose Legacy Auto Tracker · Supabase Connected
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-5xl">Inventory & Profit Dashboard</h1>
              <p className="mt-3 max-w-3xl text-sm text-purple-100 sm:text-base">
                Controla carros vendidos cash o a crédito, pagos recibidos, balance pendiente y ganancia real desde la nube.
              </p>
              <p className="mt-2 text-xs font-semibold text-purple-100 sm:text-sm">{loading ? "Loading..." : status}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
              <Button onClick={loadCarsFromSupabase} className="rounded-2xl bg-[#efe6f8] px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-white">
                <RefreshCw className="mr-2 h-5 w-5" /> Refresh
              </Button>
              <Button onClick={handleNewCar} className="rounded-2xl bg-white px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-purple-50">
                <Plus className="mr-2 h-5 w-5" /> Add Vehicle
              </Button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
          <SummaryCard title="Cars" value={summary.cars} icon={<Car />} />
          <SummaryCard title="Invested" value={money(summary.invested)} icon={<DollarSign />} />
          <SummaryCard title="Collected" value={money(summary.collected)} icon={<CreditCard />} />
          <SummaryCard title="Balance Pending" value={money(summary.balance)} icon={<CalendarDays />} />
          <SummaryCard title="Expected Revenue" value={money(summary.expected)} icon={<FileText />} />
          <SummaryCard title="Expected Profit" value={money(summary.expectedProfit)} icon={<Wrench />} highlight={summary.expectedProfit >= 0} />
          <SummaryCard title="Profit Collected" value={money(summary.collectedProfit)} icon={<DollarSign />} highlight={summary.collectedProfit >= 0} />
          <SummaryCard title="Financed Cars" value={summary.financedCars} icon={<CreditCard />} />
          <SummaryCard title="Available Cars" value={summary.availableCars} icon={<Car />} />
        </section>

        <main className="grid gap-4 md:gap-6 xl:grid-cols-[0.9fr_1.4fr]">
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-[#3b1b6d]">Vehicle Grid</h2>
                <span className="rounded-full bg-[#efe6f8] px-3 py-1 text-sm font-bold text-[#5b2a86]">{cars.length} cars</span>
              </div>

              {cars.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
                  <Car className="mx-auto mb-3 h-10 w-10" />
                  <p className="font-bold">No cars yet</p>
                  <p className="text-sm">Click Add Vehicle para empezar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {cars.map((car) => (
                    <motion.button
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      key={car.id}
                      onClick={() => handleSelectCar(car)}
                      className={`overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition ${
                        selectedCarId === car.id ? "border-[#5b2a86] ring-4 ring-purple-100" : "border-purple-100 hover:border-[#7d3fb2]"
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
                        <p className="line-clamp-1 font-black text-[#221433]">{car.year} {car.model || "Untitled Vehicle"}</p>
                        <p className="mt-1 text-xs font-bold uppercase text-[#7d3fb2]">{car.status === "sold" ? (car.saleType === "finance" ? "Credit Sale" : "Cash Sale") : "Available / Not Sold"}</p>
                        <p className={`mt-1 text-sm font-black ${getExpectedProfit(car) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {money(car.status === "sold" ? getExpectedProfit(car) : getInventoryEquity(car))} {car.status === "sold" ? "expected" : "estimated equity"}
                        </p>
                        {car.saleType === "finance" && <p className="text-xs text-slate-500">{money(getBalanceRemaining(car))} balance</p>}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              {!selectedCarId ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-[#f7f4fb] p-8 text-center md:min-h-[520px]">
                  <Car className="mb-4 h-12 w-12 text-[#7d3fb2]" />
                  <h2 className="text-2xl font-black text-[#3b1b6d]">Select or add a vehicle</h2>
                  <p className="mt-2 max-w-sm text-[#5b2a86]">Haz click en un carro del grid o agrega uno nuevo para llenar el formulario.</p>
                </div>
              ) : (
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
                      <h2 className="break-words text-2xl font-black text-[#3b1b6d] sm:text-3xl">{form.year} {form.model || "New Vehicle"}</h2>
                      <p className={`mt-2 text-lg font-black sm:text-xl ${formTotals.expectedProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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

                  <section className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                    <Input label="Model" value={form.model} onChange={(v) => handleChange("model", v)} />
                    <Input label="Year" value={form.year} onChange={(v) => handleChange("year", v)} />
                    <Input label="Purchase Date" type="date" value={form.purchaseDate} onChange={(v) => handleChange("purchaseDate", v)} />
                    <Input label="Sold Date" type="date" value={form.soldDate} onChange={(v) => handleChange("soldDate", v)} />
                    <StatusSelect label="Vehicle Status" value={form.status} onChange={(v) => handleChange("status", v)} />
                    <Select label="Sale Type" value={form.saleType} onChange={(v) => handleChange("saleType", v)} />
                    {form.status !== "sold" && (
                      <>
                        <Input label="Estimated Market Value" type="number" value={form.estimatedMarketValue} onChange={(v) => handleChange("estimatedMarketValue", v)} />
                        <Input label="Asking Price / List Price" type="number" value={form.askingPrice} onChange={(v) => handleChange("askingPrice", v)} />
                      </>
                    )}
                  </section>

                  <SectionTitle title="Cost Breakdown" />
                  <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
                    <Input label="Auction Purchase Price" type="number" value={form.auctionPrice} onChange={(v) => handleChange("auctionPrice", v)} />
                    <Input label="Repairs / Labor" type="number" value={form.repairCost} onChange={(v) => handleChange("repairCost", v)} />
                    <Input label="Parts" type="number" value={form.partsCost} onChange={(v) => handleChange("partsCost", v)} />
                    <Input label="Transport / Tow" type="number" value={form.transportCost} onChange={(v) => handleChange("transportCost", v)} />
                    <Input label="Admin / Auction Fees" type="number" value={form.adminFees} onChange={(v) => handleChange("adminFees", v)} />
                    <Input label="Title / Registration" type="number" value={form.titleFees} onChange={(v) => handleChange("titleFees", v)} />
                    <Input label="Taxes" type="number" value={form.taxes} onChange={(v) => handleChange("taxes", v)} />
                    <Input label="Detailing / Cleaning" type="number" value={form.detailingCost} onChange={(v) => handleChange("detailingCost", v)} />
                    <Input label="Ads / Marketplace" type="number" value={form.advertisingCost} onChange={(v) => handleChange("advertisingCost", v)} />
                    <Input label="Repo / Recovery Cost" type="number" value={form.repoCost} onChange={(v) => handleChange("repoCost", v)} />
                    <Input label="Miscellaneous" type="number" value={form.miscCost} onChange={(v) => handleChange("miscCost", v)} />
                  </section>

                  {form.status !== "sold" ? (
                    <>
                      <SectionTitle title="Available / Not Sold Yet" />
                      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        <MiniTotal title="Money Invested" value={money(formTotals.investment)} />
                        <MiniTotal title="Estimated Value" value={money(getEstimatedValue(form))} />
                        <MiniTotal title="Estimated Equity" value={money(getInventoryEquity(form))} />
                      </section>
                    </>
                  ) : form.saleType === "cash" ? (
                    <>
                      <SectionTitle title="Cash Sale" />
                      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        <Input label="Sold Price" type="number" value={form.soldPrice} onChange={(v) => handleChange("soldPrice", v)} />
                        <MiniTotal title="Cash Profit" value={money(formTotals.expectedProfit)} />
                      </section>
                    </>
                  ) : (
                    <>
                      <SectionTitle title="Credit / Monthly Payment Logic" />
                      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
                        <Input label="Down Payment" type="number" value={form.downPayment} onChange={(v) => handleChange("downPayment", v)} />
                        <Input label="Monthly Payment" type="number" value={form.monthlyPayment} onChange={(v) => handleChange("monthlyPayment", v)} />
                        <Input label="Number of Payments" type="number" value={form.numberOfPayments} onChange={(v) => handleChange("numberOfPayments", v)} />
                        <Input label="Payments Received" type="number" value={form.paymentsReceived} onChange={(v) => handleChange("paymentsReceived", v)} />
                        <Input label="Payment Start Date" type="date" value={form.paymentStartDate} onChange={(v) => handleChange("paymentStartDate", v)} />
                        <Input label="Late Fees Collected" type="number" value={form.lateFeesCollected} onChange={(v) => handleChange("lateFeesCollected", v)} />
                      </section>

                      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        <MiniTotal title="Total Contract" value={money(formTotals.expected)} />
                        <MiniTotal title="Balance Remaining" value={money(formTotals.balance)} />
                        <MiniTotal title="Break Even Payment #" value={formTotals.breakEvenPayment} />
                        <MiniTotal title="Profit If Fully Paid" value={money(formTotals.expectedProfit)} />
                        <MiniTotal title="Profit Today" value={money(formTotals.collectedProfit)} />
                      </section>

                      <Textarea label="Financing Notes" value={form.financingNotes} onChange={(v) => handleChange("financingNotes", v)} />
                    </>
                  )}

                  <Textarea label="General Notes" value={form.notes} onChange={(v) => handleChange("notes", v)} />

                  <section className="sticky bottom-2 z-10 flex flex-col gap-3 rounded-3xl border border-purple-100 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row">
                    <Button disabled={saving} onClick={handleSave} className="rounded-2xl bg-[#5b2a86] py-6 text-base font-bold hover:bg-[#3b1b6d] disabled:opacity-60">
                      <Save className="mr-2 h-5 w-5" /> {saving ? "Saving..." : "Save Vehicle"}
                    </Button>
                    <Button disabled={saving} onClick={handleDelete} variant="outline" className="rounded-2xl border-red-200 py-6 text-base font-bold text-red-600 hover:text-red-700 disabled:opacity-60">
                      <Trash2 className="mr-2 h-5 w-5" /> Delete
                    </Button>
                  </section>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon, highlight }) {
  return (
    <Card className="rounded-3xl border border-purple-100 bg-white shadow-md">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div className="rounded-2xl bg-[#efe6f8] p-3 text-[#5b2a86] [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
          <p className={`break-words text-xl font-black sm:text-2xl ${highlight === true ? "text-emerald-600" : highlight === false ? "text-red-600" : "text-[#221433]"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
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

function SectionTitle({ title }) {
  return <h3 className="text-lg font-black text-[#3b1b6d]">{title}</h3>;
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
