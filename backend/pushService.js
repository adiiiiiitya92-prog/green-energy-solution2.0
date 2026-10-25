import webpush from 'web-push';
import crypto from 'crypto';
import { getCollection, connectMongo } from './mongoService.js';

const SUBS = 'pushSubscriptions';
const DEFAULT_SUBJECT = 'https://solar.187.126.120.54.sslip.io';

let vapidPromise = null;

// Env keys win; otherwise keys are generated once and persisted so every server restart reuses them
// (rotating keys would silently invalidate every existing subscription).
export function ensureVapid() {
  if (vapidPromise) return vapidPromise;
  vapidPromise = (async () => {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      await connectMongo();
      const cfg = getCollection('appConfig');
      const existing = await cfg.findOne({ _id: 'vapidKeys' });
      if (existing?.publicKey && existing?.privateKey) {
        ({ publicKey, privateKey } = existing);
      } else {
        ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
        await cfg.updateOne(
          { _id: 'vapidKeys' },
          { $setOnInsert: { publicKey, privateKey, createdAt: new Date().toISOString() } },
          { upsert: true }
        );
        const stored = await cfg.findOne({ _id: 'vapidKeys' });
        ({ publicKey, privateKey } = stored);
      }
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || DEFAULT_SUBJECT, publicKey, privateKey);
    return { publicKey };
  })().catch(err => {
    vapidPromise = null;
    throw err;
  });
  return vapidPromise;
}

const subId = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

export async function saveSubscription({ subscription, userId, userRole, userName, platform }) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !userId) {
    const err = new Error('Invalid subscription payload');
    err.statusCode = 400;
    throw err;
  }
  const id = subId(subscription.endpoint);
  await getCollection(SUBS).updateOne(
    { _id: id },
    {
      $set: {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        userId,
        userRole: userRole || '',
        userName: userName || '',
        platform: platform || 'unknown',
        updatedAt: new Date().toISOString()
      },
      $setOnInsert: { createdAt: new Date().toISOString() }
    },
    { upsert: true }
  );
  return id;
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await getCollection(SUBS).deleteOne({ _id: subId(endpoint) });
}

async function sendToSubs(subs, payload) {
  if (!subs.length) return { sent: 0, failed: 0 };
  await ensureVapid();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = browser revoked the subscription; drop it so we stop retrying
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await getCollection(SUBS).deleteOne({ _id: s._id }).catch(() => {});
      } else {
        console.warn(`[Push] send failed (${err?.statusCode || ''}) for ${s.userId}:`, err?.body || err?.message);
      }
    }
  }));
  return { sent, failed };
}

export async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return { sent: 0, failed: 0 };
  const subs = await getCollection(SUBS).find({ userId: { $in: ids } }).toArray();
  return sendToSubs(subs, payload);
}

export async function notifyRole(role, payload, excludeUserId) {
  const filter = { userRole: role };
  if (excludeUserId) filter.userId = { $ne: excludeUserId };
  const subs = await getCollection(SUBS).find(filter).toArray();
  return sendToSubs(subs, payload);
}

// ---------- Change-driven triggers ----------

export const PUSH_WATCHED = new Set(['leads', 'leaveRequests', 'paymentRequests', 'deletionRequests', 'expenses', 'dispatchRequests']);

const LEAD_ASSIGN_FIELDS = ['assignedSalesPersonId', 'assignedAdminId', 'assignedEmployeeId'];
const FRESH_MS = 3 * 24 * 3600 * 1000;

// Records first seen by the server long after creation are usually offline/reconciliation re-syncs, not new events.
const isFresh = (...dates) => {
  const t = dates.map(d => (d ? new Date(d).getTime() : NaN)).find(n => !isNaN(n));
  return t === undefined ? true : Date.now() - t < FRESH_MS;
};

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const ENTITY_LABEL = {
  lead: 'Lead', quotation: 'Quotation', challan: 'Challan', document: 'Document', product: 'Product',
  photo: 'Photo', complaint: 'Complaint', employee: 'Employee', b2bBusiness: 'B2B Business', visit: 'Visit', other: 'Item'
};

