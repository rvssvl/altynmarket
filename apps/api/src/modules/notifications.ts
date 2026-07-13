import type {
  Notification,
  NotificationEvent,
  UserId,
} from "@altyn-market/domain";

export interface NotificationService {
  readonly enqueue: (input: EnqueueNotificationInput) => Promise<Notification>;
  readonly sendPending: () => Promise<void>;
}

export interface EnqueueNotificationInput {
  readonly userId: UserId;
  readonly event: NotificationEvent;
  readonly orderId?: string;
  readonly channels: readonly ("sms" | "push" | "whatsapp")[];
}
