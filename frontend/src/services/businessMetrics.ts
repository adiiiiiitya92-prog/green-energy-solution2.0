import type {
  Challan, ExpenseClaim, InstallationRecord, Lead, OrderConfirmation, PaymentRequest, Product, ProductChallan, Profile, Quotation
} from '../types';
import { getQuotationTotalAmount, latestByLead } from './quotationService';
import { buildContractValueMap, leadIncentive, resolveChannelPartner } from './channelPartnerIncentive';

/**
 * Business P&L, lead by lead.
 *
 * Which leads: only "Process Done" leads (installed / closed, material dispatched, or installation evidence)
 * that have a contract value — the same leads as the Lead Pipeline filters
 * "Process Done – Payment Due" and "Process & Payment Done".
 *
 * Month: the month the work was completed (installation completed date, else last dispatch date).
 *
 * Income: quoted amount and collected amount, both without GST.
 * System cost: material actually dispatched (challan qty × catalog purchase price)
 *            + approved installation payments of the lead
 *            + approved expenses linked to the lead
 *            + channel partner incentive.
 * Expenses not linked to any lead are "general expenses" and only reduce the net profit.
 */

const KW_IN_TEXT = /(\d+(?:\.\d+)?)\s*(?:k\.?\s*w|kwp|kilo\s*watt)/i;

/** System size in kW: the quotation's "System Capacity" first, else the lead requirement text. Shown for information only. */
export function systemKw(lead: Lead, quote?: Quotation): number {
  const cap = String(quote?.systemCapacity ?? '').trim();
  const fromCap = cap.match(/^(\d+(?:\.\d+)?)/);
  if (fromCap) return Number(fromCap[1]) || 0;
  const fromReq = String(lead.requirement || '').match(KW_IN_TEXT);
  return fromReq ? Number(fromReq[1]) || 0 : 0;
}

const monthKey = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const latestIso = (list: (string | undefined)[]) =>
  list.filter(Boolean).sort().pop() as string | undefined;
const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface MaterialLine {
  source: string; // challan number
  productName: string;
  qty: number;
  rate: number; // purchase price used (0 = not known)
  amount: number;
}

export interface LeadPL {
  leadId: string;
  name: string;
  phone: string;
  status: Lead['status'];
  paymentStatus: 'due' | 'done';
  completedAt: string;
  completedFrom: 'installation' | 'dispatch' | 'lead';
  kw: number;
  gstPct: number;
  contractWithGst: number;
  quoted: number; // ex GST
  collected: number; // ex GST
  pendingWithGst: number; // still to collect from client
  material: number;
  materialLines: MaterialLine[];
  unpricedItems: number; // dispatched lines with no purchase price in the catalog
  installation: number;
  leadExpenses: number;
  expenseTitles: string[];
  partnerIncentive: number;
  systemCost: number;
  profit: number; // quoted − system cost
  cashProfit: number; // collected − system cost
}

export interface GeneralExpenseRow {
  id: string;
  expenseNumber: string;
  title: string;
  category: string;
  employeeName: string;
  date: string;
  amount: number;
  project: string;
}

export interface MonthMetrics {
  key: string; // YYYY-MM
  systems: number;
  dueCount: number;
  doneCount: number;
  kw: number;
  quoted: number;
  collected: number;
  pendingWithGst: number;
  material: number;
  installation: number;
  leadExpenses: number;
  partnerIncentive: number;
  systemCost: number;
  profit: number;
  cashProfit: number;
  generalExpenses: number;
  netProfit: number; // profit − general expenses
  unpricedItems: number;
  leads: LeadPL[];
}

export interface CapacitySummary {
  systems: number;
  kw: number;
  dueCount: number;
  doneCount: number;
  unknownKwSystems: number;
}

export interface BusinessInput {
  leads: Lead[];
  quotations: Quotation[];
  orderConfirmations: OrderConfirmation[];
  expenses: ExpenseClaim[];
  paymentRequests: PaymentRequest[];
  partners: Pick<Profile, 'id' | 'fullName'>[];
  challans: Challan[];
  productChallans: ProductChallan[];
  products: Product[];
  installations: InstallationRecord[];
  evidenceLeadIds: Set<string>;
}

const emptyMonth = (key: string): MonthMetrics => ({
  key, systems: 0, dueCount: 0, doneCount: 0, kw: 0, quoted: 0, collected: 0, pendingWithGst: 0,
  material: 0, installation: 0, leadExpenses: 0, partnerIncentive: 0, systemCost: 0, profit: 0, cashProfit: 0,
  generalExpenses: 0, netProfit: 0, unpricedItems: 0, leads: []
});

/** Purchase price of a dispatched line. Only catalog products are priced: a non-catalog line carries the quotation's selling price. */
function purchaseRate(item: { productId?: string; rate?: number }, products: Map<string, Product>): number {
  const p = item.productId ? products.get(item.productId) : undefined;
  if (!p) return 0;
  const saved = Number(item.rate) || 0; // catalog price at the time the challan was made
  return saved > 0 ? saved : (Number(p.rate) || Number((p as any).bomRate) || 0);
}

