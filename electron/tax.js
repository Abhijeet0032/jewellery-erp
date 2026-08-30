// tax.js — Complete GST calculation engine with proper making charge handling

const GST_RATES = {
  gold_jewellery: { rate: 3, hsn: '7113' },
  making_charges: { rate: 5, hsn: '9988' },
  loose_stones: { rate: 0.25, hsn: '7102' },
  loose_gemstones: { rate: 3, hsn: '7103' },
};

/**
 * CRITICAL: Determines inter-state vs intra-state based on branch and customer GSTIN
 */
function isInterState(branchStateCode, customerGstin) {
  if (!customerGstin || customerGstin.length < 2) return false;
  const customerStateCode = customerGstin.substring(0, 2);
  return customerStateCode !== branchStateCode;
}

/**
 * Calculate making charge based on type
 * @param {number} metalValue - metal component value (net_weight * rate_per_gram)
 * @param {number} makingChargeValue - the value field from the line
 * @param {string} makingChargeType - 'fixed' | 'per_gram' | 'percentage'
 * @param {number} netWeight - for per_gram calculation
 * @returns {number} calculated making charge
 */
function calculateMakingCharge(metalValue, makingChargeValue, makingChargeType, netWeight) {
  if (!makingChargeType || makingChargeValue === undefined) return 0;

  const value = parseFloat(makingChargeValue) || 0;
  const metal = parseFloat(metalValue) || 0;
  const weight = parseFloat(netWeight) || 0;

  switch (makingChargeType) {
    case 'fixed':
      return round2(value);
    case 'per_gram':
      return round2(value * weight);
    case 'percentage':
      return round2(metal * (value / 100));
    default:
      return 0;
  }
}

/**
 * Calculate tax for a single line item
 * IMPORTANT: metal and making charge are taxed separately
 */
function calculateLineTax({ metalValue, makingCharge, lineType = 'gold_jewellery', interState }) {
  const metalRule = GST_RATES[lineType] || GST_RATES.gold_jewellery;
  const makingRule = GST_RATES.making_charges;

  const taxableMetal = round2(metalValue);
  const taxableMaking = round2(makingCharge);
  const taxableValue = round2(taxableMetal + taxableMaking);

  // Metal tax
  const metalTax = round2(taxableMetal * (metalRule.rate / 100));
  // Making charge tax
  const makingTax = round2(taxableMaking * (makingRule.rate / 100));
  const totalTaxAmount = round2(metalTax + makingTax);

  let cgst = 0, sgst = 0, igst = 0;
  if (interState) {
    igst = totalTaxAmount;
  } else {
    cgst = round2(totalTaxAmount / 2);
    sgst = round2(totalTaxAmount / 2);
  }

  return {
    hsn_code: metalRule.hsn,
    taxable_value: taxableValue,
    cgst_rate: interState ? 0 : metalRule.rate / 2,
    sgst_rate: interState ? 0 : metalRule.rate / 2,
    igst_rate: interState ? metalRule.rate : 0,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    line_total: round2(taxableValue + cgst + sgst + igst),
  };
}

/**
 * Sum invoice items to final totals
 * Round-off is applied ONLY to the final grand total, never intermediate values
 */
function summarizeInvoice(lineItems, discount = 0, oldGoldExchangeValue = 0) {
  const subtotal = round2(sum(lineItems.map(l => l.taxable_value)));
  const cgst = round2(sum(lineItems.map(l => l.cgst_amount)));
  const sgst = round2(sum(lineItems.map(l => l.sgst_amount)));
  const igst = round2(sum(lineItems.map(l => l.igst_amount)));

  const discountAmount = round2(discount);
  const taxableValue = round2(subtotal - discountAmount);
  const oldGoldAmount = round2(oldGoldExchangeValue);
  
  const preRoundTotal = round2(taxableValue + cgst + sgst + igst - oldGoldAmount);
  const grandTotal = Math.round(preRoundTotal); // Round to nearest rupee
  const roundOff = round2(grandTotal - preRoundTotal);

  return {
    subtotal,
    discount: discountAmount,
    taxable_value: taxableValue,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    old_gold_exchange_value: oldGoldAmount,
    round_off: roundOff,
    grand_total: grandTotal,
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

module.exports = {
  GST_RATES,
  isInterState,
  calculateMakingCharge,
  calculateLineTax,
  summarizeInvoice,
};
