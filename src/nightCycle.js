import { EmbedBuilder } from "discord.js";
import { DateTime } from "luxon";

// Configuration constants
const NIGHT_DURATION = 30; // minutes
const DAY_DURATION = 120; // minutes
const CYCLE_DURATION = NIGHT_DURATION + DAY_DURATION;
const CYCLE_START = DateTime.fromISO("2025-01-06T22:00:00", {
  zone: "America/New_York",
}); // Night cycle starts at 10:00 PM EST

function parseTimeInput(timeStr, timezone = "EST", dateStr = null) {
  const zone = `America/${getTimezoneCity(timezone)}`;
  let baseTime = DateTime.now().setZone(zone);

  // If date is provided, parse and use it
  if (dateStr) {
    // Try multiple date formats
    let parsedDate = DateTime.fromFormat(dateStr, "MM/dd/yy", { zone });
    if (!parsedDate.isValid) {
      parsedDate = DateTime.fromFormat(dateStr, "M/d/yy", { zone });
    }
    if (!parsedDate.isValid) {
      throw new Error('Invalid date format. Please use "MM/DD/YY" or "M/D/YY"');
    }
    baseTime = parsedDate;
  }

  if (!timeStr) return baseTime;

  // Handle military time
  if (timeStr.match(/^([01]?[0-9]|2[0-3])[0-5][0-9]$/)) {
    const hours = parseInt(timeStr.slice(0, -2));
    const minutes = parseInt(timeStr.slice(-2));
    return baseTime.set({ hours, minutes });
  }

  // Handle AM/PM format
  const parsed = DateTime.fromFormat(timeStr, "h:mm a", { zone });
  if (parsed.isValid) {
    return baseTime.set({
      hour: parsed.hour,
      minute: parsed.minute,
    });
  }

  // Try without minutes
  const parsedNoMinutes = DateTime.fromFormat(timeStr, "h a", { zone });
  if (parsedNoMinutes.isValid) {
    return baseTime.set({
      hour: parsedNoMinutes.hour,
      minute: 0,
    });
  }

  throw new Error(
    'Invalid time format. Please use "HH:MM AM/PM" or "HHMM" (military time)'
  );
}

function getTimezoneCity(timezone) {
  const timezones = {
    EST: "New_York",
    CST: "Chicago",
    MST: "Denver",
    PST: "Los_Angeles",
  };
  return timezones[timezone] || "New_York";
}

function getNightCycleInfo(targetTime) {
  const minutesSinceStart = targetTime.diff(CYCLE_START, "minutes").minutes;
  const cyclePosition = minutesSinceStart % CYCLE_DURATION;
  const isNight = cyclePosition < NIGHT_DURATION;

  // Calculate time until next night
  if (isNight) {
    // If we're in a night cycle, next night is in: remaining day (120) + current position in night
    const minutesToNextNight = DAY_DURATION + cyclePosition;
    return {
      isNight,
      minutesToNextNight,
      remainingInCycle: NIGHT_DURATION - cyclePosition,
      cyclePosition,
    };
  } else {
    // If we're in day, next night is in: remaining minutes until cycle ends
    const minutesToNextNight = CYCLE_DURATION - cyclePosition;
    return {
      isNight,
      minutesToNextNight,
      remainingInCycle: NIGHT_DURATION - (cyclePosition - DAY_DURATION),
      cyclePosition,
    };
  }
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function createNightCycleEmbed(
  timeStr = null,
  timezone = "EST",
  dateStr = null
) {
  const targetTime = parseTimeInput(timeStr, timezone, dateStr);
  const cycleInfo = getNightCycleInfo(targetTime);

  const embed = new EmbedBuilder()
    .setColor(cycleInfo.isNight ? 0x2b2d31 : 0xfee75c)
    .setTitle("🌙 Night Cycle Information");

  if (!timeStr) {
    // Current time info
    embed.addFields(
      {
        name: "Current Status",
        value: cycleInfo.isNight
          ? "🌙 Night Cycle Active"
          : "☀️ Day Cycle Active",
      },
      {
        name: "Time Until Next Night",
        value: formatDuration(cycleInfo.minutesToNextNight),
      }
    );

    if (cycleInfo.isNight) {
      embed.addFields({
        name: "Time Remaining in Night Cycle",
        value: formatDuration(cycleInfo.remainingInCycle),
      });
    }
  } else {
    // Specific time info
    const prevNightStart = targetTime.minus({
      minutes: cycleInfo.cyclePosition,
    });
    const nextNightStart = prevNightStart.plus({ minutes: CYCLE_DURATION });

    embed.addFields(
      {
        name: "Specified Time",
        value: `${targetTime.toFormat("h:mm a")} ${timezone}${
          dateStr ? ` on ${targetTime.toFormat("MM/dd/yy")}` : ""
        }`,
      },
      {
        name: "Status",
        value: cycleInfo.isNight
          ? "🌙 Night Cycle Active"
          : "☀️ No Night Cycle Active",
      },
      {
        name: "Previous Night Cycle",
        value: prevNightStart.toFormat("h:mm a"),
      },
      {
        name: "Next Night Cycle",
        value: nextNightStart.toFormat("h:mm a"),
      }
    );
  }

  return embed;
}
