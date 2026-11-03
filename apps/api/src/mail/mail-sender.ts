export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The only thing the rest of the API knows about email delivery. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
