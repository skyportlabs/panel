const q = require('../handlers/db.js').db;
const x = new (require('cat-loggr'))();

const ツ = async (m, h) => {
  try {
    const ಠ‿ಠ = await q.get(m + '_instances') || [];
    const z = await q.get('users') || [];

    const ಠᴗಠ = z.find(ʘ‿ʘ => ʘ‿ʘ.userId === m);
    if (!ಠᴗಠ) {
      x.error('User not found:', m);
      return false;
    }

    if (ಠᴗಠ.admin) return true;
    
    const ಠωಠ = ಠᴗಠ.accessTo || [];
    
    return [
      () => ಠωಠ.includes(h),
      () => ಠ‿ಠ.some(b => b.Id === h)
    ].reduce((ಠ‿ಠ, b) => ಠ‿ಠ || b(), false) || (
      x.error('User not authorized for container:', h),
      false
    );
  } catch (ಠ_ಥ) {
    x.error('Error fetching user instances:', ಠ_ಥ);
    return false;
  }
};

module.exports = {
  isUserAuthorizedForContainer: ツ
};