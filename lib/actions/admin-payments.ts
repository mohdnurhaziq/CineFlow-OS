"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/secret-box";

const SaveGatewaySchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  // Blank keeps the stored secret, so the owner can change only the category code.
  secretKey: z.string().trim().max(128).regex(/^[A-Za-z0-9_-]*$/, "Secret key contains invalid characters").optional(),
  categoryCode: z.string().trim().regex(/^[A-Za-z0-9]{3,40}$/, "Category code must be 3-40 letters or digits"),
});

async function assertOwner(tenantId: string) {
  const session = await getCurrentUser();
  return Boolean(
    session && (session.role === "SUPER_ADMIN" || (session.role === "STUDIO_OWNER" && session.tenantId === tenantId))
  );
}

/** Stores the studio's Toyyibpay credentials. The secret is encrypted and never sent back to the browser. */
export async function saveGatewayCredentials(input: z.input<typeof SaveGatewaySchema>) {
  try {
    const data = SaveGatewaySchema.parse(input);
    if (!(await assertOwner(data.tenantId))) {
      return { success: false, error: "FORBIDDEN", message: "Only the studio owner can change payment settings." };
    }
    const tenant = await db.tenant.findUnique({ where: { id: data.tenantId } });
    if (!tenant) return { success: false, error: "TENANT_NOT_FOUND", message: "Studio not found." };

    if (!data.secretKey && !tenant.toyyibpaySecretEnc) {
      return { success: false, error: "SECRET_REQUIRED", message: "Enter your Toyyibpay secret key." };
    }
    await db.tenant.update({
      where: { id: data.tenantId },
      data: {
        toyyibpayCategoryCode: data.categoryCode,
        ...(data.secretKey ? { toyyibpaySecretEnc: encryptSecret(data.secretKey) } : {}),
      },
    });
    try {
      revalidatePath(`/${data.tenantSlug}/admin/settings`);
      revalidatePath(`/${data.tenantSlug}/checkout`);
    } catch {
      // non-request context
    }
    return { success: true };
  } catch (err: any) {
    const message = err?.issues?.[0]?.message ?? "Failed to save payment settings.";
    return { success: false, error: "SAVE_FAILED", message };
  }
}

export async function removeGatewayCredentials(input: { tenantId: string; tenantSlug: string }) {
  try {
    if (!(await assertOwner(input.tenantId))) {
      return { success: false, error: "FORBIDDEN", message: "Only the studio owner can change payment settings." };
    }
    await db.tenant.update({
      where: { id: input.tenantId },
      data: { toyyibpaySecretEnc: null, toyyibpayCategoryCode: null },
    });
    try {
      revalidatePath(`/${input.tenantSlug}/admin/settings`);
      revalidatePath(`/${input.tenantSlug}/checkout`);
    } catch {
      // non-request context
    }
    return { success: true };
  } catch {
    return { success: false, error: "SAVE_FAILED", message: "Failed to remove payment settings." };
  }
}
