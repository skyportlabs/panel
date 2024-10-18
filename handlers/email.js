const nodemailer = require('nodemailer');
const { db } = require('./db.js');
const config = require('../config.json');

async function getSMTPSettings() {
  const smtpSettings = await db.get('smtp_settings');
  const name = await db.get('name') || 'Skyport';

  if (!smtpSettings) {
    throw new Error('SMTP settings not found');
  }

  return {
    transporter: nodemailer.createTransport({
      host: smtpSettings.server,
      port: smtpSettings.port,
      secure: smtpSettings.port !== 587 && smtpSettings.port !== 25,
      auth: {
        user: smtpSettings.username,
        pass: smtpSettings.password,
      },
      tls: {rejectUnauthorized: false},
    }),
    name,
    smtpSettings,
  };
}

function getWelcomeEmailHTML(username, password, companyName) {
  return `
    <html>
      <body>
        <h2>Welcome to ${companyName}!</h2>
        <p>Dear ${username},</p>
        <p>Thank you for creating an account with us.</p>
        <p>Your account details:</p>
        <ul>
          <li><strong>Username:</strong> ${username}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p>We hope you enjoy using ${companyName}!</p>
        <p>This is an automated message. Please do not reply.</p>
      </body>
    </html>
  `;
}

async function sendEmail(mailOptions) {
  const { transporter } = await getSMTPSettings();
  return transporter.sendMail(mailOptions);
}

async function sendWelcomeEmail(email, username, password) {
  const { name } = await getSMTPSettings();
  const mailOptions = {
    from: `${name} <${name}@skyport.dev>`,
    to: email,
    subject: `Welcome to ${name}`,
    html: getWelcomeEmailHTML(username, password, name),
  };
  await sendEmail(mailOptions);
  console.log(`Welcome email sent to ${email}`);
}

async function sendVerificationEmail(email, token) {
  const { smtpSettings, name } = await getSMTPSettings();
  const mailOptions = {
    from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <div>
        <h2>Verify Your Email Address</h2>
        <p>Thank you for registering on ${name}. Please click the button below to verify your email address:</p>
        <a href="${config.baseUri}/verify/${token}">Verify Email Address</a>
        <p>If you didn't create an account, please disregard this email.</p>
        <p>Thanks,<br/>The ${name} Team</p>
      </div>
    `,
  };
  await sendEmail(mailOptions);
  console.log(`Verification email sent to ${email}`);
}

async function sendTestEmail(recipientEmail) {
  const { smtpSettings, name } = await getSMTPSettings();
  const mailOptions = {
    from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
    to: recipientEmail,
    subject: 'Skyport Test Message',
    html: `
      <html>
        <body>
          <h1>Hello from ${name}!</h1>
          <p>This is a test of the email system. You're good to go!</p>
          <p>Regards,<br/>${name}</p>
        </body>
      </html>
    `,
  };
  await sendEmail(mailOptions);
  console.log(`Test email sent to ${recipientEmail}`);
}

async function sendPasswordResetEmail(email, token) {
  const { smtpSettings, name } = await getSMTPSettings();
  const mailOptions = {
    from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <div>
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password. Click the button below to reset it:</p>
        <a href="${config.baseUri}/auth/reset/${token}">Reset Password</a>
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>Thank you,<br/>The ${name} Team</p>
      </div>
    `,
  };
  await sendEmail(mailOptions);
  console.log(`Password reset email sent to ${email}`);
}

module.exports = {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendTestEmail,
  sendPasswordResetEmail,
};