import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Lead, Profile } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const filterLeadsForUser = (
  leads: Lead[],
  currentUser: Profile | null | undefined,
  currentRole: string
): Lead[] => {
  if (!currentUser || !Array.isArray(leads)) {
    return leads || [];
  }

  const roleStr = (currentRole || currentUser.role || '').toLowerCase();
  const desigStr = (currentUser.designation || '').toLowerCase();

  const isSuperAdmin = roleStr === 'super_admin';
  const isOperationsAdmin =
    roleStr === 'operations_admin' ||
    desigStr.includes('operations admin') ||
    desigStr.includes('ops admin');

  // 1. Super Admin & Operations Admin: Full visibility across the whole system
  if (isSuperAdmin || isOperationsAdmin) {
    return leads;
  }

  // 2. Strict Assignment Filter for all other users (Admin, Sales, Field, Dealer, etc.):
  // Only leads directly assigned to this user or created by this user are visible.
  return leads.filter((l) => {
    if (!l) return false;
    const isAssignedToUser =
      l.assignedSalesPersonId === currentUser.id ||
      l.assignedAdminId === currentUser.id ||
      l.assignedEmployeeId === currentUser.id ||
      l.dealerId === currentUser.id ||
      l.createdBy === currentUser.id ||
      l.createdBy === currentUser.fullName ||
      (l.createdByDealer &&
        (l.createdBy === currentUser.fullName ||
          l.createdBy === currentUser.id ||
          l.dealerId === currentUser.id));

    return Boolean(isAssignedToUser);
  });
};

let lastLeadRemoteSync = 0;
const LEAD_SYNC_INTERVAL = 15 * 60 * 1000;

