import { db } from './db';
import type { DeletionRequest } from '../types';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';
import { useAuthStore } from '../store/authStore';

export const deletionRequestService = {
  async getDeletionRequests(): Promise<DeletionRequest[]> {
    try {
      const remoteReqs = await fetchCollectionFromFirestore<DeletionRequest>('deletionRequests', 3000);
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
    metadata?: Record<string, any>;
  }): Promise<string> {
    const currentUser = useAuthStore.getState().currentUser;
    const currentRole = useAuthStore.getState().currentRole;

    const id = 'del_req_' + Math.random().toString(36).substring(2, 11);
    const req: DeletionRequest = {
      id,
      entityType: data.entityType,
      entityId: data.entityId,
      entityName: data.entityName,
      requestedByUserId: currentUser?.id || 'unknown',
      requestedByUserName: currentUser?.fullName || 'Employee / Admin',
      requestedByUserRole: currentRole || 'admin',
      requestedAt: new Date().toISOString(),
      status: 'pending',
      reason: data.reason || 'Requested deletion via CRM UI',
      metadata: data.metadata
    };

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', id, req);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async approveRequest(requestId: string): Promise<void> {
    const req = await db.deletionRequests.get(requestId);
    if (!req || req.status !== 'pending') return;

    const currentUser = useAuthStore.getState().currentUser;
    req.status = 'approved';
    req.reviewedByUserId = currentUser?.id || 'super_admin';
    req.reviewedByUserName = currentUser?.fullName || 'Super Admin';
    req.reviewedAt = new Date().toISOString();

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', req.id, req);

    // Execute actual entity deletion with super_admin bypass flag (skipApprovalCheck = true)
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
      }
    } catch (err) {
      console.error("Error executing approved deletion:", err);
    }

    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async rejectRequest(requestId: string): Promise<void> {
    const req = await db.deletionRequests.get(requestId);
    if (!req || req.status !== 'pending') return;

    const currentUser = useAuthStore.getState().currentUser;
    req.status = 'rejected';
    req.reviewedByUserId = currentUser?.id || 'super_admin';
    req.reviewedByUserName = currentUser?.fullName || 'Super Admin';
    req.reviewedAt = new Date().toISOString();

    await db.deletionRequests.put(req);
    await saveRecordToFirestore('deletionRequests', req.id, req);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  }
};
