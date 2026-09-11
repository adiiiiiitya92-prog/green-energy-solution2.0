import { db } from './db';
import type { DeletionRequest, ApprovalRequest } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';
import { useAuthStore } from '../store/authStore';

/**
 * Extracts rich employee requester information from currently authenticated session
 */
export function getRequesterInfo(overridePanel?: DeletionRequest['requestedFromPanel']) {
  const currentUser = useAuthStore.getState().currentUser;
  const currentRole = useAuthStore.getState().currentRole || currentUser?.role || 'admin';

  let detectedPanel: DeletionRequest['requestedFromPanel'] = 'admin_panel';
  try {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('inventory') || currentRole === 'inventory_manager') {
      detectedPanel = 'inventory_panel';
    } else if (path.includes('visit') || currentRole === 'field_employee') {
      detectedPanel = 'field_employee_panel';
    } else if (currentRole === 'dealer') {
      detectedPanel = 'dealer_panel';
    } else {
      detectedPanel = 'admin_panel';
    }
  } catch (_) {}

  return {
    requestedByUserId: currentUser?.id || 'unknown',
    requestedByUserName: currentUser?.fullName || 'Employee / Admin',
    requestedByUserEmail: currentUser?.email || undefined,
    requestedByUserPhone: currentUser?.phone || undefined,
    requestedByUserRole: currentRole,
    requestedByUserDesignation: currentUser?.designation || undefined,
    requestedFromPanel: overridePanel || detectedPanel,
  };
}

/**
 * Computes human-friendly field-level diffs between old and new state
 */
export function computeFieldDiff(
  oldObj: Record<string, any> = {},
  newObj: Record<string, any> = {}
): Array<{ field: string; label: string; oldValue: any; newValue: any }> {
  const diffs: Array<{ field: string; label: string; oldValue: any; newValue: any }> = [];
  const ignoredKeys = new Set([
    'id', 'createdAt', 'updatedAt', 'pdfBlob', 'fileBlob', 'photoBlob',
    'clientSignatureBlob', 'confirmationPdfBlob', 'bankDocumentBlob', 'photoBlobs'
  ]);

  const allKeys = Array.from(new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]));

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;

    const oldVal = oldObj ? oldObj[key] : undefined;
    const newVal = newObj ? newObj[key] : undefined;

    // Compare via JSON string representation
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      // Build clean human-friendly label
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();

      diffs.push({
        field: key,
        label,
        oldValue: oldVal === undefined || oldVal === null ? '(blank)' : oldVal,
        newValue: newVal === undefined || newVal === null ? '(blank)' : newVal,
      });
    }
  }

  return diffs;
}

/**
 * Sanitize object for storage (strip large blob objects that cannot be serialized)
 */
function sanitizeForSnapshot(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    const clone = { ...obj };
    const blobKeys = ['pdfBlob', 'fileBlob', 'photoBlob', 'clientSignatureBlob', 'confirmationPdfBlob', 'bankDocumentBlob', 'photoBlobs'];
    for (const key of blobKeys) {
      if (clone[key]) {
        clone[key] = '[Binary Blob Attached]';
      }
    }
    return JSON.parse(JSON.stringify(clone));
  } catch (_) {
    return { ...obj };
  }
}

