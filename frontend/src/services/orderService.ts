import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type { OrderConfirmation, ClientDocument, ClientRegistration, InstallationPhoto, ReleaseDocument } from '../types';
import { saveRecordToFirestore, deleteRecordFromFirestore, fetchCollectionFromFirestore } from './firebase';

export const orderService = {
  // Order Confirmations
  async getOrderConfirmationByLeadId(leadId: string): Promise<OrderConfirmation | undefined> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return undefined;

    let oc = await db.orderConfirmations.where({ leadId }).first();
    if (oc && deletedIds.has(oc.id)) return undefined;

    if (!oc) {
      try {
        const remoteOcs = await fetchCollectionFromFirestore<OrderConfirmation>('orderConfirmations');
        if (Array.isArray(remoteOcs) && remoteOcs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteOcs.filter(o => !freshDeleted.has(o.id) && !freshDeleted.has(o.leadId));
          if (validRemote.length > 0) {
            await db.orderConfirmations.bulkPut(validRemote);
            oc = await db.orderConfirmations.where({ leadId }).first();
          }
        }
      } catch (err) {
        console.warn("Firestore orderConfirmations sync note:", err);
      }
    } else {
      fetchCollectionFromFirestore<OrderConfirmation>('orderConfirmations').then(async (remoteOcs) => {
        if (Array.isArray(remoteOcs) && remoteOcs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteOcs.filter(o => !freshDeleted.has(o.id) && !freshDeleted.has(o.leadId));
          if (validRemote.length > 0) {
            db.orderConfirmations.bulkPut(validRemote).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    if (oc && deletedIds.has(oc.id)) return undefined;
    return oc;
  },

  async createOrderConfirmation(ocData: Omit<OrderConfirmation, 'id' | 'createdAt'>): Promise<string> {
    const id = 'oc_' + Math.random().toString(36).substring(2, 11);
    const newOc: OrderConfirmation = {
      ...ocData,
      id,
      createdAt: new Date().toISOString()
    };
    await db.transaction('rw', [db.orderConfirmations, db.leads, db.clientRegistrations], async () => {
      await db.orderConfirmations.add(newOc);
      
      const lead = await db.leads.get(ocData.leadId);
      if (lead) {
        lead.status = 'confirmed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        saveRecordToFirestore('leads', lead.id, lead);
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
        saveRecordToFirestore('clientRegistrations', ocData.leadId, newReg);
      }
    });

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
    } else {
      fetchCollectionFromFirestore<ClientRegistration>('clientRegistrations').then(async (remoteRegs) => {
        if (Array.isArray(remoteRegs) && remoteRegs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteRegs.filter(r => !freshDeleted.has(r.leadId));
          if (validRemote.length > 0) {
            db.clientRegistrations.bulkPut(validRemote).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    return reg;
  },

  async saveClientRegistration(registration: ClientRegistration): Promise<void> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(registration.leadId)) return;
    registration.updatedAt = new Date().toISOString();
    await db.transaction('rw', [db.clientRegistrations, db.leads], async () => {
      await db.clientRegistrations.put(registration);
      
      const lead = await db.leads.get(registration.leadId);
      if (lead && lead.status === 'confirmed' && registration.registrationDone) {
        lead.status = 'registered';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        saveRecordToFirestore('leads', lead.id, lead);
      }
    });

    saveRecordToFirestore('clientRegistrations', registration.leadId, registration);
  },

  // Client Documents (Slots: PAN, Aadhar, Bill, Tax, Bank etc)
  async getClientDocumentsByLeadId(leadId: string): Promise<ClientDocument[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    const localDocs = await db.clientDocuments.where({ leadId }).toArray();
    let validLocal = localDocs.filter(d => !deletedIds.has(d.id));

    if (validLocal.length === 0) {
      try {
        const remoteDocs = await fetchCollectionFromFirestore<ClientDocument>('clientDocuments');
        if (Array.isArray(remoteDocs) && remoteDocs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteDocs.filter(d => !freshDeleted.has(d.id) && !freshDeleted.has(d.leadId));
          if (validRemote.length > 0) {
            await db.clientDocuments.bulkPut(validRemote);
            const reRead = await db.clientDocuments.where({ leadId }).toArray();
            validLocal = reRead.filter(d => !freshDeleted.has(d.id));
          }
        }
      } catch (err) {
        console.warn("Firestore documents sync note:", err);
      }
    } else {
      fetchCollectionFromFirestore<ClientDocument>('clientDocuments').then(async (remoteDocs) => {
        if (Array.isArray(remoteDocs) && remoteDocs.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteDocs.filter(d => !freshDeleted.has(d.id) && !freshDeleted.has(d.leadId));
          if (validRemote.length > 0) {
            db.clientDocuments.bulkPut(validRemote).catch(() => {});
          }
        }
      }).catch(() => {});
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

    await db.transaction('rw', [db.clientDocuments, db.clientRegistrations], async () => {
      const existing = await db.clientDocuments.where({ leadId: docData.leadId, docType: docData.docType }).first();
      if (existing) {
        await db.clientDocuments.delete(existing.id);
        await markRecordAsDeleted(existing.id, 'clientDocuments');
        deleteRecordFromFirestore('clientDocuments', existing.id);
      }
      await db.clientDocuments.add(newDoc);

      if (docData.docType === 'account_details') {
        const reg = await db.clientRegistrations.get(docData.leadId);
        if (reg) {
          reg.bankFileUploaded = true;
          reg.updatedAt = new Date().toISOString();
          await db.clientRegistrations.put(reg);
          saveRecordToFirestore('clientRegistrations', docData.leadId, reg);
        }
      }
    });

    saveRecordToFirestore('clientDocuments', id, newDoc);
    return id;
  },

  async deleteClientDocument(id: string): Promise<void> {
    const doc = await db.clientDocuments.get(id);
    if (!doc) return;
    await db.transaction('rw', [db.clientDocuments, db.clientRegistrations], async () => {
      await db.clientDocuments.delete(id);
      if (doc.docType === 'account_details') {
        const reg = await db.clientRegistrations.get(doc.leadId);
        if (reg) {
          reg.bankFileUploaded = false;
          reg.updatedAt = new Date().toISOString();
          await db.clientRegistrations.put(reg);
          saveRecordToFirestore('clientRegistrations', doc.leadId, reg);
        }
      }
    });

    await markRecordAsDeleted(id, 'clientDocuments');
    deleteRecordFromFirestore('clientDocuments', id);
  },

  // Installation Photos
  async getInstallationPhotosByLeadId(leadId: string): Promise<InstallationPhoto[]> {
    const deletedIds = await getDeletedRecordIdsSet();
    if (deletedIds.has(leadId)) return [];

    const localPhotos = await db.installationPhotos.where({ leadId }).toArray();
    let validLocal = localPhotos.filter(p => !deletedIds.has(p.id));

    if (validLocal.length === 0) {
      try {
        const remotePhotos = await fetchCollectionFromFirestore<InstallationPhoto>('installationPhotos');
        if (Array.isArray(remotePhotos) && remotePhotos.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remotePhotos.filter(p => !freshDeleted.has(p.id) && !freshDeleted.has(p.leadId));
          if (validRemote.length > 0) {
            await db.installationPhotos.bulkPut(validRemote);
            const reRead = await db.installationPhotos.where({ leadId }).toArray();
            validLocal = reRead.filter(p => !freshDeleted.has(p.id));
          }
        }
      } catch (err) {
        console.warn("Firestore installation photos sync note:", err);
      }
    } else {
      fetchCollectionFromFirestore<InstallationPhoto>('installationPhotos').then(async (remotePhotos) => {
        if (Array.isArray(remotePhotos) && remotePhotos.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remotePhotos.filter(p => !freshDeleted.has(p.id) && !freshDeleted.has(p.leadId));
          if (validRemote.length > 0) {
            db.installationPhotos.bulkPut(validRemote).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    return validLocal;
  },

  async uploadInstallationPhoto(photoData: Omit<InstallationPhoto, 'id'>): Promise<string> {
    const id = 'photo_' + Math.random().toString(36).substring(2, 11);
    const newPhoto: InstallationPhoto = {
      ...photoData,
      id
    };
    await db.transaction('rw', [db.installationPhotos, db.leads], async () => {
      await db.installationPhotos.add(newPhoto);

      const photos = await db.installationPhotos.where({ leadId: photoData.leadId }).toArray();
      const types = photos.map(p => p.photoType);
      const hasRequired = ['earthing', 'meter', 'grouting'].every(type => types.includes(type as any));

      const lead = await db.leads.get(photoData.leadId);
      if (lead && hasRequired && lead.status === 'registered') {
        lead.status = 'installed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        saveRecordToFirestore('leads', lead.id, lead);
      }
    });

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

    const localReleases = await db.releaseDocuments.where({ leadId }).toArray();
    let validLocal = localReleases.filter(r => !deletedIds.has(r.id));

    if (validLocal.length === 0) {
      try {
        const remoteReleases = await fetchCollectionFromFirestore<ReleaseDocument>('releaseDocuments');
        if (Array.isArray(remoteReleases) && remoteReleases.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteReleases.filter(r => !freshDeleted.has(r.id) && !freshDeleted.has(r.leadId));
          if (validRemote.length > 0) {
            await db.releaseDocuments.bulkPut(validRemote);
            const reRead = await db.releaseDocuments.where({ leadId }).toArray();
            validLocal = reRead.filter(r => !freshDeleted.has(r.id));
          }
        }
      } catch (err) {
        console.warn("Firestore release documents sync note:", err);
      }
    } else {
      fetchCollectionFromFirestore<ReleaseDocument>('releaseDocuments').then(async (remoteReleases) => {
        if (Array.isArray(remoteReleases) && remoteReleases.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remoteReleases.filter(r => !freshDeleted.has(r.id) && !freshDeleted.has(r.leadId));
          if (validRemote.length > 0) {
            db.releaseDocuments.bulkPut(validRemote).catch(() => {});
          }
        }
      }).catch(() => {});
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
    await db.transaction('rw', [db.releaseDocuments, db.leads], async () => {
      // Clear any existing release docs for this lead so only 1 single file is kept
      const existing = await db.releaseDocuments.where({ leadId: relData.leadId }).toArray();
      for (const item of existing) {
        await db.releaseDocuments.delete(item.id);
        await markRecordAsDeleted(item.id, 'releaseDocuments');
        deleteRecordFromFirestore('releaseDocuments', item.id);
      }

      await db.releaseDocuments.add(newRel);

      const lead = await db.leads.get(relData.leadId);
      if (lead) {
        lead.status = 'closed';
        lead.updatedAt = new Date().toISOString();
        await db.leads.put(lead);
        saveRecordToFirestore('leads', lead.id, lead);
      }
    });

    saveRecordToFirestore('releaseDocuments', id, newRel);
    return id;
  },

  async deleteReleaseDocument(id: string): Promise<void> {
    await db.releaseDocuments.delete(id);
    await markRecordAsDeleted(id, 'releaseDocuments');
    deleteRecordFromFirestore('releaseDocuments', id);
  }
};
