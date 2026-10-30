"use client";

import { useState } from "react";
import { CreditCard, QrCode, Banknote, User, Mail, Phone, FileText } from "lucide-react";
import { toast } from "sonner";
import { OrderSummaryCard } from "./order-summary-card";
import { CardPaymentForm } from "./card-payment-form";
import { QrPaymentForm } from "./qr-payment-form";
import { CashPaymentForm } from "./cash-payment-form";
import { PaymentSuccessCard } from "./payment-success-card";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";

interface CheckoutShellProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    brandColor?: string | null;
    currency: string;
    qrCodeUrl?: string | null;
    bankDetails?: string | null;
  };
  slot?: {
    id: string;
    startTime: string;
    endTime: string;
    date: Date | string;
    price: number;
    depositRequired: number;
    category: string;
    campaignTitle?: string | null;
    heldUntil?: Date | string | null;
  } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    milestoneType: string;
    amount: number;
    dueDate: Date | string;
    projectId?: string | null;
    client?: {
      name: string;
      email: string;
      phone?: string | null;
    } | null;
    project?: {
      title: string;
      projectNumber: string;
    } | null;
  } | null;
  initialData?: {
    name?: string;
    email?: string;
    phone?: string;
    brief?: string;
    sessionId?: string;
  };
}

