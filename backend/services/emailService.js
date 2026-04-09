import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function createTransporter() {
  if (!env.email.smtpHost || !env.email.smtpUser) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpPort === 465,
    auth: {
      user: env.email.smtpUser,
      pass: env.email.smtpPass
    }
  });
}

transporter = createTransporter();

export async function sendEmail({ to, subject, text, html }) {
  if (!transporter) {
    // Fallback: log email to console for development when SMTP not configured
    // eslint-disable-next-line no-console
    console.log('[email] SMTP not configured. Email content:', { to, subject, text, html });
    return Promise.resolve();
  }

  const mailOptions = {
    from: env.email.fromAddress,
    to,
    subject,
    text,
    html
  };

  return transporter.sendMail(mailOptions);
}
