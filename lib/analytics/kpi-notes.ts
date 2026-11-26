/** The small lines under the dashboard's numbers. A studio with nothing yet is told so, not "100%". */

export function revenueNote(totalRevenue: number): string {
  return totalRevenue > 0 ? "100% verified" : "No payments yet";
}

/** The gear panel when nothing needs attention. */
export function gearPanelAllClear(total: number): { title: string; detail: string } {
  return total === 0
    ? { title: "No gear added yet", detail: "Add your equipment to track it here" }
    : { title: "All Equipment Operational", detail: "Zero items quarantined or under repair" };
}

export function gearNotes(gear: { total: number; maintenance: number; utilization: number }): {
  use: string;
  condition: string | null;
  repair: boolean;
} {
  if (gear.total === 0) return { use: "No gear added yet", condition: null, repair: false };
  const repair = gear.maintenance > 0;
  return {
    use: `${gear.utilization}% in use`,
    condition: repair ? `${gear.maintenance} in repair` : "fleet 100% operational",
    repair,
  };
}
