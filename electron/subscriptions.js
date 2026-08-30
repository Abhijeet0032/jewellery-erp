// subscriptions.js — tenant subscription and feature entitlement enforcement.
// Subscription state is tenant-scoped. Plan/feature definitions are shared configuration.
// Never trust the renderer for tenant identity; callers must provide an authenticated user.
const { db } = require('./db');

const ACTIVE_STATUSES = new Set(['trial', 'active', 'grace']);

function getSubscription(user) {
  if (!user || !user.tenant_id) throw new Error('Not authorized: tenant is required');

  const subscription = db.prepare(`
    SELECT ts.*, sp.plan_code, sp.name AS plan_name, sp.description AS plan_description,
           sp.limits_json, sp.active AS plan_active
    FROM tenant_subscriptions ts
    JOIN subscription_plans sp ON sp.id = ts.plan_id
    WHERE ts.tenant_id = ?
  `).get(user.tenant_id);

  if (!subscription) throw new Error('Subscription not configured for this retailer');
  return subscription;
}

function isSubscriptionActive(subscription, now = new Date()) {
  if (!subscription || !subscription.plan_active || !ACTIVE_STATUSES.has(subscription.status)) return false;
  if (subscription.expires_at) {
    const expiry = new Date(String(subscription.expires_at).replace(' ', 'T') + (String(subscription.expires_at).endsWith('Z') ? '' : 'Z'));
    if (!Number.isNaN(expiry.getTime()) && expiry <= now) return false;
  }
  return true;
}

function getEntitlements(user) {
  const subscription = getSubscription(user);
  const active = isSubscriptionActive(subscription);
  const rows = db.prepare(`
    SELECT f.feature_key, f.name, f.description, f.active,
           COALESCE(pf.enabled, 0) AS plan_enabled,
           tfo.enabled AS override_enabled,
           tfo.expires_at AS override_expires_at
    FROM features f
    LEFT JOIN plan_features pf ON pf.feature_id = f.id AND pf.plan_id = ?
    LEFT JOIN tenant_feature_overrides tfo ON tfo.feature_id = f.id AND tfo.tenant_id = ?
    ORDER BY f.name
  `).all(subscription.plan_id, user.tenant_id);

  const now = new Date();
  const features = rows.map(row => {
    let enabled = active && !!row.active && !!row.plan_enabled;
    if (row.override_enabled !== null && row.override_enabled !== undefined) {
      let overrideValid = true;
      if (row.override_expires_at) {
        const expiry = new Date(String(row.override_expires_at).replace(' ', 'T') + (String(row.override_expires_at).endsWith('Z') ? '' : 'Z'));
        overrideValid = Number.isNaN(expiry.getTime()) || expiry > now;
      }
      if (overrideValid) enabled = active && !!row.active && !!row.override_enabled;
    }
    return {
      feature_key: row.feature_key,
      name: row.name,
      description: row.description,
      enabled,
    };
  });

  return {
    subscription: {
      id: subscription.id,
      plan_code: subscription.plan_code,
      plan_name: subscription.plan_name,
      status: subscription.status,
      starts_at: subscription.starts_at,
      expires_at: subscription.expires_at,
      active,
    },
    features,
  };
}

function requireFeature(user, featureKey) {
  const key = String(featureKey || '').trim();
  if (!key) throw new Error('Feature key is required');
  const entitlement = getEntitlements(user);
  const feature = entitlement.features.find(f => f.feature_key === key);
  if (!feature || !feature.enabled) {
    throw new Error(`Feature "${key}" is not enabled for this retailer`);
  }
  return feature;
}

function getLimits(user) {
  const subscription = getSubscription(user);
  let limits = {};
  try {
    limits = JSON.parse(subscription.limits_json || '{}');
  } catch (_) {
    throw new Error('Subscription limits are invalid');
  }
  return { ...limits };
}

function requireLimit(user, limitKey, currentValue) {
  const key = String(limitKey || '').trim();
  if (!key) throw new Error('Limit key is required');
  const limits = getLimits(user);
  const max = Number(limits[key]);
  if (!Number.isFinite(max) || max < 0) return true;
  const current = Number(currentValue);
  if (!Number.isFinite(current)) throw new Error(`Current value for "${key}" is invalid`);
  if (current >= max) throw new Error(`Subscription limit reached for "${key}" (${max})`);
  return true;
}

module.exports = {
  getSubscription,
  isSubscriptionActive,
  getEntitlements,
  requireFeature,
  getLimits,
  requireLimit,
};
