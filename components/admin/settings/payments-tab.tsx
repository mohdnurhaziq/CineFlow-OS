"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveGatewayCredentials, removeGatewayCredentials } from "@/lib/actions/admin-payments";
import { PasswordVisibilityToggle } from "@/components/auth/password-visibility-toggle";
import {
  ImageUploadField,
  SaveBar,
  SettingsForm,
  SettingsSection,
  helpCls,
  inputCls,
  isValidImageUrl,
  labelCls,
  useSettingsSave,
  useUnsavedGuard,
  type StudioTenantData,
} from "./settings-ui";

type Currency = "USD" | "MYR" | "SGD" | "EUR" | "GBP";
const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "MYR", label: "Malaysian ringgit (RM)" },
  { code: "SGD", label: "Singapore dollar (S$)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British pound (£)" },
];

/** Getting paid tab: currency, bank transfer and QR code (one Save), then online payments (their own). */
export function PaymentsTab({ tenant }: { tenant: StudioTenantData }) {
  const initial = {
    currency: ((tenant.currency as Currency) || "USD") as Currency,
    bankDetails: tenant.bankDetails ?? "",
    qrCodeUrl: tenant.qrCodeUrl ?? "",
  };
  const [v, setV] = useState(initial);
  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => v[k] !== initial[k]);
  useUnsavedGuard(dirty);
  const { save, saving } = useSettingsSave(tenant);

  return (
    <div className="space-y-8">
      <SettingsForm
        onSubmit={() => save({ currency: v.currency, bankDetails: v.bankDetails, qrCodeUrl: v.qrCodeUrl })}
        footer={<SaveBar dirty={dirty} saving={saving} onDiscard={() => setV(initial)} />}
      >
        <SettingsSection title="Currency" description="Your prices, invoices and payments use this currency.">
          <div>
            <label htmlFor="pay-currency" className={labelCls}>
              Currency
            </label>
            <select id="pay-currency" value={v.currency} onChange={(e) => set("currency", e.target.value as Currency)} className={`${inputCls} sm:max-w-xs`}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </SettingsSection>

        <SettingsSection title="Bank transfer" description="Shown at checkout when a client pays by bank transfer, with a button to copy it.">
          <div>
            <label htmlFor="pay-bank" className={labelCls}>
              Bank details
            </label>
            <textarea
              id="pay-bank"
              rows={3}
              value={v.bankDetails}
              onChange={(e) => set("bankDetails", e.target.value)}
              placeholder={"Maybank\nHaz Creatives Studio\n5140 1234 5678"}
              aria-describedby="pay-bank-help"
              className={`${inputCls} resize-y`}
            />
            <p id="pay-bank-help" className={helpCls}>
              Bank name, account name and account number.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection title="Payment QR code" description="Clients scan it at checkout to pay from their banking app (DuitNow, PayNow, PromptPay…).">
          <ImageUploadField id="pay-qr" label="QR code image" folder="qrcodes" value={v.qrCodeUrl} onChange={(url) => set("qrCodeUrl", url)} />
          {v.qrCodeUrl && isValidImageUrl(v.qrCodeUrl) && (
            <div>
              <p className="text-sm text-zinc-400 mb-2">How clients see it</p>
              <div className="size-40 rounded-lg bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- any URL the owner uploads or pastes */}
                <img src={v.qrCodeUrl} alt="Your payment QR code" className="size-full object-contain" />
              </div>
            </div>
          )}
        </SettingsSection>
      </SettingsForm>

      <OnlinePayments
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        configured={Boolean(tenant.gatewayConfigured)}
        initialCategoryCode={tenant.gatewayCategoryCode ?? ""}
        currency={tenant.currency}
      />
    </div>
  );
}

/**
 * Card and FPX payments through the studio's own Toyyibpay account. Saved on its own: the secret
 * key never travels with the other settings.
 */
function OnlinePayments({
  tenantId,
  tenantSlug,
  configured,
  initialCategoryCode,
  currency,
}: {
  tenantId: string;
  tenantSlug: string;
  configured: boolean;
  initialCategoryCode: string;
  currency: string;
}) {
  const supported = currency === "MYR";
  const router = useRouter();
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [categoryCode, setCategoryCode] = useState(initialCategoryCode);
  const [busy, setBusy] = useState(false);
  const dirty = secretKey !== "" || categoryCode !== initialCategoryCode;
  useUnsavedGuard(dirty);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await saveGatewayCredentials({ tenantId, tenantSlug, secretKey: secretKey || undefined, categoryCode });
      if (res.success) {
        toast.success(configured ? "Online payments updated." : "Online payments connected.");
        setSecretKey("");
        router.refresh();
      } else {
        toast.error(res.message || "Could not save the online payment details.");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await removeGatewayCredentials({ tenantId, tenantSlug });
      if (res.success) {
        toast.success("Online payments turned off.");
        setCategoryCode("");
        setSecretKey("");
        router.refresh();
      } else {
        toast.error(res.message || "Could not turn off online payments.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0e]" aria-labelledby="online-payments-title">
      <div className="px-4 sm:px-6 grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10 py-8">
        <div>
          <h2 id="online-payments-title" className="text-base font-semibold text-white">
            Online payments
          </h2>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
            Card and FPX payments through your own Toyyibpay account. Without it, clients pay by bank transfer, QR or cash.
          </p>
          <p className={`text-sm mt-3 ${configured ? "text-emerald-400" : "text-zinc-500"}`}>{configured ? "Connected" : "Not connected"}</p>
        </div>
        <div className="space-y-5 min-w-0">
          {!supported ? (
            <p className="text-sm text-amber-200 bg-amber-500/10 rounded-lg px-4 py-3 leading-relaxed">
              Toyyibpay only charges in Malaysian ringgit, and your studio uses {currency}. Change the currency above to
              Malaysian ringgit and save, then connect Toyyibpay here.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="pay-secret" className={labelCls}>
                  User secret key
                </label>
                <span className="relative block">
                  <input
                    id="pay-secret"
                    type={showSecretKey ? "text" : "password"}
                    autoComplete="off"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder={configured ? "Saved. Leave blank to keep it." : "xxxxxxxx-xxxx-xxxx-xxxx"}
                    className={`${inputCls} pr-10`}
                  />
                  <PasswordVisibilityToggle visible={showSecretKey} onToggle={() => setShowSecretKey((s) => !s)} what="secret key" />
                </span>
              </div>
              <div>
                <label htmlFor="pay-category" className={labelCls}>
                  Category code
                </label>
                <input
                  id="pay-category"
                  autoComplete="off"
                  value={categoryCode}
                  onChange={(e) => setCategoryCode(e.target.value)}
                  placeholder="e.g. a1b2c3d4"
                  aria-describedby="pay-category-help"
                  className={`${inputCls} sm:max-w-xs`}
                />
                <p id="pay-category-help" className={helpCls}>
                  Both are in your Toyyibpay dashboard. Payments go straight to your account.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {(supported || configured) && (
        <div className="px-4 sm:px-5 py-3 border-t border-zinc-800 flex items-center gap-3">
          {configured && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50 mr-auto"
            >
              Turn off online payments
            </button>
          )}
          {supported && (
            <button
              type="button"
              onClick={connect}
              disabled={busy || !categoryCode.trim() || (!configured && !secretKey) || (configured && !dirty)}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-400 transition-colors"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {configured ? "Save changes" : "Connect Toyyibpay"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
