import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { settleToyyibpayBill } from "@/lib/payments/settle";

export const dynamic = "force-dynamic";

/**
 * Toyyibpay server-to-server callback. The body is never trusted: we only read
 * the bill code and then ask the gateway directly whether it was paid.
 */
export async function POST(req: Request) {
  let billCode = "";
  try {
    const form = await req.formData();
    billCode = String(form.get("billcode") ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!billCode) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const outcome = await settleToyyibpayBill(billCode);
    if (outcome.status === "PAID") {
      try {
        revalidatePath(`/${outcome.tenantSlug}/admin/verification`);
        revalidatePath(`/${outcome.tenantSlug}/book`);
      } catch {
        // best effort
      }
    }
    return NextResponse.json({ ok: true, status: outcome.status });
  } catch (err: any) {
    console.error("Toyyibpay callback failed:", err?.message || err);
    // 500 makes the gateway retry later.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
