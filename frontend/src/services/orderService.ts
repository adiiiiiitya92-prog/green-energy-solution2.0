import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { OrderConfirmation, ClientDocument, ClientRegistration, InstallationPhoto, ReleaseDocument } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';
import { getQuotationTotalAmount } from './quotationService';

let lastOrderRemoteSync = 0;
const ORDER_SYNC_INTERVAL = 30 * 1000; // 30 seconds fresh sync throttle
let activeOrderSyncPromise: Promise<void> | null = null;

let lastEvidenceRemoteSync = 0;
const EVIDENCE_SYNC_INTERVAL = 30 * 1000; // 30 seconds fresh sync throttle
let activeEvidenceSyncPromise: Promise<void> | null = null;

export const orderService = {
  // Order Confirmations
  async getOrderConfirmationByLeadId(leadId: string): Promise<OrderConfirmation | undefined> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return undefined;

    let oc = await db.orderConfirmations.where({ leadId }).first();
    if (oc && deletedIds.has(oc.id)) return undefined;

    if (!oc) {
      try {
        const remoteOcs = await fetchCollectionFromFirestore<OrderConfirmation>('orderConfirmations', 15000);
        if (Array.isArray(remoteOcs) && remoteOcs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteOcs.filter(o => !freshDeleted.has(o.id) && !freshDeleted.has(o.leadId));
          if (validRemote.length > 0) {
            for (const rOc of validRemote) {
              const local = await db.orderConfirmations.get(rOc.id);
              if (!local) {
                await db.orderConfirmations.put(rOc);
              }
            }
            oc = await db.orderConfirmations.where({ leadId }).first();
          }
        }
      } catch (err) {
        console.warn("Firestore orderConfirmations sync note:", err);
      }
    }

    if (oc && deletedIds.has(oc.id)) return undefined;
    return oc;
  },

  async getAllOrderConfirmations(forceFresh: boolean = false): Promise<OrderConfirmation[]> {
    const deletedIds = await getDeletedRecordIdsSet(forceFresh);
    const all = await db.orderConfirmations.toArray();
    const validLocal = all.filter(o => !deletedIds.has(o.id) && !deletedIds.has(o.leadId));

    const syncRemote = async () => {
      if (activeOrderSyncPromise) return activeOrderSyncPromise;
      activeOrderSyncPromise = (async () => {
        try {
          lastOrderRemoteSync = Date.now();
          const remoteOcs = await fetchCollectionFromFirestore<OrderConfirmation>('orderConfirmations', 15000);
          if (Array.isArray(remoteOcs) && remoteOcs.length > 0) {
            const freshDeleted = await getDeletedRecordIdsSet(true);
            const validRemote = remoteOcs.filter(o => !freshDeleted.has(o.id) && !freshDeleted.has(o.leadId));
            const remoteIds = new Set(validRemote.map(o => o.id));

            // Clean up stale deleted local order confirmations missing from remote
            const currentLocal = await db.orderConfirmations.toArray();
            for (const loc of currentLocal) {
              if (!remoteIds.has(loc.id) || freshDeleted.has(loc.id) || (loc.leadId && freshDeleted.has(loc.leadId))) {
                const age = Date.now() - new Date(loc.createdAt || 0).getTime();
                if (age > 2 * 60 * 1000 || freshDeleted.has(loc.id) || (loc.leadId && freshDeleted.has(loc.leadId))) {
                  await db.orderConfirmations.delete(loc.id).catch(() => {});
                } else if (!freshDeleted.has(loc.id) && !freshDeleted.has(loc.leadId)) {
                  // Only push freshly created local drafts (< 2 min old)
                  saveRecordToFirestore('orderConfirmations', loc.id, loc).catch(() => {});
                }
              }
            }
            
            for (const rOc of validRemote) {
              const local = await db.orderConfirmations.get(rOc.id);
              if (!local) {
                await db.orderConfirmations.put(rOc);
              } else {
                const localPayments = local.payments || [];
                const remotePayments = rOc.payments || [];
                const localPaid = localPayments.reduce((s, p) => s + (p?.amount || 0), 0) || local.advanceAmount || 0;
                const remotePaid = remotePayments.reduce((s, p) => s + (p?.amount || 0), 0) || rOc.advanceAmount || 0;

                if (localPaid > remotePaid) {
                  const merged = { ...rOc, payments: localPayments, advanceAmount: local.advanceAmount || rOc.advanceAmount };
                  await db.orderConfirmations.put(merged);
                  saveRecordToFirestore('orderConfirmations', merged.id, merged).catch(() => {});
                } else {
                  await db.orderConfirmations.put(rOc);
                }
              }
            }
          }
        } catch (err) {
          console.warn("Background orderConfirmations sync note:", err);
        } finally {
          activeOrderSyncPromise = null;
        }
      })();
      return activeOrderSyncPromise;
    };

    if (validLocal.length === 0 || forceFresh) {
      await syncRemote();
      const refreshed = await db.orderConfirmations.toArray();
      const freshDeleted = await getDeletedRecordIdsSet();
      return refreshed.filter(o => !freshDeleted.has(o.id) && !freshDeleted.has(o.leadId));
    }

    if (Date.now() - lastOrderRemoteSync > ORDER_SYNC_INTERVAL) {
      syncRemote().catch(() => {});
    }

    return validLocal;
  },

  async createOrderConfirmation(ocData: Omit<OrderConfirmation, 'id' | 'createdAt'>): Promise<string> {
    const deletedIds = await getDeletedRecordIdsSet();
    const existingQuotes = await db.quotations.where({ leadId: ocData.leadId }).toArray();
    const validQuotes = existingQuotes.filter(q => !deletedIds.has(q.id) && q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0);

    if (validQuotes.length === 0 && (!ocData.quotationId || ocData.quotationId === 'q_link')) {
      console.warn("⚠️ Cannot create Order Confirmation without a valid saved quotation for lead:", ocData.leadId);
      return '';
    }

    const id = 'oc_' + Math.random().toString(36).substring(2, 11);
    const newOc: OrderConfirmation = {
      ...ocData,
      id,
      createdAt: new Date().toISOString()
    };
    let updatedLead: any = null;
    let createdReg: any = null;

    await db.transaction('rw', [db.orderConfirmations, db.leads, db.clientRegistrations], async () => {
      await db.orderConfirmations.add(newOc);
      
      const lead = await db.leads.get(ocData.leadId);
      if (lead && (lead.status === 'new' || lead.status === 'quotation_sent')) {
        lead.status = 'confirmed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        updatedLead = lead;
      }

      const reg = await db.clientRegistrations.get(ocData.leadId);
      if (!reg) {
        const newReg: ClientRegistration = {
          leadId: ocData.leadId,
          registrationDone: false,
          fileMade: false,
          bankFileUploaded: false,
          loanStatus: 'pending',
          updatedAt: new Date().toISOString()
        };
        await db.clientRegistrations.add(newReg);
        createdReg = newReg;
      }
    });

    if (updatedLead) {
      saveRecordToFirestore('leads', updatedLead.id, updatedLead);
    }
    if (createdReg) {
      saveRecordToFirestore('clientRegistrations', ocData.leadId, createdReg);
    }
    saveRecordToFirestore('orderConfirmations', id, newOc);
    return id;
  },

  async updateOrderConfirmation(oc: OrderConfirmation): Promise<void> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(oc.id) || deletedIds.has(oc.leadId)) return;
    await db.orderConfirmations.put(oc);
    saveRecordToFirestore('orderConfirmations', oc.id, oc);
  },

  // Client Registrations Checklist
  async getClientRegistrationByLeadId(leadId: string): Promise<ClientRegistration | undefined> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return undefined;

    let reg = await db.clientRegistrations.get(leadId);
    if (!reg) {
      try {
        const remoteRegs = await fetchCollectionFromFirestore<ClientRegistration>('clientRegistrations');
        if (Array.isArray(remoteRegs) && remoteRegs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteRegs.filter(r => !freshDeleted.has(r.leadId));
          if (validRemote.length > 0) {
            await db.clientRegistrations.bulkPut(validRemote);
            reg = await db.clientRegistrations.get(leadId);
          }
        }
      } catch (err) {
        console.warn("Firestore clientRegistrations sync note:", err);
      }
    }

    return reg;
  },

  async saveClientRegistration(registration: ClientRegistration): Promise<void> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(registration.leadId)) return;
    registration.updatedAt = new Date().toISOString();
    let updatedLead: any = null;

    await db.transaction('rw', [db.clientRegistrations, db.leads], async () => {
      await db.clientRegistrations.put(registration);
      
      const lead = await db.leads.get(registration.leadId);
      if (lead && lead.status === 'confirmed' && registration.registrationDone) {
        lead.status = 'registered';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        updatedLead = lead;
      }
    });

    if (updatedLead) {
      saveRecordToFirestore('leads', updatedLead.id, updatedLead);
    }
    saveRecordToFirestore('clientRegistrations', registration.leadId, registration);
  },

  // Client Documents (Slots: PAN, Aadhar, Bill, Tax, Bank etc)
  async getClientDocumentsByLeadId(leadId: string): Promise<ClientDocument[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    let localDocs = await db.clientDocuments.where('leadId').equals(leadId).toArray().catch(() => []);
    if (localDocs.length === 0) {
      localDocs = await db.clientDocuments.filter(d => String(d.leadId).trim() === String(leadId).trim()).toArray();
    }
    let validLocal = localDocs.filter(d => !deletedIds.has(d.id));

    if (validLocal.length === 0) {
      try {
        const remoteDocs = await fetchCollectionFromFirestore<ClientDocument>('clientDocuments');
        if (Array.isArray(remoteDocs) && remoteDocs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteDocs.filter(d => !freshDeleted.has(d.id) && !freshDeleted.has(d.leadId));
          if (validRemote.length > 0) {
            for (const vd of validRemote) {
              const existing = await db.clientDocuments.get(vd.id);
              if (existing?.fileBlob && !vd.fileBlob) {
                await db.clientDocuments.put({ ...vd, fileBlob: existing.fileBlob });
              } else {
                await db.clientDocuments.put(vd);
              }
            }
            let reRead = await db.clientDocuments.where('leadId').equals(leadId).toArray().catch(() => []);
            if (reRead.length === 0) {
              reRead = await db.clientDocuments.filter(d => String(d.leadId).trim() === String(leadId).trim()).toArray();
            }
            validLocal = reRead.filter(d => !freshDeleted.has(d.id));
          }
        }
      } catch (err) {
        console.warn("Firestore documents sync note:", err);
      }
    }

    return validLocal;
  },

  async uploadClientDocument(docData: Omit<ClientDocument, 'id' | 'uploadedAt'>): Promise<string> {
    const id = 'doc_' + Math.random().toString(36).substring(2, 11);
    const newDoc: ClientDocument = {
      ...docData,
      id,
      uploadedAt: new Date().toISOString()
    };

    let removedDocIds: string[] = [];
    let updatedReg: any = null;

    await db.transaction('rw', [db.clientDocuments, db.clientRegistrations], async () => {
      const existing = await db.clientDocuments.where({ leadId: docData.leadId, docType: docData.docType }).first();
      if (existing) {
        await db.clientDocuments.delete(existing.id);
        removedDocIds.push(existing.id);
      }
      await db.clientDocuments.add(newDoc);

      if (docData.docType === 'account_details') {
        const reg = await db.clientRegistrations.get(docData.leadId);
        if (reg) {
          reg.bankFileUploaded = true;
          reg.updatedAt = new Date().toISOString();
          await db.clientRegistrations.put(reg);
          updatedReg = reg;
        }
      }
    });

    for (const oldId of removedDocIds) {
      await markRecordAsDeleted(oldId, 'clientDocuments');
      deleteRecordFromFirestore('clientDocuments', oldId);
    }
    if (updatedReg) {
      saveRecordToFirestore('clientRegistrations', docData.leadId, updatedReg);
    }
    saveRecordToFirestore('clientDocuments', id, newDoc);
    return id;
  },

  async deleteClientDocument(id: string, skipApprovalCheck = false, customReason?: string): Promise<{ success: boolean; requiresApproval?: boolean }> {
    const { useAuthStore } = await import('../store/authStore');
    const currentRole = useAuthStore.getState().currentRole;
    const currentUser = useAuthStore.getState().currentUser;
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

    if (!isSuperAdmin && !skipApprovalCheck) {
      const doc = await db.clientDocuments.get(id);
      const lead = doc?.leadId ? await db.leads.get(doc.leadId) : undefined;
      const docName = doc ? `Document "${doc.name || doc.docType}" (${lead?.name || 'Lead #' + (doc?.leadId || '')})` : `Document #${id}`;
      const itemSnapshot = {
        ...doc,
        leadName: lead?.name,
        leadPhone: lead?.phoneNumber,
        leadCity: lead?.city,
        fileBlob: undefined
      };
      const { deletionRequestService } = await import('./deletionRequestService');
      await deletionRequestService.requestDeletion({
        entityType: 'document',
        entityId: id,
        entityName: docName,
        metadata: { leadId: doc?.leadId },
        reason: customReason || `Delete document requested by ${currentUser?.fullName || 'User'}`,
        itemSnapshot
      });
      return { success: true, requiresApproval: true };
    }

    const doc = await db.clientDocuments.get(id);
    if (!doc) return { success: false };
    let updatedReg: any = null;

    await db.transaction('rw', [db.clientDocuments, db.clientRegistrations], async () => {
      await db.clientDocuments.delete(id);
      if (doc.docType === 'account_details') {
        const reg = await db.clientRegistrations.get(doc.leadId);
        if (reg) {
          reg.bankFileUploaded = false;
          reg.updatedAt = new Date().toISOString();
          await db.clientRegistrations.put(reg);
          updatedReg = reg;
        }
      }
    });

    if (updatedReg) {
      saveRecordToFirestore('clientRegistrations', doc.leadId, updatedReg);
    }
    await markRecordAsDeleted(id, 'clientDocuments');
    deleteRecordFromFirestore('clientDocuments', id);
    return { success: true };
  },

  // Installation Photos
  async getInstallationPhotosByLeadId(leadId: string): Promise<InstallationPhoto[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    let localPhotos = await db.installationPhotos.where('leadId').equals(leadId).toArray().catch(() => []);
    if (localPhotos.length === 0) {
      localPhotos = await db.installationPhotos.filter(p => String(p.leadId).trim() === String(leadId).trim()).toArray();
    }
    let validLocal = localPhotos.filter(p => !deletedIds.has(p.id));

    if (validLocal.length === 0) {
      try {
        const remotePhotos = await fetchCollectionFromFirestore<InstallationPhoto>('installationPhotos');
        if (Array.isArray(remotePhotos) && remotePhotos.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remotePhotos.filter(p => !freshDeleted.has(p.id) && !freshDeleted.has(p.leadId));
          if (validRemote.length > 0) {
            for (const vr of validRemote) {
              const existing = await db.installationPhotos.get(vr.id);
              if (existing?.photoBlob && !vr.photoBlob) {
                await db.installationPhotos.put({ ...vr, photoBlob: existing.photoBlob });
              } else {
                await db.installationPhotos.put(vr);
              }
            }
            let reRead = await db.installationPhotos.where('leadId').equals(leadId).toArray().catch(() => []);
            if (reRead.length === 0) {
              reRead = await db.installationPhotos.filter(p => String(p.leadId).trim() === String(leadId).trim()).toArray();
            }
            validLocal = reRead.filter(p => !freshDeleted.has(p.id));
          }
        }
      } catch (err) {
        console.warn("Firestore installation photos sync note:", err);
      }
    }

    return validLocal;
  },

  async uploadInstallationPhoto(photoData: Omit<InstallationPhoto, 'id'>): Promise<string> {
    const id = 'photo_' + Math.random().toString(36).substring(2, 11);
    const newPhoto: InstallationPhoto = {
      ...photoData,
      id
    };
    let updatedLead: any = null;

    await db.transaction('rw', [db.installationPhotos, db.leads], async () => {
      await db.installationPhotos.add(newPhoto);

      let photos = await db.installationPhotos.where('leadId').equals(photoData.leadId).toArray().catch(() => []);
      if (photos.length === 0) {
        photos = await db.installationPhotos.filter(p => String(p.leadId).trim() === String(photoData.leadId).trim()).toArray();
      }
      const types = photos.map(p => p.photoType);
      const hasRequired = ['earthing', 'meter', 'grouting'].every(type => types.includes(type as any));

      const lead = await db.leads.get(photoData.leadId);
      if (lead && hasRequired && lead.status === 'registered') {
        lead.status = 'installed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        updatedLead = lead;
      }
    });

    if (updatedLead) {
      saveRecordToFirestore('leads', updatedLead.id, updatedLead);
    }
    saveRecordToFirestore('installationPhotos', id, newPhoto);
    return id;
  },

  async deleteInstallationPhoto(id: string): Promise<void> {
    await db.installationPhotos.delete(id);
    await markRecordAsDeleted(id, 'installationPhotos');
    deleteRecordFromFirestore('installationPhotos', id);
  },

  // Release Documents
  async getReleaseDocumentsByLeadId(leadId: string): Promise<ReleaseDocument[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    let localReleases = await db.releaseDocuments.where('leadId').equals(leadId).toArray().catch(() => []);
    if (localReleases.length === 0) {
      localReleases = await db.releaseDocuments.filter(r => String(r.leadId).trim() === String(leadId).trim()).toArray();
    }
    let validLocal = localReleases.filter(r => !deletedIds.has(r.id));

    if (validLocal.length === 0) {
      try {
        const remoteReleases = await fetchCollectionFromFirestore<ReleaseDocument>('releaseDocuments');
        if (Array.isArray(remoteReleases) && remoteReleases.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteReleases.filter(r => !freshDeleted.has(r.id) && !freshDeleted.has(r.leadId));
          if (validRemote.length > 0) {
            for (const vr of validRemote) {
              const existing = await db.releaseDocuments.get(vr.id);
              if (existing?.fileBlob && !vr.fileBlob) {
                await db.releaseDocuments.put({ ...vr, fileBlob: existing.fileBlob });
              } else {
                await db.releaseDocuments.put(vr);
              }
            }
            let reRead = await db.releaseDocuments.where('leadId').equals(leadId).toArray().catch(() => []);
            if (reRead.length === 0) {
              reRead = await db.releaseDocuments.filter(r => String(r.leadId).trim() === String(leadId).trim()).toArray();
            }
            validLocal = reRead.filter(r => !freshDeleted.has(r.id));
          }
        }
      } catch (err) {
        console.warn("Firestore release documents sync note:", err);
      }
    }

    return validLocal;
  },

  async uploadReleaseDocument(relData: Omit<ReleaseDocument, 'id' | 'uploadedAt'>): Promise<string> {
    const id = 'rel_' + Math.random().toString(36).substring(2, 11);
    const newRel: ReleaseDocument = {
      ...relData,
      id,
      uploadedAt: new Date().toISOString()
    };
    let removedDocIds: string[] = [];
    let updatedLead: any = null;

    await db.transaction('rw', [db.releaseDocuments, db.leads], async () => {
      // Clear any existing release docs for this lead so only 1 single file is kept
      let existing = await db.releaseDocuments.where('leadId').equals(relData.leadId).toArray().catch(() => []);
      if (existing.length === 0) {
        existing = await db.releaseDocuments.filter(r => String(r.leadId).trim() === String(relData.leadId).trim()).toArray();
      }
      for (const item of existing) {
        await db.releaseDocuments.delete(item.id);
        removedDocIds.push(item.id);
      }

      await db.releaseDocuments.add(newRel);

      const lead = await db.leads.get(relData.leadId);
      if (lead) {
        lead.status = 'closed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        updatedLead = lead;
      }
    });

    for (const oldId of removedDocIds) {
      await markRecordAsDeleted(oldId, 'releaseDocuments');
      deleteRecordFromFirestore('releaseDocuments', oldId);
    }
    if (updatedLead) {
      saveRecordToFirestore('leads', updatedLead.id, updatedLead);
    }
    saveRecordToFirestore('releaseDocuments', id, newRel);
    return id;
  },

  async deleteReleaseDocument(id: string): Promise<void> {
    await db.releaseDocuments.delete(id);
    await markRecordAsDeleted(id, 'releaseDocuments');
    deleteRecordFromFirestore('releaseDocuments', id);
  },

  async getAllInstallationEvidenceLeadIds(forceFresh: boolean = false): Promise<Set<string>> {
    const deletedIds = await getDeletedRecordIdsSet(forceFresh);
    const [photos, releases, challans] = await Promise.all([
      db.installationPhotos.toArray().catch(() => []),
      db.releaseDocuments.toArray().catch(() => []),
      db.challans.toArray().catch(() => [])
    ]);
    const leadIds = new Set<string>();
    photos.forEach(p => { if (p.leadId && !deletedIds.has(p.leadId) && !deletedIds.has(p.id)) leadIds.add(p.leadId); });
    releases.forEach(r => { if (r.leadId && !deletedIds.has(r.leadId) && !deletedIds.has(r.id)) leadIds.add(r.leadId); });
    challans.forEach(c => { if (c.leadId && !deletedIds.has(c.leadId) && !deletedIds.has(c.id)) leadIds.add(c.leadId); });

    const syncRemoteEvidence = async () => {
      if (activeEvidenceSyncPromise) return activeEvidenceSyncPromise;
      activeEvidenceSyncPromise = (async () => {
        try {
          lastEvidenceRemoteSync = Date.now();
          const freshDeleted = await getDeletedRecordIdsSet(true);
          const [remotePhotos, remoteReleases, remoteChallans] = await Promise.all([
            fetchCollectionFromFirestore<InstallationPhoto>('installationPhotos', 10000).catch(() => []),
            fetchCollectionFromFirestore<ReleaseDocument>('releaseDocuments', 10000).catch(() => []),
            fetchCollectionFromFirestore<any>('challans', 10000).catch(() => [])
          ]);

          const freshLeadIds = new Set<string>();

          // 1. Installation Photos reconciliation
          if (Array.isArray(remotePhotos)) {
            const valid = remotePhotos.filter(p => p && p.id && !freshDeleted.has(p.id) && (!p.leadId || !freshDeleted.has(p.leadId)));
            const validIds = new Set(valid.map(p => p.id));
            const currentLocal = await db.installationPhotos.toArray().catch(() => []);
            for (const lp of currentLocal) {
              if (!validIds.has(lp.id) || freshDeleted.has(lp.id) || (lp.leadId && freshDeleted.has(lp.leadId))) {
                const age = Date.now() - new Date(lp.uploadedAt || lp.createdAt || 0).getTime();
                if (age > 2 * 60 * 1000 || freshDeleted.has(lp.id) || (lp.leadId && freshDeleted.has(lp.leadId))) {
                  await db.installationPhotos.delete(lp.id).catch(() => {});
                }
              }
            }
            if (valid.length > 0) {
              await db.installationPhotos.bulkPut(valid).catch(() => {});
            }
            valid.forEach(p => { if (p.leadId) freshLeadIds.add(p.leadId); });
          }

          // 2. Release Documents reconciliation
          if (Array.isArray(remoteReleases)) {
            const valid = remoteReleases.filter(r => r && r.id && !freshDeleted.has(r.id) && (!r.leadId || !freshDeleted.has(r.leadId)));
            const validIds = new Set(valid.map(r => r.id));
            const currentLocal = await db.releaseDocuments.toArray().catch(() => []);
            for (const lr of currentLocal) {
              if (!validIds.has(lr.id) || freshDeleted.has(lr.id) || (lr.leadId && freshDeleted.has(lr.leadId))) {
                const age = Date.now() - new Date(lr.uploadedAt || lr.createdAt || 0).getTime();
                if (age > 2 * 60 * 1000 || freshDeleted.has(lr.id) || (lr.leadId && freshDeleted.has(lr.leadId))) {
                  await db.releaseDocuments.delete(lr.id).catch(() => {});
                }
              }
            }
            if (valid.length > 0) {
              await db.releaseDocuments.bulkPut(valid).catch(() => {});
            }
            valid.forEach(r => { if (r.leadId) freshLeadIds.add(r.leadId); });
          }

          // 3. Challans reconciliation
          if (Array.isArray(remoteChallans)) {
            const valid = remoteChallans.filter(c => c && c.id && !freshDeleted.has(c.id) && (!c.leadId || !freshDeleted.has(c.leadId)));
            const validIds = new Set(valid.map(c => c.id));
            const currentLocal = await db.challans.toArray().catch(() => []);
            for (const lc of currentLocal) {
              if (!validIds.has(lc.id) || freshDeleted.has(lc.id) || (lc.leadId && freshDeleted.has(lc.leadId))) {
                const age = Date.now() - new Date(lc.createdAt || 0).getTime();
                if (age > 2 * 60 * 1000 || freshDeleted.has(lc.id) || (lc.leadId && freshDeleted.has(lc.leadId))) {
                  await db.challans.delete(lc.id).catch(() => {});
                }
              }
            }
            if (valid.length > 0) {
              await db.challans.bulkPut(valid).catch(() => {});
            }
            valid.forEach(c => { if (c.leadId) freshLeadIds.add(c.leadId); });
          }

          const hasDifference = freshLeadIds.size !== leadIds.size || Array.from(freshLeadIds).some(id => !leadIds.has(id));
          leadIds.clear();
          freshLeadIds.forEach(id => leadIds.add(id));

          if (hasDifference && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('app-realtime-update'));
          }
        } catch (err) {
          console.warn("Background evidence sync note:", err);
        } finally {
          activeEvidenceSyncPromise = null;
        }
      })();
      return activeEvidenceSyncPromise;
    };

    if (leadIds.size === 0 || forceFresh) {
      await syncRemoteEvidence();
    } else if (Date.now() - lastEvidenceRemoteSync > EVIDENCE_SYNC_INTERVAL) {
      syncRemoteEvidence().catch(() => {});
    }

    return leadIds;
  }
};
