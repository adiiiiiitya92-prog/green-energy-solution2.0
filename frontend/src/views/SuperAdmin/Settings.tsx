import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { db } from '../../services/db';
import { Trash2, Download, ServerCrash, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';

export const Settings: React.FC = () => {
  const { resetAllData } = useAuthStore();

  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset all data? This will clear the database and reload the demo mock values.')) {
      await resetAllData();
      alert('Demo data successfully reseeded.');
      window.location.reload();
    }
  };

  const handleExportBackup = async () => {
    try {
      // Fetch all tables
      const profiles = await db.profiles.toArray();
      const leads = await db.leads.toArray();
      const quotations = await db.quotations.toArray();
      const confirmations = await db.orderConfirmations.toArray();
      const documents = await db.clientDocuments.toArray();
      const registrations = await db.clientRegistrations.toArray();
      const photos = await db.installationPhotos.toArray();
      const releases = await db.releaseDocuments.toArray();
      const visits = await db.fieldVisitReports.toArray();

      // We cannot easily JSON serialize Blobs (which photos, signatures, PDFs have).
      // We will export a representation, converting blobs to base64 strings or placeholders.
      const backupObj = {
        meta: {
          exporter: 'SolarCRM Offline Backups',
          timestamp: new Date().toISOString()
        },
        data: {
          profiles,
          leads,
          quotations: quotations.map(q => ({ ...q, pdfBlob: q.pdfBlob ? '[Binary PDF Blob]' : null })),
          confirmations: confirmations.map(c => ({ ...c, clientSignatureBlob: '[Signature Blob]', confirmationPdfBlob: '[Receipt Blob]' })),
          documents: documents.map(d => ({ ...d, fileBlob: '[KYC Binary File Blob]' })),
          registrations: registrations.map(r => ({ ...r, bankDocumentBlob: r.bankDocumentBlob ? '[Bank File Blob]' : null })),
          photos: photos.map(p => ({ ...p, photoBlob: '[Installation Stamped Image Blob]' })),
          releases: releases.map(r => ({ ...r, fileBlob: '[Release File Blob]' })),
          visits: visits.map(v => ({ ...v, photoBlobs: (v.photoBlobs || []).map(() => '[Visit Photo Blob]') }))
        }
      };

      const jsonStr = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `SolarCRM_Backup_${dayjs(backupObj.meta.timestamp).format('YYYY-MM-DD_HHmm')}.json`;
      a.click();
      
      alert('JSON metadata backup successfully exported! (Binary blobs omitted for size in text backups)');
    } catch (err) {
      console.error(err);
      alert('Error exporting database backup.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Settings</h1>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Super Administrator system adjustments and data configuration tools.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Database Management Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-1.5 text-rose-700">
            <ServerCrash className="w-5 h-5" />
            <span>Database Management</span>
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Reset or re-initialize local offline IndexedDB storage tables.
          </p>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              onClick={handleResetData}
              type="button"
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset Local Database</span>
            </button>
            
            <button
              onClick={handleExportBackup}
              type="button"
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Database Backup</span>
            </button>
          </div>
        </div>

        {/* System parameters checklist */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>Phase 1 System Status</span>
          </h3>
          <ul className="space-y-2 text-xs font-semibold text-slate-600">
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>Client-side PWA Offline Shell: Cached</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>IndexedDB Client Store: Active (via Dexie.js)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>OpenStreetMap Leaflet Engine: Running</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
              <span>Backend Synchronization: Local State Only (Phase 1)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
