import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

function amountClass(highlight) {
  if (highlight === true) return "text-emerald-600";
  if (highlight === false) return "text-amber-700";
  return "text-[#221433]";
}

export default function MetricBreakdownModal({ open, breakdown, onClose }) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && breakdown && (
        <motion.div
          key="metric-breakdown-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-purple-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-purple-100 p-5">
              <h3 className="text-lg font-black text-[#3b1b6d]">{breakdown.title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-[#efe6f8] p-2 text-[#5b2a86] transition hover:bg-purple-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {breakdown.rows.length === 0 ? (
                <p className="rounded-2xl bg-[#f7f4fb] p-4 text-sm font-semibold text-[#5b2a86]">
                  No vehicles contribute to this yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {breakdown.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#faf7fe] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#221433]">{row.label}</p>
                        {row.meta && <p className="text-xs font-semibold text-[#7d3fb2]">{row.meta}</p>}
                      </div>
                      <span className={`flex-none text-sm font-black ${amountClass(row.highlight)}`}>{row.amount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-purple-100 bg-[#efe6f8] px-5 py-4">
              <span className="text-sm font-black uppercase tracking-wide text-[#5b2a86]">{breakdown.footerLabel}</span>
              <span className="text-lg font-black text-[#3b1b6d]">{breakdown.footerValue}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
