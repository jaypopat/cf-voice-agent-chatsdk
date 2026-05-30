import { createTelegramAdapter } from "@chat-adapter/telegram";
import { getAgentByName } from "agents";
import { createChatSdkState } from "agents/chat-sdk";
import { Chat } from "chat";

/**
 * Single-user allowlist: in a Telegram DM the chat id equals the sender's user
 * id, so the configured chat id is the only sender we answer.
 */
export function isAllowedSender(
  userId: string,
  allowedChatId: string
): boolean {
  return userId === allowedChatId;
}

/** Thread id the adapter uses for the user's DM, for proactive pushes. */
export function dmThreadId(allowedChatId: string): string {
  return `telegram:${allowedChatId}`;
}

/**
 * Build the Chat instance for one request. Must be called inside the
 * MessengerAgent's execution context — `createChatSdkState` resolves its parent
 * Agent via `getCurrentAgent()` to address ChatSdkStateAgent sub-agents.
 * Inbound DMs are routed to the brain; everything else is ignored.
 */
export function createMessengerChat(env: Env) {
  const chat = new Chat({
    userName: env.TELEGRAM_BOT_USERNAME,
    adapters: {
      telegram: createTelegramAdapter({
        botToken: env.TELEGRAM_BOT_TOKEN,
        secretToken: env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
        userName: env.TELEGRAM_BOT_USERNAME,
        mode: "webhook",
      }),
    },
    // parent Agent resolved via getCurrentAgent(); agent class defaults to
    // ChatSdkStateAgent (the sub-agent that holds Chat SDK state).
    state: createChatSdkState(),
  });

  chat.onDirectMessage(async (thread, message) => {
    if (
      !(
        message.text &&
        isAllowedSender(message.author.userId, env.TELEGRAM_ALLOWED_CHAT_ID)
      )
    ) {
      return;
    }
    const brain = await getAgentByName(env.AssistantAgent, "main");
    const reply = await brain.handleTurn(message.text);
    await thread.post(reply);
  });

  // Confirm/Change taps on a proposal card. The button value is the batch id.
  chat.onAction(["confirm", "cancel"], async (event) => {
    const batchId = event.value;
    if (
      !(
        batchId &&
        isAllowedSender(event.user?.userId ?? "", env.TELEGRAM_ALLOWED_CHAT_ID)
      )
    ) {
      return;
    }
    const brain = await getAgentByName(env.AssistantAgent, "main");
    if (event.actionId === "confirm") {
      await brain.confirmBatch(batchId);
    } else {
      await brain.cancelBatch(batchId);
    }
  });

  return chat;
}
