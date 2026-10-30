// CineFlow OS — Time Calculation & Formatting Utilities

export function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM or HH:MM AM/PM.`);
  let hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const paddedMinutes = minutes.toString().padStart(2, "0");
  const paddedHours = hours.toString().padStart(2, "0");
  return `${paddedHours}:${paddedMinutes} ${meridiem}`;
}
