import { useState } from "react";
import { Car, DollarSign, CreditCard, CalendarDays, FileText, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/carCalculations";
import { buildMetricBreakdown } from "@/lib/summaryBreakdown";
import MetricBreakdownModal from "@/components/MetricBreakdownModal";

export default function SummaryCards({ summary, cars = [] }) {
  const [openMetric, setOpenMetric] = useState(null);

  const breakdown = openMetric ? buildMetricBreakdown(openMetric, cars) : null;

  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <SummaryCard title="Cars" value={summary.cars} icon={<Car />} onClick={() => setOpenMetric("cars")} />
        <SummaryCard title="Invested" value={money(summary.invested)} icon={<DollarSign />} onClick={() => setOpenMetric("invested")} />
        <SummaryCard title="Collected" value={money(summary.collected)} icon={<CreditCard />} onClick={() => setOpenMetric("collected")} />
        <SummaryCard title="Balance Pending" value={money(summary.balance)} icon={<CalendarDays />} onClick={() => setOpenMetric("balance")} />
        <SummaryCard title="Expected Revenue" value={money(summary.expected)} icon={<FileText />} onClick={() => setOpenMetric("expected")} />
        <SummaryCard
          title="Expected Profit"
          value={money(summary.expectedProfit)}
          icon={<Wrench />}
          highlight={summary.expectedProfit >= 0}
          onClick={() => setOpenMetric("expectedProfit")}
        />
        <SummaryCard
          title="Profit Collected"
          value={money(summary.collectedProfit)}
          icon={<DollarSign />}
          highlight={summary.collectedProfit >= 0}
          onClick={() => setOpenMetric("collectedProfit")}
        />
        <SummaryCard title="Financed Cars" value={summary.financedCars} icon={<CreditCard />} onClick={() => setOpenMetric("financedCars")} />
        <SummaryCard title="Available Cars" value={summary.availableCars} icon={<Car />} onClick={() => setOpenMetric("availableCars")} />
      </section>

      <MetricBreakdownModal open={Boolean(openMetric)} breakdown={breakdown} onClose={() => setOpenMetric(null)} />
    </>
  );
}

function SummaryCard({ title, value, icon, highlight, onClick }) {
  return (
    <button type="button" onClick={onClick} className="block w-full text-left focus:outline-none">
      <Card className="rounded-3xl border border-purple-100 bg-white shadow-md transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[#7d3fb2]">
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <div className="rounded-2xl bg-[#efe6f8] p-3 text-[#5b2a86] [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
            <p
              className={`break-words text-xl font-black sm:text-2xl ${
                highlight === true ? "text-emerald-600" : highlight === false ? "text-amber-700" : "text-[#221433]"
              }`}
            >
              {value}
            </p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
