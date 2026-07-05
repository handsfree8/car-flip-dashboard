import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import VehicleForm from "@/components/VehicleForm";

export default function VehicleModal({
  open,
  form,
  formTotals,
  onChange,
  onSave,
  onDelete,
  onClose,
  saving,
  originLayoutId,
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="vehicle-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
        >
          <motion.div
            layoutId={originLayoutId}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-purple-100 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-full bg-[#efe6f8] p-2 text-[#5b2a86] transition hover:bg-purple-100 disabled:opacity-60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <VehicleForm
              form={form}
              formTotals={formTotals}
              onChange={onChange}
              onSave={onSave}
              onDelete={onDelete}
              saving={saving}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
