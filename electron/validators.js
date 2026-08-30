// validators.js — strict validation for financial data

const VALIDATORS = {
  phone: (value) => {
    if (!value) return { valid: true, error: null };
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 10) return { valid: true, error: null };
    if (cleaned.length === 12 && cleaned.startsWith('91')) return { valid: true, error: null };
    return { valid: false, error: 'Phone must be 10 digits or +91-XXXXXXXXXX' };
  },

  email: (value) => {
    if (!value) return { valid: true, error: null };
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (regex.test(value)) return { valid: true, error: null };
    return { valid: false, error: 'Invalid email format' };
  },

  pan: (value) => {
    if (!value) return { valid: true, error: null };
    // PAN format: 5 letters + 4 numbers + 1 letter (e.g. AAAPA1234C)
    const regex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (regex.test(value)) return { valid: true, error: null };
    return { valid: false, error: 'PAN must be in format: AAAPA1234C (10 chars)' };
  },

  gstin: (value) => {
    if (!value) return { valid: true, error: null };
    // GSTIN format: 15 chars (state code + PAN + entity code + checksum)
    if (value.length === 15 && /^[0-9A-Z]+$/.test(value)) {
      return { valid: true, error: null };
    }
    return { valid: false, error: 'GSTIN must be 15 alphanumeric characters' };
  },

  weight: (value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return { valid: false, error: 'Weight must be > 0' };
    if (num > 50000) return { valid: false, error: 'Weight seems unrealistic (> 50kg)' };
    return { valid: true, error: null };
  },

  rate: (value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return { valid: false, error: 'Rate must be > 0' };
    if (num > 1000000) return { valid: false, error: 'Rate seems unrealistic (> ₹1 lakh/g)' };
    return { valid: true, error: null };
  },

  percentage: (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return { valid: false, error: 'Must be a number' };
    if (num < 0 || num > 100) return { valid: false, error: 'Percentage must be 0-100' };
    return { valid: true, error: null };
  },

  amount: (value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return { valid: false, error: 'Amount must be >= 0' };
    if (num > 10000000) return { valid: false, error: 'Amount seems unrealistic (> ₹1 crore)' };
    return { valid: true, error: null };
  },
};

module.exports = VALIDATORS;
