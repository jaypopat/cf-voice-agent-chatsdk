import { Agent, getAgentByName } from "agents";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import { GoogleCalendar } from "../actions/calendar";
import { DrizzleTokenCache } from "../actions/google-token";
import { PendingStore } from "../actions/pending";
import { ReminderStore } from "../actions/reminders";
import { processTurn } from "../brain/turn";
import { MODELS } from "../config";
import {
  eventParams,
  mapEventParams,
  reminderParams,
  summarizePending,
} from "../confirm/gate";
import type { PendingActionRow } from "../memory/schema";
import { MemoryStore } from "../memory/store";
import { VectorIndex } from "../memory/vector";

interface ReminderPayload {
  reminderId: string;
}

/**
 * THE BRAIN. Owns memory, the agentic loop, and the confirm gate. Both ingress
 * channels (voice, Telegram) address the single instance "main" and call
 * handleTurn; the confirm gate executes proposed actions exactly once.
 */
export class AssistantAgent extends Agent<Env> {
  protected db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { logger: false });
    ctx.blockConcurrencyWhile(() => migrate(this.db, migrations));
  }

  getMemoryStore(): MemoryStore {
    return new MemoryStore(this.db);
  }

  private pending(): PendingStore {
    return new PendingStore(this.db);
  }

  private calendar(): GoogleCalendar {
    return new GoogleCalendar(
      {
        clientId: this.env.GOOGLE_CLIENT_ID,
        clientSecret: this.env.GOOGLE_CLIENT_SECRET,
        refreshToken: this.env.GOOGLE_REFRESH_TOKEN,
        calendarId: this.env.GOOGLE_CALENDAR_ID,
      },
      new DrizzleTokenCache(this.db)
    );
  }

  private async messenger() {
    return await getAgentByName(this.env.MessengerAgent, "main");
  }

  async handleTurn(text: string): Promise<string> {
    const result = await processTurn(
      {
        ai: this.env.AI,
        model: MODELS.llm,
        store: this.getMemoryStore(),
        vector: new VectorIndex(this.env.AI, this.env.VECTORIZE, MODELS.embed),
        pending: this.pending(),
        tz: this.env.USER_TZ,
      },
      text
    );

    // If the model proposed any actions, bundle them into one confirm card on
    // the reach channel; the reply already told the user to confirm there.
    const proposed = this.pending().byBatch(result.batchId);
    if (proposed.length > 0) {
      try {
        const messenger = await this.messenger();
        await messenger.notifyConfirm(
          result.batchId,
          proposed.map(summarizePending)
        );
      } catch {
        // Telegram push failed; the proposals are durable and the reply already
        // told the user to confirm — don't fail the turn (a webhook retry would
        // re-run the whole LLM turn and duplicate the proposals).
      }
    }
    return result.reply;
  }

  /** Execute every pending action in a batch, exactly once, then push a receipt. */
  async confirmBatch(batchId: string): Promise<void> {
    const rows = this.pending()
      .byBatch(batchId)
      .filter((r) => r.status === "pending");
    if (rows.length === 0) {
      return;
    }
    const receipts: string[] = [];
    for (const row of rows) {
      // The fiber guards the external mutation: durable + exactly-once across
      // eviction/retry, keyed by the action id. A failure on one action must
      // not abort the rest, and the user always gets a per-action receipt.
      try {
        await this.startFiber(
          `exec:${row.id}`,
          () => this.executeAction(row.id),
          { idempotencyKey: row.id, waitForCompletion: true }
        );
        receipts.push(`✅ ${summarizePending(row)}`);
      } catch (err) {
        this.pending().setStatus(row.id, "failed");
        receipts.push(`❌ ${summarizePending(row)} (${String(err)})`);
      }
    }
    const messenger = await this.messenger();
    await messenger.notify(receipts.join("\n"));
  }

  async cancelBatch(batchId: string): Promise<void> {
    const pending = this.pending();
    for (const row of pending.byBatch(batchId)) {
      if (row.status === "pending") {
        pending.setStatus(row.id, "cancelled");
      }
    }
    const messenger = await this.messenger();
    await messenger.notify("Okay, cancelled — tell me what to change.");
  }

  /** Fired by a Durable Object alarm; pushes the reminder to the reach channel. */
  async fireReminder(payload: ReminderPayload): Promise<void> {
    const reminders = new ReminderStore(this.db);
    const row = reminders.byId(payload.reminderId);
    if (!row || row.status !== "scheduled") {
      return;
    }
    // Mark fired before delivering: a DO alarm retries on throw, so deliver
    // at-most-once rather than risk a duplicate buzz if Telegram is briefly down.
    reminders.markFired(payload.reminderId);
    const messenger = await this.messenger();
    await messenger.notify(`⏰ ${row.text}`);
  }

  private async executeAction(id: string): Promise<void> {
    const pending = this.pending();
    const row = pending.byId(id);
    if (!row || row.status === "done") {
      return;
    }
    if (row.type === "event") {
      await this.insertEventAction(id, row, pending);
    } else {
      await this.scheduleReminderAction(id, row);
    }
    pending.setStatus(id, "done");
  }

  private async insertEventAction(
    id: string,
    row: PendingActionRow,
    pending: PendingStore
  ): Promise<void> {
    if (row.externalRef) {
      return; // already created on a prior fiber run
    }
    const event = await this.calendar().insertEvent(
      mapEventParams(eventParams(row))
    );
    pending.setExternalRef(id, event.id);
    this.getMemoryStore().insert({
      id: crypto.randomUUID(),
      kind: "event",
      text: summarizePending(row),
    });
  }

  private async scheduleReminderAction(
    id: string,
    row: PendingActionRow
  ): Promise<void> {
    const reminders = new ReminderStore(this.db);
    if (reminders.byId(id)) {
      return; // already scheduled on a prior fiber run
    }
    const params = reminderParams(row);
    const fireAt = Date.parse(params.when);
    if (Number.isNaN(fireAt)) {
      throw new Error(`Reminder has no valid time: "${params.when}"`);
    }
    const schedule = await this.schedule(new Date(fireAt), "fireReminder", {
      reminderId: id,
    });
    reminders.insert({
      id,
      text: params.text,
      fireAt,
      scheduleId: schedule.id,
    });
  }
}
