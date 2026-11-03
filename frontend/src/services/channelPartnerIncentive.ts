import type { Lead, OrderConfirmation, Quotation } from '../types';
import { getQuotationTotalAmount } from './quotationService';

export const DEFAULT_CP_GST_PCT = 8.9;

export interface IncentiveBreakdown {
  customerPrice: number;
  rate: number;
  margin: number;
  gstPct: number;
  gst: number;
  incentive: number;
}

// Incentive = (customer price − GES rate to partner) minus GST% on that margin.
export function computeIncentive(customerPrice: number, rate: number, gstPct = DEFAULT_CP_GST_PCT): IncentiveBreakdown {
  const margin = Math.max(0, Math.round((customerPrice || 0) - (rate || 0)));
  const gst = Math.round(margin * (gstPct || 0) / 100);
  return { customerPrice: customerPrice || 0, rate: rate || 0, margin, gstPct: gstPct || 0, gst, incentive: margin - gst };
}

export const leadIncentive = (lead: Lead, customerPrice: number): IncentiveBreakdown | null =>
  lead.channelPartnerRate && lead.channelPartnerRate > 0
    ? computeIncentive(customerPrice, lead.channelPartnerRate, lead.channelPartnerGstPct ?? DEFAULT_CP_GST_PCT)
    : null;

// Same "Total Contract" rule as the lead card: main quotation total, else the order confirmation value, else amount paid.
export function buildContractValueMap(quotes: Quotation[], ocs: OrderConfirmation[]): Record<string, number> {
  const qMap: Record<string, Quotation> = {};
  quotes.forEach(q => {
    if (q.leadId && (!qMap[q.leadId] || (q.items && q.items.length > 0))) qMap[q.leadId] = q;
  });
  const ocMap: Record<string, OrderConfirmation> = {};
  ocs.forEach(oc => {
    if (oc.leadId) ocMap[oc.leadId] = oc;
  });
  const out: Record<string, number> = {};
  for (const leadId of new Set([...Object.keys(qMap), ...Object.keys(ocMap)])) {
    const q = qMap[leadId];
    const oc = ocMap[leadId];
    const quoteTotal = q ? getQuotationTotalAmount(q) : 0;
    const ocSubtotal = oc ? (oc.subtotal || (Array.isArray(oc.itemsConfirmed) ? oc.itemsConfirmed.reduce((s, i) => s + (i.amount || 0), 0) : 0) || oc.advanceAmount || 0) : 0;
    let total = quoteTotal > 0 ? quoteTotal : ocSubtotal;
    if (total <= 0 && oc) {
      const pays = Array.isArray(oc.payments) && oc.payments.length > 0 ? oc.payments : oc.advanceAmount ? [{ amount: oc.advanceAmount }] : [];
      total = pays.reduce((s, p: any) => s + (p?.amount || 0), 0);
    }
    out[leadId] = total;
  }
  return out;
}
