/**
 * Solar Golden Hour Astronomical Calculation Engine
 * Pure TypeScript NOAA Solar Positioning Algorithm with Zero External Dependencies
 */

export interface SolarTimes {
  sunrise: string;           // e.g. "06:42 AM"
  sunset: string;            // e.g. "04:38 PM"
  goldenHourMorning: string; // e.g. "06:42 AM - 07:22 AM"
  goldenHourEvening: string; // e.g. "03:58 PM - 04:38 PM"
  solarNoon?: string;        // e.g. "11:40 AM"
  dawn?: string;             // Civil dawn
  dusk?: string;             // Civil dusk
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Extracts latitude and longitude from location pin URL or address string.
 * Supports Google Maps URLs (?q=lat,lng or @lat,lng) or fallback default.
 */
export function extractCoordinates(input?: string | null): Coordinates {
  const DEFAULT: Coordinates = { lat: 40.7001, lng: -73.9850 }; // Brooklyn, NY default
  if (!input) return DEFAULT;

  // Match pattern: 40.7001,-73.9850 (with optional space, optional query/at prefix)
  const match = input.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (match && match[1] && match[2]) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return DEFAULT;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function sinDeg(deg: number): number {
  return Math.sin(deg * DEG2RAD);
}

function cosDeg(deg: number): number {
  return Math.cos(deg * DEG2RAD);
}

function tanDeg(deg: number): number {
  return Math.tan(deg * DEG2RAD);
}

function asinDeg(val: number): number {
  return Math.asin(Math.max(-1, Math.min(1, val))) * RAD2DEG;
}

function acosDeg(val: number): number {
  return Math.acos(Math.max(-1, Math.min(1, val))) * RAD2DEG;
}

/**
 * Calculates Julian Day Number from year, month (1-12), and day (1-31).
 */
function getJulianDay(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

/**
 * Formats fractional hours (0-24) into "hh:mm AM/PM" string.
 */
function formatTime12h(hours: number): string {
  let normalizedHours = ((hours % 24) + 24) % 24;
  let h = Math.floor(normalizedHours);
  const m = Math.round((normalizedHours - h) * 60);

  if (m === 60) {
    h = (h + 1) % 24;
  }
  const minStr = (m % 60).toString().padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const displayHours = h % 12 === 0 ? 12 : h % 12;
  const hourStr = displayHours.toString().padStart(2, "0");

  return `${hourStr}:${minStr} ${period}`;
}

/**
 * Calculates sunrise, sunset, and golden hour windows using pure astronomical formulas.
 * 
 * @param lat Latitude in decimal degrees (-90 to +90)
 * @param lng Longitude in decimal degrees (-180 to +180)
 * @param date Target date object or ISO date string
 * @param tzOffsetHours Optional explicit timezone offset from UTC (defaults to round(lng / 15))
 */
export function calculateGoldenHour(
  lat: number,
  lng: number,
  date: Date | string,
  tzOffsetHours?: number
): SolarTimes {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();

  // If tzOffsetHours is omitted, compute solar local timezone: round(lng / 15)
  // For Brooklyn (-73.985): round(-73.985 / 15) = -5 (UTC-5)
  const tz = tzOffsetHours !== undefined ? tzOffsetHours : Math.round(lng / 15);

  const JD = getJulianDay(year, month, day);
  const T = (JD - 2451545.0) / 36525.0;

  // Geometric mean longitude of the Sun (degrees)
  let L0 = 280.46646 + T * (36000.76983 + T * 0.0003032);
  L0 = ((L0 % 360) + 360) % 360;

  // Geometric mean anomaly of the Sun (degrees)
  let M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  M = ((M % 360) + 360) % 360;

  // Sun's equation of the center
  const C = sinDeg(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            sinDeg(2 * M) * (0.019993 - 0.000101 * T) +
            sinDeg(3 * M) * 0.000289;

  // Sun's true longitude
  const sunTrueLong = L0 + C;

  // Sun's apparent longitude
  const sunApparentLong = sunTrueLong - 0.00569 - 0.00478 * sinDeg(125.04 - 1934.136 * T);

  // Mean obliquity of the ecliptic
  const seconds = 21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813));
  const obliq = 23.0 + (26.0 + seconds / 60.0) / 60.0;
  const obliqCorr = obliq + 0.00256 * cosDeg(125.04 - 1934.136 * T);

  // Sun's declination
  const sunDeclin = asinDeg(sinDeg(obliqCorr) * sinDeg(sunApparentLong));

  // Equation of Time (minutes)
  const yVar = Math.pow(tanDeg(obliqCorr / 2), 2);
  const Etime = 4.0 * RAD2DEG * (
    yVar * sinDeg(2 * L0) -
    2 * 0.016708634 * sinDeg(M) +
    4 * 0.016708634 * yVar * sinDeg(M) * cosDeg(2 * L0) -
    0.5 * yVar * yVar * sinDeg(4 * L0) -
    1.25 * 0.016708634 * 0.016708634 * sinDeg(2 * M)
  );

  // Solar Noon in minutes from midnight UTC
  const solarNoonUTC = 720 - 4 * lng - Etime;
  const solarNoonLocalHours = (solarNoonUTC / 60) + tz;

  // Helper to compute hour angle for a given zenith angle
  const getHourAngle = (zenithAngle: number): number | null => {
    const cosH = (cosDeg(zenithAngle) - sinDeg(lat) * sinDeg(sunDeclin)) /
                 (cosDeg(lat) * cosDeg(sunDeclin));
    if (cosH > 1 || cosH < -1) return null; // Sun never reaches this altitude (polar day/night)
    return acosDeg(cosH);
  };

  // Standard Zenith for sunrise/sunset is 90.833° (accounting for 34' refraction + 16' solar radius)
  const H_sun = getHourAngle(90.833) ?? 90;
  const sunriseHours = solarNoonLocalHours - (H_sun * 4) / 60;
  const sunsetHours = solarNoonLocalHours + (H_sun * 4) / 60;

  // Golden Hour Boundary: Sun altitude +6° => Zenith = 90 - 6 = 84°
  const H_golden = getHourAngle(84.0) ?? 80;
  const goldenHourMorningEndHours = solarNoonLocalHours - (H_golden * 4) / 60;
  const goldenHourEveningStartHours = solarNoonLocalHours + (H_golden * 4) / 60;

  // Civil Twilight (Dawn/Dusk): Zenith = 96° (altitude -6°)
  const H_civil = getHourAngle(96.0) ?? 95;
  const dawnHours = solarNoonLocalHours - (H_civil * 4) / 60;
  const duskHours = solarNoonLocalHours + (H_civil * 4) / 60;

  const sunriseStr = formatTime12h(sunriseHours);
  const sunsetStr = formatTime12h(sunsetHours);
  const ghMornEndStr = formatTime12h(goldenHourMorningEndHours);
  const ghEveStartStr = formatTime12h(goldenHourEveningStartHours);

  return {
    sunrise: sunriseStr,
    sunset: sunsetStr,
    goldenHourMorning: `${sunriseStr} - ${ghMornEndStr}`,
    goldenHourEvening: `${ghEveStartStr} - ${sunsetStr}`,
    solarNoon: formatTime12h(solarNoonLocalHours),
    dawn: formatTime12h(dawnHours),
    dusk: formatTime12h(duskHours),
  };
}
