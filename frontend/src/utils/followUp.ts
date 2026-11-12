import type { Lead } from '../types';

// Once a lead is confirmed (or has moved past that stage, or is lost) its follow-up is no longer pending.
const DONE_STATUSES: Lead['status'][] = ['confirmed', 'registered', 'installed', 'closed', 'lost'];

export const isLeadPastFollowUp = (status?: Lead['status'] | string): boolean =>
  !!status && (DONE_STATUSES as string[]).includes(status);

export const isFollowUpDone = (lead?: Pick<Lead, 'status' | 'followUpCompleted'> | null): boolean =>
  !!lead && (!!lead.followUpCompleted || isLeadPastFollowUp(lead.status));
