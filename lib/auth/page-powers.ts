import { levelAtLeast, type AccessMap } from "@/lib/auth/access";

/**
 * What a page lets someone do, derived on the server from their access map and passed to its
 * components as explicit booleans. The server actions check the same levels; these only decide
 * which controls and figures a page shows.
 *
 * Not a "use server" module.
 */

/** What a booking's Actions offer besides the Bookings MANAGE ones (move, cancel, resend). */
export interface BookingActionPowers {
  /** Mark the session done or a no-show: Bookings MANAGE, or OWN (their own booking), not VIEW. */
  canRecordOutcome: boolean;
  /** Create a booking's missing gallery: Galleries MANAGE. */
  canCreateGallery: boolean;
}

/**
 * A booking's actions. The page or pop-up has already checked Bookings access to the booking (at
 * OWN, only one they are assigned to), so OWN closes out its own booking like MANAGE.
 */
export function bookingActionPowers(access: AccessMap): BookingActionPowers {
  return {
    canRecordOutcome: access.areas.bookings === "OWN" || access.areas.bookings === "MANAGE",
    canCreateGallery: levelAtLeast(access.areas.galleries, "MANAGE"),
  };
}

/**
 * A project's page. The page has already checked Galleries access to this project (at OWN, only
 * a project they lead or are assigned to), so OWN works on its own project like MANAGE.
 */
export function projectPagePowers(access: AccessMap) {
  return {
    /** Budget, invoices and the payment line: Invoices VIEW. */
    money: levelAtLeast(access.areas.invoices, "VIEW"),
    /** Upload and remove files, tell the client, change the stage: Galleries OWN (their own) or MANAGE, not VIEW. */
    canEditGallery: access.areas.galleries === "OWN" || access.areas.galleries === "MANAGE",
    /** Change the project type: Galleries MANAGE. */
    canChangeKind: levelAtLeast(access.areas.galleries, "MANAGE"),
    /** Shoot days, the shot list and gear reservations: Production MANAGE. */
    canManageProduction: levelAtLeast(access.areas.production, "MANAGE"),
    /** Order framed prints for the client: Print orders MANAGE. */
    canOrderPrints: levelAtLeast(access.areas.printOrders, "MANAGE"),
  };
}
