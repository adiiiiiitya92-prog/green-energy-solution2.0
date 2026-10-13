import { db, getDeletedRecordIdsSet } from './db';
import type { PaymentRequest, Receipt, PaymentMethod } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, buildApiUrl } from './firebase';
import { getNextNumber, seedLocalCounter } from './counterService';
import { supervisorSummaryService } from './installationService';

let lastReqSync = 0;
let lastReceiptSync = 0;
const SYNC_INTERVAL = 15 * 60 * 1000;

/**
 * Backend guarded status transition: only applies if current status === expectedStatus.
 * Returns {ok:true} when this caller won the transition, {ok:false} if already decided.
 */
async function decideStatus(requestId: string, expectedStatus: string, setFields: Record<string, any>): Promise<{ ok: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(buildApiUrl(`/api/firestore/paymentRequests/${encodeURIComponent(requestId)}/decide`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedStatus, set: setFields }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: !!data?.success };
  } catch (e) {
    console.warn('decideStatus backend call failed:', e);
    return { ok: false };
  }
}

async function syncRequests() {
  try {
    lastReqSync = Date.now();
    const remote = await fetchCollectionFromFirestore<PaymentRequest>('paymentRequests');
    if (Array.isArray(remote) && remote.length > 0) await db.paymentRequests.bulkPut(remote);
  } catch (e) { console.warn('Payment request sync note:', e); }
}

async function syncReceipts() {
  try {
    lastReceiptSync = Date.now();
    const remote = await fetchCollectionFromFirestore<Receipt>('receipts');
    if (Array.isArray(remote) && remote.length > 0) await db.receipts.bulkPut(remote);
  } catch (e) { console.warn('Receipt sync note:', e); }
}

