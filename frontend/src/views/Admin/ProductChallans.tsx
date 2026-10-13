import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Search, FileText, Truck, Ban, Download, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { Lead, Product, ProductChallan, ProductChallanItem } from '../../types';
import { productChallanService, type ProductChallanFilters } from '../../services/productChallanService';
import { productService } from '../../services/productService';
import { leadService } from '../../services/leadService';
import { useAuthStore } from '../../store/authStore';
import { generateProductChallanPdf, openPdfBlob } from '../../services/installationPdfService';

const PAGE_SIZE = 20;

export const ProductChallans: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // list state
  const [items, setItems] = useState<ProductChallan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProductChallanFilters>({});
  const [filterDraft, setFilterDraft] = useState<ProductChallanFilters>({});

  const loadList = async (p = page, f = filters) => {
    const { items, total } = await productChallanService.getProductChallans({ page: p, pageSize: PAGE_SIZE, filters: f });
    setItems(items);
    setTotal(total);
  };

  useEffect(() => {
    productService.getProducts().then(all => setProducts(all.filter(p => p.category === 'solar_water_heater')));
    leadService.getLeads().then(setLeads).catch(() => {});
    loadList(1, {});
    const h = () => loadList();
    window.addEventListener('app-realtime-update', h);
    return () => window.removeEventListener('app-realtime-update', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open create modal if navigated with ?create=1
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowCreate(true);
    }
  }, [searchParams]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" /> Product Challans
          </h1>
          <p className="text-xs text-slate-500 font-semibold">Solar Water Heater & product delivery challans</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Challan
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-600 font-extrabold text-xs">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <input placeholder="Customer name" className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50"
            value={filterDraft.customerName || ''} onChange={e => setFilterDraft(d => ({ ...d, customerName: e.target.value }))} />
          <input placeholder="Challan No (SWH-...)" className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50"
            value={filterDraft.challanNo || ''} onChange={e => setFilterDraft(d => ({ ...d, challanNo: e.target.value }))} />
          <input type="date" title="From date" className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50"
            value={filterDraft.dateFrom || ''} onChange={e => setFilterDraft(d => ({ ...d, dateFrom: e.target.value }))} />
          <input type="date" title="To date" className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50"
            value={filterDraft.dateTo || ''} onChange={e => setFilterDraft(d => ({ ...d, dateTo: e.target.value }))} />
          <select className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50"
            value={filterDraft.productId || ''} onChange={e => setFilterDraft(d => ({ ...d, productId: e.target.value || undefined }))}>
            <option value="">All products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setFilters(filterDraft); setPage(1); loadList(1, filterDraft); }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg cursor-pointer">Apply</button>
          <button onClick={() => { setFilterDraft({}); setFilters({}); setPage(1); loadList(1, {}); }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-lg cursor-pointer">Clear</button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-extrabold text-slate-500 flex justify-between">
          <span>Saved Challans ({total})</span>
          <span>Page {page} / {totalPages}</span>
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold">No challans found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(ch => (
              <div key={ch.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{ch.challanNo}</span>
                    {ch.status === 'cancelled' && <span className="text-[9px] bg-rose-100 text-rose-700 font-black px-1.5 py-0.5 rounded uppercase">Cancelled</span>}
                  </div>
                  <div className="text-xs text-slate-500 font-semibold truncate">
                    {ch.customerSnapshot?.name} · {new Date(ch.date || ch.createdAt).toLocaleDateString('en-IN')} · {(ch.items || []).length} item(s)
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={async () => openPdfBlob(await generateProductChallanPdf(ch), `${ch.challanNo}.pdf`)}
                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded-lg border border-emerald-200 flex items-center gap-1 cursor-pointer">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  {ch.status !== 'cancelled' && (
                    <button onClick={async () => {
                      const reason = prompt('Cancel this challan? Enter a reason:');
                      if (reason !== null) { await productChallanService.cancelProductChallan(ch.id, reason || 'Cancelled'); loadList(); }
                    }}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer">
                      <Ban className="w-3 h-3" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => { const np = page - 1; setPage(np); loadList(np); }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer">
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <button disabled={page >= totalPages} onClick={() => { const np = page + 1; setPage(np); loadList(np); }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer">
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateChallanModal
          products={products}
          leads={leads}
          preselectProductId={searchParams.get('productId') || undefined}
          preparedByName={currentUser?.fullName || ''}
          preparedById={currentUser?.id || ''}
          onClose={() => { setShowCreate(false); setSearchParams({}); }}
          onCreated={async (ch) => {
            setShowCreate(false);
            setSearchParams({});
            await loadList(1);
            setPage(1);
            if (confirm(`Challan ${ch.challanNo} created. Open PDF now?`)) {
              openPdfBlob(await generateProductChallanPdf(ch), `${ch.challanNo}.pdf`);
            }
          }}
        />
      )}
    </div>
  );
};

