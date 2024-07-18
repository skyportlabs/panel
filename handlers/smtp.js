const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { db } = require('./db.js');

async function getSMTPSettings() {
  const smtpSettings = await db.get('smtp_settings');
  const name = await db.get('name') || 'Skyport';

  if (!smtpSettings) {
    throw new Error('SMTP settings not found');
  }

  const transporter = nodemailer.createTransport({
    host: smtpSettings.server,
    port: smtpSettings.port,
    secure: true,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
  });

  return { transporter, smtpSettings, name };
}

async function sendEmail(to, subject, templateData) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const templatePath = path.resolve(__dirname, '../emailTemplates/Lite&Green.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateSource);

    templateData.name = name;
    templateData.subject = subject;

    const htmlContent = template(templateData);

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to,
      subject,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
}

module.exports = {
  sendEmail,
};
