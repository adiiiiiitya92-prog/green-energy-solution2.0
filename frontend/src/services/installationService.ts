import { db, getDeletedRecordIdsSet } from './db';
import type { InstallationRecord, RemainingMaterialEntry, SupervisorSummary, Challan } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';

let lastInstallSync = 0;
let lastSummarySync = 0;
const SYNC_INTERVAL = 15 * 60 * 1000;

export interface DispatchedMaterialRow {
  productName: string;
  qty: number;
  unit?: string;
  date: string;
  source: string; // challan number
}

async function syncInstallations() {
  try {
    lastInstallSync = Date.now();
    const remote = await fetchCollectionFromFirestore<InstallationRecord>('installations');
    if (Array.isArray(remote) && remote.length > 0) await db.installations.bulkPut(remote);
  } catch (e) { console.warn('Installation sync note:', e); }
}

async function syncSummaries() {
  try {
    lastSummarySync = Date.now();
    const remote = await fetchCollectionFromFirestore<SupervisorSummary>('supervisorSummaries');
    if (Array.isArray(remote) && remote.length > 0) await db.supervisorSummaries.bulkPut(remote);
  } catch (e) { console.warn('Summary sync note:', e); }
}

export const installationService = {
  async getByLead(leadId: string): Promise<InstallationRecord | undefined> {
    let rec = await db.installations.where({ leadId }).first();
    if (!rec && Date.now() - lastInstallSync > SYNC_INTERVAL) {
      await syncInstallations();
      rec = await db.installations.where({ leadId }).first();
    }
    return rec;
  },

  async getBySupervisor(supervisorId: string): Promise<InstallationRecord[]> {
    const deleted = await getDeletedRecordIdsSet();
    let list = await db.installations.where({ supervisorId }).toArray();
    if (list.length === 0 && Date.now() - lastInstallSync > SYNC_INTERVAL) {
      await syncInstallations();
      list = await db.installations.where({ supervisorId }).toArray();
    }
    return list.filter(r => !deleted.has(r.id));
  },

  async getOrCreateForLead(leadId: string, leadName: string, supervisorId: string, supervisorName?: string): Promise<InstallationRecord> {
    const existing = await this.getByLead(leadId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const rec: InstallationRecord = {
      id: 'install_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      leadId,
      leadName,
      supervisorId,
      supervisorName,
      remainingMaterial: [],
      status: 'in_progress',
      createdAt: now,
      updatedAt: now
    };
    await db.installations.put(rec);
    saveRecordToFirestore('installations', rec.id, rec).catch(() => {});
    return rec;
  },

  async addRemainingMaterial(rec: InstallationRecord, imageUrls: string[], description: string, supervisorId: string): Promise<InstallationRecord> {
    const entry: RemainingMaterialEntry = {
      id: 'rm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      imageUrls,
      description,
      createdAt: new Date().toISOString(),
      createdBy: supervisorId
    };
    const updated: InstallationRecord = {
      ...rec,
      remainingMaterial: [...(rec.remainingMaterial || []), entry],
      updatedAt: new Date().toISOString()
    };
    await db.installations.put(updated);
    saveRecordToFirestore('installations', updated.id, updated).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /** Mark installation complete. Idempotent: increments supervisor count only on first completion. */
  async markComplete(rec: InstallationRecord): Promise<InstallationRecord> {
    if (rec.status === 'completed') return rec; // dedup guard
    const updated: InstallationRecord = {
      ...rec,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.installations.put(updated);
    saveRecordToFirestore('installations', updated.id, updated).catch(() => {});
    await supervisorSummaryService.incrementInstallations(rec.supervisorId, rec.supervisorName);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  /** Read-only dispatched material for a lead, pulled from existing delivery challans. */
  async getDispatchedMaterialForLead(leadId: string): Promise<DispatchedMaterialRow[]> {
    const deleted = await getDeletedRecordIdsSet();
    const challans = (await db.challans.where({ leadId }).toArray()).filter(c => !deleted.has(c.id));
    const rows: DispatchedMaterialRow[] = [];
    challans.forEach((c: Challan) => {
      (c.items || []).forEach(it => {
        rows.push({
          productName: it.productName,
          qty: it.qty,
          unit: it.unit,
          date: c.createdAt,
          source: c.challanNumber
        });
      });
    });
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
};

export const supervisorSummaryService = {
  async getSummary(supervisorId: string): Promise<SupervisorSummary> {
    let s = await db.supervisorSummaries.get(supervisorId);
    if (!s && Date.now() - lastSummarySync > SYNC_INTERVAL) {
      await syncSummaries();
      s = await db.supervisorSummaries.get(supervisorId);
    }
    return s || { id: supervisorId, supervisorId, installationsCount: 0, totalPaid: 0, updatedAt: new Date().toISOString() };
  },

  async getAll(): Promise<SupervisorSummary[]> {
    let list = await db.supervisorSummaries.toArray();
    if (list.length === 0 && Date.now() - lastSummarySync > SYNC_INTERVAL) {
      await syncSummaries();
      list = await db.supervisorSummaries.toArray();
    }
    return list;
  },

  /** Atomic increment of installationsCount via Firestore transaction (+ local mirror). */
  async incrementInstallations(supervisorId: string, supervisorName?: string): Promise<void> {
    await this._atomicUpdate(supervisorId, supervisorName, { installationsDelta: 1 });
  },

  /** Atomic increment of totalPaid when a payment is approved. */
  async addPaid(supervisorId: string, amount: number, supervisorName?: string): Promise<void> {
    await this._atomicUpdate(supervisorId, supervisorName, { paidDelta: amount });
  },

  async _atomicUpdate(supervisorId: string, supervisorName: string | undefined, delta: { installationsDelta?: number; paidDelta?: number }): Promise<void> {
    const now = new Date().toISOString();
    const inc: Record<string, number> = {};
    if (delta.installationsDelta) inc.installationsCount = delta.installationsDelta;
    if (delta.paidDelta) inc.totalPaid = delta.paidDelta;

    // Primary path: backend atomic $inc (MongoDB)
    try {
      const { buildApiUrl } = await import('./firebase');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(buildApiUrl(`/api/firestore/supervisorSummaries/${encodeURIComponent(supervisorId)}/increment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inc, set: { supervisorId, supervisorName: supervisorName || undefined } }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const doc = data?.doc;
        if (doc) {
          await db.supervisorSummaries.put({
            id: supervisorId,
            supervisorId,
            supervisorName: doc.supervisorName || supervisorName,
            installationsCount: doc.installationsCount || 0,
            totalPaid: doc.totalPaid || 0,
            updatedAt: doc.updatedAt || now
          });
          return;
        }
      }
      throw new Error('increment endpoint failed');
    } catch (e) {
      console.warn('Supervisor summary increment fallback (local mirror only):', e);
      const current = await db.supervisorSummaries.get(supervisorId);
      await db.supervisorSummaries.put({
        id: supervisorId,
        supervisorId,
        supervisorName: supervisorName || current?.supervisorName,
        installationsCount: (current?.installationsCount || 0) + (delta.installationsDelta || 0),
        totalPaid: (current?.totalPaid || 0) + (delta.paidDelta || 0),
        updatedAt: now
      });
    }
  }
};
