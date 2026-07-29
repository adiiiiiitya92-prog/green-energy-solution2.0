import React, { useState } from 'react';
import { Products } from '../Admin/Products';
import { Challans } from '../Admin/Challans';
import { Package, Truck, ShieldCheck } from 'lucide-react';

export const InventoryPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'challans'>('inventory');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Panel Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-extrabold uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Dedicated Workspace • Inventory & Delivery Panel</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Inventory & Delivery Challan Management
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Unified stock control room for cataloging components, monitoring low stock thresholds, and issuing official material delivery slips for dispatches.
            </p>
          </div>

          {/* Quick Tab Switcher Cards */}
          <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-700/80 shadow-inner w-full md:w-auto shrink-0">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>1. Inventory Stock</span>
            </button>
            <button
              onClick={() => setActiveTab('challans')}
              className={`flex-1 md:flex-none flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'challans'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>2. Delivery Challans</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation Navigation Pills (Mobile / Secondary) */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-black">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'inventory'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Product Catalog & Stock Inward</span>
        </button>
        <button
          onClick={() => setActiveTab('challans')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'challans'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Material Delivery Challans</span>
        </button>
      </div>

      {/* Active Tab View */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-xs">
        {activeTab === 'inventory' ? <Products /> : <Challans />}
      </div>
    </div>
  );
};

export default InventoryPanel;
