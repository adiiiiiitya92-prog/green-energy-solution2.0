import { db } from './db';
import type { Lead } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

export const leadService = {
  async getLeads(): Promise<Lead[]> {
    try {
      const remoteLeads = await fetchCollectionFromFirestore<Lead>('leads');
      if (Array.isArray(remoteLeads)) {
        // Sync local Dexie DB with latest remote state
        const remoteIds = new Set(remoteLeads.map(l => l.id));
        const localLeads = await db.leads.toArray();
        const deletedIds = localLeads.filter(l => !remoteIds.has(l.id)).map(l => l.id);
        
        if (remoteLeads.length > 0) {
          await db.leads.bulkPut(remoteLeads);
        }
        if (deletedIds.length > 0) {
          await db.leads.bulkDelete(deletedIds);
        }
        
        return await db.leads.orderBy('createdAt').reverse().toArray();
      }
    } catch (err) {
      console.warn("Firestore leads sync note, returning local cache:", err);
    }

    return db.leads.orderBy('createdAt').reverse().toArray();
  },

  async getLeadById(id: string): Promise<Lead | undefined> {
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
    lead.updatedAt = new Date().toISOString();
    await db.leads.put(lead);
    saveRecordToFirestore('leads', lead.id, lead);
  },

  async deleteLead(id: string): Promise<void> {
    const quotes = await db.quotations.where({ leadId: id }).toArray();
    const ocs = await db.orderConfirmations.where({ leadId: id }).toArray();

    await db.transaction('rw', [
      db.leads,
      db.quotations,
      db.orderConfirmations,
      db.clientDocuments,
      db.clientRegistrations,
      db.installationPhotos,
      db.releaseDocuments,
      db.fieldVisitReports
    ], async () => {
      await db.leads.delete(id);
      await db.quotations.where({ leadId: id }).delete();
      await db.orderConfirmations.where({ leadId: id }).delete();
      await db.clientDocuments.where({ leadId: id }).delete();
      await db.clientRegistrations.where({ leadId: id }).delete();
      await db.installationPhotos.where({ leadId: id }).delete();
      await db.releaseDocuments.where({ leadId: id }).delete();
      await db.fieldVisitReports.where({ leadId: id }).delete();
    });

    deleteRecordFromFirestore('leads', id);
    for (const q of quotes) {
      deleteRecordFromFirestore('quotations', q.id);
    }
    for (const oc of ocs) {
      deleteRecordFromFirestore('orderConfirmations', oc.id);
    }
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
