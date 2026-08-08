import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Lead, Profile } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const filterLeadsForUser = (
  leads: Lead[],
  currentUser: Profile | null | undefined,
  currentRole: string
): Lead[] => {
  const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';
  if (isSuperAdmin || !currentUser) {
    return leads;
  }
  return leads.filter(l => 
    l.assignedSalesPersonId === currentUser.id || 
    l.assignedAdminId === currentUser.id || 
    l.assignedEmployeeId === currentUser.id ||
    l.createdBy === currentUser.id ||
    l.createdBy === currentUser.fullName ||
    (currentUser.email && l.createdBy === currentUser.email)
  );
};

export const leadService = {
  async getLeads(): Promise<Lead[]> {
    const syncRemote = async () => {
      try {
        const remoteLeads = await fetchCollectionFromFirestore<Lead>('leads');
        if (Array.isArray(remoteLeads)) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteLeads.filter(l => l.id && !freshDeleted.has(l.id));
          
          if (validRemote.length > 0) {
            const remoteIds = new Set(validRemote.map(l => l.id));
            const currentLocal = await db.leads.toArray();
            const toDelete = currentLocal.filter(l => !remoteIds.has(l.id) || freshDeleted.has(l.id)).map(l => l.id);
            
            if (toDelete.length > 0) {
              await db.leads.bulkDelete(toDelete);
            }
            await db.leads.bulkPut(validRemote);
          } else if (remoteLeads.length === 0) {
            // All remote records deleted globally
            const currentLocal = await db.leads.toArray();
            if (currentLocal.length > 0) {
              const freshDeleted = await getDeletedRecordIdsSet();
              const toDelete = currentLocal.filter(l => freshDeleted.has(l.id)).map(l => l.id);
              if (toDelete.length > 0) {
                await db.leads.bulkDelete(toDelete);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Background lead sync note:", err);
      }
    };

    await syncRemote();
    const refreshed = await db.leads.orderBy('createdAt').reverse().toArray();
    const freshDeleted = await getDeletedRecordIdsSet();
    return refreshed.filter(l => !freshDeleted.has(l.id));
  },

  async getLeadById(id: string): Promise<Lead | undefined> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(id)) return undefined;
    return db.leads.get(id);
  },

  async createLead(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = 'lead_' + Math.random().toString(36).substring(2, 11);
    const now = new Date().toISOString();
    const newLead: Lead = {
      ...leadData,
      id,
      createdAt: now,
      updatedAt: now
    };

    // Save locally & sync to Firestore
    await db.leads.add(newLead);
    saveRecordToFirestore('leads', id, newLead);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async updateLead(leadOrId: Lead | string, patch?: Partial<Lead>): Promise<void> {
    let leadToUpdate: Lead | undefined;
    if (typeof leadOrId === 'string') {
      const existing = await db.leads.get(leadOrId);
      if (!existing) return;
      leadToUpdate = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    } else {
      leadToUpdate = { ...leadOrId, ...patch, updatedAt: new Date().toISOString() };
    }

    if (!leadToUpdate || !leadToUpdate.id) return;
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadToUpdate.id)) return;
    await db.leads.put(leadToUpdate);
    saveRecordToFirestore('leads', leadToUpdate.id, leadToUpdate);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async deleteLead(id: string, skipApprovalCheck = false): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const lead = await db.leads.get(id);
      const leadName = lead ? `${lead.name} (+91 ${lead.phoneNumber})` : `Lead ID #${id}`;
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'lead',
        entityId: id,
        entityName: leadName,
        reason: `Delete lead requested by ${currentUser?.fullName || 'Admin/Employee'}`
      });
      return { success: true, requiresApproval: true };
    }

    // 1. Collect all dependent sub-records before deletion
    const quotes = await db.quotations.where({ leadId: id }).toArray();
    const ocs = await db.orderConfirmations.where({ leadId: id }).toArray();
    const clientDocs = await db.clientDocuments.where({ leadId: id }).toArray();
    const clientRegs = await db.clientRegistrations.where({ leadId: id }).toArray();
    const photos = await db.installationPhotos.where({ leadId: id }).toArray();
    const releases = await db.releaseDocuments.where({ leadId: id }).toArray();
    const visits = await db.fieldVisitReports.where({ leadId: id }).toArray();
    const challans = await db.challans.where({ leadId: id }).toArray();
    const shadows = await db.shadowAnalyses.where({ leadId: id }).toArray();

    // 2. Clear local IndexedDB records
    await db.transaction('rw', [
      db.leads,
      db.quotations,
      db.orderConfirmations,
      db.clientDocuments,
      db.clientRegistrations,
      db.installationPhotos,
      db.releaseDocuments,
      db.fieldVisitReports,
      db.challans,
      db.shadowAnalyses,
      db.deletedRecords
    ], async () => {
      await db.leads.delete(id);
      await db.quotations.where({ leadId: id }).delete();
      await db.orderConfirmations.where({ leadId: id }).delete();
      await db.clientDocuments.where({ leadId: id }).delete();
      await db.clientRegistrations.where({ leadId: id }).delete();
      await db.installationPhotos.where({ leadId: id }).delete();
      await db.releaseDocuments.where({ leadId: id }).delete();
      await db.fieldVisitReports.where({ leadId: id }).delete();
      await db.challans.where({ leadId: id }).delete();
      await db.shadowAnalyses.where({ leadId: id }).delete();
    });

    // 3. Log tombstones so background sync never reinstates deleted data
    await markRecordAsDeleted(id, 'leads');
    for (const q of quotes) await markRecordAsDeleted(q.id, 'quotations');
    for (const oc of ocs) await markRecordAsDeleted(oc.id, 'orderConfirmations');
    for (const cd of clientDocs) await markRecordAsDeleted(cd.id, 'clientDocuments');
    for (const cr of clientRegs) await markRecordAsDeleted(cr.leadId, 'clientRegistrations');
    for (const p of photos) await markRecordAsDeleted(p.id, 'installationPhotos');
    for (const r of releases) await markRecordAsDeleted(r.id, 'releaseDocuments');
    for (const v of visits) await markRecordAsDeleted(v.id, 'fieldVisitReports');
    for (const ch of challans) await markRecordAsDeleted(ch.id, 'challans');
    for (const sa of shadows) await markRecordAsDeleted(sa.id, 'shadowAnalyses');

    // 4. Remote wipe from Cloud Firestore & Backend REST API
    deleteRecordFromFirestore('leads', id);
    deleteRecordFromFirestore('clientRegistrations', id);
    for (const q of quotes) deleteRecordFromFirestore('quotations', q.id);
    for (const oc of ocs) deleteRecordFromFirestore('orderConfirmations', oc.id);
    for (const cd of clientDocs) deleteRecordFromFirestore('clientDocuments', cd.id);
    for (const p of photos) deleteRecordFromFirestore('installationPhotos', p.id);
    for (const r of releases) deleteRecordFromFirestore('releaseDocuments', r.id);
    for (const v of visits) deleteRecordFromFirestore('fieldVisitReports', v.id);
    for (const ch of challans) deleteRecordFromFirestore('challans', ch.id);
    for (const sa of shadows) deleteRecordFromFirestore('shadowAnalyses', sa.id);

    fetch(`${BACKEND_URL}/api/leads/${id}`, { method: 'DELETE' }).catch(() => {});
    return { success: true };
  },

  async deleteClientDocument(docId: string, leadId?: string, skipApprovalCheck = false): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!docId) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const docItem = await db.clientDocuments.get(docId);
      const docName = docItem ? `Document "${docItem.name || docItem.docType}"` : `Document #${docId}`;
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'document',
        entityId: docId,
        entityName: docName,
        metadata: { leadId },
        reason: `Delete document requested by ${currentUser?.fullName || 'Admin/Employee'}`
      });
      return { success: true, requiresApproval: true };
    }

    await db.clientDocuments.delete(docId);
    await markRecordAsDeleted(docId, 'clientDocuments');
    deleteRecordFromFirestore('clientDocuments', docId);
    return { success: true };
  },

  async assignLead(leadId: string, salesPersonId?: string, adminId?: string): Promise<void> {
    const lead = await db.leads.get(leadId);
    if (lead) {
      lead.assignedSalesPersonId = salesPersonId;
      lead.assignedAdminId = adminId;
      lead.assignedEmployeeId = salesPersonId || adminId || undefined;
      lead.updatedAt = new Date().toISOString();
      await db.leads.put(lead);
      saveRecordToFirestore('leads', leadId, lead);
    }
  },

  async updateLeadStatus(leadId: string, status: Lead['status']): Promise<void> {
    const lead = await db.leads.get(leadId);
    if (lead) {
      lead.status = status;
      lead.updatedAt = new Date().toISOString();
      await db.leads.put(lead);
      saveRecordToFirestore('leads', leadId, lead);
    }
  },

  async updateLeadRating(leadId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<void> {
    const lead = await db.leads.get(leadId);
    if (lead) {
      lead.clientRating = rating;
      lead.updatedAt = new Date().toISOString();
      await db.leads.put(lead);
      saveRecordToFirestore('leads', leadId, lead);
    }
  }
};
