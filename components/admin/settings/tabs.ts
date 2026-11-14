/** The settings tabs, shared by the server page (reads ?tab=) and the client shell. */
export const SETTINGS_TABS = [
  { id: "studio", label: "Studio" },
  { id: "payments", label: "Getting paid" },
  { id: "delivery", label: "Photo delivery" },
  { id: "plan", label: "Plan" },
] as const;
export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];
