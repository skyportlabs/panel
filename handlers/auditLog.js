const { db } = require('./db');
const log = new (require('cat-loggr'))();

function AdminAudit(userId, username, action, ip) {
    this.userId = userId;
    this.username = username;
    this.action = action;
    this.ip = ip;
    this.timestamp = new Date().toISOString();
}

async function logAudit(userId, username, action, ip) {
    const newAudit = new AdminAudit(userId, username, action, ip);
    let audits = [];

    try {
        const data = await db.get('audits');
        audits = data ? JSON.parse(data) : [];
    } catch (err) {
        log.error('Error fetching audits:', err);
    }

    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    audits = audits.filter(audit => new Date(audit.timestamp) >= oneMonthAgo);

    audits.push(newAudit);

    try {
        await db.set('audits', JSON.stringify(audits));
    } catch (err) {
        log.error('Error saving audits:', err);
    }
}

module.exports = { logAudit };
