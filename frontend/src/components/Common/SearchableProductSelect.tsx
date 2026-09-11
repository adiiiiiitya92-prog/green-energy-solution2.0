import React, { useState, useEffect, useRef } from 'react';
import type { Product } from '../../types';
import { Search, ChevronDown, Check, X, Package, Tag, AlertCircle } from 'lucide-react';

interface SearchableProductSelectProps {
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (productId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  placeholder = '-- Search or Select Component --',
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Sync display text with selected product
  useEffect(() => {
    if (selectedProduct) {
      setSearchQuery(selectedProduct.name);
    } else if (!selectedProductId) {
      setSearchQuery('');
    }
  }, [selectedProductId, selectedProduct]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset search query to selected product name if closed without picking
        if (selectedProduct) {
          setSearchQuery(selectedProduct.name);
        } else {
          setSearchQuery('');
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedProduct]);

  // Filter products by initial letters/words, brand, category, description
  const filteredProducts = products.filter(p => {
    if (!searchQuery.trim()) return true;
    // If the input exactly matches selected product name and dropdown is open, show all
    if (selectedProduct && searchQuery.trim().toLowerCase() === selectedProduct.name.toLowerCase() && !isOpen) {
      return true;
    }

    const q = searchQuery.toLowerCase().trim();
    const nameMatch = p.name.toLowerCase().includes(q);
    const brandMatch = (p.brand || '').toLowerCase().includes(q);
    const catMatch = (p.category || '').toLowerCase().includes(q);
    const bomCatMatch = (p.bomCategory || '').toLowerCase().includes(q);
    const descMatch = (p.description || '').toLowerCase().includes(q);
    const serialMatch = (p.serialNumbers || []).some(sn => sn.toLowerCase().includes(q)) ||
      (p.productUnits || []).some(u => u.serialNumber && u.serialNumber.toLowerCase().includes(q));

    return nameMatch || brandMatch || catMatch || bomCatMatch || descMatch || serialMatch;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsOpen(true);
    setHighlightedIndex(0);

    // If input was completely cleared
    if (!val.trim() && selectedProductId) {
      onSelectProduct('');
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // Auto-select text on focus so user can immediately type initial letters
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleSelect = (product: Product) => {
    onSelectProduct(product.id);
    setSearchQuery(product.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectProduct('');
    setSearchQuery('');
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
        handleSelect(filteredProducts[highlightedIndex]);
      } else if (filteredProducts.length > 0) {
        handleSelect(filteredProducts[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      if (selectedProduct) {
        setSearchQuery(selectedProduct.name);
      }
    }
  };

  // Scroll highlighted element into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const getCategoryBadgeLabel = (p: Product) => {
    if (p.category === 'bom_item') return p.bomCategory || 'BOM Component';
    if (p.category === 'solar_panel') return 'Solar Panel';
    if (p.category === 'inverter') return 'Inverter';
    if (p.category === 'battery') return 'Battery';
    if (p.category === 'structure') return 'Structure';
    return 'General Component';
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input Field with Dropdown Trigger */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full border rounded-xl pl-9 pr-16 py-2 bg-white text-xs font-bold text-slate-900 focus:outline-none transition-all ${
            isOpen
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
              : 'border-slate-200 hover:border-slate-300'
          } ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'cursor-text'}`}
        />

        {/* Action icons on right: Clear (X) & Dropdown Chevron */}
        <div className="absolute right-2 flex items-center gap-1">
          {searchQuery && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setIsOpen(prev => !prev);
              if (!isOpen && inputRef.current) {
                inputRef.current.focus();
              }
            }}
            className={`p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
            title="Toggle component list"
          >
            <ChevronDown className="w-4 h-4 transition-transform duration-200" />
          </button>
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto overflow-x-hidden p-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header count info */}
          <div className="px-3 py-1.5 text-[10.5px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 flex justify-between items-center bg-slate-50/60 rounded-xl mb-1">
            <span>Components ({filteredProducts.length})</span>
            <span className="text-[9.5px] text-slate-400 font-semibold lowercase">type to search</span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-6 px-4 text-center">
              <Package className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-slate-700">No components found</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                No matching product for "{searchQuery}". Check spelling or brand.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredProducts.map((product, index) => {
                const isSelected = product.id === selectedProductId;
                const isHighlighted = index === highlightedIndex;
                const isOutOfStock = product.category !== 'bom_item' && product.stockQuantity <= 0;

                return (
                  <div
                    key={product.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(product)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-black border border-emerald-200/80 shadow-2xs'
                        : isHighlighted
                        ? 'bg-slate-100/90 text-slate-900 font-extrabold'
                        : 'hover:bg-slate-50 text-slate-800 font-semibold'
                    }`}
                  >
                    {/* Left: Product Name, Brand & Category */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-[12.5px]">{product.name}</span>
                        {isSelected && (
                          <span className="shrink-0 text-emerald-600 font-black text-xs">
                            <Check className="w-3.5 h-3.5 inline" />
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                        {product.brand && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 font-bold border border-blue-100">
                            🏷️ {product.brand}
                          </span>
                        )}
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-purple-50 text-purple-800 font-bold border border-purple-100">
                          {getCategoryBadgeLabel(product)}
                        </span>
                        {product.unit && (
                          <span className="text-slate-400 font-medium">
                            UOM: {product.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Stock Badge */}
                    <div className="shrink-0 text-right">
                      {product.category === 'bom_item' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                          BOM Kit
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                            isOutOfStock
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isOutOfStock ? '⚠️ 0 in stock' : `Stock: ${product.stockQuantity} ${product.unit || 'Nos'}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
