import React, { useState } from 'react';
import { isMeterUnit, type Product, type ProductUnit } from '../../types';
import { productService } from '../../services/productService';
import { stockTransactionService } from '../../services/stockTransactionService';
import { useAuthStore } from '../../store/authStore';
import {
  X, Calendar, PlusCircle, Package, Hash, FileText, CheckCircle2,
  Barcode, Layers, AlertCircle
} from 'lucide-react';

interface QuickStockInwardModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: Product, addedCount: number) => void;
  showToast: (msg: string) => void;
}

interface QuickStockInwardModalInnerProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: Product, addedCount: number) => void;
  showToast: (msg: string) => void;
}

const QuickStockInwardModalContent: React.FC<QuickStockInwardModalInnerProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess,
  showToast
}) => {

  const todayStr = new Date().toISOString().slice(0, 10);
  const [inwardDate, setInwardDate] = useState<string>(todayStr);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [prefix, setPrefix] = useState<string>(() => {
    return (product.brand || product.name || 'GES')
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') + '-';
  });
  const [batchNote, setBatchNote] = useState<string>('');
  const [pasteSerialsText, setPasteSerialsText] = useState<string>('');
  const [showPasteSerials, setShowPasteSerials] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { currentUser } = useAuthStore();
  const currentStock = product.stockQuantity || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyToAdd = Number(quantity);
    if (!qtyToAdd || qtyToAdd <= 0) {
      alert('Please enter a valid quantity greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build ISO timestamp from selected date
      const now = new Date();
      const selectedDate = new Date(inwardDate);
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      const dateIso = selectedDate.toISOString();

      const existingUnits: ProductUnit[] = product.productUnits && product.productUnits.length > 0
        ? [...product.productUnits]
        : (product.serialNumbers && product.serialNumbers.length > 0
            ? product.serialNumbers.map((sn, idx) => ({
                id: `unit_${idx + 1}_${Date.now()}_${idx}`,
                unitNumber: idx + 1,
                serialNumber: sn,
                status: 'available' as const,
                addedAt: product.createdAt || dateIso
              }))
            : []);

      const currentMaxNum = existingUnits.length > 0
        ? Math.max(...existingUnits.map(u => u.unitNumber || 0))
        : (product.stockQuantity || 0);

      // Parse custom pasted serials if any
      const pastedLines = pasteSerialsText
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(Boolean);

      const year = selectedDate.getFullYear();
      const cleanPrefix = prefix.trim() || 'GES-';
      const newUnits: ProductUnit[] = [];
      const newSerialStrings: string[] = [];

      const isMeter = isMeterUnit(product.unit);
      for (let i = 0; i < qtyToAdd; i++) {
        const uNum = currentMaxNum + i + 1;
        const sn = pastedLines[i] || (isMeter ? String(uNum) : `${cleanPrefix}${year}-${String(uNum).padStart(3, '0')}`);
        newSerialStrings.push(sn);
        newUnits.push({
          id: `unit_${uNum}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          unitNumber: uNum,
          serialNumber: sn,
          status: 'available',
          notes: batchNote.trim() || undefined,
          addedAt: dateIso
        });
      }

      const allUnits = [...existingUnits, ...newUnits];
      const availableUnits = allUnits.filter(u => u.status === 'available' || !u.status);
      const newTotalStock = availableUnits.length;

      const updatedProduct: Product = {
        ...product,
        stockQuantity: newTotalStock,
        productUnits: allUnits,
        serialNumbers: availableUnits.map(u => u.serialNumber)
      };

      // 1. Update product in database (skip auto generic history since we will log detailed batch)
      await productService.updateProduct(updatedProduct, { skipHistoryLog: true });

      // 2. Explicitly log Stock Inward Batch Transaction with exact date and serial range
      const userSummary = currentUser
        ? { id: currentUser.id, name: currentUser.fullName, role: currentUser.role }
        : undefined;

      const formattedDisplayDate = selectedDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      const noteText = batchNote.trim()
        ? `${batchNote.trim()} • Inward batch (+${qtyToAdd} ${product.unit || 'Nos'}) added on ${formattedDisplayDate}`
        : `Stock inward batch of +${qtyToAdd} ${product.unit || 'Nos'} added on ${formattedDisplayDate}`;

      await stockTransactionService.logStockInward({
        product,
        quantityAdded: qtyToAdd,
        previousStock: currentStock,
        newStock: newTotalStock,
        serialNumbers: newSerialStrings,
        notes: noteText,
        user: userSummary,
        timestamp: dateIso
      });

      showToast(`✅ Added +${qtyToAdd} ${product.unit || 'Nos'} to "${product.name}" with stock date ${formattedDisplayDate}!`);
      onSuccess(updatedProduct, qtyToAdd);
      onClose();
    } catch (err) {
      console.error("Error adding stock inward batch:", err);
      alert("Failed to inward stock batch. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Inward New Stock Batch</h2>
              <p className="text-[11px] font-semibold text-emerald-200/80">
                Partition inventory additions by date & auto-generate serial numbers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Target Product Summary Banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Target Product</span>
              <h3 className="text-sm font-black text-slate-900">{product.name}</h3>
              {product.brand && (
                <span className="text-xs font-semibold text-slate-500">Brand: {product.brand}</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block">Current Available</span>
              <span className="text-base font-black text-slate-800">
                {currentStock} {product.unit || 'Nos'}
              </span>
            </div>
          </div>

          {/* Date Partition Input */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Stock Inward Date (Partition Date) *</span>
            </label>
            <input
              type="date"
              required
              value={inwardDate}
              onChange={e => setInwardDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
            <p className="text-[10px] text-slate-400 font-semibold mt-1">
              All units added in this batch will be partitioned under this date in the inventory and history logs.
            </p>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <span>Quantity to Inward ({product.unit || 'Nos'}) *</span>
            </label>
            <input
              type="number"
              min="1"
              required
              placeholder="e.g. 50"
              value={quantity}
              onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
            {Number(quantity) > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <span>New Stock Balance will be:</span>
                <span className="font-black text-sm">
                  {currentStock + Number(quantity)} {product.unit || 'Nos'}
                </span>
                <span className="text-[10px] text-emerald-600">(+{quantity})</span>
              </div>
            )}
          </div>

          {/* Serial Number Prefix / Meter Numbering Info */}
          {isMeterUnit(product.unit) ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center gap-2.5">
              <span className="text-lg">📏</span>
              <div>
                <p className="font-extrabold text-blue-900">Meter Unit Numbering (1, 2, 3...)</p>
                <p className="text-[10.5px] text-blue-700 font-medium">Since this product's unit is in meters, sequential numbers (1, 2, 3...) are automatically assigned instead of long serial codes.</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
                <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                <span>Serial Number Prefix</span>
              </label>
              <input
                type="text"
                placeholder="e.g. GES-"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              />
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                Preview: {prefix.trim() || 'GES-'}{new Date(inwardDate).getFullYear()}-001
              </p>
            </div>
          )}

          {/* Optional: Paste Custom Serials Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowPasteSerials(!showPasteSerials)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <span>{showPasteSerials ? '▼ Hide custom serials paste' : '▶ Or paste specific serial numbers (optional)'}</span>
            </button>

            {showPasteSerials && (
              <div className="mt-2 space-y-1 animate-fade-in">
                <textarea
                  rows={3}
                  placeholder="Paste serial numbers (one per line or comma-separated)..."
                  value={pasteSerialsText}
                  onChange={e => {
                    setPasteSerialsText(e.target.value);
                    const lines = e.target.value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
                    if (lines.length > 0 && (!quantity || Number(quantity) < lines.length)) {
                      setQuantity(lines.length);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400">
                  Pasting serials automatically updates inward quantity to match count.
                </p>
              </div>
            )}
          </div>

          {/* Inward Notes / Invoice Reference */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>Inward Notes / Supplier Invoice Ref (Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. PO #9928 / Received from Waree Warehouse"
              value={batchNote}
              onChange={e => setBatchNote(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !quantity || Number(quantity) <= 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Saving Inward Batch...</span>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Confirm Stock Inward (+{quantity || 0})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const QuickStockInwardModal: React.FC<QuickStockInwardModalProps> = (props) => {
  if (!props.isOpen || !props.product) return null;
  return <QuickStockInwardModalContent {...props} product={props.product} />;
};
