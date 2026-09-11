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
  const [leadsSnap, quotesSnap, ocsSnap, delSnap] = await Promise.all([
    getDocs(collection(db, 'leads')),
    getDocs(collection(db, 'quotations')),
    getDocs(collection(db, 'orderConfirmations')),
    getDocs(collection(db, 'deletedRecords')).catch(() => ({ docs: [] }))
  ]);

  const deletedIds = new Set(delSnap.docs.map(d => d.id));
  const leads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => !deletedIds.has(l.id));
  const quotes = quotesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => !deletedIds.has(q.id));
  const ocs = ocsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !deletedIds.has(c.id));

  const quoteByLeadId = new Map();
  quotes.forEach(q => { if (q.leadId && !quoteByLeadId.has(q.leadId)) quoteByLeadId.set(q.leadId, q); });
  const ocByLeadId = new Map();
  ocs.forEach(oc => { if (oc.leadId) ocByLeadId.set(oc.leadId, oc); });

  const leadCalculations = leads.map(l => {
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
      id: l.id,
      name: l.name,
      status: l.status,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      contractVal,
      paidVal,
      pendingVal,
      assignedSalesPersonId: l.assignedSalesPersonId,
      assignedAdminId: l.assignedAdminId,
      assignedEmployeeId: l.assignedEmployeeId
    };
  });

  // Let's check updatedAt dates of closed and installed leads
  const closed = leadCalculations.filter(l => l.status === 'closed');
  const installed = leadCalculations.filter(l => l.status === 'installed');
  console.log(`Total Closed: ${closed.length} (with dues: ${closed.filter(l => l.pendingVal > 0).length})`);
  console.log(`Total Installed: ${installed.length} (with dues: ${installed.filter(l => l.pendingVal > 0).length})`);

  // Check how many were updated on 08-Sep or 09-Sep
  const updated09Sep = leadCalculations.filter(l => (l.updatedAt || '').startsWith('2026-09-09'));
  const updated08Sep = leadCalculations.filter(l => (l.updatedAt || '').startsWith('2026-09-08'));
  console.log(`Updated on 09-Sep: ${updated09Sep.length}`);
  console.log(`Updated on 08-Sep: ${updated08Sep.length}`);

  // Let's see status breakdown of updated on 08-Sep and 09-Sep
  console.log("\n08-Sep updates by status:");
  const st08 = {};
  updated08Sep.forEach(l => st08[l.status] = (st08[l.status] || 0) + 1);
  console.log(st08);

  console.log("\n09-Sep updates by status:");
  const st09 = {};
  updated09Sep.forEach(l => st09[l.status] = (st09[l.status] || 0) + 1);
  console.log(st09);

  // Check what combination could equal 112 leads yesterday
  // E.g. if installed leads were 22 yesterday and closed were 90, 90 + 22 = 112!!
  // Or closed leads: 107 total leads in closed status - 11 fully paid = 96 with dues.
  // Wait! Total closed leads in DB = 107!
  // What was total closed + installed leads yesterday?
  console.log("\nInstalled leads created/updated timestamps:");
  installed.forEach(l => {
    console.log(`- ${l.name}: status=${l.status}, createdAt=${l.createdAt?.substring(0, 10)}, updatedAt=${l.updatedAt}, dues=${l.pendingVal}`);
  });

  process.exit(0);
}

run().catch(console.error);
