import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { ExpenseClaim, ExpenseCategory, ExpensePaymentMode, Profile } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore, uploadImageToFirebase, getQuickB2Url, getFreshB2SignedUrl } from './firebase';
import { compressImage } from './imageCompressionService';

/**
 * Normalizes any receipt URL or base64 data string:
 * - Detects and decodes double-encoded base64 data:application/octet-stream
 * - Preserves standard data:image/*
 * - Signs Backblaze B2 URLs with instant download auth tokens
 */
export function normalizeReceiptUrl(urlOrData: string | undefined | null): string {
  if (!urlOrData || typeof urlOrData !== 'string') return '';
  const trimmed = urlOrData.trim();
  if (!trimmed) return '';

  // If double-encoded base64 data URL
  if (trimmed.startsWith('data:application/octet-stream;base64,') || trimmed.startsWith('data:text/plain;base64,')) {
    try {
      const b64Part = trimmed.split(',')[1];
      const decoded = atob(b64Part);
      if (decoded.startsWith('data:image/') || decoded.startsWith('blob:')) {
        return decoded;
      }
    } catch (_) {}
  }

  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return getQuickB2Url(trimmed);
  }

  return trimmed;
}

/**
 * Resolves the best available working image URL for a claim:
 * 1. Checks billProofBlob (local fast base64 image data URL)
 * 2. Checks billProofUrl (remote cloud storage / B2 URL signed)
 */
export function resolveExpenseReceiptUrl(claim: { billProofUrl?: string; billProofBlob?: string } | null | undefined): string {
  if (!claim) return '';

  if (claim.billProofBlob) {
    const norm = normalizeReceiptUrl(claim.billProofBlob);
    if (norm.startsWith('data:image/') || norm.startsWith('blob:')) {
      return norm;
    }
  }

  if (claim.billProofUrl) {
    const norm = normalizeReceiptUrl(claim.billProofUrl);
    if (norm) {
      return norm;
    }
  }

  if (claim.billProofBlob) {
    return normalizeReceiptUrl(claim.billProofBlob);
  }

  return '';
}

let lastExpenseRemoteSync = 0;
const EXPENSE_SYNC_INTERVAL = 30 * 1000;

