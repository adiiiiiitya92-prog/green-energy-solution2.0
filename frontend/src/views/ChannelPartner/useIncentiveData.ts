import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { leadService } from '../../services/leadService';
import { quotationService, latestByLead } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { employeeService } from '../../services/employeeService';
import { buildContractValueMap, leadIncentive, resolveChannelPartner, type IncentiveBreakdown } from '../../services/channelPartnerIncentive';
import { channelPartnerPayoutService, isPayoutAllowed, type ChannelPartnerPayout } from '../../services/channelPartnerPayoutService';
import type { Lead, OrderConfirmation, Profile } from '../../types';

export type PayoutState = 'paid' | 'ready' | 'locked' | 'no_rate';

export interface IncentiveRow {
  lead: Lead;
  partnerId: string;
  partnerName: string;
  date: string;
  customerPrice: number;
  inc: IncentiveBreakdown | null;
  payout: ChannelPartnerPayout | null;
  payoutState: PayoutState;
}

// Incentive month = booking month (confirmation / first payment), falling back to lead creation.
const bookingDate = (lead: Lead, oc?: OrderConfirmation) =>
  lead.confirmedAt || oc?.createdAt || oc?.payments?.[0]?.paidAt || lead.createdAt;

/**
 * Loads everything the incentive views need. Shows the local cache first, then replaces it with fresh server data.
 * Payouts always come from the server; if they cannot be loaded, payoutsError is set and paying is blocked.
 * partnerId limits the rows to one channel partner (the partner's own view).
 */
export function useIncentiveData(partnerId?: string) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contractMap, setContractMap] = useState<Record<string, number>>({});
  const [ocMap, setOcMap] = useState<Record<string, OrderConfirmation>>({});
  const [partners, setPartners] = useState<Profile[]>([]);
  const [payouts, setPayouts] = useState<ChannelPartnerPayout[]>([]);
  const [payoutsError, setPayoutsError] = useState('');
  const freshDoneAt = useRef(0);

  const loadPayouts = useCallback(async () => {
    try {
      setPayouts(await channelPartnerPayoutService.getAll());
      setPayoutsError('');
    } catch (err: any) {
      setPayoutsError(err?.message || 'Could not load payouts');
    }
  }, []);

  // fresh = pull from the server first; otherwise read the local cache (fast, may be a few minutes old).
  const load = useCallback(async (fresh = false) => {
    const startedAt = Date.now();
    try {
      const [allLeads, quotes, ocs, emps] = await Promise.all([
        leadService.getLeads(fresh),
        quotationService.getAllQuotations(fresh).catch(() => []),
        orderService.getAllOrderConfirmations(fresh).catch(() => []),
        employeeService.getEmployees(fresh).catch(() => [] as Profile[])
      ]);
      // A cache read that began before a server load finished must not overwrite the server data.
      if (!fresh && startedAt < freshDoneAt.current) return;
      if (fresh) freshDoneAt.current = Date.now();
      setLeads(allLeads);
      setContractMap(buildContractValueMap(quotes, ocs));
      setOcMap(latestByLead(ocs));
      setPartners(emps.filter(e => e.role === 'dealer'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(() => load(true));
    loadPayouts();
    let t: any;
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (!col || col === 'channelPartnerPayouts') loadPayouts();
      if (col && !['leads', 'quotations', 'orderConfirmations'].includes(col)) return;
      clearTimeout(t);
      t = setTimeout(() => load(), 800);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => { clearTimeout(t); window.removeEventListener('app-realtime-update', onUpdate); };
  }, [load, loadPayouts]);

  const rows: IncentiveRow[] = useMemo(() => {
    const payoutByLead = new Map(payouts.map(p => [p.leadId, p]));
    const out: IncentiveRow[] = [];
    for (const lead of leads) {
      const partner = resolveChannelPartner(lead, partners);
      if (!partner || (partnerId && partner.id !== partnerId)) continue;
      const customerPrice = contractMap[lead.id] || 0;
      const inc = leadIncentive(lead, customerPrice);
      const payout = payoutByLead.get(lead.id) || null;
      const payoutState: PayoutState = payout ? 'paid' : !inc ? 'no_rate' : isPayoutAllowed(lead) ? 'ready' : 'locked';
      out.push({ lead, partnerId: partner.id, partnerName: partner.name, date: bookingDate(lead, ocMap[lead.id]), customerPrice, inc, payout, payoutState });
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [leads, partners, contractMap, ocMap, payouts, partnerId]);

  return { loading, rows, leads, setLeads, contractMap, partners, payouts, setPayouts, payoutsError, loadPayouts };
}

export interface PayoutTotals {
  leads: number;
  rated: number;
  customer: number;
  rate: number;
  margin: number;
  gst: number;
  incentive: number;
  paid: number;
  paidCount: number;
  ready: number;
  readyCount: number;
  locked: number;
  lockedCount: number;
  noRateCount: number;
}

export const sumRows = (rows: IncentiveRow[]): PayoutTotals =>
  rows.reduce<PayoutTotals>((t, r) => {
    t.leads += 1;
    t.customer += r.customerPrice;
    if (r.inc) {
      t.rated += 1;
      t.rate += r.inc.rate;
      t.margin += r.inc.margin;
      t.gst += r.inc.gst;
      t.incentive += r.inc.incentive;
    }
    if (r.payoutState === 'paid') { t.paid += r.payout?.amount || 0; t.paidCount += 1; }
    else if (r.payoutState === 'ready') { t.ready += r.inc?.incentive || 0; t.readyCount += 1; }
    else if (r.payoutState === 'locked') { t.locked += r.inc?.incentive || 0; t.lockedCount += 1; }
    else t.noRateCount += 1;
    return t;
  }, { leads: 0, rated: 0, customer: 0, rate: 0, margin: 0, gst: 0, incentive: 0, paid: 0, paidCount: 0, ready: 0, readyCount: 0, locked: 0, lockedCount: 0, noRateCount: 0 });
