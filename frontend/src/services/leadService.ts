import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Lead } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const leadService = {
  async getLeads(): Promise<Lead[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    const localLeads = await db.leads.orderBy('createdAt').reverse().toArray();
    const validLocal = localLeads.filter(l => !deletedIds.has(l.id));

    const syncRemote = async () => {
      try {
        const remoteLeads = await fetchCollectionFromFirestore<Lead>('leads');
        if (Array.isArray(remoteLeads) && remoteLeads.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteLeads.filter(l => !freshDeleted.has(l.id));
          const remoteIds = new Set(validRemote.map(l => l.id));
          
          const currentLocal = await db.leads.toArray();
          const toDelete = currentLocal.filter(l => !remoteIds.has(l.id) || freshDeleted.has(l.id)).map(l => l.id);
          
          if (validRemote.length > 0) {
            await db.leads.bulkPut(validRemote);
          }
          if (toDelete.length > 0) {
            await db.leads.bulkDelete(toDelete);
          }
        }
      } catch (err) {
        console.warn("Background lead sync note:", err);
      }
    };

    if (validLocal.length > 0) {
      syncRemote();
      return validLocal;
    }

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
    return id;
  },

  async updateLead(lead: Lead): Promise<void> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(lead.id)) return;
    lead.updatedAt = new Date().toISOString();
    await db.leads.put(lead);
    saveRecordToFirestore('leads', lead.id, lead);
  },

  async deleteLead(id: string): Promise<void> {
    if (!id) return;

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
