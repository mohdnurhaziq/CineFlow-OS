/**
 * WhatsApp Call Sheet URL & Message Formatter
 * Generates formatted markdown dispatch messages and https://wa.me/?text=... links
 */

export interface CallSheetWithDetails {
  id: string;
  title: string;
  shootDate: Date | string;
  generalCallTime: string;
  locationName: string;
  locationAddress: string;
  locationPinUrl?: string | null;
  parkingNotes?: string | null;
  hospitalName?: string | null;
  hospitalAddress?: string | null;
  weatherSummary?: string | null;
  temperature?: string | null;
  sunriseTime?: string | null;
  sunsetTime?: string | null;
  goldenHourMorning?: string | null;
  goldenHourEvening?: string | null;
  notes?: string | null;
  crewJson?: string | null;
  project?: {
    title: string;
    projectNumber: string;
    tenant?: {
      name: string;
      slug: string;
    };
  } | null;
}

export interface CrewMember {
  name: string;
  role: string;
  callTime?: string;
  phone?: string;
  email?: string;
}

/**
 * Parses crewJson string safely into structured CrewMember array.
 */
export function parseCrewJson(crewJson?: string | null): CrewMember[] {
  if (!crewJson) return [];
  try {
    const parsed = JSON.parse(crewJson);
    if (Array.isArray(parsed)) {
      return parsed.map((m) => ({
        name: m.name || "Crew Member",
        role: m.role || "Crew",
        callTime: m.callTime || "TBD",
        phone: m.phone || "",
        email: m.email || "",
      }));
    }
  } catch (err) {
    console.error("Failed to parse crewJson:", err);
  }
  return [];
}

/**
 * Formats a Date into a human-readable date string (e.g., "Sunday, November 15, 2026").
 */
function formatShootDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generates formatted WhatsApp dispatch message and wa.me URL.
 */
export function generateWhatsAppCallSheetUrl(
  callSheet: CallSheetWithDetails,
  targetPhone?: string,
  baseUrl: string = ""
): {
  url: string;
  previewText: string;
} {
  const formattedDate = formatShootDate(callSheet.shootDate);
  const projectTitle = callSheet.project?.title || "Production Project";
  const projectNumber = callSheet.project?.projectNumber || "PRJ-001";
  const studioName = callSheet.project?.tenant?.name || "CineFlow Studio";
  const tenantSlug = callSheet.project?.tenant?.slug || "studio";

  const lines: string[] = [];

  lines.push(`🎬 *OFFICIAL CALL SHEET: ${callSheet.title.toUpperCase()}*`);
  lines.push(`📁 *Project:* ${projectTitle} (${projectNumber})`);
  lines.push(`🏢 *Studio:* ${studioName}`);
  lines.push("");
  lines.push(`📅 *Date:* ${formattedDate}`);
  lines.push(`⏰ *General Call Time:* ${callSheet.generalCallTime}`);
  lines.push("");
  lines.push(`📍 *Location:* ${callSheet.locationName}`);
  lines.push(`${callSheet.locationAddress}`);
  if (callSheet.locationPinUrl) {
    lines.push(`🗺️ *Map Pin:* ${callSheet.locationPinUrl}`);
  }
  if (callSheet.parkingNotes) {
    lines.push(`🅿️ *Parking:* ${callSheet.parkingNotes}`);
  }
  lines.push("");

  // Solar & Golden Hour
  const sunrise = callSheet.sunriseTime || "N/A";
  const sunset = callSheet.sunsetTime || "N/A";
  const ghMorn = callSheet.goldenHourMorning || "N/A";
  const ghEve = callSheet.goldenHourEvening || "N/A";

  lines.push("☀️ *Solar & Golden Hour Schedule:*");
  lines.push(`• Sunrise: ${sunrise} | Sunset: ${sunset}`);
  lines.push(`• Morning Golden Hour: ${ghMorn}`);
  lines.push(`• Evening Golden Hour: ${ghEve}`);

  if (callSheet.weatherSummary || callSheet.temperature) {
    lines.push(
      `⛅ *Weather:* ${callSheet.weatherSummary || "Clear"}${
        callSheet.temperature ? ` (${callSheet.temperature})` : ""
      }`
    );
  }
  lines.push("");

  // Emergency Medical Hospital
  if (callSheet.hospitalName || callSheet.hospitalAddress) {
    lines.push("🏥 *Nearest Emergency Hospital:*");
    if (callSheet.hospitalName) lines.push(`${callSheet.hospitalName}`);
    if (callSheet.hospitalAddress) lines.push(`${callSheet.hospitalAddress}`);
    lines.push("");
  }

  // Crew Roster
  const crew = parseCrewJson(callSheet.crewJson);
  if (crew.length > 0) {
    lines.push("👥 *Crew Call Schedule:*");
    for (const member of crew) {
      lines.push(
        `• ${member.name} (${member.role}): ${member.callTime || callSheet.generalCallTime}${
          member.phone ? ` [${member.phone}]` : ""
        }`
      );
    }
    lines.push("");
  }

  // Production Notes
  if (callSheet.notes) {
    lines.push("📝 *Production Notes:*");
    lines.push(callSheet.notes);
    lines.push("");
  }

  // Live HUD Link
  const effectiveBaseUrl = baseUrl.replace(/\/$/, "");
  const hudUrl = `${effectiveBaseUrl}/${tenantSlug}/set-hud/${callSheet.id}`;
  lines.push("📱 *Live On-Set Companion HUD:*");
  lines.push(hudUrl);

  const previewText = lines.join("\n");

  // Format target phone: remove spaces, dashes, parentheses
  const cleanPhone = targetPhone ? targetPhone.replace(/[^\d+]/g, "") : "";
  const phoneSegment = cleanPhone ? (cleanPhone.startsWith("+") ? cleanPhone.slice(1) : cleanPhone) : "";

  const url = phoneSegment
    ? `https://wa.me/${phoneSegment}?text=${encodeURIComponent(previewText)}`
    : `https://wa.me/?text=${encodeURIComponent(previewText)}`;

  return {
    url,
    previewText,
  };
}
