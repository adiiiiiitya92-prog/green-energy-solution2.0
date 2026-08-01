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

export const DEFAULT_BOM_ITEMS: BomItem[] = [
  {
    srNo: "1",
    itemName: "Solar Panels (PV Modules)",
    qty: 1,
    unit: "Set",
    brand: "As specified in Quote",
    category: "Solar Panels (PV Modules)"
  },
  {
    srNo: "2",
    itemName: "Solar String Inverter",
    qty: 1,
    unit: "Nos",
    brand: "As specified in Quote",
    category: "Solar String Inverter"
  },
  {
    srNo: "3",
    itemName: "Solar 80 micron HDGI Structure*",
    description: "60 x 40 mm x 2 mm For Leg , Rafters\n40 x 40 mm x 2 mm For purlins",
    qty: 1,
    unit: "Set",
    brand: "As specified in Quote",
    category: "Solar 80 micron HDGI Structure*"
  },
  {
    srNo: "4.1",
    itemName: "ACDB (IP65) - With SPD, Fuse & MCB\nDCDB (IP65) - With SPD, Fuse & MCB",
    qty: 1,
    unit: "Nos",
    brand: "polycab / schineder",
    category: "Protection Devices"
  },
  {
    srNo: "5.1",
    itemName: "4 SQ MM DC Solar Copper Cable, XLS-R, UV RESISTANT, 1100V Grade, Double Insulated",
    qty: 30,
    unit: "Mtr",
    brand: "Polycab / RR",
    category: "Cables"
  },
  {
    srNo: "5.2",
    itemName: "4 SQ MM or 6 SQ MM AC Wire , XLS- R",
    qty: 30,
    unit: "Mtr",
    brand: "Polycab / RR",
    category: "Cables"
  },
  {
    srNo: "5.3",
    itemName: "4 SQ MM Copper Earthing wire for AC & DC",
    qty: 30,
    unit: "Mtr",
    brand: "Polycab / RR",
    category: "Cables"
  },
  {
    srNo: "5.4",
    itemName: "16 SQ MM Aluminium Wire For LA",
    qty: 30,
    unit: "Mtr",
    brand: "Polycab / RR",
    category: "Cables"
  },
  {
    srNo: "5.5",
    itemName: "UPVC Conduit Pipe for wiring",
    qty: 1,
    unit: "Mtr",
    brand: "Polycab / RR",
    category: "Cables"
  },
  {
    srNo: "6.1",
    itemName: "200 Micron Copper Coated 1 Meter Earthing Rod for AC / DC & LA",
    qty: 3,
    unit: "Set",
    brand: "Polycab / RR",
    category: "Earthing / LA - lightning arrestor"
  },
  {
    srNo: "6.2",
    itemName: "1 Meter copper LA with 3 spike & insulator",
    qty: 1,
    unit: "Set",
    brand: "Standard",
    category: "Earthing / LA - lightning arrestor"
  },
  {
    srNo: "7.1",
    itemName: "Wifi Stick : Data Loger for Oniline Monitoring",
    qty: 1,
    unit: "Nos",
    brand: "As per inverter",
    category: "Data Logger"
  },
  {
    srNo: "8.1",
    itemName: "Cable tie, SS304 300mm (100Pcs/Pkt)",
    qty: 1,
    unit: "Set",
    brand: "Ss304",
    category: "Other Accessories"
  },
  {
    srNo: "8.2",
    itemName: "Ferules & Cable Tags",
    qty: 1,
    unit: "Set",
    brand: "Standard",
    category: "Other Accessories"
  },
  {
    srNo: "8.3",
    itemName: "Lugs Ring Type As per wiring requirements",
    qty: 1,
    unit: "Set",
    brand: "Coper",
    category: "Other Accessories"
  }
];

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
  if (!items || items.length === 0) return [];

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
  if (typeof q.grandTotal === 'number' && q.grandTotal > 0) return q.grandTotal;
  if (typeof q.total === 'number' && q.total > 0) return q.total;
  if (typeof q.subtotal === 'number' && q.subtotal > 0) return q.subtotal;
  if (Array.isArray(q.items) && q.items.length > 0) {
    const sum = q.items.reduce((s: number, i: any) => s + (Number(i.amount) || Number(i.rate) || 0), 0);
    if (sum > 0) return sum;
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

export const quotationService = {
  async getAllQuotations(): Promise<Quotation[]> {
    const syncRemote = async () => {
      try {
        const remoteQuotes = await fetchCollectionFromFirestore<Quotation>('quotations');
        if (Array.isArray(remoteQuotes)) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteQuotes.filter(q => !freshDeleted.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
          const remoteIds = new Set(validRemote.map(q => q.id));

          const currentLocal = await db.quotations.toArray();
          const toDelete = currentLocal.filter(q => !remoteIds.has(q.id) || freshDeleted.has(q.id)).map(q => q.id);

          if (toDelete.length > 0) {
            await db.quotations.bulkDelete(toDelete);
          }
          if (validRemote.length > 0) {
            await db.quotations.bulkPut(validRemote.map(sanitizeQuotationRecord));
          } else if (remoteQuotes.length === 0) {
            await db.quotations.clear();
          }
        }
      } catch (err) {
        console.warn("Background quotation sync note:", err);
      }
    };

    await syncRemote();
    const refreshed = await db.quotations.orderBy('createdAt').reverse().toArray();
    const freshDeleted = await getDeletedRecordIdsSet();
    return refreshed.filter(q => !freshDeleted.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0).map(sanitizeQuotationRecord);
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
        console.warn("Firestore quotation fetch by ID note:", err);
      }
    }

    if (q && (!q.items || q.items.length === 0 || getQuotationTotalAmount(q) <= 0)) {
      return undefined;
    }
    return q ? sanitizeQuotationRecord(q) : undefined;
  },

  async getQuotationsByLeadId(leadId: string): Promise<Quotation[]> {
    const deletedRecordIds = await getDeletedRecordIdsSet();
    if (deletedRecordIds.has(leadId)) return [];

    let quotes = await db.quotations.where({ leadId }).reverse().sortBy('createdAt');
    let validQuotes = quotes.filter(q => !deletedRecordIds.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);

    // If local cache is empty, sync from Firestore first (handles reload/signout scenarios)
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
    } else {
      // Background sync for freshness (don't block)
      fetchCollectionFromFirestore<Quotation>('quotations').then(async (remoteQuotes) => {
        if (Array.isArray(remoteQuotes) && remoteQuotes.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const forThisLead = remoteQuotes.filter(q => !freshDeleted.has(q.id) && q.leadId === leadId && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);
          if (forThisLead.length > 0) {
            db.quotations.bulkPut(forThisLead.map(sanitizeQuotationRecord)).catch(() => {});
          }
        }
      }).catch(() => {});
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
    return id;
  },

  async updateQuotation(quotation: Quotation): Promise<void> {
    const finalQuotation = sanitizeQuotationRecord(quotation);
    await db.quotations.put(finalQuotation);
    saveRecordToFirestore('quotations', finalQuotation.id, finalQuotation);
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
    await markRecordAsDeleted(id, 'quotations');
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

