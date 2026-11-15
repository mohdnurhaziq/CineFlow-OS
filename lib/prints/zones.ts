export function parseZoneStates(statesJson: string): string[] {
  try {
    const v = JSON.parse(statesJson);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** The shipping zone (name and fee) a state belongs to, or null when no zone covers it. */
export function zoneForState(
  zones: { name: string; fee: number; statesJson: string }[],
  state: string,
): { name: string; fee: number } | null {
  const zone = zones.find((z) => parseZoneStates(z.statesJson).includes(state));
  return zone ? { name: zone.name, fee: zone.fee } : null;
}
