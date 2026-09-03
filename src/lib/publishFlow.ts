import type { PublishNotificationOutcome } from "./pushEvents";

export interface PublishScheduleDependencies {
  weekStart: string;
  publishWithSnapshots: () => Promise<PublishNotificationOutcome>;
  publishWithoutSnapshots: () => Promise<void>;
  queueNotification: (task: () => Promise<void>) => void;
  notify: (outcome: PublishNotificationOutcome) => Promise<void>;
  logError?: (message: string) => void;
}

/**
 * Publication is the critical operation. Snapshot/diff bookkeeping and push
 * delivery are deliberately best-effort and may never prevent publication.
 */
export async function publishSchedule({
  weekStart,
  publishWithSnapshots,
  publishWithoutSnapshots,
  queueNotification,
  notify,
  logError = console.error,
}: PublishScheduleDependencies): Promise<void> {
  let outcome: PublishNotificationOutcome;

  try {
    outcome = await publishWithSnapshots();
  } catch {
    logError(
      `[publish] Snapshot/diff update failed for week ${weekStart}; publishing without push metadata.`
    );
    await publishWithoutSnapshots();
    return;
  }

  try {
    queueNotification(async () => {
      try {
        await notify(outcome);
      } catch {
        logError(`[push] Notification task failed for week ${weekStart}.`);
      }
    });
  } catch {
    logError(`[push] Could not queue notification for week ${weekStart}.`);
  }
}
