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
      const messenger = await this.messenger();
      await messenger.notifyConfirm(
        result.batchId,
        proposed.map(summarizePending)
      );
    }
    return result.reply;
  }

  /** Execute every pending action in a batch, exactly once, then push a receipt. */
  async confirmBatch(batchId: string): Promise<void> {
    const rows = this.pending()
      .byBatch(batchId)
      .filter((r) => r.status === "pending");
    const receipts: string[] = [];
    for (const row of rows) {
      // The fiber guards the external mutation: durable + exactly-once across
      // eviction/retry, keyed by the action id.
      await this.startFiber(
        `exec:${row.id}`,
        () => this.executeAction(row.id),
        {
          idempotencyKey: row.id,
          waitForCompletion: true,
        }
      );
      receipts.push(summarizePending(row));
    }
    if (receipts.length > 0) {
      const messenger = await this.messenger();
      await messenger.notify(`✅ Done:\n${receipts.join("\n")}`);
    }
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
    const messenger = await this.messenger();
    await messenger.notify(`⏰ ${row.text}`);
    reminders.markFired(payload.reminderId);
  }

  private async executeAction(id: string): Promise<void> {
    const pending = this.pending();
    const row = pending.byId(id);
    if (!row || row.status === "done") {
      return;
    }
    if (row.type === "event") {
      if (!row.externalRef) {
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
    } else {
      const params = reminderParams(row);
      const fireAt = Date.parse(params.when);
      const schedule = await this.schedule(new Date(fireAt), "fireReminder", {
        reminderId: id,
      });
      new ReminderStore(this.db).insert({
        id,
        text: params.text,
        fireAt,
        scheduleId: schedule.id,
      });
    }
    pending.setStatus(id, "done");
  }
}
