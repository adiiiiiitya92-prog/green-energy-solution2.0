import { buildApiUrl } from './firebase';
import { getNextNumber } from './counterService';
import type { Lead } from '../types';

export type PayoutMode = 'bank' | 'upi' | 'cheque' | 'cash';

export const PAYOUT_MODE_LABEL: Record<PayoutMode, string> = {
  bank: 'Bank Transfer (NEFT/RTGS/IMPS)',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash'
};

/** One payout per lead. Read and written straight to the server (no local cache) so a payment is never shown twice or lost. */
export interface ChannelPartnerPayout {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone?: string;
  partnerId: string;
  partnerName: string;
  amount: number; // amount actually paid
  incentive: number; // calculated incentive at the time of payment
  customerPrice: number;
  partnerRate: number;
  margin: number;
  gst: number;
  gstPct: number;
  mode: PayoutMode;
  reference?: string;
  notes?: string;
  paidAt: string; // payment date chosen by staff
  receiptNo: string;
  paidById: string;
  paidByName: string;
  createdAt: string;
  updatedAt: string;
}

const COL = 'channelPartnerPayouts';
export const payoutIdForLead = (leadId: string) => `cpp_${leadId}`;

/** A lead's incentive can be paid only once the lead is closed. */
export const isPayoutAllowed = (lead: Pick<Lead, 'status'>) => lead.status === 'closed';
export const PAYOUT_LOCKED_MSG = 'Payout is allowed only after the lead is CLOSED (release complete).';

const request = async (path: string, init?: RequestInit, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(buildApiUrl(path), { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const channelPartnerPayoutService = {
  /** Throws if the server cannot be reached, so the page never mistakes "could not load" for "not paid". */
  async getAll(): Promise<ChannelPartnerPayout[]> {
    const res = await request(`/api/firestore/${COL}`);
    if (!res.ok) throw new Error(`Could not load payouts (HTTP ${res.status})`);
    const list = await res.json();
    return (Array.isArray(list) ? list : []).filter((p: any) => p && p.id && p.leadId && !p.isDeleted);
  },

  async getForLead(leadId: string): Promise<ChannelPartnerPayout | null> {
    const res = await request(`/api/firestore/${COL}/${encodeURIComponent(payoutIdForLead(leadId))}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Could not check existing payout (HTTP ${res.status})`);
    const doc = await res.json().catch(() => null);
    return doc && doc.id && !doc.isDeleted ? doc : null;
  },

  async markPaid(input: Omit<ChannelPartnerPayout, 'id' | 'receiptNo' | 'createdAt' | 'updatedAt'> & { lead: Lead }): Promise<ChannelPartnerPayout> {
    const { lead, ...data } = input;
    if (!isPayoutAllowed(lead)) throw new Error(PAYOUT_LOCKED_MSG);
    if (!(data.amount > 0)) throw new Error('Enter the amount paid.');
    // Re-check on the server right before saving, in case someone else paid it a moment ago.
    const existing = await this.getForLead(lead.id);
    if (existing) throw new Error(`Already paid on ${new Date(existing.paidAt).toLocaleDateString('en-IN')} (Receipt ${existing.receiptNo}).`);

    const { number: receiptNo } = await getNextNumber({ key: 'cpPayoutReceipt', prefix: `CPR-${new Date().getFullYear()}-`, pad: 4 });
    const now = new Date().toISOString();
    const record: ChannelPartnerPayout = { ...data, id: payoutIdForLead(lead.id), receiptNo, createdAt: now, updatedAt: now };
    const res = await request(`/api/firestore/${COL}/${encodeURIComponent(record.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!res.ok) throw new Error(`Payment could not be saved (HTTP ${res.status}). Please try again.`);
    return record;
  },

  /** Super admin only: removes a payout entered by mistake. */
  async cancel(payout: ChannelPartnerPayout): Promise<void> {
    const res = await request(`/api/firestore/${COL}/${encodeURIComponent(payout.id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Could not cancel payment (HTTP ${res.status}).`);
  }
};
