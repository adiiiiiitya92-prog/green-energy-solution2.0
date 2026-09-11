import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKLwdN137XN8xbFU58BATMRoVFPyVbVVE",
  authDomain: "green-energy-solution-dcfa8.firebaseapp.com",
  projectId: "green-energy-solution-dcfa8",
  storageBucket: "green-energy-solution-dcfa8.firebasestorage.app",
  messagingSenderId: "169155482765",
  appId: "1:169155482765:web:955e322b4c1655fe2ebec4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getQuotationTotalAmount(q) {
  if (!q) return 0;
  const items = q.items || q.lineItems || [];
  const subtotal = q.subtotal !== undefined && q.subtotal !== null && Number(q.subtotal) > 0
    ? Number(q.subtotal)
    : (Array.isArray(items) ? items.reduce((s, i) => s + (Number(i.amount) || (Number(i.qty || 1) * Number(i.rate || 0)) || 0), 0) : 0);
  const gstRateVal = q.gstRate !== undefined && q.gstRate !== null ? Number(q.gstRate) : 0;
  const taxAmt = Math.round(subtotal * (gstRateVal / 100));
  const subtotalWithTax = subtotal + taxAmt;
  if (subtotalWithTax > 0) return subtotalWithTax;
  if (typeof q.grandTotal === 'number' && q.grandTotal > 0) {
    const subsidyVal = Number(q.subsidyAmount) || 0;
    if (subsidyVal > 0 && q.grandTotal < (subtotal + taxAmt)) return q.grandTotal + subsidyVal;
    return q.grandTotal;
  }
  return 0;
}

function getPaymentsList(c) {
  if (c.payments && c.payments.length > 0) return c.payments;
  return [{ id: 'p1', installmentNo: 1, label: '1st Advance', amount: c.advanceAmount || 0, paymentMode: c.paymentMode || 'utr', paidAt: c.createdAt }];
}

async function run() {
  console.log("Loading data from Firestore...");
  const [leadsSnap, quotesSnap, ocsSnap, delSnap] = await Promise.all([
    getDocs(collection(db, 'leads')),
    getDocs(collection(db, 'quotations')),
    getDocs(collection(db, 'orderConfirmations')),
    getDocs(collection(db, 'deletedRecords')).catch(() => ({ docs: [] }))
  ]);

  const deletedIds = new Set(delSnap.docs.map(d => d.id));
  const allLeads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => !deletedIds.has(l.id));
  const quotes = quotesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !deletedIds.has(q.id));
  const ocs = ocsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !deletedIds.has(c.id));

  const quoteByLeadId = new Map();
  quotes.forEach(q => {
    if (q.leadId && !quoteByLeadId.has(q.leadId)) quoteByLeadId.set(q.leadId, q);
  });

  const ocByLeadId = new Map();
  ocs.forEach(oc => {
    if (oc.leadId) ocByLeadId.set(oc.leadId, oc);
  });

  console.log(`Active Leads: ${allLeads.length}, Active Quotes: ${quotes.length}, Active OCs: ${ocs.length}`);

  // Calculate financials for each lead
  const leadData = allLeads.map(l => {
    const mainQuote = quoteByLeadId.get(l.id);
    const oc = ocByLeadId.get(l.id);
    const quoteTotal = mainQuote ? getQuotationTotalAmount(mainQuote) : 0;
    const ocSubtotal = oc ? (oc.subtotal || (Array.isArray(oc.itemsConfirmed) ? oc.itemsConfirmed.reduce((s, i) => s + (i.amount || 0), 0) : 0) || oc.advanceAmount || 0) : 0;
    let contractVal = quoteTotal > 0 ? quoteTotal : ocSubtotal;
    const pList = oc ? getPaymentsList(oc) : [];
    const paidVal = pList.reduce((sum, p) => sum + (p?.amount || 0), 0);
    if (contractVal <= 0 && paidVal > 0) contractVal = paidVal;
    const pendingVal = Math.max(0, contractVal - paidVal);

    return {
      lead: l,
      contractVal,
      paidVal,
      pendingVal,
      status: l.status,
      assignedSalesPersonId: l.assignedSalesPersonId,
      assignedAdminId: l.assignedAdminId,
      assignedEmployeeId: l.assignedEmployeeId,
      dealerId: l.dealerId,
      createdBy: l.createdBy,
      updatedAt: l.updatedAt,
      createdAt: l.createdAt
    };
  });

  // 1. Group by status
  const byStatus = {};
  for (const item of leadData) {
    const st = item.status || 'unknown';
    if (!byStatus[st]) byStatus[st] = { totalLeads: 0, leadsWithDues: 0, contract: 0, paid: 0, pending: 0 };
    byStatus[st].totalLeads++;
    if (item.pendingVal > 0) {
      byStatus[st].leadsWithDues++;
      byStatus[st].contract += item.contractVal;
      byStatus[st].paid += item.paidVal;
      byStatus[st].pending += item.pendingVal;
    }
  }
  console.log("\n--- BY LEAD STATUS (LEADS WITH DUES > 0) ---");
  console.table(byStatus);

  // 2. Process Done combinations:
  // Option A: closed ONLY
  const closedOnly = leadData.filter(i => i.status === 'closed' && i.pendingVal > 0);
  const closedPending = closedOnly.reduce((s, i) => s + i.pendingVal, 0);
  const closedContract = closedOnly.reduce((s, i) => s + i.contractVal, 0);
  const closedPaid = closedOnly.reduce((s, i) => s + i.paidVal, 0);

  // Option B: installed ONLY
  const installedOnly = leadData.filter(i => i.status === 'installed' && i.pendingVal > 0);
  const installedPending = installedOnly.reduce((s, i) => s + i.pendingVal, 0);
  const installedContract = installedOnly.reduce((s, i) => s + i.contractVal, 0);
  const installedPaid = installedOnly.reduce((s, i) => s + i.paidVal, 0);

  // Option C: closed + installed (Dashboard Process Done)
  const procDone = leadData.filter(i => (i.status === 'closed' || i.status === 'installed') && i.pendingVal > 0);
  const procDonePending = procDone.reduce((s, i) => s + i.pendingVal, 0);
  const procDoneContract = procDone.reduce((s, i) => s + i.contractVal, 0);
  const procDonePaid = procDone.reduce((s, i) => s + i.paidVal, 0);

  console.log("\n--- PROCESS DONE BREAKDOWN ---");
  console.log(`CLOSED ONLY: Count = ${closedOnly.length}, Contract = ₹${closedContract.toLocaleString('en-IN')}, Paid = ₹${closedPaid.toLocaleString('en-IN')}, Pending = ₹${closedPending.toLocaleString('en-IN')}`);
  console.log(`INSTALLED ONLY: Count = ${installedOnly.length}, Contract = ₹${installedContract.toLocaleString('en-IN')}, Paid = ₹${installedPaid.toLocaleString('en-IN')}, Pending = ₹${installedPending.toLocaleString('en-IN')}`);
  console.log(`CLOSED + INSTALLED (TOTAL): Count = ${procDone.length}, Contract = ₹${procDoneContract.toLocaleString('en-IN')}, Paid = ₹${procDonePaid.toLocaleString('en-IN')}, Pending = ₹${procDonePending.toLocaleString('en-IN')}`);

  process.exit(0);
}

run().catch(console.error);
