declare module "web-push" {
  export interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
  }
  export interface PushSubscription {
    endpoint: string;
    keys: PushSubscriptionKeys;
  }
  export interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }
  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string,
  ): void;
  export function generateVAPIDKeys(): VapidKeys;
  export function sendNotification(
    subscription: PushSubscription,
    payload: string,
    options?: { TTL?: number; headers?: Record<string, string> },
  ): Promise<void>;
}