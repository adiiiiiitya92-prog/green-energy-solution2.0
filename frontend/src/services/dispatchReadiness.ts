import type { Challan, DispatchRequest, Lead, OrderConfirmation, Quotation } from '../types';
import { buildContractValueMap } from './channelPartnerIncentive';
import { latestByLead } from './quotationService';
import { isLeadConfirmed } from './leadService';

/** Share of the order value that must be received before material should go out. */
export const DISPATCH_READY_PAYMENT_SHARE = 0.5;

export interface DispatchReadyLead {
  lead: Lead;
  orderTotal: number;
  paid: number;
  paidPct: number; // 0-100
  lastPaymentAt?: string;
  hasOpenRequest: boolean; // admin already pressed "Notify Inventory"
}

const amountPaid = (oc?: OrderConfirmation) => {
  if (!oc) return { paid: 0, last: undefined as string | undefined };
  const list = Array.isArray(oc.payments) && oc.payments.length > 0
    ? oc.payments
    : oc.advanceAmount ? [{ amount: oc.advanceAmount, paidAt: oc.createdAt }] : [];
  const paid = list.reduce((s, p: any) => s + (Number(p?.amount) || 0), 0);
  const last = list.map((p: any) => p?.paidAt).filter(Boolean).sort().pop();
  return { paid, last };
};

/**
 * Confirmed leads (not yet installed/closed) that have received at least 50% of the order value
 * but have no delivery challan yet — the inventory team should prepare their dispatch.
 */
export function findDispatchReadyLeads(input: {
  leads: Lead[];
  quotations: Quotation[];
  orderConfirmations: OrderConfirmation[];
  challans: Challan[];
  dispatchRequests: DispatchRequest[];
}): DispatchReadyLead[] {
  const contract = buildContractValueMap(input.quotations, input.orderConfirmations);
  const ocs = latestByLead(input.orderConfirmations);
  const dispatched = new Set(input.challans.map(c => c.leadId).filter(Boolean) as string[]);
  const openRequest = new Set(
    input.dispatchRequests.filter(r => r.status === 'pending' || r.status === 'acknowledged').map(r => r.leadId)
  );

  const out: DispatchReadyLead[] = [];
  for (const lead of input.leads) {
    // Installed / closed leads already have their material on site
    if (!lead || !isLeadConfirmed(lead) || lead.status === 'installed' || lead.status === 'closed') continue;
    if (dispatched.has(lead.id)) continue;
    const orderTotal = contract[lead.id] || 0;
    if (orderTotal <= 0) continue;
    const { paid, last } = amountPaid(ocs[lead.id]);
    if (paid < orderTotal * DISPATCH_READY_PAYMENT_SHARE) continue;
    out.push({
      lead,
      orderTotal,
      paid,
      paidPct: Math.min(100, Math.round((paid / orderTotal) * 100)),
      lastPaymentAt: last,
      hasOpenRequest: openRequest.has(lead.id)
    });
  }
  // Waiting longest first
  return out.sort((a, b) => (a.lastPaymentAt || a.lead.confirmedAt || '').localeCompare(b.lastPaymentAt || b.lead.confirmedAt || ''));
}
