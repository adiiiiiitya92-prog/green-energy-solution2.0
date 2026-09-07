import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { Quotation, OrderConfirmation, ClientRegistration, BomItem } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

export const BOM_CATEGORY_ORDER = [
  'Solar Panels (PV Modules)',
  'Solar String Inverter',
  'Solar 80 micron HDGI Structure*',
  'Protection Devices',
  'Cables',
  'Earthing / LA - lightning arrestor',
  'Data Logger',
  'Other Accessories'
];

export const DEFAULT_BOM_ITEMS: BomItem[] = [];

export function getBomCategoryIndex(categoryOrName?: string, itemName?: string): number {
  const text = `${categoryOrName || ''} ${itemName || ''}`.toLowerCase().trim();

  // 1. Solar Panels (PV Modules)
  if (text.includes('panel') || text.includes('pv module') || text.includes('solar panel')) {
    return 1;
  }
  // 2. Solar String Inverter
  if (text.includes('inverter') || text.includes('string inverter')) {
    return 2;
  }
  // 3. Solar HDGI Structure
  if (text.includes('hdgi') || text.includes('structure') || text.includes('mounting') || text.includes('purlin') || text.includes('rafter') || text.includes('leg')) {
    return 3;
  }
  // 4. Protection Devices
  if (text.includes('protection') || text.includes('acdb') || text.includes('dcdb') || text.includes('spd') || text.includes('fuse') || text.includes('mcb')) {
    return 4;
  }
  // 5. Cables
  if (text.includes('cable') || text.includes('wire') || text.includes('conduit') || text.includes('wiring')) {
    return 5;
  }
  // 6. Earthing / LA - lightning arrestor
  if (text.includes('earthing') || text.includes('lightning') || text.includes('la') || text.includes('arrestor') || text.includes('rod')) {
    return 6;
  }
  // 7. Data Logger
  if (text.includes('data logger') || text.includes('logger') || text.includes('wifi stick')) {
    return 7;
  }
  // 8. Other Accessories
  if (text.includes('accessory') || text.includes('accessories') || text.includes('tie') || text.includes('ferule') || text.includes('lug') || text.includes('tag') || text.includes('other')) {
    return 8;
  }

  return 9;
}

export function getStandardCategoryName(categoryOrName?: string, itemName?: string): string {
  const idx = getBomCategoryIndex(categoryOrName, itemName);
  switch (idx) {
    case 1: return 'Solar Panels (PV Modules)';
    case 2: return 'Solar String Inverter';
    case 3: return 'Solar 80 micron HDGI Structure*';
    case 4: return 'Protection Devices';
    case 5: return 'Cables';
    case 6: return 'Earthing / LA - lightning arrestor';
    case 7: return 'Data Logger';
    case 8: return 'Other Accessories';
    default: return categoryOrName || 'Other Accessories';
  }
}

export function sortAndFormatBomItems(items: BomItem[]): BomItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const list = items.map(i => ({ ...i }));

  list.sort((a, b) => {
    const idxA = getBomCategoryIndex(a.category, a.itemName);
    const idxB = getBomCategoryIndex(b.category, b.itemName);
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return 0;
  });

  const subCategoryCounts: Record<number, number> = {};

  return list.map(item => {
    const catIdx = getBomCategoryIndex(item.category, item.itemName);
    const stdCat = getStandardCategoryName(item.category, item.itemName);
    item.category = stdCat;

    if (catIdx >= 1 && catIdx <= 3) {
      return {
        ...item,
        srNo: String(catIdx)
      };
    } else if (catIdx >= 4 && catIdx <= 8) {
      subCategoryCounts[catIdx] = (subCategoryCounts[catIdx] || 0) + 1;
      const subIdx = subCategoryCounts[catIdx];
      return {
        ...item,
        srNo: `${catIdx}.${subIdx}`
      };
    } else {
      return item;
    }
  });
}

export function getQuotationTotalAmount(q: any): number {
  if (!q) return 0;
  const items = q.items || q.lineItems || [];
  const subtotal = q.subtotal !== undefined && q.subtotal !== null && Number(q.subtotal) > 0
    ? Number(q.subtotal)
    : (Array.isArray(items) ? items.reduce((s: number, i: any) => s + (Number(i.amount) || (Number(i.qty || 1) * Number(i.rate || 0)) || 0), 0) : 0);

  const gstRateVal = q.gstRate !== undefined && q.gstRate !== null ? Number(q.gstRate) : 0;
  const taxAmt = Math.round(subtotal * (gstRateVal / 100));
  const subtotalWithTax = subtotal + taxAmt;

  if (subtotalWithTax > 0) {
    return subtotalWithTax;
  }

  if (typeof q.grandTotal === 'number' && q.grandTotal > 0) {
    const subsidyVal = Number(q.subsidyAmount) || 0;
    if (subsidyVal > 0 && q.grandTotal < (subtotal + taxAmt)) {
      return q.grandTotal + subsidyVal;
    }
    return q.grandTotal;
  }
  return 0;
}

