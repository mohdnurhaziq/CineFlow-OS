"use server";

import { db } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/bookings/billing";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { canAccessClientRecord } from "@/lib/auth/project-access";
import {
  CreatePrintOrderSchema,
  type CreatePrintOrderInput,
} from "@/lib/validations/visualizer";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

/**
 * Creates a print and custom frame order.
 * Atomically writes a MilestoneInvoice record with milestoneType = "PRINT_FRAME_ORDER",
 * saves itemized print specifications in paymentReference JSON,
 * and returns the instant checkout URL.
 */
export async function createPrintOrder(input: CreatePrintOrderInput) {
  try {
    const validated = CreatePrintOrderSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      projectId,
      printSizeId,
      frameDesignId,
      matBoardType,
      orientation,
      photoUrl,
      photoTitle,
      clientName,
      clientEmail,
      clientPhone,
      notes,
    } = validated;

    // Ordering needs a sign-in: a client orders for themselves; studio staff can order for a client.
    const session = await getCurrentUser();
    if (!session) {
      return { success: false, error: "UNAUTHENTICATED", message: "UNAUTHENTICATED: Please sign in to order prints." };
    }
    const isStaff = STAFF_ROLES.has(session.role) && (session.role === "SUPER_ADMIN" || session.tenantId === tenantId);
    const isClient = session.role === "CLIENT" && session.tenantId === tenantId;
    if (!isStaff && !isClient) {
      return { success: false, error: "FORBIDDEN", message: "FORBIDDEN: Sign in with an account at this studio to order prints." };
    }

    // A project's photos are private: the order may only reference a project the caller can see.
    if (projectId) {
      const project = await db.project.findFirst({ where: { id: projectId, tenantId }, select: { clientId: true } });
      if (!project || !canAccessClientRecord(session, tenantId, project.clientId)) {
        return { success: false, error: "FORBIDDEN", message: "FORBIDDEN: That project isn't available to this account." };
      }
    }

    // 1. Fetch Tenant, PrintSize and FrameDesign
    const [tenant, printSize, frameDesign] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId } }),
      db.printSize.findFirst({ where: { id: printSizeId, tenantId } }),
      db.frameDesign.findFirst({ where: { id: frameDesignId, tenantId } }),
    ]);

    if (!tenant) {
      return {
        success: false,
        error: "TENANT_NOT_FOUND",
        message: "Studio tenant was not found.",
      };
    }
    if (!printSize) {
      return {
        success: false,
        error: "PRINT_SIZE_NOT_FOUND",
        message: "Selected print size was not found in studio catalog.",
      };
    }
    if (!frameDesign) {
      return {
        success: false,
        error: "FRAME_DESIGN_NOT_FOUND",
        message: "Selected frame design was not found in studio catalog.",
      };
    }

    // 2. Compute Itemized Pricing
    const printPrice = printSize.basePrice;
    const framePrice = frameDesign.priceOffset;
    const matPrice = matBoardType === "NONE" ? 0 : 25.0;
    const totalAmount = printPrice + framePrice + matPrice;

    // 3. Atomic Database Transaction
    const invoice = await db.$transaction(async (tx) => {
      // A signed-in client is billed themselves (the typed name/email are ignored). Staff order for
      // the client with that email, creating a passwordless account if needed, never a team member.
      let user;
      if (isClient) {
        user = await tx.user.findFirst({ where: { id: session.id, tenantId, role: "CLIENT" } });
        if (!user) throw new Error("Your client account was not found.");
      } else {
        const email = clientEmail.trim().toLowerCase();
        user = await tx.user.findFirst({ where: { email, tenantId } });
        if (user && user.role !== "CLIENT") throw new Error("That email belongs to a studio team member.");
        if (!user) {
          user = await tx.user.create({
            data: { tenantId, name: clientName, email, phone: clientPhone || null, role: "CLIENT", isQuickCreated: true },
          });
        }
      }

      // Assemble structured itemized specification payload
      const orderMetadata = {
        orderType: "PRINT_FRAME_ORDER",
        printSize: {
          id: printSize.id,
          code: printSize.code,
          name: printSize.name,
          widthInches: printSize.widthInches,
          heightInches: printSize.heightInches,
          price: printPrice,
        },
        frameDesign: {
          id: frameDesign.id,
          name: frameDesign.name,
          material: frameDesign.material,
          moldingWidth: frameDesign.moldingWidth,
          frameColor: frameDesign.frameColor,
          priceOffset: framePrice,
        },
        matBoard: {
          type: matBoardType,
          price: matPrice,
        },
        orientation,
        photoUrl,
        photoTitle: photoTitle || "Archival Wall Art Print",
        client: {
          name: user.name,
          email: user.email,
          phone: user.phone ?? (clientPhone || null),
        },
        notes: notes || null,
        financialBreakdown: {
          printPrice,
          framePrice,
          matPrice,
          totalAmount,
          currency: tenant.currency,
        },
      };

      // Create MilestoneInvoice
      return tx.milestoneInvoice.create({
        data: {
          tenantId,
          invoiceNumber: await nextInvoiceNumber(tx, tenantId),
          clientId: user.id,
          projectId: projectId || null,
          milestoneType: "PRINT_FRAME_ORDER",
          amount: totalAmount,
          status: "PENDING",
          dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000), // Net 7 days
          paymentReference: JSON.stringify(orderMetadata),
        },
      });
    });

    safeRevalidate(`/${tenantSlug}/visualizer`);
    safeRevalidate(`/${tenantSlug}/admin/verification`);

    return {
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount,
      checkoutUrl: `/${tenantSlug}/checkout?invoiceId=${invoice.id}`,
    };
  } catch (err: any) {
    console.error("createPrintOrder error:", err);
    return {
      success: false,
      error: "ORDER_CREATION_FAILED",
      message: err.message || "Failed to process print and frame order.",
    };
  }
}
