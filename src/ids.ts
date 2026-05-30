const SHORT_ID_LEN = 8;

/**
 * A compact id: a UUID prefix. Used for batch ids and pending-action ids, both
 * of which ride Telegram's 64-byte callback_data budget, so they must stay short.
 */
export function shortId(): string {
  return crypto.randomUUID().slice(0, SHORT_ID_LEN);
}
