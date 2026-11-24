import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** In-memory record of sent mail (capped). Lets tests assert on side effects without an SMTP server. */
export const outbox: MailMessage[] = [];

/**
 * Mail adapter. Replace the body with a real provider (SES, Resend, SMTP) for production.
 * Until then messages are logged without their body so reset links never reach log storage.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  outbox.push(message);
  if (outbox.length > 50) outbox.shift();
  logger.info("mail_queued", { to: message.to, subject: message.subject });
}
