const nodemailer = require('nodemailer');
const { db } = require('./db.js');
const config = require('../config.json');


async function getSMTPSettings() {
  const smtpSettings = await db.get('smtp_settings');
  const name = await db.get('name') || 'Skyport';
  let secure = true
  if (!smtpSettings) {
    throw new Error('SMTP settings not found');
  }
  if (smtpSettings.port == 587 || smtpSettings.port == 25) {
    secure = false
    const transporter = nodemailer.createTransport({
    host: smtpSettings.server,
    port: smtpSettings.port,
    secure: secure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
    tls: {
        rejectUnauthorized: true 
    },
  });
  } else {
const transporter = nodemailer.createTransport({
    host: smtpSettings.server,
    port: smtpSettings.port,
    secure: secure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
  });
  }
  
  return { transporter, smtpSettings, name };
}

async function sendWelcomeEmail(email, username, password) {
  try {

    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: email,
      subject: `Welcome to ${name}`,
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f0f0f0;
                padding: 20px;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
              }
              .header {
                background-color: #007bff;
                color: #fff;
                padding: 10px;
                text-align: center;
                border-radius: 8px 8px 0 0;
              }
              .content {
                padding: 20px;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #777;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Welcome to ${await db.get('name') || 'Skyport'}!</h2>
              </div>
              <div class="content">
                <p>Dear ${username},</p>
                <p>Thank you for creating an account with us.</p>
                <p>Your account details:</p>
                <ul>
                  <li><strong>Username:</strong> ${username}</li>
                  <li><strong>Password:</strong> ${password}</li>
                </ul>
                <p>We hope you enjoy using ${await db.get('name') || 'Skyport'}!</p>
              </div>
              <div class="footer">
                <p>This is an automated message. Please do not reply.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

async function sendVerificationEmail(email, token) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 20px; border-radius: 10px; max-width: 600px; margin: 0 auto; color: #333; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #4CAF50; text-align: center; font-size: 24px; margin-bottom: 20px;">Verify Your Email Address</h2>
            <p style="font-size: 16px; text-align: center; margin-bottom: 20px;">Hello,</p>
            <p style="font-size: 16px; text-align: center; margin-bottom: 20px;">Thank you for registering on ${name}. Please click the button below to verify your email address:</p>
            <div style="text-align: center; margin-bottom: 20px;">
              <a href="${config.baseUri}/verify/${token}" style="display: inline-block; padding: 14px 28px; font-size: 16px; color: #ffffff; background-color: #4CAF50; text-decoration: none; border-radius: 30px; box-shadow: 0 4px 6px rgba(76, 175, 80, 0.2);">Verify Email Address</a>
            </div>
            <p style="font-size: 16px; text-align: center; margin-bottom: 20px;">If you're having trouble clicking the button above, you can also verify your email by copying and pasting the following link into your browser:</p>
            <p style="font-size: 16px; text-align: center; margin-bottom: 20px;"><a href="${config.baseUri}/verify/${token}" style="color: #4CAF50; word-wrap: break-word; text-decoration: underline;">${config.baseUri}/verify/${token}</a></p>
            <p style="font-size: 16px; text-align: center; margin-bottom: 20px;">If you didn't create an account on ${name}, please disregard this email.</p>
            <p style="font-size: 16px; text-align: center;">Thanks,<br/>The ${name} Team</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
}


/**
 * Sends a test email using SMTP settings stored in the database.
 *
 * @param {string} recipientEmail - The email address where the test email should be sent.
 * @returns {Promise<string>} A promise that resolves with a success message or rejects with an error message.
 */
async function sendTestEmail(recipientEmail) {
    try {
      const { transporter, smtpSettings, name } = await getSMTPSettings();
  
      const mailOptions = {
        from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
        to: recipientEmail,
        subject: 'Skyport Test Message',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
              <style>
                /* Media Queries */
                @media only screen and (max-width: 500px) {
                  .button { width: 100% !important; }
                }
              </style>
            </head>
            <body style="margin: 0; padding: 0; width: 100%; background-color: #F2F4F6;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 100%; margin: 0; padding: 0; background-color: #F2F4F6;" align="center">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <!-- Logo -->
                      <tr>
                        <td style="padding: 25px 0; text-align: center;">
                          <a href="${config.domain}" target="_blank" style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #2F3133; text-decoration: none; text-shadow: 0 1px 0 white;">
                            ${await db.get('name') || 'Skyport'}
                          </a>
                        </td>
                      </tr>
                      <!-- Email Body -->
                      <tr>
                        <td style="width: 100%; margin: 0; padding: 0; border-top: 1px solid #EDEFF2; border-bottom: 1px solid #EDEFF2; background-color: #FFF;" width="100%">
                          <table style="width: auto; max-width: 570px; margin: 0 auto; padding: 0;" align="center" width="570" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; padding: 35px;">
                                <!-- Greeting -->
                                <h1 style="margin-top: 0; color: #2F3133; font-size: 19px; font-weight: bold; text-align: left;">
                                  Hello from Skyport Panel!
                                </h1>
                                <!-- Intro -->
                                <p style="margin-top: 0; color: #74787E; font-size: 16px; line-height: 1.5em;">
                                  This is a test of the Skyport mail system. You're good to go!.
                                </p>
                                <p>
                                  Regards,
                                  <br>${await db.get('name') || 'Skyport'}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td>
                          <table style="width: auto; max-width: 570px; margin: 0 auto; padding: 0; text-align: center;" align="center" width="570" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #AEAEAE; padding: 35px; text-align: center;">
                                <p style="margin-top: 0; color: #74787E; font-size: 12px; line-height: 1.5em;">
                                  &copy; ${new Date().getFullYear()} ${await db.get('name') || 'Skyport'}
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      };
  
      const info = await transporter.sendMail(mailOptions);
      console.log(`Test Email sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Error sending test email:', error);
      return false;
    }
  }

  async function sendPasswordResetEmail(email, token) {
    try {
      const { transporter, smtpSettings, name } = await getSMTPSettings();
  
      const mailOptions = {
        from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
              <h2 style="color: #4CAF50; text-align: center;">Password Reset Request</h2>
              <p style="font-size: 16px;">Hello,</p>
              <p style="font-size: 16px;">We received a request to reset your password. Click the button below to reset it:</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${config.baseUri}/auth/reset/${token}" style="display: inline-block; padding: 12px 24px; font-size: 16px; color: #ffffff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Reset Password</a>
              </div>
              <p style="font-size: 16px;">If the button above does not work, click the link below:</p>
              <p style="font-size: 16px; text-align: center;"><a href="${config.baseUri}/auth/reset/${token}" style="color: #4CAF50; word-wrap: break-word;">${config.baseUri}/auth/reset/${token}</a></p>
              <p style="font-size: 16px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
              <p style="font-size: 16px;">Thank you,</p>
              <p style="font-size: 16px;">The ${name} Team</p>
            </div>
          </div>
        `,
      };
  
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

module.exports = {
  sendPasswordResetEmail, 
  sendWelcomeEmail,
  sendTestEmail,
  sendVerificationEmail,
};
