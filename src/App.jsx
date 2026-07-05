import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Cloud, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  emptyCar,
  rowToCar,
  getInvestment,
  getExpectedSaleValue,
  getCollectedSoFar,
  getBalanceRemaining,
  getBreakEvenPayment,
} from "@/lib/carCalculations";
import SummaryCards from "@/components/SummaryCards";
import VehicleGrid from "@/components/VehicleGrid";
import VehicleModal from "@/components/VehicleModal";
import ReportsPanel from "@/components/ReportsPanel";
import AttentionBanner from "@/components/AttentionBanner";

const TABS = [
  { value: "inventory", label: "Inventario" },
  { value: "reports", label: "Reportes" },
];

export default function CarSalesInventoryDashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [form, setForm] = useState(emptyCar);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");

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

  function handleNewCar() {
    setSelectedCarId("new");
    setForm({ ...emptyCar, id: null });
    setStatus("New vehicle ready");
    setActiveTab("inventory");
  }

  function handleSelectCar(car) {
    setSelectedCarId(car.id);
    setForm(car);
  }

  function handleSelectCarFromAttention(car) {
    handleSelectCar(car);
    setActiveTab("inventory");
  }

  function handleCloseModal() {
    setSelectedCarId(null);
    setForm(emptyCar);
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
              <motion.div layoutId="vehicle-card-new">
                <Button onClick={handleNewCar} className="rounded-2xl bg-white px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-purple-50">
                  <Plus className="mr-2 h-5 w-5" /> Add Vehicle
                </Button>
              </motion.div>
            </div>
          </div>
        </header>

        <SummaryCards summary={summary} />

        <AttentionBanner cars={cars} onSelectCar={handleSelectCarFromAttention} />

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${
                activeTab === tab.value ? "bg-[#5b2a86] text-white" : "text-[#5b2a86] hover:bg-[#efe6f8]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "inventory" ? (
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-[#3b1b6d]">Vehicle Grid</h2>
                <span className="rounded-full bg-[#efe6f8] px-3 py-1 text-sm font-bold text-[#5b2a86]">{cars.length} cars</span>
              </div>
              <VehicleGrid cars={cars} selectedCarId={selectedCarId} onSelectCar={handleSelectCar} />
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <ReportsPanel cars={cars} />
            </CardContent>
          </Card>
        )}
      </div>

      <VehicleModal
        open={Boolean(selectedCarId)}
        form={form}
        formTotals={formTotals}
        onChange={handleChange}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleCloseModal}
        saving={saving}
        originLayoutId={selectedCarId === "new" ? "vehicle-card-new" : `vehicle-card-${selectedCarId}`}
      />
    </div>
  );
}
