export interface NotificationSender {
  send(message: { channel: string; text: string }): Promise<void>;
}

export interface SlackAdapterOptions {
  channel?: string;
  urgent?: boolean;
}

export class SlackNotificationSender implements NotificationSender {
  constructor(private readonly options: SlackAdapterOptions = {}) {}

  async send(message: { channel: string; text: string }): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return;
    }

    const channel = this.options.channel ?? message.channel;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text: message.text, urgent: this.options.urgent ?? false }),
    });
  }
}
