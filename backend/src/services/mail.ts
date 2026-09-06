import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

// Force IPv4 first to prevent ENETUNREACH error on servers without IPv6 routing
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

function createTransporter(targetHost?: string, targetPort?: number, secure?: boolean) {
  const host = targetHost || process.env.SMTP_HOST || 'mail.sbmoffice.net';
  const user = process.env.MAIL_USER || 'dash@sbmoffice.net';
  const pass = process.env.MAIL_PASS || 'Metal@#3579';
  const port = targetPort || Number(process.env.SMTP_PORT) || 465;
  const isSecure = secure !== undefined ? secure : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    family: 4, // Force IPv4
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  } as any);
}

export async function sendVerificationMail(to: string, code: string) {
  const brandName = 'Metal Innovation';
  const appTitle = 'Digital Signage';
  const mailUser = process.env.MAIL_USER || 'dash@sbmoffice.net';
  const logoUrl = 'https://dash.sbmoffice.net/logo.png';
  
  console.log(`\n======================================================`);
  console.log(`🔑 [AUTH OTP] Verification code for ${to}: ${code}`);
  console.log(`======================================================\n`);

  const mailOptions: any = {
    from: `"${brandName} - ${appTitle}" <${mailUser}>`,
    replyTo: mailUser,
    to,
    subject: `Verification Code - ${brandName} - ${appTitle}`,
    text: `Greetings from ${brandName}!\n\nWelcome to ${brandName} ${appTitle}.\n\nYour 6-digit verification code is: ${code}\n\nPlease enter this code in your browser to activate your account.\n\nIf you did not request this email, please ignore it.\n\n© 2026 ${brandName}. All rights reserved.`,
    html: `
      <div style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 15px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
        <!-- Top Accent Bar -->
        <div style="height: 4px; background: linear-gradient(90deg, #16a34a 0%, #2563eb 100%);"></div>

        <!-- Header: Logo on Left, Brand on Right -->
        <div style="padding: 22px 28px; background: #ffffff; border-bottom: 1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td align="left" valign="middle" style="width: 140px;">
                <img src="${logoUrl}" alt="${brandName}" style="height: 44px; width: auto; max-width: 135px; display: block;" />
              </td>
              <td align="right" valign="middle">
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px; line-height: 1.2;">${brandName}</div>
                <div style="font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 3px;">${appTitle}</div>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Content Area -->
        <div style="padding: 32px 28px; text-align: center;">
          <div style="display: inline-block; padding: 4px 12px; background: #f0fdf4; color: #16a34a; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; border-radius: 20px; margin-bottom: 14px; border: 1px solid #bbf7d0;">
            Security Verification
          </div>

          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 10px 0; letter-spacing: -0.3px;">
            Activate Your Account
          </h2>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 auto 24px auto; max-width: 440px;">
            Welcome to the <strong>${brandName}</strong> digital dashboard. Please use the one-time verification code below to verify your email and complete activation:
          </p>
          
          <!-- Verification Code Box -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 28px; margin: 0 auto 22px auto; display: inline-block; min-width: 260px;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 1.2px; margin-bottom: 6px;">Verification Code</div>
            <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 7px; color: #2563eb; line-height: 1;">${code}</div>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
            If you did not request an account, you can safely disregard this message.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #fafafa; padding: 16px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.5;">
            &copy; 2026 ${brandName} &bull; Enterprise Digital Signage Platform
          </p>
        </div>
      </div>
    `
  };

  await dispatchMail(mailOptions, to);
}

export async function sendPasswordResetMail(to: string, code: string) {
  const brandName = 'Metal Innovation';
  const appTitle = 'Digital Signage';
  const mailUser = process.env.MAIL_USER || 'dash@sbmoffice.net';
  const logoUrl = 'https://dash.sbmoffice.net/logo.png';
  
  console.log(`\n======================================================`);
  console.log(`🔑 [AUTH RESET OTP] Password Reset Code for ${to}: ${code}`);
  console.log(`======================================================\n`);

  const mailOptions: any = {
    from: `"${brandName} - ${appTitle}" <${mailUser}>`,
    replyTo: mailUser,
    to,
    subject: `Password Reset Code - ${brandName} - ${appTitle}`,
    text: `Greetings from ${brandName}!\n\nA password reset request was received for your account.\n\nYour 6-digit password reset code is: ${code}\n\nThis code will expire in 15 minutes.\n\nIf you did not request a password reset, please secure your account immediately.\n\n© 2026 ${brandName}. All rights reserved.`,
    html: `
      <div style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 15px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
        <!-- Top Accent Bar -->
        <div style="height: 4px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>

        <!-- Header: Logo on Left, Brand on Right -->
        <div style="padding: 22px 28px; background: #ffffff; border-bottom: 1px solid #f1f5f9;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td align="left" valign="middle" style="width: 140px;">
                <img src="${logoUrl}" alt="${brandName}" style="height: 44px; width: auto; max-width: 135px; display: block;" />
              </td>
              <td align="right" valign="middle">
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px; line-height: 1.2;">${brandName}</div>
                <div style="font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 3px;">${appTitle}</div>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Content Area -->
        <div style="padding: 32px 28px; text-align: center;">
          <div style="display: inline-block; padding: 4px 12px; background: #fef2f2; color: #dc2626; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; border-radius: 20px; margin-bottom: 14px; border: 1px solid #fecaca;">
            Password Recovery
          </div>

          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 10px 0; letter-spacing: -0.3px;">
            Reset Your Password
          </h2>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 auto 24px auto; max-width: 440px;">
            We received a request to reset your password for the <strong>${brandName}</strong> account. Use the 6-digit security code below to set a new password:
          </p>
          
          <!-- Code Box -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 28px; margin: 0 auto 22px auto; display: inline-block; min-width: 260px;">
            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 1.2px; margin-bottom: 6px;">Security Reset Code</div>
            <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 7px; color: #dc2626; line-height: 1;">${code}</div>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
            This security code will expire in 15 minutes. If you did not make this request, please secure your account.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #fafafa; padding: 16px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.5;">
            &copy; 2026 ${brandName} &bull; Enterprise Digital Signage Platform
          </p>
        </div>
      </div>
    `
  };

  await dispatchMail(mailOptions, to);
}

async function dispatchMail(mailOptions: any, to: string) {
  // 1. Try Primary Domain SMTP (mail.sbmoffice.net:465)
  try {
    const transporter = createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Success: Email dispatched to ${to} via SMTP (mail.sbmoffice.net:465)`);
    return;
  } catch (smtpErr: any) {
    console.warn(`[MAIL] SMTP 465 failed (${smtpErr.message}). Trying 127.0.0.1:587...`);
  }

  // 2. Try Localhost SMTP (127.0.0.1:587)
  try {
    const transporter = createTransporter('127.0.0.1', 587, false);
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Success: Email dispatched to ${to} via 127.0.0.1:587`);
    return;
  } catch (smtpErr2: any) {
    console.warn(`[MAIL] SMTP 587 failed (${smtpErr2.message}). Trying Sendmail...`);
  }

  // 3. Fallback to Local Sendmail
  try {
    const sendmailTransporter = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: '/usr/sbin/sendmail',
    } as any);

    await sendmailTransporter.sendMail(mailOptions);
    console.log(`[MAIL] Success: Email dispatched to ${to} via Sendmail`);
  } catch (sendmailErr: any) {
    console.error(`[MAIL] Failed to send email to ${to}:`, sendmailErr.message);
  }
}
