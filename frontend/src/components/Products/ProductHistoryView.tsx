import React, { useState, useEffect, useMemo } from 'react';
import { isMeterUnit, type StockTransaction, type Product } from '../../types';
import { stockTransactionService } from '../../services/stockTransactionService';
import {
  Calendar, Clock, Search, Filter, ArrowUpRight, ArrowDownLeft,
  Package, PlusCircle, CheckCircle2, RefreshCw, Download, Layers,
  Boxes, Shield, User, FileText, Sparkles, AlertCircle
} from 'lucide-react';

interface ProductHistoryViewProps {
  products: Product[];
}

export const ProductHistoryView: React.FC<ProductHistoryViewProps> = ({ products }) => {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month'>('all');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const list = await stockTransactionService.getTransactions();

      // If there are products in catalog without an explicit 'product_created' transaction in older data,
      // synthesize product creation transactions from products' createdAt so user sees when each product was added!
      const existingProdIdsWithCreatedTxn = new Set(
        list.filter(t => t.type === 'product_created').map(t => t.productId)
      );

      const synthesized: StockTransaction[] = [];
      for (const p of products) {
        if (!existingProdIdsWithCreatedTxn.has(p.id) && p.createdAt) {
          synthesized.push({
            id: `legacy_created_${p.id}`,
            type: 'product_created',
            productId: p.id,
            productName: p.name,
            brand: p.brand,
            category: p.category,
            unit: p.unit || 'Nos',
            quantityAdded: p.stockQuantity || 0,
            previousStock: 0,
            newStock: p.stockQuantity || 0,
            notes: `Product catalog inception (Initial stock: ${p.stockQuantity || 0} ${p.unit || 'Nos'})`,
            timestamp: p.createdAt
          });
        }
      }

      const combined = [...list, ...synthesized].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setTransactions(combined);
    } catch (err) {
      console.error("Error loading stock history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const handleUpdate = () => {
      loadHistory();
    };
    window.addEventListener('app-realtime-update', handleUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleUpdate);
    };
  }, [products]);

  // Date filtering logic
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type Filter
      if (selectedType !== 'all') {
        if (selectedType === 'product_created' && t.type !== 'product_created') return false;
        if (selectedType === 'stock_inward' && t.type !== 'stock_inward' && t.type !== 'batch_added') return false;
        if (selectedType === 'stock_dispatch' && t.type !== 'stock_dispatch' && !t.quantityDeducted) return false;
        if (selectedType === 'stock_adjustment' && t.type !== 'stock_adjustment') return false;
      }

      // Product Filter
      if (selectedProductId !== 'all' && t.productId !== selectedProductId) {
        return false;
      }

      // Date Range Filter
      if (dateFilter !== 'all') {
        const tDate = new Date(t.timestamp);
        const tDateStr = t.timestamp.slice(0, 10);
        if (dateFilter === 'today' && tDateStr !== todayStr) return false;
        if (dateFilter === 'yesterday' && tDateStr !== yesterdayStr) return false;
        if (dateFilter === '7days' && tDate < sevenDaysAgo) return false;
        if (dateFilter === 'month' && tDate < thirtyDaysAgo) return false;
      }

      // Search Term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = t.productName?.toLowerCase().includes(query);
        const matchesBrand = t.brand?.toLowerCase().includes(query);
        const matchesNotes = t.notes?.toLowerCase().includes(query);
        const matchesUser = t.performedBy?.name?.toLowerCase().includes(query);
        const matchesChallan = t.challanNumber?.toLowerCase().includes(query);
        const matchesSerial = t.serialNumbers?.some(sn => sn.toLowerCase().includes(query));
        return matchesName || matchesBrand || matchesNotes || matchesUser || matchesChallan || matchesSerial;
      }

      return true;
    });
  }, [transactions, selectedType, selectedProductId, dateFilter, searchTerm]);

  // Group by Date Partition
  const groupedByDate = useMemo(() => {
    const groups: { [dateKey: string]: { displayDate: string; items: StockTransaction[]; totalAdded: number; totalDeducted: number } } = {};

    filteredTransactions.forEach(t => {
      const dateKey = t.timestamp ? t.timestamp.slice(0, 10) : 'unknown';
      let displayDate = dateKey;
      try {
        const d = new Date(t.timestamp);
        if (!isNaN(d.getTime())) {
          if (dateKey === todayStr) {
            displayDate = `Today • ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
          } else if (dateKey === yesterdayStr) {
            displayDate = `Yesterday • ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
          } else {
            displayDate = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
          }
        }
      } catch (_) {}

      if (!groups[dateKey]) {
        groups[dateKey] = {
          displayDate,
          items: [],
          totalAdded: 0,
          totalDeducted: 0
        };
      }

      groups[dateKey].items.push(t);
      if (t.quantityAdded) groups[dateKey].totalAdded += t.quantityAdded;
      if (t.quantityDeducted) groups[dateKey].totalDeducted += t.quantityDeducted;
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(dateKey => ({
        dateKey,
        ...groups[dateKey]
      }));
  }, [filteredTransactions, todayStr, yesterdayStr]);

  // KPI Metrics
  const totalProductsCreated = useMemo(() => {
    return transactions.filter(t => t.type === 'product_created').length;
  }, [transactions]);

  const totalStockInwardUnits = useMemo(() => {
    return transactions.reduce((sum, t) => {
      if (t.type === 'stock_inward' || t.type === 'batch_added') {
        return sum + (t.quantityAdded || 0);
      }
      return sum;
    }, 0);
  }, [transactions]);

  const totalDispatchedUnits = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (t.quantityDeducted || 0), 0);
  }, [transactions]);

  // Format Time (12hr IST)
  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('No transactions to export.');
      return;
    }

    const headers = ['Date', 'Time', 'Product Name', 'Brand', 'Category', 'Event Type', 'Quantity Added', 'Quantity Deducted', 'Prev Stock', 'New Stock', 'Challan No', 'Performed By', 'Notes'];
    const rows = filteredTransactions.map(t => [
      t.timestamp ? t.timestamp.slice(0, 10) : '',
      formatTime(t.timestamp),
      `"${(t.productName || '').replace(/"/g, '""')}"`,
      `"${(t.brand || '').replace(/"/g, '""')}"`,
      t.category || '',
      t.type || (t.quantityDeducted ? 'stock_dispatch' : 'stock_inward'),
      t.quantityAdded || 0,
      t.quantityDeducted || 0,
      t.previousStock !== undefined ? t.previousStock : '',
      t.newStock !== undefined ? t.newStock : '',
      t.challanNumber || '',
      `"${(t.performedBy?.name || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvString = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Stock_Catalog_History_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Products Added */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 p-4 rounded-2xl text-white shadow-md border border-indigo-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-indigo-300 uppercase tracking-wider">Catalog Inceptions</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black">{totalProductsCreated}</span>
            <span className="text-xs text-indigo-200/80 font-bold">Products Introduced</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Total products registered with initial stock dates</p>
        </div>

        {/* Metric 2: Stock Inward Units */}
        <div className="bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 p-4 rounded-2xl text-white shadow-md border border-emerald-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider">Stock Inward Added</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-300">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black">+{totalStockInwardUnits.toLocaleString('en-IN')}</span>
            <span className="text-xs text-emerald-200/80 font-bold">Units Inwarded</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Total new stock batches received and added</p>
        </div>

        {/* Metric 3: Dispatched Units */}
        <div className="bg-gradient-to-br from-rose-900 via-rose-950 to-slate-950 p-4 rounded-2xl text-white shadow-md border border-rose-500/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-rose-300 uppercase tracking-wider">Stock Dispatched</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-300">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black">-{totalDispatchedUnits.toLocaleString('en-IN')}</span>
            <span className="text-xs text-rose-200/80 font-bold">Units Dispatched</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Total units issued via material delivery challans</p>
        </div>

        {/* Metric 4: Total Log Entries */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4 rounded-2xl text-white shadow-md border border-slate-700/50 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">Audit Log Trail</span>
            <div className="w-8 h-8 rounded-xl bg-slate-700/40 flex items-center justify-center text-slate-300">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black">{transactions.length}</span>
            <span className="text-xs text-slate-300 font-bold">Total History Records</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Saved permanently in database & sync'd real-time</p>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search history by product name, brand, serial number, challan # or user..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Refresh Button */}
            <button
              onClick={loadHistory}
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh History"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Export filtered history to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-slate-100">
          {/* Event Type Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
            <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" /> Event:
            </span>
            <button
              onClick={() => setSelectedType('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                selectedType === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Events ({filteredTransactions.length})
            </button>
            <button
              onClick={() => setSelectedType('product_created')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                selectedType === 'product_created'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>New Products Added</span>
            </button>
            <button
              onClick={() => setSelectedType('stock_inward')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                selectedType === 'stock_inward'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <ArrowDownLeft className="w-3 h-3" />
              <span>Stock Inward Batches</span>
            </button>
            <button
              onClick={() => setSelectedType('stock_dispatch')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                selectedType === 'stock_dispatch'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>Challan Dispatches</span>
            </button>
            <button
              onClick={() => setSelectedType('stock_adjustment')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                selectedType === 'stock_adjustment'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Adjustments
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Product Selector */}
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Products ({products.length})</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.brand ? `(${p.brand})` : ''}
                </option>
              ))}
            </select>

            {/* Date Range Selector */}
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today Only</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Date-Partitioned Timeline */}
      {loading && transactions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">Loading catalog & stock history...</p>
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">No stock history entries found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting your search query or filters. Any newly added product or stock inward batch will automatically be saved and displayed here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(group => (
            <div key={group.dateKey} className="space-y-3">
              {/* Date Partition Header Banner */}
              <div className="sticky top-2 z-10 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl flex flex-wrap justify-between items-center gap-2 shadow-lg border border-slate-700/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider">
                      {group.displayDate}
                    </span>
                    <span className="ml-2 text-[10px] font-bold text-slate-400">
                      ({group.items.length} {group.items.length === 1 ? 'event' : 'events'})
                    </span>
                  </div>
                </div>

                {/* Partition Summary Badges */}
                <div className="flex items-center gap-2 text-[10px] font-extrabold">
                  {group.totalAdded > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <ArrowDownLeft className="w-3 h-3" />
                      <span>Stock Added from this date: +{group.totalAdded.toLocaleString('en-IN')} units</span>
                    </span>
                  )}
                  {group.totalDeducted > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3" />
                      <span>Dispatched: -{group.totalDeducted.toLocaleString('en-IN')} units</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Event Cards for this Date */}
              <div className="grid grid-cols-1 gap-2.5 pl-2 sm:pl-4 border-l-2 border-slate-200 ml-3">
                {group.items.map(t => {
                  const isProductCreated = t.type === 'product_created';
                  const isStockInward = t.type === 'stock_inward' || t.type === 'batch_added';
                  const isDispatch = t.type === 'stock_dispatch' || (!t.type && t.quantityDeducted);
                  const isAdjustment = t.type === 'stock_adjustment';

                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md bg-white ${
                        isProductCreated
                          ? 'border-indigo-200 hover:border-indigo-400 bg-gradient-to-r from-indigo-50/40 via-white to-white'
                          : isStockInward
                          ? 'border-emerald-200 hover:border-emerald-400 bg-gradient-to-r from-emerald-50/40 via-white to-white'
                          : isDispatch
                          ? 'border-rose-200 hover:border-rose-400 bg-gradient-to-r from-rose-50/30 via-white to-white'
                          : 'border-amber-200 hover:border-amber-400 bg-gradient-to-r from-amber-50/30 via-white to-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        {/* Event Type & Product Title */}
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isProductCreated
                                ? 'bg-indigo-100 text-indigo-700'
                                : isStockInward
                                ? 'bg-emerald-100 text-emerald-700'
                                : isDispatch
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {isProductCreated ? (
                              <Sparkles className="w-5 h-5" />
                            ) : isStockInward ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : isDispatch ? (
                              <ArrowUpRight className="w-5 h-5" />
                            ) : (
                              <Boxes className="w-5 h-5" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Event Badge */}
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  isProductCreated
                                    ? 'bg-indigo-600 text-white'
                                    : isStockInward
                                    ? 'bg-emerald-600 text-white'
                                    : isDispatch
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-600 text-white'
                                }`}
                              >
                                {isProductCreated
                                  ? '✨ New Product Added'
                                  : isStockInward
                                  ? '📥 Stock Inward Batch'
                                  : isDispatch
                                  ? '🚚 Stock Dispatched'
                                  : '⚖️ Stock Adjusted'}
                              </span>

                              {/* Category Badge */}
                              {t.category && (
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                  {t.category}
                                </span>
                              )}

                              {/* Time */}
                              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(t.timestamp)}
                              </span>
                            </div>

                            <h3 className="text-sm font-black text-slate-900 mt-1">
                              {t.productName}
                              {t.brand && (
                                <span className="text-xs font-semibold text-slate-500 ml-1.5">
                                  ({t.brand})
                                </span>
                              )}
                            </h3>

                            {/* Notes / Remarks */}
                            {t.notes && (
                              <p className="text-xs text-slate-600 font-medium mt-1">
                                {t.notes}
                              </p>
                            )}

                            {/* Challan Info if Dispatch */}
                            {t.challanNumber && (
                              <p className="text-[11px] font-bold text-rose-700 mt-1 flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" />
                                Challan Slip: #{t.challanNumber} {t.challanType ? `(${t.challanType})` : ''}
                              </p>
                            )}

                            {/* Serial Numbers / Meter Numbers Range preview */}
                            {t.serialNumbers && t.serialNumbers.length > 0 && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-400">
                                  {isMeterUnit(t.unit) ? 'Numbers (Meters):' : 'Serials:'}
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                                  {t.serialNumbers[0]}
                                  {t.serialNumbers.length > 1
                                    ? ` ... ${t.serialNumbers[t.serialNumbers.length - 1]} (${t.serialNumbers.length} ${t.unit || 'units'})`
                                    : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantity & Stock Delta Column */}
                        <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 shrink-0">
                          {/* Delta Badge */}
                          {t.quantityAdded !== undefined && t.quantityAdded > 0 && (
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300 shadow-2xs">
                                <PlusCircle className="w-3.5 h-3.5" />
                                +{t.quantityAdded} {t.unit || 'Nos'}
                              </span>
                            </div>
                          )}

                          {t.quantityDeducted !== undefined && t.quantityDeducted > 0 && (
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-rose-100 text-rose-800 font-black text-xs border border-rose-300 shadow-2xs">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                -{t.quantityDeducted} {t.unit || 'Nos'}
                              </span>
                            </div>
                          )}

                          {/* Before & After Stock */}
                          {t.previousStock !== undefined && t.newStock !== undefined && (
                            <div className="text-[11px] font-bold text-slate-500 mt-1 text-right">
                              Stock: <span className="text-slate-700">{t.previousStock}</span> →{' '}
                              <span className="text-slate-900 font-black">{t.newStock}</span>
                            </div>
                          )}

                          {/* Performed By User */}
                          {t.performedBy?.name && (
                            <div className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>By: {t.performedBy.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