export const expenseService = {
  async getAllExpenses(): Promise<ExpenseClaim[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localExpenses = await db.expenses.toArray();
    const validLocal = localExpenses.filter(e => !deletedIds.has(e.id));

    // Auto-repair any previously saved claims that suffered from double-encoding
    for (const item of validLocal) {
      let changed = false;
      let fixedBlob = item.billProofBlob;
      let fixedUrl = item.billProofUrl;

      if (fixedBlob && (fixedBlob.startsWith('data:application/octet-stream;base64,') || fixedBlob.startsWith('data:text/plain;base64,'))) {
        const decoded = normalizeReceiptUrl(fixedBlob);
        if (decoded && decoded !== fixedBlob) {
          fixedBlob = decoded;
          changed = true;
        }
      }

      if (fixedUrl && (fixedUrl.startsWith('data:application/octet-stream;base64,') || fixedUrl.startsWith('data:text/plain;base64,'))) {
        const decoded = normalizeReceiptUrl(fixedUrl);
        if (decoded && decoded !== fixedUrl) {
          fixedUrl = decoded;
          changed = true;
        }
      }

      if (changed) {
        item.billProofBlob = fixedBlob;
        item.billProofUrl = fixedUrl;
        db.expenses.put(item).catch(() => {});
        saveRecordToFirestore('expenses', item.id, item);
      }
    }

    const syncRemote = async () => {
      try {
        lastExpenseRemoteSync = Date.now();
        const remoteExpenses = await fetchCollectionFromFirestore<ExpenseClaim>('expenses', 2000);
        if (Array.isArray(remoteExpenses) && remoteExpenses.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteExpenses.filter(e => !freshDeleted.has(e.id));
          if (validRemote.length > 0) {
            await db.expenses.bulkPut(validRemote);
          }
        }
      } catch (err) {
        console.warn("Background expenses sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const freshDeleted = await getDeletedRecordIdsSet();
      const refreshed = await db.expenses.toArray();
      const list = refreshed.filter(e => !freshDeleted.has(e.id));
      return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    if (Date.now() - lastExpenseRemoteSync > EXPENSE_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  },

  async getExpensesByEmployee(employeeId: string): Promise<ExpenseClaim[]> {
    const all = await this.getAllExpenses();
    return all.filter(e => e.employeeId === employeeId);
  },

  async getExpenseById(id: string): Promise<ExpenseClaim | undefined> {
    return await db.expenses.get(id);
  },

  async uploadReceiptImage(file: File): Promise<{ url: string; base64: string }> {
    try {
      // 1. Compress image to clean WebP/JPEG blob optimized for receipts & text documents
      const compressedFile = await compressImage(file, {
        isDocument: true,
        maxSizeKB: 180,
        maxWidthOrHeight: 1600
      });

      // 2. Read as valid data:image/* URL
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(compressedFile);
      });

      // 3. Upload File / Blob to Cloud Storage
      const fileName = `expense_receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
      let cloudUrl = '';
      try {
        cloudUrl = await uploadImageToFirebase(compressedFile, `expenses/${fileName}`, {
          isDocument: true,
          maxSizeKB: 180,
          maxWidthOrHeight: 1600
        });
      } catch (uploadErr) {
        console.warn("Cloud storage upload fallback to local base64:", uploadErr);
      }

      // If cloudUrl returned is a Backblaze B2 url, ensure signed token is attached
      const finalUrl = cloudUrl && (cloudUrl.startsWith('http://') || cloudUrl.startsWith('https://'))
        ? getQuickB2Url(cloudUrl)
        : base64;

      return {
        url: finalUrl || base64,
        base64: base64
      };
    } catch (err) {
      console.warn("Receipt image processing fallback:", err);
      // Fallback: read directly as base64 without blocking
      const rawBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      return {
        url: rawBase64,
        base64: rawBase64
      };
    }
  },

  async createExpenseClaim(params: {
    employee: Profile;
    title: string;
    category: ExpenseCategory;
    amount: number;
    expenseDate: string;
    paymentMode: ExpensePaymentMode;
    associatedProject?: string;
    description?: string;
    billProofUrl?: string;
    billProofBlob?: string;
  }): Promise<ExpenseClaim> {
    const id = 'exp_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    const year = new Date().getFullYear();

    // Generate clean safe sequential expenseNumber
    const all = await db.expenses.toArray();
    let maxSeq = 1000;
    for (const e of all) {
      if (e.expenseNumber) {
        const match = e.expenseNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= maxSeq) maxSeq = num + 1;
        }
      }
    }
    const expenseNumber = `GES-EXP-${year}-${maxSeq}`;
    const nowIso = new Date().toISOString();

    const newClaim: ExpenseClaim = {
      id,
      expenseNumber,
      employeeId: params.employee.id,
      employeeName: params.employee.fullName,
      employeeEmail: params.employee.email,
      employeePhone: params.employee.phone,
      employeeRole: params.employee.role,
      designation: params.employee.designation || params.employee.role.replace('_', ' ').toUpperCase(),
      title: params.title.trim(),
      category: params.category,
      amount: Math.abs(Number(params.amount) || 0),
      expenseDate: params.expenseDate,
      paymentMode: params.paymentMode,
      associatedProject: params.associatedProject?.trim(),
      description: params.description?.trim(),
      billProofUrl: params.billProofUrl,
      billProofBlob: params.billProofBlob,
      status: 'pending',
      submittedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.expenses.put(newClaim);
    saveRecordToFirestore('expenses', id, newClaim);

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    try {
      const bc = new BroadcastChannel('ges_crm_realtime');
      bc.postMessage({ type: 'REALTIME_UPDATE' });
      bc.close();
    } catch (_) {}

    return newClaim;
  },

  async reapplyExpenseClaim(params: {
    previousExpenseId: string;
    employee: Profile;
    title: string;
    category: ExpenseCategory;
    amount: number;
    expenseDate: string;
    paymentMode: ExpensePaymentMode;
    associatedProject?: string;
    description?: string;
    billProofUrl?: string;
    billProofBlob?: string;
  }): Promise<ExpenseClaim> {
    const prev = await db.expenses.get(params.previousExpenseId);
    const year = new Date().getFullYear();
    const all = await db.expenses.toArray();
    let maxSeq = 1000;
    for (const e of all) {
      if (e.expenseNumber) {
        const match = e.expenseNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= maxSeq) maxSeq = num + 1;
        }
      }
    }
    const expenseNumber = `GES-EXP-${year}-${maxSeq}`;
    const nowIso = new Date().toISOString();

    if (prev) {
      await db.expenses.update(prev.id, {
        isReapplied: true,
        updatedAt: nowIso
      });
      const updatedPrev = await db.expenses.get(prev.id);
      if (updatedPrev) {
        saveRecordToFirestore('expenses', prev.id, updatedPrev);
      }
    }

    const newId = 'exp_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    const newClaim: ExpenseClaim = {
      id: newId,
      expenseNumber,
      employeeId: params.employee.id,
      employeeName: params.employee.fullName,
      employeeEmail: params.employee.email,
      employeePhone: params.employee.phone,
      employeeRole: params.employee.role,
      designation: params.employee.designation || params.employee.role.replace('_', ' ').toUpperCase(),
      title: params.title.trim(),
      category: params.category,
      amount: Math.abs(Number(params.amount) || 0),
      expenseDate: params.expenseDate,
      paymentMode: params.paymentMode,
      associatedProject: params.associatedProject?.trim(),
      description: params.description?.trim(),
      billProofUrl: params.billProofUrl || prev?.billProofUrl,
      billProofBlob: params.billProofBlob || prev?.billProofBlob,
      status: 'pending',
      submittedAt: nowIso,
      previousExpenseId: params.previousExpenseId,
      isReapplied: false,
      reapplicationCount: (prev?.reapplicationCount || 0) + 1,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await db.expenses.put(newClaim);
    saveRecordToFirestore('expenses', newId, newClaim);

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    try {
      const bc = new BroadcastChannel('ges_crm_realtime');
      bc.postMessage({ type: 'REALTIME_UPDATE' });
      bc.close();
    } catch (_) {}

    return newClaim;
  },

  async approveExpenseClaim(params: {
    expenseId: string;
    reviewerId: string;
    reviewerName: string;
    approvedAmount?: number;
    remarks?: string;
  }): Promise<ExpenseClaim> {
    const existing = await db.expenses.get(params.expenseId);
    if (!existing) {
      throw new Error(`Expense claim ${params.expenseId} not found.`);
    }

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const voucherNumber = `GES/EXP-VOUCHER/${year}-${rand}`;

    const updated: ExpenseClaim = {
      ...existing,
      status: 'approved',
      approvedAmount: params.approvedAmount !== undefined ? Number(params.approvedAmount) : existing.amount,
      approvalRemarks: params.remarks?.trim() || 'Expense bill verified and approved for company reimbursement.',
      voucherNumber,
      reimbursementStatus: 'pending_payment',
      reviewedAt: nowIso,
      reviewedByUserId: params.reviewerId,
      reviewedByUserName: params.reviewerName,
      updatedAt: nowIso
    };

    await db.expenses.put(updated);
    saveRecordToFirestore('expenses', params.expenseId, updated);

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    try {
      const bc = new BroadcastChannel('ges_crm_realtime');
      bc.postMessage({ type: 'REALTIME_UPDATE' });
      bc.close();
    } catch (_) {}

    return updated;
  },

  async rejectExpenseClaim(params: {
    expenseId: string;
    reviewerId: string;
    reviewerName: string;
    rejectionReason: string;
  }): Promise<ExpenseClaim> {
    const existing = await db.expenses.get(params.expenseId);
    if (!existing) {
      throw new Error(`Expense claim ${params.expenseId} not found.`);
    }

    if (!params.rejectionReason.trim()) {
      throw new Error('Please provide specific remarks explaining why this bill/expense is being rejected.');
    }

    const nowIso = new Date().toISOString();
    const updated: ExpenseClaim = {
      ...existing,
      status: 'rejected',
      rejectionReason: params.rejectionReason.trim(),
      reviewedAt: nowIso,
      reviewedByUserId: params.reviewerId,
      reviewedByUserName: params.reviewerName,
      updatedAt: nowIso
    };

    await db.expenses.put(updated);
    saveRecordToFirestore('expenses', params.expenseId, updated);

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    try {
      const bc = new BroadcastChannel('ges_crm_realtime');
      bc.postMessage({ type: 'REALTIME_UPDATE' });
      bc.close();
    } catch (_) {}

    return updated;
  },

  async deleteExpenseClaim(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'expenses');
    await db.expenses.delete(id);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    try {
      const bc = new BroadcastChannel('ges_crm_realtime');
      bc.postMessage({ type: 'REALTIME_UPDATE' });
      bc.close();
    } catch (_) {}
  }
};
