const { db } = require('./db');

function normalize(value) {
  if (value === undefined || value === null) return null;

  const result = String(value).trim();

  return result === '' ? null : result;
}

function validateGSTIN(value) {
  if (!value) return true;

  return /^[0-9A-Z]{15}$/.test(
    String(value).trim().toUpperCase()
  );
}

function validatePAN(value) {
  if (!value) return true;

  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
    String(value).trim().toUpperCase()
  );
}

function getCurrentTenant(user) {
  if (!user || !user.tenant_id) {
    throw new Error('Not authenticated');
  }

  const tenant = db.prepare(`
    SELECT *
    FROM tenants
    WHERE id = ?
  `).get(user.tenant_id);

  if (!tenant) {
    throw new Error('Retailer not found');
  }

  if (!tenant.active) {
    throw new Error('Retailer is inactive');
  }

  return tenant;
}

function getCompany(user) {
  return getCurrentTenant(user);
}

function updateCompany(user, input = {}) {
  const tenant = getCurrentTenant(user);

  const legalName = normalize(input.legal_name);
  const displayName = normalize(input.display_name);
  const phone = normalize(input.phone);
  const email = normalize(input.email);
  const address = normalize(input.address);
  const city = normalize(input.city);
  const state = normalize(input.state);
  const pincode = normalize(input.pincode);
  const gstin = normalize(input.gstin)?.toUpperCase() || null;
  const pan = normalize(input.pan)?.toUpperCase() || null;
  const logoPath = normalize(input.logo_path);
  const currency = normalize(input.currency) || 'INR';
  const timezone = normalize(input.timezone) || 'Asia/Kolkata';

  if (!legalName) {
    throw new Error('Legal business name is required');
  }

  if (legalName.length > 200) {
    throw new Error('Legal business name is too long');
  }

  if (displayName && displayName.length > 200) {
    throw new Error('Display name is too long');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email address');
  }

  if (gstin && !validateGSTIN(gstin)) {
    throw new Error('Invalid GSTIN');
  }

  if (pan && !validatePAN(pan)) {
    throw new Error('Invalid PAN');
  }

  if (pincode && !/^[0-9]{6}$/.test(pincode)) {
    throw new Error('Invalid PIN code');
  }

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE tenants
      SET
        business_name = ?,
        legal_name = ?,
        display_name = ?,
        phone = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        pincode = ?,
        gstin = ?,
        pan = ?,
        logo_path = ?,
        currency = ?,
        timezone = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      legalName,
      legalName,
      displayName,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      gstin,
      pan,
      logoPath,
      currency,
      timezone,
      tenant.id
    );

    return getCurrentTenant(user);
  });

  return update();
}

module.exports = {
  getCompany,
  updateCompany,
  validateGSTIN,
  validatePAN,
};
