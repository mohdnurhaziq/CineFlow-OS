"use client";

import { useRouter } from "next/navigation";
import type { AssignableMember } from "@/lib/team/members";
import type { BookingDetails } from "@/lib/bookings/details";
import { BookingDetailsBody } from "@/components/admin/bookings/booking-details-dialog";
import { BookingActions } from "@/components/admin/bookings/booking-actions";

/** Full-page view of one booking: the same details and actions as the Bookings pop-up. */
export function BookingDetailView({
  booking,
  tenantId,
  tenantSlug,
  currency,
  canManage,
  canRecordPayments,
  assignable,
}: {
  booking: BookingDetails;
  tenantId: string;
  tenantSlug: string;
  currency: string;
  canManage: boolean;
  canRecordPayments: boolean;
  /** Who can be added in the Team section (empty below Bookings MANAGE). */
  assignable: AssignableMember[];
}) {
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10]">
      <BookingDetailsBody
        booking={booking}
        tenantSlug={tenantSlug}
        currency={currency}
        team={{ tenantId, tenantSlug, canManage, people: assignable, onChanged: () => router.refresh() }}
      />
      <BookingActions
        booking={booking}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        canManage={canManage}
        canRecordPayments={canRecordPayments}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
