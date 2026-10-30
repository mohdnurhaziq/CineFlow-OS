"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
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
      // Find or create Client User
      let user = await tx.user.findFirst({
        where: { email: clientEmail, tenantId },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            tenantId,
            name: clientName,
            email: clientEmail,
            phone: clientPhone || null,
            role: "CLIENT",
          },
        });
      }

      // Generate Unique Invoice Number
      let invoiceNumber = "";
      let isUnique = false;
      while (!isUnique) {
        const rand = Math.floor(100000 + Math.random() * 900000);
        invoiceNumber = `INV-${new Date().getFullYear()}-${rand}`;
        const existingInv = await tx.milestoneInvoice.findUnique({
          where: { invoiceNumber },
        });
        if (!existingInv) isUnique = true;
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
          name: clientName,
          email: clientEmail,
          phone: clientPhone || null,
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
          invoiceNumber,
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
