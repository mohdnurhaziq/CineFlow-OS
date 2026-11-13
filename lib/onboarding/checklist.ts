import { db } from "@/lib/db";

/**
 * Setup checklist shown to a new studio owner on the admin dashboard. Every step is
 * worked out from the studio's real data, so nobody has to tick anything by hand.
 *
 * Plain server module (not "use server"): called from server components only.
 */

export type SetupStepId = "brand" | "services" | "availability" | "payments" | "showcase" | "firstBooking";

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
}

export interface SetupChecklist {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  allDone: boolean;
}

const isSet = (value: string | null | undefined) => !!value && value.trim().length > 0;

export async function getSetupChecklist(tenantId: string): Promise<SetupChecklist> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      logoUrl: true,
      qrCodeUrl: true,
      bankDetails: true,
      toyyibpaySecretEnc: true,
      _count: { select: { servicePackages: true, bookingSlots: true, showcaseItems: true, clientBookings: true } },
    },
  });

  const steps: SetupStep[] = [
    { id: "brand", done: isSet(tenant?.logoUrl) },
    { id: "services", done: (tenant?._count.servicePackages ?? 0) > 0 },
    { id: "availability", done: (tenant?._count.bookingSlots ?? 0) > 0 },
    {
      id: "payments",
      done: isSet(tenant?.qrCodeUrl) || isSet(tenant?.bankDetails) || isSet(tenant?.toyyibpaySecretEnc),
    },
    { id: "showcase", done: (tenant?._count.showcaseItems ?? 0) > 0 },
    { id: "firstBooking", done: (tenant?._count.clientBookings ?? 0) > 0 },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, total: steps.length, allDone: doneCount === steps.length };
}