export const deletionRequestService = {
  async getDeletionRequests(): Promise<DeletionRequest[]> {
    try {
      const remoteReqs = await fetchCollectionFromFirestore<DeletionRequest>('deletionRequests', 8000);
      if (Array.isArray(remoteReqs) && remoteReqs.length > 0) {
        await db.deletionRequests.bulkPut(remoteReqs);
      }
    } catch (_) {}
    return db.deletionRequests.orderBy('requestedAt').reverse().toArray();
  },

  async getPendingRequests(): Promise<DeletionRequest[]> {
    const list = await this.getDeletionRequests();
    return list.filter(r => r.status === 'pending');
  },

  async requestDeletion(data: {
    entityType: DeletionRequest['entityType'];
    entityId: string;
    entityName: string;
    reason?: string;
    itemSnapshot?: Record<string, any>;
    metadata?: Record<string, any>;
    panel?: DeletionRequest['requestedFromPanel'];
  }): Promise<string> {
    const requester = getRequesterInfo(data.panel);
    const id = 'del_req_' + Math.random().toString(36).substring(2, 11);

    const req: DeletionRequest = {
      id,
      requestType: 'delete',
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      ...requester,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      reason: data.reason || `Requested deletion by ${requester.requestedByUserName} (${requester.requestedByUserRole})`,
      itemSnapshot: sanitizeForSnapshot(data.itemSnapshot),
      metadata: data.metadata
    };

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', id, req);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async requestEdit(data: {
    entityType: DeletionRequest['entityType'];
    entityId: string;
    entityName: string;
    previousData: Record<string, any>;
    updatedData: Record<string, any>;
    reason?: string;
    metadata?: Record<string, any>;
    panel?: DeletionRequest['requestedFromPanel'];
  }): Promise<string> {
    const requester = getRequesterInfo(data.panel);
    const id = 'edit_req_' + Math.random().toString(36).substring(2, 11);
    const changedFields = computeFieldDiff(data.previousData, data.updatedData);

    const req: DeletionRequest = {
      id,
      requestType: 'edit',
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      ...requester,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      reason: data.reason || `Requested edit updates by ${requester.requestedByUserName} (${requester.requestedByUserRole})`,
      previousData: sanitizeForSnapshot(data.previousData),
      updatedData: sanitizeForSnapshot(data.updatedData),
      itemSnapshot: sanitizeForSnapshot(data.updatedData),
      changedFields,
      metadata: data.metadata
    };

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', id, req);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async approveRequest(requestId: string, adminRemarks?: string): Promise<void> {
    const req = await db.deletionRequests.get(requestId);
    if (!req || req.status !== 'pending') return;

    const currentUser = useAuthStore.getState().currentUser;
    req.status = 'approved';
    req.reviewedByUserId = currentUser?.id || 'super_admin';
    req.reviewedByUserName = currentUser?.fullName || 'Super Admin';
    req.reviewedAt = new Date().toISOString();
    if (adminRemarks) {
      req.reviewRemarks = adminRemarks;
    }

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', req.id, req);

    // 1. If this was an EDIT request, apply the approved changes!
    if (req.requestType === 'edit' && req.updatedData) {
      try {
        if (req.entityType === 'lead') {
          const { leadService } = await import('./leadService');
          await leadService.updateLead(req.updatedData as any);
        } else if (req.entityType === 'product') {
          const { productService } = await import('./productService');
          await productService.updateProduct(req.updatedData as any);
        } else if (req.entityType === 'challan') {
          const { challanService } = await import('./challanService');
          await challanService.updateChallan(req.entityId, req.updatedData as any);
        } else if (req.entityType === 'employee') {
          const { employeeService } = await import('./employeeService');
          await employeeService.updateEmployee(req.entityId, req.updatedData as any);
        } else if (req.entityType === 'complaint') {
          const { complaintService } = await import('./complaintService');
          await complaintService.updateComplaint(req.entityId, req.updatedData as any);
        }
      } catch (err) {
        console.error("Error executing approved edit updates:", err);
      }
    } 
    // 2. If this was a DELETE request, execute permanent deletion!
    else {
      try {
        if (req.entityType === 'lead') {
          const { leadService } = await import('./leadService');
          await leadService.deleteLead(req.entityId, true);
        } else if (req.entityType === 'quotation') {
          const { quotationService } = await import('./quotationService');
          await quotationService.deleteQuotation(req.entityId, true);
        } else if (req.entityType === 'challan') {
          const { challanService } = await import('./challanService');
          await challanService.deleteChallan(req.entityId, true);
        } else if (req.entityType === 'product') {
          const { productService } = await import('./productService');
          await productService.deleteProduct(req.entityId, true);
        } else if (req.entityType === 'document') {
          if (req.metadata?.leadId) {
            const { leadService } = await import('./leadService');
            await leadService.deleteClientDocument(req.entityId, req.metadata.leadId, true);
          }
        } else if (req.entityType === 'complaint') {
          const { complaintService } = await import('./complaintService');
          await complaintService.deleteComplaint(req.entityId, true);
        } else if (req.entityType === 'employee') {
          const { employeeService } = await import('./employeeService');
          await employeeService.deleteEmployee(req.entityId, true);
        }
      } catch (err) {
        console.error("Error executing approved deletion:", err);
      }
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async rejectRequest(requestId: string, rejectRemarks?: string): Promise<void> {
    const req = await db.deletionRequests.get(requestId);
    if (!req || req.status !== 'pending') return;

    const currentUser = useAuthStore.getState().currentUser;
    req.status = 'rejected';
    req.reviewedByUserId = currentUser?.id || 'super_admin';
    req.reviewedByUserName = currentUser?.fullName || 'Super Admin';
    req.reviewedAt = new Date().toISOString();
    if (rejectRemarks) {
      req.reviewRemarks = rejectRemarks;
    }

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', req.id, req);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  }
};

export const approvalRequestService = deletionRequestService;
