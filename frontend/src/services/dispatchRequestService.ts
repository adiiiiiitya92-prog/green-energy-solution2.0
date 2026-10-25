import { db, getDeletedRecordIdsSet } from './db';
import { saveRecordToFirestore, fetchCollectionFromFirestore } from './firebase';
import { challanService } from './challanService';
import type { DispatchRequest, Lead, Profile, Challan } from '../types';

const COL = 'dispatchRequests';

const isActive = (r: DispatchRequest) => r.status === 'pending' || r.status === 'acknowledged';

async function persist(rec: DispatchRequest) {
  await db.dispatchRequests.put(rec);
  await saveRecordToFirestore(COL, rec.id, rec);
}

async function syncRemote() {
  const remote = await fetchCollectionFromFirestore<DispatchRequest>(COL, 10000);
  if (!remote.length) return;
  const local = await db.dispatchRequests.bulkGet(remote.map(r => r.id));
  await db.dispatchRequests.bulkPut(
    remote.map((r, i) => {
      const cur = local[i];
      return cur && (cur.updatedAt || '') > (r.updatedAt || '') ? cur : r;
    })
  );
}

// A request is fulfilled by the first challan raised for the lead after the request was made.
function findFulfillingChallan(req: DispatchRequest, challans: Challan[]): Challan | undefined {
  return challans
    .filter(c => String(c.leadId || '') === req.leadId && (c.createdAt || '') >= req.createdAt)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))[0];
}

async function settleDispatched(requests: DispatchRequest[]): Promise<DispatchRequest[]> {
  const active = requests.filter(isActive);
  if (!active.length) return requests;
  const challans = await challanService.getChallans().catch(() => [] as Challan[]);
  const now = new Date().toISOString();
  const settled = new Map<string, DispatchRequest>();
  for (const r of active) {
    const ch = findFulfillingChallan(r, challans);
    if (ch) {
      const next: DispatchRequest = {
        ...r,
        status: 'dispatched',
        dispatchedAt: ch.createdAt || now,
        challanId: ch.id,
        challanNumber: ch.challanNumber,
        updatedAt: now
      };
      settled.set(r.id, next);
      persist(next).catch(() => {});
    }
  }
  return requests.map(r => settled.get(r.id) || r);
}

const sortNewest = (list: DispatchRequest[]) => list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

export const dispatchRequestService = {
  isActive,

  async getAll(fresh = true): Promise<DispatchRequest[]> {
    if (fresh) await syncRemote().catch(() => {});
    const deleted = await getDeletedRecordIdsSet().catch(() => new Set<string>());
    const all = (await db.dispatchRequests.toArray()).filter(r => !deleted.has(r.id) && !deleted.has(r.leadId));
    return sortNewest(await settleDispatched(all));
  },

  async getForLead(leadId: string): Promise<DispatchRequest[]> {
    const remote = await fetchCollectionFromFirestore<DispatchRequest>(COL, 6000, { leadId }).catch(() => []);
    if (remote.length) {
      const local = await db.dispatchRequests.bulkGet(remote.map(r => r.id));
      await db.dispatchRequests.bulkPut(remote.map((r, i) => (local[i] && (local[i]!.updatedAt || '') > (r.updatedAt || '') ? local[i]! : r)));
    }
    const list = await db.dispatchRequests.where({ leadId }).toArray();
    return sortNewest(await settleDispatched(list));
  },

  async create(params: { lead: Lead; remark: string; totalPaid: number; orderTotal: number; user: Profile; role: string }): Promise<DispatchRequest> {
    const existing = (await this.getForLead(params.lead.id)).find(isActive);
    if (existing) throw new Error('A dispatch request is already open for this lead.');
    const now = new Date().toISOString();
    const rec: DispatchRequest = {
      id: `dsp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      leadId: params.lead.id,
      leadName: params.lead.name,
      leadPhone: params.lead.phoneNumber,
      remark: params.remark.trim(),
      totalPaid: params.totalPaid,
      orderTotal: params.orderTotal,
      status: 'pending',
      requestedById: params.user.id,
      requestedByName: params.user.fullName,
      requestedByRole: params.role,
      createdAt: now,
      updatedAt: now
    };
    await persist(rec);
    return rec;
  },

  async acknowledge(req: DispatchRequest, user: Profile): Promise<DispatchRequest> {
    const now = new Date().toISOString();
    const next: DispatchRequest = { ...req, status: 'acknowledged', acknowledgedAt: now, acknowledgedByName: user.fullName, updatedAt: now };
    await persist(next);
    return next;
  },

  async cancel(req: DispatchRequest, user: Profile): Promise<DispatchRequest> {
    const now = new Date().toISOString();
    const next: DispatchRequest = { ...req, status: 'cancelled', cancelledAt: now, cancelledByName: user.fullName, updatedAt: now };
    await persist(next);
    return next;
  }
};