export async function handlePushTriggers(collection, prev, next) {
  if (!next || next.isDeleted) return;

  if (collection === 'leads') {
    const newlyAssigned = LEAD_ASSIGN_FIELDS
      .map(f => next[f])
      .filter(uid => uid && !LEAD_ASSIGN_FIELDS.some(f => prev?.[f] === uid));
    if (!newlyAssigned.length) return;
    if (!prev && !isFresh(next.createdAt)) return;
    const recipients = newlyAssigned.filter(uid => prev || uid !== next.createdBy);
    await notifyUsers(recipients, {
      title: '🆕 New Lead Assigned',
      body: `${next.name || 'Customer'}${next.phoneNumber ? ` • ${next.phoneNumber}` : ''}${next.requirement ? ` • ${next.requirement}` : ''}`,
      url: '/leads',
      tag: `lead-${next.id}`
    });
    return;
  }

  // Approval requests → super admin, dispatch requests → inventory; only on the transition into 'pending'
  if (next.status !== 'pending' || prev?.status === 'pending') return;

  let payload = null;
  let requesterId = null;
  let targetRole = 'super_admin';

  if (collection === 'dispatchRequests') {
    if (!prev && !isFresh(next.createdAt)) return;
    requesterId = next.requestedById;
    targetRole = 'inventory_manager';
    payload = {
      title: '🚚 Dispatch Required',
      body: `${next.leadName || 'Lead'}${next.remark ? ` • ${next.remark}` : ''} — from ${next.requestedByName || 'Admin'}`.slice(0, 240),
      url: '/inventory-panel?dispatch=1',
      tag: `dispatch-${next.id}`
    };
  } else if (collection === 'leaveRequests') {
    if (!prev && !isFresh(next.appliedAt, next.createdAt)) return;
    requesterId = next.employeeId;
    payload = {
      title: '🗓️ Leave Approval Request',
      body: `${next.employeeName || 'Employee'} • ${next.totalDays || ''} day(s) • ${next.startDate || ''}${next.endDate && next.endDate !== next.startDate ? ` → ${next.endDate}` : ''}`,
      url: '/leave-requests',
      tag: `leave-${next.id}`
    };
  } else if (collection === 'paymentRequests') {
    if (!prev && !isFresh(next.createdAt)) return;
    requesterId = next.supervisorId;
    payload = {
      title: '💰 Payment Approval Request',
      body: `${next.supervisorName || 'Supervisor'} • ${inr(next.requestedAmount)}${next.leadName ? ` • ${next.leadName}` : ''}`,
      url: '/installation-payments',
      tag: `payreq-${next.id}`
    };
  } else if (collection === 'expenses') {
    if (!prev && !isFresh(next.submittedAt, next.createdAt)) return;
    requesterId = next.employeeId;
    payload = {
      title: '🧾 Expense Approval Request',
      body: `${next.employeeName || 'Employee'} • ${inr(next.amount)}${next.title ? ` • ${next.title}` : ''}`,
      url: '/expenses',
      tag: `expense-${next.id}`
    };
  } else if (collection === 'deletionRequests') {
    if (!prev && !isFresh(next.requestedAt, next.createdAt)) return;
    requesterId = next.requestedByUserId;
    const isEdit = next.requestType === 'edit';
    payload = {
      title: isEdit ? '✏️ Edit Approval Request' : '🗑️ Delete Approval Request',
      body: `${next.requestedByUserName || 'Staff'} wants to ${isEdit ? 'edit' : 'delete'} ${ENTITY_LABEL[next.entityType] || 'item'}: ${next.entityName || next.entityId || ''}`,
      url: '/dashboard?approvals=1',
      tag: `delreq-${next.id}`
    };
  }

  if (payload) await notifyRole(targetRole, payload, requesterId);
}
