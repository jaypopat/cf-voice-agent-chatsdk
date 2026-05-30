import { Agent } from "agents";
import { buildConfirmCard } from "../messenger/cards";
import { createMessengerChat, dmThreadId } from "../messenger/chat";

/**
 * Telegram ingress + reach channel. Hosts the Vercel Chat SDK inside an Agent
 * context (so Chat SDK state persists via ChatSdkStateAgent sub-agents) and
 * exposes:
 *  - onRequest: the Telegram webhook (routed here as /agents/messenger-agent/main)
 *  - notify: proactive push to the user's DM (reminders, confirm prompts)
 */
export class MessengerAgent extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const chat = createMessengerChat(this.env);
    return await chat.webhooks.telegram(request, {
      waitUntil: (task: Promise<unknown>) => this.ctx.waitUntil(task),
    });
  }

  /** Push a plain message to the user's Telegram DM. */
  async notify(text: string): Promise<void> {
    await this.dmThread().post(text);
  }

  /** Push a one-tap confirm card bundling this turn's proposed actions. */
  async notifyConfirm(batchId: string, summaries: string[]): Promise<void> {
    await this.dmThread().post(buildConfirmCard(batchId, summaries));
  }

  private dmThread() {
    return createMessengerChat(this.env).thread(
      dmThreadId(this.env.TELEGRAM_ALLOWED_CHAT_ID)
    );
  }
}
