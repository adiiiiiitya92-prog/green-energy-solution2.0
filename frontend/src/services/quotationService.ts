import { db } from './db';
import type { Quotation, OrderConfirmation, ClientRegistration } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

function sanitizeQuotationRecord(qData: any): Quotation {
  if (!qData) return qData;
  const { pdfBlob, ...cleanObj } = qData;
  return cleanObj as Quotation;
}

export const quotationService = {
  async getQuotations(): Promise<Quotation[]> {
    const localLeads = await db.leads.toArray();
    const validLeadIds = new Set(localLeads.map(l => l.id));

    try {
      const remoteQuotes = await fetchCollectionFromFirestore<Quotation>('quotations');
      if (Array.isArray(remoteQuotes)) {
        const validRemote = remoteQuotes.filter(q => !q.leadId || validLeadIds.has(q.leadId));
        const remoteIds = new Set(validRemote.map(q => q.id));
        
        const localQuotes = await db.quotations.toArray();
        const deletedIds = localQuotes.filter(q => !remoteIds.has(q.id)).map(q => q.id);

        if (validRemote.length > 0) {
          await db.quotations.bulkPut(validRemote.map(sanitizeQuotationRecord));
        }
        if (deletedIds.length > 0) {
          await db.quotations.bulkDelete(deletedIds);
        }

        return await db.quotations.orderBy('createdAt').reverse().toArray();
      }
    } catch (err) {
      console.warn("Firestore quotations sync note, returning local cache:", err);
    }

    const localQuotes = await db.quotations.orderBy('createdAt').reverse().toArray();
    return localQuotes.filter(q => !q.leadId || validLeadIds.has(q.leadId));
  },

  async getQuotationById(id: string): Promise<Quotation | undefined> {
    return db.quotations.get(id);
  },

  async getQuotationsByLeadId(leadId: string): Promise<Quotation[]> {
    return db.quotations.where({ leadId }).reverse().sortBy('createdAt');
  },

  async createQuotation(qData: Omit<Quotation, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
    const existingQuotes = await db.quotations.where({ leadId: qData.leadId }).toArray();
    const existing = existingQuotes.length > 0 ? existingQuotes[0] : null;

    const id = qData.id || existing?.id || ('q_' + Math.random().toString(36).substring(2, 11));
    const rawQuotation: Quotation = {
      ...existing,
      ...qData,
      id,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const finalQuotation = sanitizeQuotationRecord(rawQuotation);

    await db.transaction('rw', [db.quotations, db.leads, db.orderConfirmations, db.clientRegistrations], async () => {
      await db.quotations.put(finalQuotation);

      if (qData.leadId) {
        // 1. Update Lead status
        const lead = await db.leads.get(qData.leadId);
        if (lead) {
          lead.status = 'quotation_sent';
          lead.updatedAt = new Date().toISOString();
          await db.leads.put(lead);
          saveRecordToFirestore('leads', lead.id, lead);
        }

        // 2. Auto-initialize Order & KYC Payment Entry record
        const existingOc = await db.orderConfirmations.where({ leadId: qData.leadId }).first();
        if (!existingOc) {
          const ocId = 'oc_' + Math.random().toString(36).substring(2, 11);
          const newOc: OrderConfirmation = {
            id: ocId,
            leadId: qData.leadId,
            quotationId: id,
            itemsConfirmed: finalQuotation.items || [],
            subtotal: finalQuotation.grandTotal || finalQuotation.subtotal || 0,
            advanceAmount: 0,
            paymentMode: 'transaction_id',
            clientSignatureBlob: '',
            payments: [],
            createdBy: finalQuotation.createdBy || 'Admin',
            createdAt: new Date().toISOString()
          };
          await db.orderConfirmations.put(newOc);
          saveRecordToFirestore('orderConfirmations', ocId, newOc);
        } else {
          // Update existing order record with latest quotation total & items
          existingOc.quotationId = id;
          existingOc.itemsConfirmed = finalQuotation.items || existingOc.itemsConfirmed;
          existingOc.subtotal = finalQuotation.grandTotal || finalQuotation.subtotal || existingOc.subtotal;
          await db.orderConfirmations.put(existingOc);
          saveRecordToFirestore('orderConfirmations', existingOc.id, existingOc);
        }

        // 3. Auto-initialize Order & KYC Client Registration checklist
        const existingReg = await db.clientRegistrations.get(qData.leadId);
        if (!existingReg) {
          const newReg: ClientRegistration = {
            leadId: qData.leadId,
            registrationDone: false,
            fileMade: false,
            bankFileUploaded: false,
            loanStatus: 'pending',
            updatedAt: new Date().toISOString()
          };
          await db.clientRegistrations.put(newReg);
          saveRecordToFirestore('clientRegistrations', qData.leadId, newReg);
        }
      }
    });

    saveRecordToFirestore('quotations', id, finalQuotation);

    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalQuotation)
      });
      if (!res.ok) {
        console.warn(`Backend API quotations sync status: ${res.status}`);
      }
    } catch (err) {
      console.warn("Backend API quotations sync offline note:", err);
    }

    return id;
  },

  async updateQuotation(quotation: Quotation): Promise<void> {
    const finalQuotation = sanitizeQuotationRecord(quotation);
    await db.quotations.put(finalQuotation);
    saveRecordToFirestore('quotations', finalQuotation.id, finalQuotation);

    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalQuotation)
      });
      if (!res.ok) {
        console.warn(`Backend API quotations update status: ${res.status}`);
      }
    } catch (err) {
      console.warn("Backend API quotations sync offline note:", err);
    }
  },

  async deleteQuotation(id: string): Promise<void> {
    const q = await db.quotations.get(id);
    if (q && q.leadId) {
      try {
        localStorage.removeItem(`quotation_${q.leadId}`);
      } catch (_) {}
    }
    try {
      localStorage.removeItem(`quotation_${id}`);
    } catch (_) {}
    await db.quotations.delete(id);
    deleteRecordFromFirestore('quotations', id);
  },

  async markQuotationAsSent(id: string): Promise<void> {
    const quotation = await db.quotations.get(id);
    if (quotation) {
      quotation.sentViaWhatsapp = true;
      quotation.whatsappSentAt = new Date().toISOString();
      await db.quotations.put(quotation);
      saveRecordToFirestore('quotations', id, quotation);
    }
  }
};

export function getCleanWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 10) {
    return `91${clean}`;
  }
  if (clean.length === 11 && clean.startsWith('0')) {
    return `91${clean.slice(1)}`;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    return clean;
  }
  return clean;
}