export const leadService = {
  async getLeads(): Promise<Lead[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localLeads = await db.leads.orderBy('createdAt').reverse().toArray();
    const activeLocal = localLeads.filter(l => !deletedIds.has(l.id));

    const syncRemote = async () => {
      try {
        lastLeadRemoteSync = Date.now();
        const remoteLeads = await fetchCollectionFromFirestore<Lead>('leads');
        if (Array.isArray(remoteLeads)) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteLeads.filter(l => l.id && !freshDeleted.has(l.id));
          
          if (validRemote.length > 0) {
            // Merge remote leads into local database (do NOT delete local leads!)
            await db.leads.bulkPut(validRemote);
          }

          // Push any active local leads not yet in remote Firestore to the cloud
          const currentLocal = await db.leads.toArray();
          const remoteIds = new Set(validRemote.map(l => l.id));
          for (const localLead of currentLocal) {
            if (localLead.id && !freshDeleted.has(localLead.id) && !remoteIds.has(localLead.id)) {
              saveRecordToFirestore('leads', localLead.id, localLead).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn("Background lead sync note:", err);
      }
    };

    // If local database is empty, wait for remote sync. Otherwise sync in background at most once every 15 min
    if (activeLocal.length === 0) {
      await syncRemote();
    } else if (Date.now() - lastLeadRemoteSync > LEAD_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    // Auto-heal any active leads mistakenly marked as deleted by previous background sync bugs
    try {
      const allLocal = await db.leads.toArray();
      const currentDeleted = await getDeletedRecordIdsSet();
      for (const l of allLocal) {
        if (l && l.id && currentDeleted.has(l.id)) {
          await db.deletedRecords.delete(l.id);
        }
      }
    } catch (_) {}

    const refreshed = await db.leads.orderBy('createdAt').reverse().toArray();
    const freshDeleted = await getDeletedRecordIdsSet();
    const activeLeads = refreshed.filter(l => !freshDeleted.has(l.id));

    // Auto-sanitize existing complaint leads so no complaint text appears on leads UI
    for (const lead of activeLeads) {
      let needsFix = false;
      let cleanReq = lead.requirement;
      let cleanDesc = lead.description;

      if (cleanReq && cleanReq.includes('New Complaint Lead:')) {
        cleanReq = cleanReq.replace(/^New Complaint Lead:\s*/i, '').trim();
        needsFix = true;
      }
      if (cleanDesc && cleanDesc.includes('Created automatically via Complaint Box')) {
        cleanDesc = cleanDesc.replace(/^Created automatically via Complaint Box\s*\[.*?\]\.?\s*/gi, '').trim();
        needsFix = true;
      }

      if (needsFix) {
        lead.requirement = cleanReq || 'Service Request';
        lead.description = cleanDesc;
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        saveRecordToFirestore('leads', lead.id, lead);
      }
    }

    // Auto-heal leads that have an uploaded release document but were previously demoted to confirmed or other stages
    try {
      const allReleases = await db.releaseDocuments.toArray();
      const activeReleases = allReleases.filter(r => !freshDeleted.has(r.id) && !freshDeleted.has(r.leadId));
      const leadIdsWithRelease = new Set(activeReleases.map(r => r.leadId));

      for (const lead of activeLeads) {
        if (leadIdsWithRelease.has(lead.id) && lead.status !== 'closed') {
          lead.status = 'closed';
          lead.updatedAt = new Date().toISOString();
          await db.leads.put(lead);
          saveRecordToFirestore('leads', lead.id, lead).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Auto-heal release leads note:", e);
    }

    return activeLeads;
  },

  async getLeadById(id: string): Promise<Lead | undefined> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(id)) return undefined;
    return db.leads.get(id);
  },

  /**
   * Check if a lead with the given name or email already exists.
   * Compares names and emails case-insensitively with trimming.
   * Excludes tombstones (deleted records) and optionally excludes a given lead ID (useful for updates).
   */
  async checkDuplicateLead(
    name?: string,
    email?: string,
    excludeLeadId?: string
  ): Promise<{ isDuplicate: boolean; field?: 'name' | 'email'; message?: string; existingLead?: Lead }> {
    const deletedIds = await getDeletedRecordIdsSet();
    const allLeads = await db.leads.toArray();
    const activeLeads = allLeads.filter(l => l.id && !deletedIds.has(l.id) && l.id !== excludeLeadId);

    const cleanName = (name || '').trim().toLowerCase();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (cleanName) {
      const nameMatch = activeLeads.find(l => (l.name || '').trim().toLowerCase() === cleanName);
      if (nameMatch) {
        return {
          isDuplicate: true,
          field: 'name',
          message: `A lead with the name "${nameMatch.name}" already exists! Duplicate lead names are not allowed.`,
          existingLead: nameMatch
        };
      }
    }

    if (cleanEmail) {
      const emailMatch = activeLeads.find(l => (l.email || '').trim().toLowerCase() === cleanEmail);
      if (emailMatch) {
        return {
          isDuplicate: true,
          field: 'email',
          message: `A lead with the email "${emailMatch.email}" already exists (Lead: "${emailMatch.name}")! Duplicate email IDs are not allowed.`,
          existingLead: emailMatch
        };
      }
    }

    return { isDuplicate: false };
  },

  async createLead(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // Validate uniqueness of Name and Email
    const dupCheck = await this.checkDuplicateLead(leadData.name, leadData.email);
    if (dupCheck.isDuplicate) {
      throw new Error(dupCheck.message || 'A lead with the same name or email already exists.');
    }

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
    saveRecordToFirestore('leads', id, newLead).catch(err => console.warn("Background Firestore lead save note:", err));
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

    // Validate uniqueness of Name and Email when updated
    if (patch?.name !== undefined || patch?.email !== undefined || typeof leadOrId !== 'string') {
      const dupCheck = await this.checkDuplicateLead(leadToUpdate.name, leadToUpdate.email, leadToUpdate.id);
      if (dupCheck.isDuplicate) {
        throw new Error(dupCheck.message || 'Another lead with the same name or email already exists.');
      }
    }

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
