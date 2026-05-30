import type { CalendarEventInput } from "../actions/calendar";
import type { PendingActionRow } from "../memory/schema";

const ONE_HOUR_MS = 60 * 60 * 1000;

interface EventParams {
  end?: string;
  location?: string;
  notes?: string;
  start: string;
  title: string;
}

interface ReminderParams {
  text: string;
  when: string;
}

/** Map a propose_event proposal's params to a Calendar event (end defaults to +1h). */
export function mapEventParams(params: EventParams): CalendarEventInput {
  let end = params.end;
  if (end === undefined) {
    const startMs = Date.parse(params.start);
    if (Number.isNaN(startMs)) {
      throw new Error(`Event has no valid start time: "${params.start}"`);
    }
    end = new Date(startMs + ONE_HOUR_MS).toISOString();
  }
  return {
    summary: params.title,
    start: params.start,
    end,
    location: params.location,
    description: params.notes,
  };
}

export function eventParams(row: PendingActionRow): EventParams {
  return JSON.parse(row.params) as EventParams;
}

export function reminderParams(row: PendingActionRow): ReminderParams {
  return JSON.parse(row.params) as ReminderParams;
}

/** One human line summarizing a pending action, for the confirm card + receipts. */
export function summarizePending(row: PendingActionRow): string {
  if (row.type === "event") {
    const p = eventParams(row);
    return `📅 ${p.title} — ${p.start}`;
  }
  const p = reminderParams(row);
  return `⏰ ${p.text} — ${p.when}`;
}