export function CheckoutShell({
  tenant,
  slot,
  invoice,
  initialData,
}: CheckoutShellProps) {
  const [activeTab, setActiveTab] = useState<"CARD" | "QR_CODE" | "CASH">("CARD");

  const [clientInfo, setClientInfo] = useState({
    name: initialData?.name || invoice?.client?.name || "",
    email: initialData?.email || invoice?.client?.email || "",
    phone: initialData?.phone || invoice?.client?.phone || "",
    brief: initialData?.brief || "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{
    trackingCode?: string;
    invoiceNumber: string;
    status: string;
    paymentMethod: string;
    amount: number;
    unlockedDownloads?: boolean;
    projectId?: string;
  } | null>(null);

  const amountToPay = slot ? slot.depositRequired : invoice ? invoice.amount : 0;
  const isDirectInvoice = Boolean(invoice && !slot);

  const validateClientInfo = () => {
    if (!clientInfo.name.trim() || clientInfo.name.trim().length < 2) {
      toast.error("Please enter your full name (minimum 2 characters).");
      return false;
    }
    if (!clientInfo.email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return false;
    }
    if (!clientInfo.phone.trim() || clientInfo.phone.trim().length < 6) {
      toast.error("Please enter a valid mobile phone number.");
      return false;
    }
    return true;
  };

  const handleCardSubmit = async (cardData: {
    cardNumber: string;
    cardExp: string;
    cardCvc: string;
    cardholderName: string;
  }) => {
    if (!isDirectInvoice && !validateClientInfo()) return;

    setIsSubmitting(true);
    try {
      if (slot) {
        const res = await processBookingCheckout({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          slotId: slot.id,
          sessionId: initialData?.sessionId || "sess_direct_checkout",
          clientName: clientInfo.name.trim(),
          clientEmail: clientInfo.email.trim(),
          clientPhone: clientInfo.phone.trim(),
          creativeBrief: clientInfo.brief.trim() || undefined,
          paymentMethod: "CARD",
          cardDetails: cardData,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            trackingCode: res.trackingCode,
            invoiceNumber: res.invoiceNumber,
            status: res.status || "CONFIRMED",
            paymentMethod: "CARD",
            amount: amountToPay,
          });
          toast.success("Card payment authorized! Slot officially confirmed.");
        } else {
          toast.error(res.message || "Failed to process card checkout.");
        }
      } else if (invoice) {
        const res = await processInvoicePayment({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          invoiceId: invoice.id,
          paymentMethod: "CARD",
          cardDetails: cardData,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            invoiceNumber: res.invoiceNumber,
            status: "PAID",
            paymentMethod: "CARD",
            amount: amountToPay,
            unlockedDownloads: res.unlockedDownloads,
            projectId: invoice.projectId || undefined,
          });
          toast.success(
            res.unlockedDownloads
              ? "Payment verified! Master 4K deliverables unlocked in vault."
              : "Invoice settled successfully!"
          );
        } else {
          toast.error(res.message || "Failed to settle invoice.");
        }
      }
    } catch (err: any) {
      console.error("Card payment error:", err);
      toast.error(err.message || "An unexpected error occurred during card authorization.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQrSubmit = async (data: {
    paymentProofUrl: string;
    paymentReference: string;
  }) => {
    if (!isDirectInvoice && !validateClientInfo()) return;

    setIsSubmitting(true);
    try {
      if (slot) {
        const res = await processBookingCheckout({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          slotId: slot.id,
          sessionId: initialData?.sessionId || "sess_direct_checkout",
          clientName: clientInfo.name.trim(),
          clientEmail: clientInfo.email.trim(),
          clientPhone: clientInfo.phone.trim(),
          creativeBrief: clientInfo.brief.trim() || undefined,
          paymentMethod: "QR_CODE",
          paymentProofUrl: data.paymentProofUrl,
          paymentReference: data.paymentReference,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            trackingCode: res.trackingCode,
            invoiceNumber: res.invoiceNumber,
            status: "PENDING_VERIFICATION",
            paymentMethod: "QR_CODE",
            amount: amountToPay,
          });
          toast.success("Receipt slip submitted for studio verification.");
        } else {
          toast.error(res.message || "Failed to submit checkout.");
        }
      } else if (invoice) {
        const res = await processInvoicePayment({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          invoiceId: invoice.id,
          paymentMethod: "QR_CODE",
          paymentProofUrl: data.paymentProofUrl,
          paymentReference: data.paymentReference,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            invoiceNumber: res.invoiceNumber,
            status: "PENDING_VERIFICATION",
            paymentMethod: "QR_CODE",
            amount: amountToPay,
            projectId: invoice.projectId || undefined,
          });
          toast.success("Receipt submitted! Awaiting studio verification.");
        } else {
          toast.error(res.message || "Failed to submit payment slip.");
        }
      }
    } catch (err: any) {
      console.error("QR checkout error:", err);
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCashSubmit = async (data: { cashNotes: string }) => {
    if (!isDirectInvoice && !validateClientInfo()) return;

    setIsSubmitting(true);
    try {
      if (slot) {
        const res = await processBookingCheckout({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          slotId: slot.id,
          sessionId: initialData?.sessionId || "sess_direct_checkout",
          clientName: clientInfo.name.trim(),
          clientEmail: clientInfo.email.trim(),
          clientPhone: clientInfo.phone.trim(),
          creativeBrief: clientInfo.brief.trim() || undefined,
          paymentMethod: "CASH",
          paymentReference: data.cashNotes,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            trackingCode: res.trackingCode,
            invoiceNumber: res.invoiceNumber,
            status: "PENDING_VERIFICATION",
            paymentMethod: "CASH",
            amount: amountToPay,
          });
          toast.success("Cash booking invoice created! Settle at front desk.");
        } else {
          toast.error(res.message || "Failed to generate cash booking.");
        }
      } else if (invoice) {
        const res = await processInvoicePayment({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          invoiceId: invoice.id,
          paymentMethod: "CASH",
          paymentReference: data.cashNotes,
        });

        if (res.success && res.invoiceNumber) {
          setCheckoutResult({
            invoiceNumber: res.invoiceNumber,
            status: "PENDING_VERIFICATION",
            paymentMethod: "CASH",
            amount: amountToPay,
            projectId: invoice.projectId || undefined,
          });
          toast.success("Cash counter request registered.");
        } else {
          toast.error(res.message || "Failed to process cash request.");
        }
      }
    } catch (err: any) {
      console.error("Cash checkout error:", err);
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If transaction completed, render the success card
  if (checkoutResult) {
    return (
      <div className="py-12 px-4 sm:px-6">
        <PaymentSuccessCard
          tenantSlug={tenant.slug}
          trackingCode={checkoutResult.trackingCode}
          invoiceNumber={checkoutResult.invoiceNumber}
          status={checkoutResult.status}
          paymentMethod={checkoutResult.paymentMethod}
          amount={checkoutResult.amount}
          currency={tenant.currency}
          unlockedDownloads={checkoutResult.unlockedDownloads}
          projectId={checkoutResult.projectId}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Title */}
      <div className="mb-8 space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
          SECURE ESCROW CHECKOUT // {tenant.name.toUpperCase()}
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {slot ? "Complete Studio Session Reservation" : "Settle Milestone Invoice"}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Order Summary (5 cols) */}
        <div className="lg:col-span-5 order-2 lg:order-1">
          <OrderSummaryCard
            tenantName={tenant.name}
            currency={tenant.currency}
            slot={slot}
            invoice={invoice}
          />
        </div>

        {/* Right Column: Intake & Payment Forms (7 cols) */}
        <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">
          {/* Client Information Section (Shown for slot bookings or unpopulated invoice) */}
          {!isDirectInvoice && (
            <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Step 1: Production Client Intake
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  Required for Call Sheet &amp; Vault Delivery
                </span>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-2.5 size-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="e.g. Maya Farhan"
                      value={clientInfo.name}
                      onChange={(e) => setClientInfo((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-2.5 size-4 text-zinc-500" />
                      <input
                        type="email"
                        placeholder="maya@example.com"
                        value={clientInfo.email}
                        onChange={(e) => setClientInfo((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Mobile Phone *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-2.5 size-4 text-zinc-500" />
                      <input
                        type="tel"
                        placeholder="+60 12-345 6789"
                        value={clientInfo.phone}
                        onChange={(e) => setClientInfo((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Shoot Concept / Creative Brief (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of wardrobe, mood, or deliverables requested..."
                    value={clientInfo.brief}
                    onChange={(e) => setClientInfo((prev) => ({ ...prev, brief: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 resize-none font-sans"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Payment Method Selector & Interactive Forms */}
          <div className="p-6 rounded-2xl border border-zinc-800 bg-[#121215] space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                {isDirectInvoice ? "Select Settlement Channel" : "Step 2: Choose Payment Method"}
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                100% Secure &amp; Self-Contained
              </span>
            </div>

            {/* Payment Method Tabs */}
            <div className="grid grid-cols-3 gap-2.5 p-1 rounded-xl bg-[#18181b] border border-zinc-800">
              <button
                type="button"
                onClick={() => setActiveTab("CARD")}
                className={`py-2.5 px-3 rounded-lg text-xs font-medium font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === "CARD"
                    ? "bg-amber-500 text-black font-bold shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`}
              >
                <CreditCard className="size-4" />
                <span className="hidden sm:inline">Online Card</span>
                <span className="sm:hidden">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("QR_CODE")}
                className={`py-2.5 px-3 rounded-lg text-xs font-medium font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === "QR_CODE"
                    ? "bg-amber-500 text-black font-bold shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`}
              >
                <QrCode className="size-4" />
                <span className="hidden sm:inline">Studio QR</span>
                <span className="sm:hidden">QR Slip</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("CASH")}
                className={`py-2.5 px-3 rounded-lg text-xs font-medium font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === "CASH"
                    ? "bg-amber-500 text-black font-bold shadow-md"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`}
              >
                <Banknote className="size-4" />
                <span className="hidden sm:inline">Cash Counter</span>
                <span className="sm:hidden">Cash</span>
              </button>
            </div>

            {/* Dynamic Form Render */}
            <div>
              {activeTab === "CARD" && (
                <CardPaymentForm
                  amount={amountToPay}
                  currency={tenant.currency}
                  isSubmitting={isSubmitting}
                  onSubmit={handleCardSubmit}
                />
              )}

              {activeTab === "QR_CODE" && (
                <QrPaymentForm
                  amount={amountToPay}
                  currency={tenant.currency}
                  qrCodeUrl={tenant.qrCodeUrl}
                  bankDetails={tenant.bankDetails}
                  isSubmitting={isSubmitting}
                  onSubmit={handleQrSubmit}
                />
              )}

              {activeTab === "CASH" && (
                <CashPaymentForm
                  amount={amountToPay}
                  currency={tenant.currency}
                  isSubmitting={isSubmitting}
                  onSubmit={handleCashSubmit}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
