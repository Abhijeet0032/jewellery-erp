import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const BLANK_LINE = () => ({
  key: Math.random().toString(36).slice(2),
  item_id: null, description: '', hsn_code: '7113', qty: 1,
  gross_weight: '', stone_weight: '', net_weight: '', rate_per_gram: '',
  making_charge: '', making_charge_type: 'fixed', lineType: 'gold_jewellery',
});

export default function Billing() {
  const { currentUser } = useAuth();
  const [roles, setRoles] = useState({});
  const [rateForm, setRateForm] = useState({ metal: 'gold', purity: '22K', rate_per_gram: '' });
  const [savingRate, setSavingRate] = useState(false);
  const [docType, setDocType] = useState('estimate');
  const [stockItems, setStockItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [rates, setRates] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ 
    name: '', phone: '', email: '', address: '', pan: '', gstin: '',
    birthday: '', subscribe_marketing: false 
  });
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemSearchResults, setItemSearchResults] = useState([]);
  const [lines, setLines] = useState([BLANK_LINE()]);
  const [discount, setDiscount] = useState('');
  const [oldGoldExchangeValue, setOldGoldExchangeValue] = useState('');
  const [autoCalcOldGold, setAutoCalcOldGold] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [convertedFromEstimateId, setConvertedFromEstimateId] = useState(null);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [lastCreated, setLastCreated] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [printMode, setPrintMode] = useState(null); // 'preview', 'thermal', 'a4'

  useEffect(() => { 
    loadReferenceData(); 
    loadRecent(); 
    window.erp.auth.roles().then(setRoles); 
  }, []);

  // Search customers as user types
  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    const q = customerSearch.toLowerCase();
    const filtered = customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.phone?.includes(q) ||
      c.email?.includes(q)
    );
    setCustomerSearchResults(filtered.slice(0, 5));
  }, [customerSearch]);

  // Search items as user types
  useEffect(() => {
    if (itemSearch.trim().length < 2) {
      setItemSearchResults([]);
      return;
    }
    const q = itemSearch.toLowerCase();
    const filtered = stockItems.filter(i => 
      i.sku.toLowerCase().includes(q) || 
      i.name.toLowerCase().includes(q)
    );
    setItemSearchResults(filtered.slice(0, 8));
  }, [itemSearch]);

  async function loadReferenceData() {
    const [items, custs, rateList] = await Promise.all([
      window.erp.items.list(currentUser.id),
      window.erp.customers.list(currentUser.id),
      window.erp.rates.latest(currentUser.id),
    ]);
    setStockItems(items.filter(i => i.status === 'in_stock'));
    setCustomers(custs);
    setRates(rateList);
  }

  async function loadRecent() {
    const all = await window.erp.invoices.list(undefined, currentUser.id);
    setRecentInvoices(all.slice(0, 8));
  }

  function findRate(metal, purity) {
    const match = rates.find(r => r.metal === metal && r.purity === purity);
    return match ? match.rate_per_gram : '';
  }

  function selectCustomer(cust) {
    setCustomerId(cust.id);
    setCustomerData(cust);
    setCustomerSearch('');
    setCustomerSearchResults([]);
    // Auto-calculate old gold exchange if enabled
    if (autoCalcOldGold && cust.old_gold_history) {
      // TODO: fetch customer's previous old gold value
    }
  }

  function updateLine(key, field, value) {
    setLines(ls => ls.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      if (field === 'gross_weight' || field === 'stone_weight') {
        const gross = parseFloat(field === 'gross_weight' ? value : l.gross_weight) || 0;
        const stone = parseFloat(field === 'stone_weight' ? value : l.stone_weight) || 0;
        updated.net_weight = Math.max(gross - stone, 0).toFixed(3);
      }
      // Auto-calculate making charge based on type
      if (field === 'making_charge_type' && l.net_weight && l.rate_per_gram) {
        const net = parseFloat(l.net_weight) || 0;
        const rate = parseFloat(l.rate_per_gram) || 0;
        const metalValue = net * rate;
        if (value === 'percentage') {
          // Default 10% making charge
          updated.making_charge = (metalValue * 0.1).toFixed(2);
        }
      }
      return updated;
    }));
  }

  function pickStockItem(key, itemId) {
    const item = stockItems.find(i => i.id === itemId);
    if (!item) return;
    const rate = findRate(item.metal, item.purity);
    let makingCharge = item.making_charge_value || 0;
    if (item.making_charge_type === 'per_gram' && item.net_weight) {
      makingCharge = (item.making_charge_value * item.net_weight).toFixed(2);
    }
    setLines(ls => ls.map(l => l.key !== key ? l : {
      ...l,
      item_id: item.id,
      description: item.name,
      hsn_code: item.hsn_code,
      gross_weight: item.gross_weight,
      stone_weight: item.stone_weight,
      net_weight: item.net_weight,
      rate_per_gram: rate || l.rate_per_gram,
      making_charge: makingCharge,
      making_charge_type: item.making_charge_type,
    }));
    setItemSearch('');
    setItemSearchResults([]);
  }

  function addLine() { setLines(ls => [...ls, BLANK_LINE()]); }
  function removeLine(key) { setLines(ls => ls.filter(l => l.key !== key)); }

  const runPreview = useCallback(async () => {
    const validLines = lines.filter(l => l.net_weight && l.rate_per_gram);
    if (validLines.length === 0) { setPreview(null); return; }
    try {
      const result = await window.erp.invoices.preview({
        customerId: customerId || null,
        branchId: currentUser.branch_id,
        lines: validLines.map(toLinePayload),
        discount: parseFloat(discount) || 0,
        oldGoldExchangeValue: parseFloat(oldGoldExchangeValue) || 0,
        userId: currentUser.id,
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
    }
  }, [lines, discount, oldGoldExchangeValue, customerId]);

  useEffect(() => { runPreview(); }, [runPreview]);

  function toLinePayload(l) {
    return {
      item_id: l.item_id, description: l.description || 'Item', hsn_code: l.hsn_code, qty: l.qty || 1,
      gross_weight: parseFloat(l.gross_weight) || 0, net_weight: parseFloat(l.net_weight) || 0,
      rate_per_gram: parseFloat(l.rate_per_gram) || 0, making_charge: parseFloat(l.making_charge) || 0,
      lineType: l.lineType,
    };
  }

  async function handleAddCustomer() {
    if (!newCustomer.name) return;
    const { id } = await window.erp.customers.create(newCustomer, currentUser.id);
    await loadReferenceData();
    selectCustomer({ id, ...newCustomer });
    setShowNewCustomer(false);
    setNewCustomer({ name: '', phone: '', email: '', address: '', pan: '', gstin: '', birthday: '', subscribe_marketing: false });
  }

  async function handleSubmit() {
    setErrorMsg(null);
    const validLines = lines.filter(l => l.net_weight && l.rate_per_gram);
    if (validLines.length === 0) { setErrorMsg('Add at least one line with weight and rate.'); return; }
    setSaving(true);
    try {
      const result = await window.erp.invoices.create({
        docType,
        customerId: customerId || null,
        branchId: currentUser.branch_id,
        lines: validLines.map(toLinePayload),
        discount: parseFloat(discount) || 0,
        oldGoldExchangeValue: parseFloat(oldGoldExchangeValue) || 0,
        convertedFromEstimateId,
        userId: currentUser.id,
      });
      setLastCreated(result);
      setPrintMode('preview'); // Auto-open print preview
      setLines([BLANK_LINE()]);
      setDiscount(''); setOldGoldExchangeValue(''); setConvertedFromEstimateId(null);
      await loadReferenceData(); await loadRecent();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function convertToTaxInvoice(invoiceId) {
    const full = await window.erp.invoices.getWithLines(invoiceId, currentUser.id);
    setDocType('tax_invoice');
    setCustomerId(full.customer_id || '');
    setConvertedFromEstimateId(full.id);
    setDiscount(full.discount || '');
    setOldGoldExchangeValue(full.old_gold_exchange_value || '');
    setLines(full.line_items.map(li => ({
      key: Math.random().toString(36).slice(2),
      item_id: li.item_id, description: li.description, hsn_code: li.hsn_code, qty: li.qty,
      gross_weight: li.gross_weight, stone_weight: 0, net_weight: li.net_weight,
      rate_per_gram: li.rate_per_gram, making_charge: li.making_charge, 
      making_charge_type: 'fixed', lineType: 'gold_jewellery',
    })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSetRate() {
    if (!rateForm.rate_per_gram) return;
    setSavingRate(true);
    try {
      await window.erp.rates.set(rateForm.metal, rateForm.purity, parseFloat(rateForm.rate_per_gram), currentUser.id);
      setRateForm({ metal: 'gold', purity: '22K', rate_per_gram: '' });
      await loadReferenceData();
      // Auto-apply rate to all lines with matching metal/purity
      setLines(ls => ls.map(l => {
        const net = parseFloat(l.net_weight) || 0;
        const oldRate = parseFloat(l.rate_per_gram) || 0;
        if ((l.description.toLowerCase().includes(rateForm.metal) || !l.rate_per_gram) && net > 0) {
          return { ...l, rate_per_gram: parseFloat(rateForm.rate_per_gram).toFixed(2) };
        }
        return l;
      }));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingRate(false);
    }
  }

  // Print functions
  function printThermal() {
    if (!lastCreated || !preview) return;
    const w = window.open('', '', 'width=400,height=600');
    w.document.write(`
      <style>
        body { font-family: monospace; font-size: 12px; margin: 0; padding: 10px; }
        .header { text-align: center; font-weight: bold; margin-bottom: 10px; }
        .line { display: flex; justify-content: space-between; }
        .total { border-top: 2px solid #000; font-weight: bold; margin-top: 10px; }
      </style>
      <div class="header">JEWELLERY BILL</div>
      <div>${lastCreated.invoice_number || 'Estimate'}</div>
      <div>${new Date().toLocaleString()}</div>
      <div style="margin: 10px 0; border-top: 1px solid #000;"></div>
    `);
    preview.lines.forEach(line => {
      w.document.write(`<div class="line"><span>${line.description}</span><span>₹${line.line_total.toFixed(2)}</span></div>`);
    });
    w.document.write(`
      <div style="margin: 10px 0; border-top: 1px solid #000;"></div>
      <div class="line"><span>TOTAL</span><span>₹${preview.totals.grand_total.toFixed(2)}</span></div>
      <div style="text-align: center; margin-top: 20px; font-size: 10px;">Thank you!</div>
    `);
    w.document.close();
    w.print();
  }

  function printA4() {
    if (!lastCreated || !preview) return;
    const w = window.open('', '', 'width=800,height=1000');
    w.document.write(`
      <style>
        @media print { body { margin: 0; } }
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        .total { font-weight: bold; font-size: 16px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; }
      </style>
      <div class="header">TAX INVOICE</div>
      <div><strong>${lastCreated.invoice_number || 'Estimate'}</strong></div>
      <div>Date: ${new Date().toLocaleDateString()}</div>
      ${customerData ? `<div><strong>Customer:</strong> ${customerData.name}</div>` : ''}
      <table>
        <tr><th>Description</th><th style="text-align:right">Weight</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr>
    `);
    preview.lines.forEach(line => {
      w.document.write(`
        <tr>
          <td>${line.description}</td>
          <td style="text-align:right">${line.net_weight.toFixed(3)}g</td>
          <td style="text-align:right">₹${line.rate_per_gram.toFixed(2)}</td>
          <td style="text-align:right">₹${line.line_total.toFixed(2)}</td>
        </tr>
      `);
    });
    w.document.write(`</table>`);
    w.document.write(`
      <div style="margin-top: 20px;">
        <div style="display: flex; justify-content: space-between; border-top: 1px solid #000; padding-top: 10px;">
          <span>Subtotal:</span><span>₹${preview.totals.subtotal.toFixed(2)}</span>
        </div>
        ${preview.totals.discount > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Discount:</span><span>-₹${preview.totals.discount.toFixed(2)}</span></div>` : ''}
        <div style="display: flex; justify-content: space-between;"><span>Taxable Value:</span><span>₹${preview.totals.taxable_value.toFixed(2)}</span></div>
        ${preview.interState 
          ? `<div style="display: flex; justify-content: space-between;"><span>IGST:</span><span>₹${preview.totals.igst_amount.toFixed(2)}</span></div>`
          : `
            <div style="display: flex; justify-content: space-between;"><span>CGST:</span><span>₹${preview.totals.cgst_amount.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>SGST:</span><span>₹${preview.totals.sgst_amount.toFixed(2)}</span></div>
          `
        }
        <div class="total" style="display: flex; justify-content: space-between; border-top: 2px solid #000; margin-top: 10px; padding-top: 10px;">
          <span>GRAND TOTAL:</span><span>₹${preview.totals.grand_total.toFixed(2)}</span>
        </div>
      </div>
      <div class="footer">
        <p>This is a computer generated invoice. No signature required.</p>
      </div>
    `);
    w.document.close();
    w.print();
  }

  if (printMode) {
    return (
      <div className="main-panel">
        <h1 className="page-title">Print Bill</h1>
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <button className="primary" onClick={() => { printThermal(); setPrintMode(null); }} style={{ marginRight: 10 }}>Print Thermal (POS)</button>
            <button className="primary" onClick={() => { printA4(); setPrintMode(null); }}>Print A4 (GST)</button>
            <button onClick={() => setPrintMode(null)} style={{ marginLeft: 10 }}>Close</button>
          </div>
          {lastCreated && preview && (
            <div style={{ padding: 20, background: 'var(--paper)', borderRadius: 8 }}>
              <h3>{lastCreated.invoice_number || 'Estimate'}</h3>
              {preview.lines.map(l => (
                <div key={l.key} style={{ marginBottom: 8 }}>
                  {l.description}: {l.net_weight.toFixed(3)}g @ ₹{l.rate_per_gram.toFixed(2)}/g + ₹{l.making_charge.toFixed(2)} = ₹{l.line_total.toFixed(2)}
                </div>
              ))}
              <div style={{ marginTop: 15, borderTop: '2px solid var(--ink)', paddingTop: 10 }}>
                <strong>Grand Total: ₹{preview.totals.grand_total.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="main-panel">
      <h1 className="page-title">Billing</h1>
      <p className="page-sub">Estimates (no tax) or Tax Invoices with GST, auto-print options, full customer data.</p>

      {roles[currentUser.role]?.canSetRates && (
        <div className="card">
          <strong>Today's Rate</strong>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {rates.map(r => (
              <div key={r.metal + r.purity} style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                {r.metal} {r.purity}: <strong style={{ color: 'var(--ink)' }}>₹{r.rate_per_gram.toFixed(2)}/g</strong>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Metal</label>
              <select value={rateForm.metal} onChange={e => setRateForm(f => ({ ...f, metal: e.target.value }))}>
                <option value="gold">Gold</option><option value="silver">Silver</option><option value="platinum">Platinum</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Purity</label>
              <input value={rateForm.purity} onChange={e => setRateForm(f => ({ ...f, purity: e.target.value }))} style={{ width: 80 }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Rate/gram (₹)</label>
              <input type="number" step="0.01" value={rateForm.rate_per_gram} onChange={e => setRateForm(f => ({ ...f, rate_per_gram: e.target.value }))} style={{ width: 110 }} />
            </div>
            <button className="primary" type="button" onClick={handleSetRate} disabled={savingRate}>Update Rate</button>
          </div>
        </div>
      )}

      {lastCreated && (
        <div className="card" style={{ borderColor: 'var(--emerald)', background: '#F2F7F4' }}>
          <strong>{lastCreated.invoice_number ? `Tax Invoice ${lastCreated.invoice_number}` : 'Estimate'} created</strong> — grand total ₹{lastCreated.grand_total.toFixed(2)}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 20, marginBottom: 18, alignItems: 'center' }}>
          <label style={{ marginBottom: 0 }}>
            <input type="radio" checked={docType === 'estimate'} onChange={() => setDocType('estimate')} /> Estimate
          </label>
          <label style={{ marginBottom: 0 }}>
            <input type="radio" checked={docType === 'tax_invoice'} onChange={() => setDocType('tax_invoice')} /> Tax Invoice
          </label>
          {convertedFromEstimateId && <span className="pill sold">Converting from estimate</span>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label>Customer</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input 
              type="text" 
              placeholder="Search by name, phone, email..." 
              value={customerSearch} 
              onChange={e => setCustomerSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => setShowNewCustomer(s => !s)}>+ New</button>
          </div>
          {customerSearch && customerSearchResults.length > 0 && (
            <div style={{ background: 'var(--paper)', borderRadius: 6, marginBottom: 8, maxHeight: 200, overflow: 'auto' }}>
              {customerSearchResults.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                  <strong>{c.name}</strong> {c.phone && `(${c.phone})`}
                </div>
              ))}
            </div>
          )}
          {customerId && customerData && (
            <div style={{ padding: 10, background: 'var(--brass-soft)', borderRadius: 6, marginBottom: 10 }}>
              <strong>{customerData.name}</strong><br/>
              {customerData.phone && `Phone: ${customerData.phone}`}<br/>
              {customerData.email && `Email: ${customerData.email}`}<br/>
              {customerData.address && `Address: ${customerData.address}`}
              {customerData.birthday && (
                <div style={{ marginTop: 5, color: 'var(--ledger-red)', fontWeight: 'bold' }}>🎂 Birthday: {customerData.birthday}</div>
              )}
              <button onClick={() => { setCustomerId(''); setCustomerData(null); }} style={{ marginTop: 8, fontSize: '0.8rem' }}>Clear</button>
            </div>
          )}
        </div>

        {showNewCustomer && (
          <div className="card" style={{ background: 'var(--paper)', marginBottom: 14 }}>
            <strong>Add New Customer</strong>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <div className="field"><label>Name *</label><input required value={newCustomer.name} onChange={e => setNewCustomer(c => ({ ...c, name: e.target.value }))} /></div>
              <div className="field"><label>Phone</label><input value={newCustomer.phone} onChange={e => setNewCustomer(c => ({ ...c, phone: e.target.value }))} /></div>
              <div className="field"><label>Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer(c => ({ ...c, email: e.target.value }))} /></div>
              <div className="field"><label>Address</label><input value={newCustomer.address} onChange={e => setNewCustomer(c => ({ ...c, address: e.target.value }))} /></div>
              <div className="field"><label>PAN</label><input value={newCustomer.pan} onChange={e => setNewCustomer(c => ({ ...c, pan: e.target.value }))} /></div>
              <div className="field"><label>GSTIN</label><input value={newCustomer.gstin} onChange={e => setNewCustomer(c => ({ ...c, gstin: e.target.value }))} /></div>
              <div className="field"><label>Birthday</label><input type="date" value={newCustomer.birthday} onChange={e => setNewCustomer(c => ({ ...c, birthday: e.target.value }))} /></div>
              <div className="field"><label><input type="checkbox" checked={newCustomer.subscribe_marketing} onChange={e => setNewCustomer(c => ({ ...c, subscribe_marketing: e.target.checked }))} /> Marketing emails</label></div>
            </div>
            <button className="primary" onClick={handleAddCustomer} style={{ marginTop: 12 }}>Save Customer</button>
            <button onClick={() => setShowNewCustomer(false)} style={{ marginLeft: 8 }}>Cancel</button>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label>Item Search</label>
          <input 
            type="text" 
            placeholder="Search stock by SKU or name..." 
            value={itemSearch} 
            onChange={e => setItemSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 6 }}
          />
          {itemSearch && itemSearchResults.length > 0 && (
            <div style={{ background: 'var(--paper)', borderRadius: 6, maxHeight: 150, overflow: 'auto' }}>
              {itemSearchResults.map(item => (
                <div key={item.id} onClick={() => pickStockItem(lines[lines.length - 1]?.key || BLANK_LINE().key, item.id)} 
                  style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                  <strong>{item.sku}</strong> - {item.name} ({item.purity}, {item.net_weight}g)
                </div>
              ))}
            </div>
          )}
        </div>

        <table className="data-table" style={{ marginBottom: 12, fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th>Description</th><th className="num">Gross</th><th className="num">Stone</th>
              <th className="num">Net</th><th className="num">Rate</th><th>Making Type</th><th className="num">Making</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.key}>
                <td>
                  <input value={l.description} onChange={e => updateLine(l.key, 'description', e.target.value)} style={{ width: '100%', minWidth: 100 }} />
                </td>
                <td><input className="num" type="number" step="0.001" value={l.gross_weight} onChange={e => updateLine(l.key, 'gross_weight', e.target.value)} style={{ width: 60 }} /></td>
                <td><input className="num" type="number" step="0.001" value={l.stone_weight} onChange={e => updateLine(l.key, 'stone_weight', e.target.value)} style={{ width: 50 }} /></td>
                <td className="num">{l.net_weight || '—'}</td>
                <td><input className="num" type="number" step="0.01" value={l.rate_per_gram} onChange={e => updateLine(l.key, 'rate_per_gram', e.target.value)} style={{ width: 70 }} /></td>
                <td>
                  <select value={l.making_charge_type} onChange={e => updateLine(l.key, 'making_charge_type', e.target.value)} style={{ width: '100%' }}>
                    <option value="fixed">Fixed</option>
                    <option value="per_gram">Per gram</option>
                    <option value="percentage">%</option>
                  </select>
                </td>
                <td><input className="num" type="number" step="0.01" value={l.making_charge} onChange={e => updateLine(l.key, 'making_charge', e.target.value)} style={{ width: 70 }} /></td>
                <td><button type="button" onClick={() => removeLine(l.key)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addLine}>+ Add Line</button>

        <div className="form-grid" style={{ marginTop: 18 }}>
          <div className="field"><label>Discount (₹)</label><input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
          <div className="field"><label>Old Gold Exchange (₹)</label><input type="number" step="0.01" value={oldGoldExchangeValue} onChange={e => setOldGoldExchangeValue(e.target.value)} /></div>
          <div className="field"><label><input type="checkbox" checked={autoCalcOldGold} onChange={e => setAutoCalcOldGold(e.target.checked)} /> Auto-calculate from history</label></div>
        </div>

        {preview && (
          <div style={{ marginTop: 18, padding: 16, background: 'var(--paper)', borderRadius: 8 }}>
            <Row label="Subtotal" value={preview.totals.subtotal} />
            {preview.totals.discount > 0 && <Row label="Discount" value={-preview.totals.discount} />}
            <Row label="Taxable Value" value={preview.totals.taxable_value} />
            {preview.interState
              ? <Row label="IGST" value={preview.totals.igst_amount} />
              : <>
                  <Row label="CGST" value={preview.totals.cgst_amount} />
                  <Row label="SGST" value={preview.totals.sgst_amount} />
                </>}
            {preview.totals.old_gold_exchange_value > 0 && <Row label="Old Gold Exchange" value={-preview.totals.old_gold_exchange_value} />}
            {preview.totals.round_off !== 0 && <Row label="Round Off" value={preview.totals.round_off} />}
            <div style={{ borderTop: '2px solid var(--ink)', marginTop: 8, paddingTop: 8 }}>
              <Row label="Grand Total" value={preview.totals.grand_total} bold />
            </div>
          </div>
        )}

        {errorMsg && <p style={{ color: 'var(--ledger-red)', marginTop: 12 }}>{errorMsg}</p>}
        <div style={{ marginTop: 18 }}>
          <button className="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : docType === 'estimate' ? 'Create Estimate' : 'Issue Tax Invoice'}
          </button>
        </div>
      </div>

      <div className="card">
        <strong>Recent ({recentInvoices.length})</strong>
        <table className="data-table" style={{ marginTop: 12, fontSize: '0.85rem' }}>
          <thead><tr><th>Doc</th><th>Type</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {recentInvoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.invoice_number || `Est ${inv.id.slice(0, 6)}`}</td>
                <td><span className={`pill ${inv.doc_type === 'tax_invoice' ? 'in_stock' : 'sold'}`}>{inv.doc_type.replace('_', ' ')}</span></td>
                <td className="num">₹{inv.grand_total.toFixed(2)}</td>
                <td>{inv.payment_status}</td>
                <td>
                  {inv.doc_type === 'estimate' && (
                    <button onClick={() => convertToTaxInvoice(inv.id)} style={{ fontSize: '0.75rem' }}>→ Tax Invoice</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? '1.05rem' : '0.9rem', fontWeight: bold ? 700 : 400, padding: '3px 0' }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>₹{Number(value).toFixed(2)}</span>
    </div>
  );
}
