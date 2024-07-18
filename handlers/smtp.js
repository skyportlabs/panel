const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { db } = require('./db.js');

const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
async function getSMTPSettings() {
  const smtpSettings = await db.get('smtp_settings');
  const name = await db.get('name') || 'Skyport';

  if (!smtpSettings) {
    log.error('SMTP settings not found');
  }

  const securePorts = [25, 465, 587, 2525]; 
  const secure = securePorts.includes(smtpSettings.port);

  const transporter = nodemailer.createTransport({
    host: smtpSettings.server,
    port: smtpSettings.port,
    secure: secure, 
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
  } catch (error) {
    log.error('Error sending email:', error);
  }
}

module.exports = {
  sendEmail,
};
