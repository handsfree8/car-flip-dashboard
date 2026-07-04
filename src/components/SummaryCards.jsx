import { Car, DollarSign, CreditCard, CalendarDays, FileText, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/carCalculations";

export default function SummaryCards({ summary }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      <SummaryCard title="Cars" value={summary.cars} icon={<Car />} />
      <SummaryCard title="Invested" value={money(summary.invested)} icon={<DollarSign />} />
      <SummaryCard title="Collected" value={money(summary.collected)} icon={<CreditCard />} />
      <SummaryCard title="Balance Pending" value={money(summary.balance)} icon={<CalendarDays />} />
      <SummaryCard title="Expected Revenue" value={money(summary.expected)} icon={<FileText />} />
      <SummaryCard
        title="Expected Profit"
        value={money(summary.expectedProfit)}
        icon={<Wrench />}
        highlight={summary.expectedProfit >= 0}
      />
      <SummaryCard
        title="Profit Collected"
        value={money(summary.collectedProfit)}
        icon={<DollarSign />}
        highlight={summary.collectedProfit >= 0}
      />
      <SummaryCard title="Financed Cars" value={summary.financedCars} icon={<CreditCard />} />
      <SummaryCard title="Available Cars" value={summary.availableCars} icon={<Car />} />
    </section>
  );
}

function SummaryCard({ title, value, icon, highlight }) {
  return (
    <Card className="rounded-3xl border border-purple-100 bg-white shadow-md">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div className="rounded-2xl bg-[#efe6f8] p-3 text-[#5b2a86] [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
          <p
            className={`break-words text-xl font-black sm:text-2xl ${
              highlight === true ? "text-emerald-600" : highlight === false ? "text-red-600" : "text-[#221433]"
            }`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