/** Expense → lead: explicit link first, else a unique lead name found in the "project / site" text. */
export function buildExpenseLeadResolver(leads: Lead[]) {
  const byId = new Set(leads.map(l => l.id));
  const named = leads
    .map(l => ({ id: l.id, name: norm(l.name) }))
    .filter(x => x.name.length >= 4);
  return (e: ExpenseClaim): string | undefined => {
    if (e.leadId && byId.has(e.leadId)) return e.leadId;
    const text = norm(e.associatedProject);
    if (!text) return undefined;
    const hits = named.filter(x => text.includes(x.name));
    if (hits.length === 0) return undefined;
    const longest = Math.max(...hits.map(h => h.name.length));
    const best = hits.filter(h => h.name.length === longest);
    const ids = new Set(best.map(b => b.id));
    return ids.size === 1 ? best[0].id : undefined;
  };
}

export function computeBusinessMetrics(input: BusinessInput): { capacity: CapacitySummary; months: Map<string, MonthMetrics>; leads: LeadPL[]; generalExpenses: GeneralExpenseRow[] } {
  const quotes = latestByLead(input.quotations.filter(q => q.items && q.items.length > 0));
  const ocs = latestByLead(input.orderConfirmations);
  const contract = buildContractValueMap(input.quotations, input.orderConfirmations);
  const productsById = new Map(input.products.map(p => [p.id, p]));
  const installByLead = latestByLead(input.installations);

  const challansByLead = new Map<string, Challan[]>();
  input.challans.forEach(c => {
    if (!c?.leadId || c.type === 'b2b') return;
    const arr = challansByLead.get(c.leadId) || [];
    arr.push(c);
    challansByLead.set(c.leadId, arr);
  });
  const productChallansByLead = new Map<string, ProductChallan[]>();
  input.productChallans.forEach(c => {
    if (!c?.leadId || c.status === 'cancelled') return;
    const arr = productChallansByLead.get(c.leadId) || [];
    arr.push(c);
    productChallansByLead.set(c.leadId, arr);
  });

  const instPayByLead = new Map<string, number>();
  input.paymentRequests.forEach(p => {
    if (!p?.leadId || p.status !== 'approved') return;
    instPayByLead.set(p.leadId, (instPayByLead.get(p.leadId) || 0) + (Number(p.approvedAmount ?? p.requestedAmount) || 0));
  });

  const resolveLead = buildExpenseLeadResolver(input.leads);
  const expByLead = new Map<string, ExpenseClaim[]>();
  const generalExpenses: ExpenseClaim[] = [];
  input.expenses.forEach(e => {
    if (!e || e.status !== 'approved') return;
    const leadId = resolveLead(e);
    if (leadId) {
      const arr = expByLead.get(leadId) || [];
      arr.push(e);
      expByLead.set(leadId, arr);
    } else {
      generalExpenses.push(e);
    }
  });

  const months = new Map<string, MonthMetrics>();
  const month = (key: string) => {
    let m = months.get(key);
    if (!m) { m = emptyMonth(key); months.set(key, m); }
    return m;
  };
  const capacity: CapacitySummary = { systems: 0, kw: 0, dueCount: 0, doneCount: 0, unknownKwSystems: 0 };
  const allLeads: LeadPL[] = [];

  for (const lead of input.leads) {
    if (!lead?.id) continue;
    const leadChallans = challansByLead.get(lead.id) || [];
    const leadProdChallans = productChallansByLead.get(lead.id) || [];
    const isProcessDone = lead.status === 'installed' || lead.status === 'closed'
      || leadChallans.length > 0 || input.evidenceLeadIds.has(lead.id);
    const contractWithGst = contract[lead.id] || 0;
    if (!isProcessDone || contractWithGst <= 0) continue;

    // Money in
    const q = quotes[lead.id];
    const oc = ocs[lead.id];
    const pays = oc ? (Array.isArray(oc.payments) && oc.payments.length > 0 ? oc.payments : oc.advanceAmount ? [{ amount: oc.advanceAmount }] : []) : [];
    const paidWithGst = pays.reduce((s, p: any) => s + (Number(p?.amount) || 0), 0);
    const quoteTotal = q ? getQuotationTotalAmount(q) : 0;
    const gstPct = quoteTotal > 0 ? Number(q?.gstRate) || 0 : 0;
    const exGst = (v: number) => v / (1 + gstPct / 100);
    const pendingWithGst = Math.max(0, contractWithGst - paidWithGst);

    // Completion month
    const inst = installByLead[lead.id];
    const dispatchDate = latestIso([
      ...leadChallans.map(c => c.createdAt),
      ...leadProdChallans.map(c => c.date || c.createdAt)
    ]);
    let completedAt = '';
    let completedFrom: LeadPL['completedFrom'] = 'lead';
    if (inst?.completedAt) { completedAt = inst.completedAt; completedFrom = 'installation'; }
    else if (dispatchDate) { completedAt = dispatchDate; completedFrom = 'dispatch'; }
    else { completedAt = lead.confirmedAt || lead.updatedAt || lead.createdAt; }

    // Material actually dispatched
    const materialLines: MaterialLine[] = [];
    leadChallans.forEach(c => (c.items || []).forEach(it => {
      const qty = Number(it.qty) || 0;
      const rate = purchaseRate(it, productsById);
      materialLines.push({ source: c.challanNumber, productName: it.productName, qty, rate, amount: qty * rate });
    }));
    leadProdChallans.forEach(c => (c.items || []).forEach(it => {
      const qty = Number(it.qty) || 0;
      const rate = purchaseRate(it, productsById);
      materialLines.push({ source: c.challanNo, productName: it.productName, qty, rate, amount: qty * rate });
    }));
    const material = materialLines.reduce((s, l) => s + l.amount, 0);
    const unpricedItems = materialLines.filter(l => l.qty > 0 && l.rate <= 0).length;

    const installation = instPayByLead.get(lead.id) || 0;
    const exps = expByLead.get(lead.id) || [];
    const leadExpenses = exps.reduce((s, e) => s + (Number(e.approvedAmount ?? e.amount) || 0), 0);
    const partnerIncentive = resolveChannelPartner(lead, input.partners)
      ? leadIncentive(lead, contractWithGst)?.incentive || 0
      : 0;

    const quoted = exGst(contractWithGst);
    const collected = exGst(paidWithGst);
    const systemCost = material + installation + leadExpenses + partnerIncentive;
    const kw = systemKw(lead, q);

    const row: LeadPL = {
      leadId: lead.id,
      name: lead.name,
      phone: lead.phoneNumber,
      status: lead.status,
      paymentStatus: pendingWithGst > 0 ? 'due' : 'done',
      completedAt,
      completedFrom,
      kw,
      gstPct,
      contractWithGst,
      quoted,
      collected,
      pendingWithGst,
      material,
      materialLines,
      unpricedItems,
      installation,
      leadExpenses,
      expenseTitles: exps.map(e => `${e.expenseNumber || ''} ${e.title || ''}`.trim()),
      partnerIncentive,
      systemCost,
      profit: quoted - systemCost,
      cashProfit: collected - systemCost
    };
    allLeads.push(row);

    capacity.systems += 1;
    capacity.kw += kw;
    if (!kw) capacity.unknownKwSystems += 1;
    if (row.paymentStatus === 'due') capacity.dueCount += 1; else capacity.doneCount += 1;

    const key = monthKey(completedAt);
    if (!key) continue;
    const m = month(key);
    m.systems += 1;
    if (row.paymentStatus === 'due') m.dueCount += 1; else m.doneCount += 1;
    m.kw += kw;
    m.quoted += quoted;
    m.collected += collected;
    m.pendingWithGst += pendingWithGst;
    m.material += material;
    m.installation += installation;
    m.leadExpenses += leadExpenses;
    m.partnerIncentive += partnerIncentive;
    m.systemCost += systemCost;
    m.unpricedItems += unpricedItems;
    m.leads.push(row);
  }

  const generalRows: GeneralExpenseRow[] = [];
  generalExpenses.forEach(e => {
    const date = e.expenseDate || e.createdAt;
    const amount = Number(e.approvedAmount ?? e.amount) || 0;
    const key = monthKey(date);
    if (key) month(key).generalExpenses += amount;
    generalRows.push({
      id: e.id, expenseNumber: e.expenseNumber || '', title: e.title || '', category: String(e.category || ''),
      employeeName: e.employeeName || '', date, amount, project: e.associatedProject || ''
    });
  });

  months.forEach(m => {
    m.profit = m.quoted - m.systemCost;
    m.cashProfit = m.collected - m.systemCost;
    m.netProfit = m.profit - m.generalExpenses;
    m.leads.sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
  });

  return { capacity, months, leads: allLeads, generalExpenses: generalRows };
}

const SUM_KEYS = [
  'systems', 'dueCount', 'doneCount', 'kw', 'quoted', 'collected', 'pendingWithGst', 'material', 'installation',
  'leadExpenses', 'partnerIncentive', 'systemCost', 'profit', 'cashProfit', 'generalExpenses', 'netProfit', 'unpricedItems'
] as const;

/** Months of one year in order (missing months are zero) and the year totals up to now. */
export function yearMetrics(months: Map<string, MonthMetrics>, year: number, now = new Date()) {
  const list: MonthMetrics[] = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2, '0')}`;
    list.push(months.get(key) || emptyMonth(key));
  }
  const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : year < now.getFullYear() ? 12 : 0;
  const total = emptyMonth(String(year));
  list.slice(0, monthsElapsed).forEach(m => {
    SUM_KEYS.forEach(k => { (total as any)[k] += m[k]; });
    total.leads.push(...m.leads);
  });
  return { months: list, monthsElapsed, total };
}
