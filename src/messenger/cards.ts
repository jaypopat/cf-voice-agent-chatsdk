import { Actions, Button, Card, type CardElement } from "chat";

/**
 * The cross-channel confirm card: the proposed actions in the subtitle plus a
 * single Confirm/Change pair. Both buttons carry the batch id (short — well
 * under Telegram's 64-byte callback budget) so onAction can route the batch.
 */
export function buildConfirmCard(
  batchId: string,
  summaries: string[]
): CardElement {
  return Card({
    title: "Confirm",
    subtitle: summaries.join("\n"),
    children: [
      Actions([
        Button({
          id: "confirm",
          label: "Confirm",
          style: "primary",
          value: batchId,
        }),
        Button({ id: "cancel", label: "Change", value: batchId }),
      ]),
    ],
  });
}