export function sanitizeQuotationRecord(q: Quotation): Quotation {
  if (!q) return q;
  const tot = getQuotationTotalAmount(q);
  return {
    ...q,
    grandTotal: tot,
    subtotal: q.subtotal || tot,
    total: q.total || tot
  };
}

let lastQuotationRemoteSync = 0;
const QUOTE_SYNC_INTERVAL = 15 * 60 * 1000;

export const quotationService = {
  async getAllQuotations(): Promise<Quotation[]> {
    // Auto-heal any active quotations mistakenly marked as deleted by previous background sync bugs
    try {
      const allLocal = await db.quotations.toArray();
      const currentDeleted = await getDeletedRecordIdsSet();
      for (const q of allLocal) {
        if (q && q.id && currentDeleted.has(q.id)) {
          await db.deletedRecords.delete(q.id);
        }
      }
    } catch (_) {}

    const deletedIds = await getDeletedRecordIdsSet();
    const localQuotes = await db.quotations.orderBy('createdAt').reverse().toArray();
    const validLocal = localQuotes.filter(q => !deletedIds.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0).map(sanitizeQuotationRecord);

    const syncRemote = async () => {
      try {
        lastQuotationRemoteSync = Date.now();
        const remoteQuotes = await fetchCollectionFromFirestore<Quotation>('quotations');
        if (Array.isArray(remoteQuotes)) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteQuotes.filter(q => !freshDeleted.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
          if (validRemote.length > 0) {
            // Merge remote quotations into local database (do NOT delete local quotations!)
            await db.quotations.bulkPut(validRemote.map(sanitizeQuotationRecord));
          }

          // Push any active local quotations not yet in remote Firestore to the cloud
          const currentLocal = await db.quotations.toArray();
          const remoteIds = new Set(validRemote.map(q => q.id));
          for (const localQuote of currentLocal) {
            if (localQuote.id && !freshDeleted.has(localQuote.id) && !remoteIds.has(localQuote.id)) {
              saveRecordToFirestore('quotations', localQuote.id, sanitizeQuotationRecord(localQuote)).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn("Background quotation sync note:", err);
      }
    };

    if (validLocal.length === 0) {
      await syncRemote();
      const refreshed = await db.quotations.orderBy('createdAt').reverse().toArray();
      const freshDeleted = await getDeletedRecordIdsSet();
      return refreshed.filter(q => !freshDeleted.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0).map(sanitizeQuotationRecord);
    }

    // If cache is populated, return immediately and sync in background only if cooldown expired
    if (Date.now() - lastQuotationRemoteSync > QUOTE_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
  },

  async getQuotationById(id: string): Promise<Quotation | undefined> {
    const deletedRecordIds = await getDeletedRecordIdsSet();
    if (deletedRecordIds.has(id)) return undefined;

    let q = await db.quotations.get(id);
    
    // If not found locally, try Firestore sync
    if (!q) {
      try {
        const remoteQuotes = await fetchCollectionFromFirestore<Quotation>('quotations');
        if (Array.isArray(remoteQuotes) && remoteQuotes.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteQuotes.filter(item => !freshDeleted.has(item.id));
          await db.quotations.bulkPut(validRemote.map(sanitizeQuotationRecord));
          q = await db.quotations.get(id);
        }
      } catch (err) {
        console.warn("Firestore quotation fetch note:", err);
      }
    }

    if (q && (deletedRecordIds.has(q.id) || (q.leadId && deletedRecordIds.has(q.leadId)))) return undefined;
    return q ? sanitizeQuotationRecord(q) : undefined;
  },

  async getQuotationsByLeadId(leadId: string): Promise<Quotation[]> {
    const deletedRecordIds = await getDeletedRecordIdsSet();
    if (deletedRecordIds.has(leadId)) return [];

    let quotes = await db.quotations.where({ leadId }).reverse().sortBy('createdAt');
    let validQuotes = quotes.filter(q => !deletedRecordIds.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);

    // If local cache is empty, sync from Firestore first (handles fresh device scenarios)
    if (validQuotes.length === 0) {
      try {
        const remoteQuotes = await fetchCollectionFromFirestore<Quotation>('quotations');
        if (Array.isArray(remoteQuotes) && remoteQuotes.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const forThisLead = remoteQuotes.filter(q => !freshDeleted.has(q.id) && q.leadId === leadId && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
          if (forThisLead.length > 0) {
            await db.quotations.bulkPut(forThisLead.map(sanitizeQuotationRecord));
          }
          // Re-read after sync
          quotes = await db.quotations.where({ leadId }).reverse().sortBy('createdAt');
          validQuotes = quotes.filter(q => !freshDeleted.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
        }
      } catch (err) {
        console.warn("Firestore quotation sync for lead note:", err);
      }
    }

    // Purge any orphan zero-total / zero-item quotations from local & remote DB
    const zeroQuotes = quotes.filter(q => !q.items || q.items.length === 0 || getQuotationTotalAmount(q) <= 0);
    if (zeroQuotes.length > 0) {
      for (const zq of zeroQuotes) {
        db.quotations.delete(zq.id).catch(() => {});
        markRecordAsDeleted(zq.id, 'quotations').catch(() => {});
        deleteRecordFromFirestore('quotations', zq.id).catch(() => {});
      }
    }
    return validQuotes.map(sanitizeQuotationRecord);
  },

  async createQuotation(qData: Omit<Quotation, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
    if (!qData.items || qData.items.length === 0 || getQuotationTotalAmount(qData) <= 0) {
      console.warn("⚠️ Cannot create/save quotation without commercial product items or with 0 grand total.");
      return '';
    }

    const existingQuotes = await db.quotations.where({ leadId: qData.leadId }).toArray();
    const validExisting = existingQuotes.filter(q => q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
    
    const existingById = qData.id ? validExisting.find(q => q.id === qData.id) : null;
    const existingByNum = qData.quotationNumber ? validExisting.find(q => q.quotationNumber === qData.quotationNumber) : null;
    const existing = existingById || existingByNum || null;

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
        // 1. Update Lead status & sync Follow-up Date
        const lead = await db.leads.get(qData.leadId);
        if (lead) {
          if (lead.status === 'new') {
            lead.status = 'quotation_sent';
          }
          if (finalQuotation.followUpDate && finalQuotation.followUpDate.trim() !== '') {
            lead.nextFollowUpDate = finalQuotation.followUpDate;
            lead.followUpCompleted = false;
            lead.followUpSetAt = finalQuotation.followUpSetAt || new Date().toISOString();
          }
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
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return id;
  },

  async updateQuotation(quotation: Quotation): Promise<void> {
    const finalQuotation = sanitizeQuotationRecord(quotation);
    await db.quotations.put(finalQuotation);
    if (finalQuotation.leadId) {
      const lead = await db.leads.get(finalQuotation.leadId);
      if (lead) {
        if (finalQuotation.followUpDate && finalQuotation.followUpDate.trim() !== '') {
          lead.nextFollowUpDate = finalQuotation.followUpDate;
          lead.followUpCompleted = finalQuotation.followUpCompleted || false;
          lead.updatedAt = new Date().toISOString();
          await db.leads.put(lead);
          saveRecordToFirestore('leads', lead.id, lead);
        }
      }
    }
    saveRecordToFirestore('quotations', finalQuotation.id, finalQuotation);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  async deleteQuotation(id: string, skipApprovalCheck = false): Promise<{ success: boolean; requiresApproval?: boolean }> {
    if (!id) return { success: false };

    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const q = await db.quotations.get(id);
      const qName = q ? `Quotation ${q.quotationNumber || '#' + id}` : `Quotation #${id}`;
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'quotation',
        entityId: id,
        entityName: qName,
        metadata: { leadId: q?.leadId },
        reason: `Delete quotation requested by ${currentUser?.fullName || 'Admin/Employee'}`
      });
      return { success: true, requiresApproval: true };
    }

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
    await markRecordAsDeleted(id, 'quotations');
    deleteRecordFromFirestore('quotations', id);

    if (q && q.leadId) {
      const remainingQuotes = await db.quotations.where({ leadId: q.leadId }).toArray();
      const validRemaining = remainingQuotes.filter(item => item.id !== id && item.items && item.items.length > 0 && getQuotationTotalAmount(item) > 0);
      if (validRemaining.length === 0) {
        // No remaining valid quotations for this lead!
        // Remove or reset order confirmations that had no payments made
        const ocs = await db.orderConfirmations.where({ leadId: q.leadId }).toArray();
        for (const oc of ocs) {
          const payments = (Array.isArray(oc.payments) && oc.payments.length > 0) ? oc.payments : (oc.advanceAmount ? [{ amount: oc.advanceAmount }] : []);
          const totalPaid = payments.reduce((s: number, p: any) => s + (p?.amount || 0), 0);
          if (totalPaid <= 0) {
            await db.orderConfirmations.delete(oc.id);
            await markRecordAsDeleted(oc.id, 'orderConfirmations');
            deleteRecordFromFirestore('orderConfirmations', oc.id);
          }
        }
        // Update lead status back to new if it was quotation_sent or confirmed
        const lead = await db.leads.get(q.leadId);
        if (lead && (lead.status === 'quotation_sent' || lead.status === 'confirmed')) {
          lead.status = 'new';
          await db.leads.put(lead);
          saveRecordToFirestore('leads', lead.id, lead);
        }
      }
    }
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return { success: true };
  },

  async markQuotationAsSent(id: string): Promise<void> {
    const quotation = await db.quotations.get(id);
    if (quotation) {
      quotation.sentViaWhatsapp = true;
      quotation.whatsappSentAt = new Date().toISOString();
      await db.quotations.put(quotation);
      saveRecordToFirestore('quotations', id, quotation);
    }
  },

  async getQuotations(): Promise<Quotation[]> {
    return this.getAllQuotations();
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

