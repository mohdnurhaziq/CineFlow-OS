/** Client account states for the admin Clients section. Safe to import from client and server code. */

export type ClientAccountStatus = "REGISTERED" | "INVITED" | "GUEST";

export const CLIENT_ACCOUNT_STATUS_LABELS: Record<ClientAccountStatus, string> = {
  REGISTERED: "Registered",
  INVITED: "Invited",
  GUEST: "Guest",
};
