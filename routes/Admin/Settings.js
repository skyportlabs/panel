const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('node:fs');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { sendTestEmail } = require('../../handlers/email.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

// Configure multer for file upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '..', '..', 'public', 'assets');
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, 'logo.png');
    }
  }),
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/') || new Error('Not an image! Please upload an image file.'));
  }
});

async function fetchCommonSettings(req) {
  const settings = await db.get('settings') || {};
  return {
    req,
    user: req.user,
    settings
  };
}

router.get('/admin/settings', isAdmin, async (req, res) => {
  const settings = await fetchCommonSettings(req);
  res.render('admin/settings/appearance', settings);
});

router.get('/admin/settings/smtp', isAdmin, async (req, res) => {
  try {
    const settings = await fetchCommonSettings(req);
    const smtpSettings = await db.get('smtp_settings') || {};
    res.render('admin/settings/smtp', { ...settings, smtpSettings });
  } catch (error) {
    log.error('Error fetching SMTP settings:', error);
    res.status(500).send('Failed to fetch SMTP settings. Please try again later.');
  }
});

router.get('/admin/settings/theme', isAdmin, async (req, res) => {
  const settings = await fetchCommonSettings(req);
  res.render('admin/settings/theme', settings);
});

router.post('/admin/settings/toggle/force-verify', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.forceVerify = !settings.forceVerify;
    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, 'force-verify:edit', req.ip);
    res.redirect('/admin/settings');
  } catch (err) {
    log.error('Error toggling force verify:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/admin/settings/change/name', isAdmin, async (req, res) => {
  const { name } = req.body;
  try {
    const settings = await db.get('settings') || {};
    settings.name = name;
    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, 'name:edit', req.ip);
    res.redirect(`/admin/settings?changednameto=${name}`);
  } catch (err) {
    log.error('Error changing name:', err);
    res.status(500).send("Database error");
  }
});

router.post('/admin/settings/change/theme/color', isAdmin, async (req, res) => {
  const { buttoncolor, paneltheme, sidebardirection } = req.body;
  let theme = require('../../storage/theme.json');
  try {
    if (buttoncolor) theme['button-color'] = buttoncolor;
    if (paneltheme) theme['paneltheme-color'] = paneltheme;
    if (sidebardirection) {
      theme['sidebar-direction'] = theme['sidebar-direction'] === 'left' ? 'right' : 'left';
  }  
    await fs.promises.writeFile('./storage/theme.json', JSON.stringify(theme, null, 2));
    logAudit(req.user.userId, req.user.username, 'theme:edit', req.ip);
    res.redirect('/admin/settings/theme?changed=' + (buttoncolor || paneltheme || sidebardirection));
  } catch (err) {
    log.error('Error updating theme:', err);
    res.status(500).send("File writing error");
  }
});

router.post('/admin/settings/toggle/theme/footer', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.footer = !settings.footer;
    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, `footer:${settings.footer ? 'enabled' : 'disabled'}`, req.ip);
    res.redirect('/admin/settings/theme');
  } catch (err) {
    log.error('Error toggling footer:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/admin/settings/saveSmtpSettings', isAdmin, async (req, res) => {
  const { smtpServer, smtpPort, smtpUser, smtpPass, smtpFromName, smtpFromAddress } = req.body;

  try {
    await db.set('smtp_settings', {
      server: smtpServer,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
      fromName: smtpFromName,
      fromAddress: smtpFromAddress
    });
    logAudit(req.user.userId, req.user.username, 'SMTP:edit', req.ip);
    res.redirect('/admin/settings/smtp?msg=SmtpSaveSuccess');
  } catch (error) {
    log.error('Error saving SMTP settings:', error);
    res.redirect('/admin/settings/smtp?err=SmtpSaveFailed');
  }
});

router.post('/sendTestEmail', isAdmin, async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    await sendTestEmail(recipientEmail);
    res.redirect('/admin/settings/smtp?msg=TestemailSentsuccess');
  } catch (error) {
    log.error('Error sending test email:', error);
    res.redirect('/admin/settings/smtp?err=TestemailSentfailed');
  }
});

// Update logo handling to store it in settings
router.post('/admin/settings/change/logo', isAdmin, upload.single('logo'), async (req, res) => {
  const { type } = req.body;

  try {
    const settings = await db.get('settings') || {};

    if (type === 'image' && req.file) {
      settings.logo = true; // Set logo to true in settings
      await db.set('settings', settings); // Save settings with logo
      res.redirect('/admin/settings');
    } else if (type === 'none') {
      const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo.png');
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
      settings.logo = false; // Set logo to false in settings
      await db.set('settings', settings); // Save settings without logo
      logAudit(req.user.userId, req.user.username, 'logo:edit', req.ip);
      res.redirect('/admin/settings');
    } else {
      res.status(400).send('Invalid request');
    }
  } catch (err) {
    log.error('Error processing logo change:', err);
    res.status(500).send("Error processing logo change: " + err.message);
  }
});

router.post('/admin/settings/toggle/register', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.register = !settings.register;
    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, 'register:edit', req.ip);
    res.redirect('/admin/settings');
  } catch (err) {
    log.error('Error toggling registration:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;