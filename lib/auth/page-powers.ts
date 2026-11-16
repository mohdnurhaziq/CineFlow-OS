import { levelAtLeast, type AccessMap } from "@/lib/auth/access";

/**
 * What a page lets someone do, derived on the server from their access map and passed to its
 * components as explicit booleans. The server actions check the same levels; these only decide
 * which controls and figures a page shows.
 *
 * Not a "use server" module.
 */

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
