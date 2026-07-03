import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Timezone utilities for MST handling
const MST_OFFSET_HOURS = -7; // MST is UTC-7

/**
 * Converts a datetime-local string (assumed to be in MST) to ISO UTC string
 * datetime-local format: "YYYY-MM-DDTHH:mm" (no timezone info)
 * The input is treated as MST and converted to UTC for storage
 * Returns ISO string in UTC
 *
 * Example: "2024-02-04T17:00" (5:00 PM MST) -> "2024-02-05T00:00:00.000Z" (midnight UTC)
 */
export function convertMSTToUTC(localDateTimeString: string): string {
  const [datePart, timePart] = localDateTimeString.split("T");

  // Create a date treating the input as UTC temporarily
  const date = new Date(`${datePart}T${timePart}:00Z`);

  // Adjust for MST offset: MST is UTC-7, so to convert MST to UTC we ADD 7 hours
  // MST_OFFSET_HOURS = -7, so we do: hours - (-7) = hours + 7
  date.setHours(date.getHours() - MST_OFFSET_HOURS);

  return date.toISOString();
}

/**
 * Converts an ISO UTC string to MST local time string for display
 * Returns formatted string like "Mon, Jan 15, 2024 5:30 PM MST"
 *
 * Example: "2024-02-05T00:00:00.000Z" (UTC) -> "Mon, Feb 04, 2024 5:00 PM MST"
 */
export function formatMSTTime(utcIsoString: string): string {
  const date = new Date(utcIsoString);

  // Use Intl.DateTimeFormat to display the UTC time in America/Denver timezone (MST/MDT)
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Denver", // MST/MDT - handles DST automatically
  });

  return formatter.format(date) + " MST";
}

/**
 * Gets current time formatted as datetime-local string in MST
 * Returns datetime in format "YYYY-MM-DDTHH:mm" representing current MST time
 * Useful for initializing datetime input with current MST time
 *
 * Example: If current UTC time is 2024-02-05T02:30:00Z, returns "2024-02-04T19:30"
 */
export function getCurrentMSTDateTime(): string {
  const now = new Date();

  // Convert current UTC time to MST using the Denver timezone
  const mstTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Denver" }),
  );

  // Format as datetime-local (YYYY-MM-DDTHH:mm)
  const year = mstTime.getFullYear();
  const month = String(mstTime.getMonth() + 1).padStart(2, "0");
  const day = String(mstTime.getDate()).padStart(2, "0");
  const hours = String(mstTime.getHours()).padStart(2, "0");
  const minutes = String(mstTime.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