async function seedReqCounter() {
  try {
    const all = await db.paymentRequests.toArray();
    const max = all.reduce((m, r) => {
      const n = parseInt((r.requestNumber || '').replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    if (max > 0) await seedLocalCounter('paymentRequest', max);
  } catch (_) {}
}

async function seedReceiptCounter() {
  try {
    const all = await db.receipts.toArray();
    const max = all.reduce((m, r) => {
      const n = parseInt((r.receiptNo || '').replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    if (max > 0) await seedLocalCounter('receipt', max);
  } catch (_) {}
}

export const paymentRequestService = {
  async createRequest(data: {
    leadId: string;
    leadName?: string;
    supervisorId: string;
    supervisorName?: string;
    requestedAmount: number;
    note?: string;
    installationId?: string;
    reappliedFrom?: string;
    reapplicationCount?: number;
  }): Promise<PaymentRequest> {
    await seedReqCounter();
    const { number } = await getNextNumber({ key: 'paymentRequest', prefix: 'IPR-', pad: 4 });
    const req: PaymentRequest = {
      id: 'preq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      requestNumber: number,
      installationId: data.installationId,
      leadId: data.leadId,
      leadName: data.leadName,
      supervisorId: data.supervisorId,
      supervisorName: data.supervisorName,
      requestedAmount: data.requestedAmount,
      note: data.note,
      status: 'pending',
      reappliedFrom: data.reappliedFrom,
      reapplicationCount: data.reapplicationCount,
      createdAt: new Date().toISOString()
    };
    await db.paymentRequests.put(req);
    saveRecordToFirestore('paymentRequests', req.id, req).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return req;
  },

  async getBySupervisor(supervisorId: string): Promise<PaymentRequest[]> {
    const deleted = await getDeletedRecordIdsSet();
    let list = await db.paymentRequests.where({ supervisorId }).toArray();
    if (list.length === 0 && Date.now() - lastReqSync > SYNC_INTERVAL) {
      await syncRequests();
      list = await db.paymentRequests.where({ supervisorId }).toArray();
    }
    return list.filter(r => !deleted.has(r.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getAll(forceSync = false): Promise<PaymentRequest[]> {
    const deleted = await getDeletedRecordIdsSet();
    if (forceSync || Date.now() - lastReqSync > SYNC_INTERVAL) await syncRequests();
    const list = await db.paymentRequests.toArray();
    return list.filter(r => !deleted.has(r.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getPending(): Promise<PaymentRequest[]> {
    const all = await this.getAll();
    return all.filter(r => r.status === 'pending');
  },

  /**
   * Approve with a transactional status guard so a request can't be double-approved.
   * On success: set approved, generate receipt, bump supervisor totalPaid.
   */
  async approve(requestId: string, payload: {
    approvedAmount: number;
    method: PaymentMethod;
    transactionId?: string;
    description?: string;
    approvedBy: string;
    approvedByName?: string;
  }): Promise<{ success: boolean; message?: string; receipt?: Receipt }> {
    const local = await db.paymentRequests.get(requestId);
    if (!local) return { success: false, message: 'Request not found.' };
    if (local.status !== 'pending') return { success: false, message: `Already ${local.status}.` };

    const nowTs = new Date().toISOString();

    // Atomic guarded status transition on the backend (prevents double approve)
    const decided = await decideStatus(requestId, 'pending', {
      status: 'approved',
      approvedAmount: payload.approvedAmount,
      method: payload.method,
      transactionId: payload.transactionId,
      description: payload.description,
      decidedAt: nowTs,
      decidedBy: payload.approvedBy,
      decidedByName: payload.approvedByName
    });
    if (!decided.ok) {
      await syncRequests();
      return { success: false, message: 'This request was already decided by someone else.' };
    }

    // Generate receipt
    await seedReceiptCounter();
    const { number: receiptNo } = await getNextNumber({ key: 'receipt', prefix: 'IRC-', pad: 4 });
    const now = new Date().toISOString();
    const receipt: Receipt = {
      id: 'rcpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      receiptNo,
      paymentRequestId: requestId,
      supervisorId: local.supervisorId,
      supervisorName: local.supervisorName,
      leadId: local.leadId,
      leadName: local.leadName,
      amount: payload.approvedAmount,
      method: payload.method,
      transactionId: payload.transactionId,
      description: payload.description,
      approvedBy: payload.approvedBy,
      approvedByName: payload.approvedByName,
      createdAt: now
    };
    await db.receipts.put(receipt);
    saveRecordToFirestore('receipts', receipt.id, receipt).catch(() => {});

    const updatedReq: PaymentRequest = {
      ...local,
      status: 'approved',
      approvedAmount: payload.approvedAmount,
      method: payload.method,
      transactionId: payload.transactionId,
      description: payload.description,
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      decidedAt: now,
      decidedBy: payload.approvedBy,
      decidedByName: payload.approvedByName
    };
    await db.paymentRequests.put(updatedReq);
    saveRecordToFirestore('paymentRequests', updatedReq.id, updatedReq).catch(() => {});

    // Bump supervisor totalPaid (atomic)
    await supervisorSummaryService.addPaid(local.supervisorId, payload.approvedAmount, local.supervisorName);

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true, receipt };
  },

  async reject(requestId: string, payload: { rejectReason: string; decidedBy: string; decidedByName?: string }): Promise<{ success: boolean; message?: string }> {
    const local = await db.paymentRequests.get(requestId);
    if (!local) return { success: false, message: 'Request not found.' };
    if (local.status !== 'pending') return { success: false, message: `Already ${local.status}.` };

    const now = new Date().toISOString();

    const decided = await decideStatus(requestId, 'pending', {
      status: 'rejected',
      rejectReason: payload.rejectReason,
      decidedAt: now,
      decidedBy: payload.decidedBy,
      decidedByName: payload.decidedByName
    });
    if (!decided.ok) {
      await syncRequests();
      return { success: false, message: 'This request was already decided.' };
    }

    const updated: PaymentRequest = {
      ...local,
      status: 'rejected',
      rejectReason: payload.rejectReason,
      decidedAt: now,
      decidedBy: payload.decidedBy,
      decidedByName: payload.decidedByName
    };
    await db.paymentRequests.put(updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  },

  /** Reapply against a rejected request: creates a NEW pending request linked via reappliedFrom. */
  async reapply(oldRequest: PaymentRequest, data: { requestedAmount: number; note?: string }): Promise<PaymentRequest> {
    return this.createRequest({
      leadId: oldRequest.leadId,
      leadName: oldRequest.leadName,
      supervisorId: oldRequest.supervisorId,
      supervisorName: oldRequest.supervisorName,
      installationId: oldRequest.installationId,
      requestedAmount: data.requestedAmount,
      note: data.note,
      reappliedFrom: oldRequest.id,
      reapplicationCount: (oldRequest.reapplicationCount || 0) + 1
    });
  }
};

export const receiptService = {
  async getBySupervisor(supervisorId: string): Promise<Receipt[]> {
    const deleted = await getDeletedRecordIdsSet();
    let list = await db.receipts.where({ supervisorId }).toArray();
    if (list.length === 0 && Date.now() - lastReceiptSync > SYNC_INTERVAL) {
      await syncReceipts();
      list = await db.receipts.where({ supervisorId }).toArray();
    }
    return list.filter(r => !deleted.has(r.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getAll(forceSync = false): Promise<Receipt[]> {
    const deleted = await getDeletedRecordIdsSet();
    if (forceSync || Date.now() - lastReceiptSync > SYNC_INTERVAL) await syncReceipts();
    const list = await db.receipts.toArray();
    return list.filter(r => !deleted.has(r.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getById(id: string): Promise<Receipt | undefined> {
    return db.receipts.get(id);
  }
};