// ── Create Challan Modal ──
const CreateChallanModal: React.FC<{
  products: Product[];
  leads: Lead[];
  preselectProductId?: string;
  preparedByName: string;
  preparedById: string;
  onClose: () => void;
  onCreated: (ch: ProductChallan) => void;
}> = ({ products, leads, preselectProductId, preparedByName, preparedById, onClose, onCreated }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ProductChallanItem[]>([]);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<any>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (preselectProductId) {
      const p = products.find(x => x.id === preselectProductId);
      if (p) setRows([{ productId: p.id, productName: p.name, brand: p.brand, unit: p.unit, qty: 1, rate: p.rate }]);
    }
  }, [preselectProductId, products]);

  // debounced lead search (400ms, min 2 chars, limit 10)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(leadSearch.trim()), 400);
    return () => clearTimeout(debounceRef.current);
  }, [leadSearch]);

  const leadMatches = useMemo(() => {
    if (debouncedSearch.length < 2) return [];
    const q = debouncedSearch.toLowerCase();
    return leads.filter(l => (l.name || '').toLowerCase().includes(q)).slice(0, 10);
  }, [debouncedSearch, leads]);

  const pickLead = (l: Lead) => {
    setSelectedLead(l);
    setCustName(l.name || '');
    setCustPhone(l.phoneNumber || '');
    setLeadSearch(l.name || '');
  };

  const addProductRow = (productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    if (rows.some(r => r.productId === p.id)) return;
    setRows(r => [...r, { productId: p.id, productName: p.name, brand: p.brand, unit: p.unit, qty: 1, rate: p.rate }]);
  };

  const canSave = custName.trim().length > 0 && rows.length > 0 && rows.every(r => r.qty > 0) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const ch = await productChallanService.createProductChallan({
        date,
        leadId: selectedLead?.id,
        customerSnapshot: { name: custName.trim(), phone: custPhone.trim() || undefined, address: custAddress.trim() || undefined },
        items: rows,
        vehicleNo: vehicleNo.trim() || undefined,
        notes: notes.trim() || undefined,
        createdBy: preparedById,
        createdByName: preparedByName
      });
      onCreated(ch);
    } catch (e) {
      alert('Failed to create challan. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-indigo-600" /> Create Product Challan</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4 text-xs font-semibold">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Challan No</label>
              <div className="px-3 py-2.5 bg-slate-100 rounded-xl text-slate-500 font-bold">Auto (SWH-####)</div>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
            </div>
          </div>

          {/* Lead search */}
          <div className="relative">
            <label className="block text-slate-500 mb-1">Customer / Lead (search, min 2 chars)</label>
            <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-slate-50">
              <Search className="w-4 h-4 text-slate-400" />
              <input value={leadSearch} onChange={e => { setLeadSearch(e.target.value); setSelectedLead(null); }}
                placeholder="Type customer name..." className="w-full px-2 py-2.5 bg-transparent focus:outline-none" />
            </div>
            {leadMatches.length > 0 && !selectedLead && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {leadMatches.map(l => (
                  <button key={l.id} onClick={() => pickLead(l)}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0 cursor-pointer">
                    <div className="font-bold text-slate-800">{l.name}</div>
                    <div className="text-[10px] text-slate-400">{l.phoneNumber} · {l.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Customer Name *</label>
              <input value={custName} onChange={e => setCustName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Phone</label>
              <input value={custPhone} onChange={e => setCustPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
            </div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Address</label>
            <textarea value={custAddress} onChange={e => setCustAddress(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
          </div>

          {/* Products */}
          <div>
            <label className="block text-slate-500 mb-1">Add Product</label>
            <select onChange={e => { addProductRow(e.target.value); e.target.value = ''; }} defaultValue=""
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer">
              <option value="" disabled>Select a Solar Water Heater product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.brand ? ` (${p.brand})` : ''}</option>)}
            </select>
            {products.length === 0 && (
              <p className="text-[10px] text-amber-600 mt-1">No Solar Water Heater products found. Add one in Product Catalog first.</p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {rows.map((r, idx) => (
                <div key={r.productId} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 truncate">{r.productName}</div>
                    <div className="text-[10px] text-slate-400">{r.brand || ''} {r.unit ? `· ${r.unit}` : ''}</div>
                  </div>
                  <input type="number" min={1} value={r.qty}
                    onChange={e => setRows(rs => rs.map((x, i) => i === idx ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-center" />
                  <button onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}
                    className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Vehicle No (optional)</label>
              <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Prepared By</label>
              <div className="px-3 py-2.5 bg-slate-100 rounded-xl text-slate-500 font-bold truncate">{preparedByName || '—'}</div>
            </div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={!canSave}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer">
              <FileText className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Challan'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl cursor-pointer">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};
