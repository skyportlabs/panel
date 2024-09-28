const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('node:fs');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog.js');
const { sendTestEmail } = require('../../handlers/email.js');
const { isAdmin } = require('../../utils/isAdmin.js');

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
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image file.'), false);
    }
  }
});

router.get('/admin/settings', isAdmin, async (req, res) => {
  res.render('admin/settings/appearance', {
    req,
    user: req.user,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false,
    settings: await db.get('settings')
  });
});

router.get('/admin/settings/smtp', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings');
    const smtpSettings = await db.get('smtp_settings') || {};
    
    res.render('admin/settings/smtp', {
      req,
      user: req.user,
      name: await db.get('name') || 'Skyport',
      logo: await db.get('logo') || false,
      settings,
      smtpSettings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).send('Failed to fetch settings. Please try again later.');
  }
});

router.get('/admin/settings/theme', isAdmin, async (req, res) => {
  res.render('admin/settings/theme', {
    req,
    user: req.user,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false,
    settings: await db.get('settings')
  });
});

router.post('/admin/settings/toggle/force-verify', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.forceVerify = !settings.forceVerify;

    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, 'force-verify:edit', req.ip);

    res.redirect('/admin/settings');
  } catch (err) {
    console.error('Error toggling force verify:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/admin/settings/change/name', isAdmin, async (req, res) => {
  const name = req.body.name;
  try {
    await db.set('name', [name]);
    logAudit(req.user.userId, req.user.username, 'name:edit', req.ip);
    res.redirect('/admin/settings?changednameto=' + name);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

router.post('/admin/settings/change/theme/button-color', isAdmin, async (req, res) => {
  const buttoncolor = req.body.buttoncolor;
  let theme = require('../../storage/theme.json');
  try {
    theme['button-color'] = buttoncolor;
    await fs.writeFileSync('./storage/theme.json', JSON.stringify(theme, null, 2));
    logAudit(req.user.userId, req.user.username, 'theme:edit', req.ip);
    res.redirect('/admin/settings/theme?changedbuttoncolorto=' + buttoncolor);
  } catch (err) {
    console.error(err);
    res.status(500).send("File writing error");
  }
});

router.post('/admin/settings/change/theme/paneltheme-color', isAdmin, async (req, res) => {
  const paneltheme = req.body.paneltheme;
  let theme = require('../../storage/theme.json');
  try {
    theme['paneltheme-color'] = paneltheme;
    await fs.writeFileSync('./storage/theme.json', JSON.stringify(theme, null, 2));
    logAudit(req.user.userId, req.user.username, 'theme:edit', req.ip);
    res.redirect('/admin/settings/theme?changedpanelcolorto=' + paneltheme);
  } catch (err) {
    console.error(err);
    res.status(500).send("File writing error");
  }
});

router.post('/admin/settings/toggle/theme/footer', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.footer = !settings.footer;

    await db.set('settings', settings);
    const action = settings.footer ? 'enabled' : 'disabled';
    logAudit(req.user.userId, req.user.username, 'footer:' + action, req.ip);

    res.redirect('/admin/settings/theme');
  } catch (err) {
    console.error('Error toggling footer:', err);
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
    console.error('Error saving SMTP settings:', error);
    res.redirect('/admin/settings/smtp?err=SmtpSaveFailed');
  }
});

router.post('/sendTestEmail', isAdmin, async (req, res) => {
  try {
    const { recipientEmail } = req.body;

    const emailSent = await sendTestEmail(recipientEmail);

    if (emailSent) {
      res.redirect('/admin/settings/smtp?msg=TestemailSentsuccess');
    } else {
      res.redirect('/admin/settings/smtp?err=TestemailSentfailed'); 
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.redirect('/admin/settings/smtp?err=TestemailSentfailed');
  }
});

router.post('/admin/settings/change/logo', isAdmin, upload.single('logo'), async (req, res) => {
  const type = req.body.type;

  try {
    if (type === 'image' && req.file) {
      // Image uploaded successfully
      await db.set('logo', true);
      res.redirect('/admin/settings');
    } else if (type === 'none') {
      // Remove existing logo
      const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo.png');
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
      await db.set('logo', false);
      logAudit(req.user.userId, req.user.username, 'logo:edit', req.ip);
      res.redirect('/admin/settings');
    } else {
      res.status(400).send('Invalid request');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing logo change: " + err.message);
  }
});

router.post('/admin/settings/toggle/register', isAdmin, async (req, res) => {
  let settings = await db.get('settings');
  settings.register = !settings.register;
  await db.set('settings', settings);
  logAudit(req.user.userId, req.user.username, 'register:edit', req.ip);
  res.redirect('/admin/settings');
});

module.exports = router;