"use client";

import { useEffect, useMemo, useState } from "react";
import { X, UserPlus, Users, Search, Loader2, AlertCircle, Check, CalendarCheck } from "lucide-react";
import { createBookingForCustomer } from "@/lib/actions/admin-bookings";
import type { BookingSlotRow } from "./single-slot-dialog";
import { PackagePicker, packagesFor, type BookingPackageOption } from "@/components/booking/package-picker";
import { useDialog } from "@/lib/use-dialog";

export interface ClientOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface BookForCustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  slot: BookingSlotRow | null;
  clients: ClientOption[];
  /** Studio packages; those for the slot's category are offered (optional for staff). */
  packages?: BookingPackageOption[];
  currency?: string;
  onSuccess: () => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors";
const labelClass = "text-xs font-mono text-zinc-400 block mb-1";

export function BookForCustomerDialog({
  isOpen,
  onClose,
  tenantId,
  tenantSlug,
  slot,
  clients,
  packages = [],
  currency = "MYR",
  onSuccess,
}: BookForCustomerDialogProps) {
  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [discipline, setDiscipline] = useState("PHOTOGRAPHY");
  const [serviceTier, setServiceTier] = useState("STANDARD");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "PAID">("PENDING");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QR_CODE" | "CARD">("CASH");
  const [packageId, setPackageId] = useState<string | null>(null);
  const offeredPackages = useMemo(() => (slot ? packagesFor(packages, slot.category) : []), [packages, slot]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(clients.length > 0 ? "EXISTING" : "NEW");
      setSearch("");
      setSelectedClientId("");
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setDiscipline("PHOTOGRAPHY");
      setServiceTier("STANDARD");
      setCreativeBrief("");
      setPaymentStatus("PENDING");
      setPaymentMethod("CASH");
      setPackageId(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, slot?.id, clients.length]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  const dialog = useDialog(isOpen && !!slot, onClose);
  if (!isOpen || !slot) return null;

  const dateStr = new Date(slot.date).toISOString().split("T")[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === "EXISTING" && !selectedClientId) {
      setErrorMessage("Select a customer first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createBookingForCustomer({
        tenantId,
        tenantSlug,
        slotId: slot.id,
        ...(mode === "EXISTING"
          ? { clientId: selectedClientId }
          : { newClient: { name: newName, email: newEmail, phone: newPhone } }),
        discipline,
        serviceTier,
        creativeBrief: creativeBrief || undefined,
        paymentStatus,
        paymentMethod,
        packageId: packageId ?? undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Failed to create booking.");
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(`Booked for ${res.customerName} (${res.trackingCode}).`);
      onSuccess();
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0">
      <div {...dialog} aria-labelledby="book-for-customer-dialog-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-[#0d0d10] z-10">
          <div className="flex items-center gap-2">
            <CalendarCheck className="size-5 text-amber-400" />
            <h2 id="book-for-customer-dialog-title" className="text-base font-bold text-white tracking-tight">Book for Customer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-300 flex items-center justify-between">
            <span>{dateStr}</span>
            <span className="text-amber-400">
              {slot.startTime} – {slot.endTime}
            </span>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              <Check className="size-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Customer */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("EXISTING")}
                className={`inline-flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  mode === "EXISTING"
                    ? "bg-amber-500/10 border-amber-500 text-amber-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <Users className="size-3.5" />
                Existing Customer
              </button>
              <button
                type="button"
                onClick={() => setMode("NEW")}
                className={`inline-flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  mode === "NEW"
                    ? "bg-amber-500/10 border-amber-500 text-amber-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <UserPlus className="size-3.5" />
                New Customer
              </button>
            </div>

            {mode === "EXISTING" ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email or phone..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800/70">
                  {filteredClients.length === 0 ? (
                    <div className="p-3 text-xs text-zinc-500 text-center">
                      {clients.length === 0
                        ? "No customer accounts yet. Create a new customer."
                        : "No customers match your search."}
                    </div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setSelectedClientId(c.id)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                          selectedClientId === c.id ? "bg-amber-500/10" : "hover:bg-zinc-900"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{c.name}</div>
                          <div className="text-[11px] font-mono text-zinc-400 truncate">
                            {c.email}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </div>
                        </div>
                        {selectedClientId === c.id && <Check className="size-4 text-amber-400 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Maya Lin"
                    required
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="maya@example.com"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+60 12-345 6789"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">
                  If this email already has an account at your studio, the booking is linked to it. Otherwise a
                  new account is created that the customer can claim by signing up with the same email.
                </p>
              </div>
            )}
          </div>

          <PackagePicker
            packages={offeredPackages}
            value={packageId}
            onChange={setPackageId}
            currency={currency}
            allowNone
            label="Package"
          />

          {/* Booking details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Discipline</label>
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className={inputClass}>
                <option value="PHOTOGRAPHY">Photography</option>
                <option value="VIDEOGRAPHY">Videography</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Service Tier</label>
              <select value={serviceTier} onChange={(e) => setServiceTier(e.target.value)} className={inputClass}>
                <option value="STANDARD">Standard</option>
                <option value="PREMIUM">Premium</option>
                <option value="CINEMATIC">Cinematic</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Creative Brief (optional)</label>
            <textarea
              rows={2}
              value={creativeBrief}
              onChange={(e) => setCreativeBrief(e.target.value)}
              placeholder="Notes about the shoot..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "PENDING" | "PAID")}
                className={inputClass}
              >
                <option value="PENDING">Pending (needs verification)</option>
                <option value="PAID">Paid (confirm booking)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "QR_CODE" | "CARD")}
                className={inputClass}
              >
                <option value="CASH">Cash</option>
                <option value="QR_CODE">QR / Bank Transfer</option>
                <option value="CARD">Card</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!successMessage}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-black font-bold text-xs tracking-tight transition-all"
            >
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" />}
              {isSubmitting ? "Booking..." : "Create Booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
