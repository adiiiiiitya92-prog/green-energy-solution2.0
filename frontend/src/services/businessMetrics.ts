import type { ExpenseClaim, Lead, OrderConfirmation, PaymentRequest, Profile, Quotation } from '../types';
import { getQuotationTotalAmount, latestByLead } from './quotationService';
import { buildContractValueMap, leadIncentive, resolveChannelPartner } from './channelPartnerIncentive';

/** Leads that count as sold: confirmed and every stage after it. */
export const BOOKED_STATUSES: Lead['status'][] = ['confirmed', 'registered', 'installed', 'closed'];
const DONE_STATUSES: Lead['status'][] = ['installed', 'closed'];

const KW_IN_TEXT = /(\d+(?:\.\d+)?)\s*(?:k\.?\s*w|kwp|kilo\s*watt)/i;

/** System size in kW: the quotation's "System Capacity" first, else the lead requirement text (e.g. "3 Kw Solar Rooftop System"). */
export function systemKw(lead: Lead, quote?: Quotation): number {
  const cap = String(quote?.systemCapacity ?? '').trim();
  const fromCap = cap.match(/^(\d+(?:\.\d+)?)/);
  if (fromCap) return Number(fromCap[1]) || 0;
  const fromReq = String(lead.requirement || '').match(KW_IN_TEXT);
  return fromReq ? Number(fromReq[1]) || 0 : 0;
}

/** Sale value without GST (GST collected is passed on to the government, so it is not income). */
export function revenueExGst(quote: Quotation | undefined, contractValue: number): number {
  if (quote) {
    const total = getQuotationTotalAmount(quote);
    const gst = Number(quote.gstRate) || 0;
    return total > 0 ? total / (1 + gst / 100) : contractValue;
  }
  return contractValue;
}

const bookingDate = (lead: Lead, oc?: OrderConfirmation) =>
  lead.confirmedAt || oc?.createdAt || oc?.payments?.[0]?.paidAt || lead.createdAt;
const monthKey = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export interface MonthMetrics {
  key: string; // YYYY-MM
  systems: number;
  kw: number;
  revenue: number; // ex GST
  materialCost: number; // kw × cost per kW
  expenses: number;
  installationPayments: number;
  partnerIncentive: number;
  cost: number;
  profit: number;
}

export interface CapacitySummary {
  totalKw: number;
  systems: number;
  doneKw: number; // installed + closed
  doneSystems: number;
  inProgressKw: number; // confirmed + registered
  inProgressSystems: number;
  unknownKwSystems: number; // booked leads with no kW found
}

export interface BusinessInput {
  leads: Lead[];
  quotations: Quotation[];
  orderConfirmations: OrderConfirmation[];
  expenses: ExpenseClaim[];
  paymentRequests: PaymentRequest[];
  partners: Pick<Profile, 'id' | 'fullName'>[];
  costPerKw: number;
}

const emptyMonth = (key: string): MonthMetrics => ({
  key, systems: 0, kw: 0, revenue: 0, materialCost: 0, expenses: 0, installationPayments: 0, partnerIncentive: 0, cost: 0, profit: 0
});

export function computeBusinessMetrics(input: BusinessInput): { capacity: CapacitySummary; months: Map<string, MonthMetrics> } {
  const quotes = latestByLead(input.quotations.filter(q => q.items && q.items.length > 0 && getQuotationTotalAmount(q) > 0));
  const ocs = latestByLead(input.orderConfirmations);
  const contract = buildContractValueMap(input.quotations, input.orderConfirmations);
  const months = new Map<string, MonthMetrics>();
  const month = (key: string) => {
    let m = months.get(key);
    if (!m) { m = emptyMonth(key); months.set(key, m); }
    return m;
  };

  const capacity: CapacitySummary = { totalKw: 0, systems: 0, doneKw: 0, doneSystems: 0, inProgressKw: 0, inProgressSystems: 0, unknownKwSystems: 0 };

  for (const lead of input.leads) {
    if (!lead || !BOOKED_STATUSES.includes(lead.status)) continue;
    const q = quotes[lead.id];
    const kw = systemKw(lead, q);
    capacity.systems += 1;
    capacity.totalKw += kw;
    if (!kw) capacity.unknownKwSystems += 1;
    if (DONE_STATUSES.includes(lead.status)) { capacity.doneKw += kw; capacity.doneSystems += 1; }
    else { capacity.inProgressKw += kw; capacity.inProgressSystems += 1; }

    const key = monthKey(bookingDate(lead, ocs[lead.id]));
    if (!key) continue;
    const m = month(key);
    m.systems += 1;
    m.kw += kw;
    m.revenue += revenueExGst(q, contract[lead.id] || 0);
    if (resolveChannelPartner(lead, input.partners)) {
      m.partnerIncentive += leadIncentive(lead, contract[lead.id] || 0)?.incentive || 0;
    }
  }

  for (const e of input.expenses) {
    if (!e || e.status !== 'approved') continue;
    const key = monthKey(e.expenseDate || e.createdAt);
    if (key) month(key).expenses += Number(e.approvedAmount ?? e.amount) || 0;
  }

  for (const p of input.paymentRequests) {
    if (!p || p.status !== 'approved') continue;
    const key = monthKey(p.decidedAt || p.createdAt);
    if (key) month(key).installationPayments += Number(p.approvedAmount ?? p.requestedAmount) || 0;
  }

  months.forEach(m => {
    m.materialCost = m.kw * (input.costPerKw || 0);
    m.cost = m.materialCost + m.expenses + m.installationPayments + m.partnerIncentive;
    m.profit = m.revenue - m.cost;
  });

  return { capacity, months };
}

/** Months of one year in order (missing months are zero), plus year totals and a full-year projection. */
export function yearMetrics(months: Map<string, MonthMetrics>, year: number, now = new Date()) {
  const list: MonthMetrics[] = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2, '0')}`;
    list.push(months.get(key) || emptyMonth(key));
  }
  const isCurrentYear = year === now.getFullYear();
  const monthsElapsed = isCurrentYear ? now.getMonth() + 1 : year < now.getFullYear() ? 12 : 0;
  const upto = list.slice(0, monthsElapsed);
  const sum = (k: keyof MonthMetrics) => upto.reduce((s, m) => s + (m[k] as number), 0);
  const profitSoFar = sum('profit');
  return {
    months: list,
    monthsElapsed,
    revenue: sum('revenue'),
    cost: sum('cost'),
    kw: sum('kw'),
    profitSoFar,
    projectedProfit: isCurrentYear && monthsElapsed > 0 ? (profitSoFar / monthsElapsed) * 12 : profitSoFar
  };
}
