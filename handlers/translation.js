const path = require('path');
const fs = require('fs');



function loadTranslations(lang) {
  const filePath = path.join(__dirname, `../lang/${lang}/lang.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../lang/en/lang.json'), 'utf8'));
}

function translationMiddleware(req, res, next) {
  req.lang = req.cookies && req.cookies.lang ? req.cookies.lang : 'en';
  req.translations = loadTranslations(req.lang);
  next();
}

module.exports = translationMiddleware;
