import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = {
  sku: '', barcode: '', huid: '', name: '', category: 'ring',
  metal: 'gold', purity: '22K', gross_weight: '', stone_weight: '',
  stone_details: '', making_charge_type: 'per_gram', making_charge_value: '',
  wastage_percent: '', hsn_code: '7113',
};

export default function ItemMaster() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const rows = await window.erp.items.list(currentUser.id);
    setItems(rows);
  }

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        gross_weight: parseFloat(form.gross_weight) || 0,
        stone_weight: parseFloat(form.stone_weight) || 0,
        making_charge_value: parseFloat(form.making_charge_value) || 0,
        wastage_percent: parseFloat(form.wastage_percent) || 0,
      };
      // Uses the actual signed-in user's id and branch now that Login is built.
      await window.erp.items.create({ ...payload, branch_id: currentUser.branch_id }, currentUser.id);
      setForm(EMPTY_FORM);
      await loadItems();
    } catch (err) {
      alert('Could not save item: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport(format) {
    const path = await window.erp.exportTable('items', format, currentUser.id);
    alert(`Exported to: ${path}`);
  }

  return (
    <div className="main-panel">
      <h1 className="page-title">Item Master</h1>
      <p className="page-sub">Every piece of stock starts here — weight, purity, and making charge feed directly into billing.</p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field"><label>SKU</label><input required value={form.sku} onChange={e => update('sku', e.target.value)} /></div>
          <div className="field"><label>Barcode</label><input value={form.barcode} onChange={e => update('barcode', e.target.value)} /></div>
          <div className="field"><label>HUID</label><input value={form.huid} onChange={e => update('huid', e.target.value)} /></div>

          <div className="field"><label>Item Name</label><input required value={form.name} onChange={e => update('name', e.target.value)} /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={e => update('category', e.target.value)}>
              <option value="ring">Ring</option><option value="chain">Chain</option>
              <option value="bangle">Bangle</option><option value="earring">Earring</option>
              <option value="necklace">Necklace</option><option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Metal</label>
            <select value={form.metal} onChange={e => update('metal', e.target.value)}>
              <option value="gold">Gold</option><option value="silver">Silver</option><option value="platinum">Platinum</option>
            </select>
          </div>

          <div className="field"><label>Purity</label><input required placeholder="e.g. 22K" value={form.purity} onChange={e => update('purity', e.target.value)} /></div>
          <div className="field"><label>Gross Weight (g)</label><input required type="number" step="0.001" value={form.gross_weight} onChange={e => update('gross_weight', e.target.value)} /></div>
          <div className="field"><label>Stone Weight (g)</label><input type="number" step="0.001" value={form.stone_weight} onChange={e => update('stone_weight', e.target.value)} /></div>

          <div className="field"><label>Stone Details</label><input value={form.stone_details} onChange={e => update('stone_details', e.target.value)} /></div>
          <div className="field">
            <label>Making Charge Type</label>
            <select value={form.making_charge_type} onChange={e => update('making_charge_type', e.target.value)}>
              <option value="per_gram">Per Gram</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option>
            </select>
          </div>
          <div className="field"><label>Making Charge Value</label><input type="number" step="0.01" value={form.making_charge_value} onChange={e => update('making_charge_value', e.target.value)} /></div>

          <div className="field"><label>Wastage %</label><input type="number" step="0.01" value={form.wastage_percent} onChange={e => update('wastage_percent', e.target.value)} /></div>
          <div className="field"><label>HSN Code</label><input value={form.hsn_code} onChange={e => update('hsn_code', e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Item'}</button>
        </div>
      </form>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong>Stock ({items.length})</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleExport('csv')}>Export CSV</button>
            <button onClick={() => handleExport('xlsx')}>Export Excel</button>
            <button onClick={() => handleExport('json')}>Export JSON</button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Name</th><th>Category</th><th>Purity</th>
              <th className="num">Gross (g)</th><th className="num">Net (g)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.purity}</td>
                <td className="num">{item.gross_weight.toFixed(3)}</td>
                <td className="num">{item.net_weight.toFixed(3)}</td>
                <td><span className={`pill ${item.status}`}>{item.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888', padding: 24 }}>No items yet — add your first piece above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
