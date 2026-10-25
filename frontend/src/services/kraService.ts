import { db, markRecordAsDeleted, getDeletedRecordIdsSet } from './db';
import type {
  KRATemplate,
  KRAScore,
  KRAScoreItem,
  KRAItem,
  UserRole
} from '../types';
import {
  saveRecordToFirestore,
  fetchCollectionFromFirestore,
  deleteRecordFromFirestore
} from './firebase';

let lastTplSync = 0;
let lastScoreSync = 0;
const SYNC_INTERVAL = 60 * 1000;

// ------------- Default KRA templates (seed) -------------
export const DEFAULT_FIELD_KRA: KRAItem[] = [
  {
    name: 'Meter Installation & CRM Update',
    weight: 40,
    target:
      'Installations completed ÷ installations due; target set monthly by manager (benchmark ≥90%).'
  },
  {
    name: 'Material Saving & Project Cost Control',
    weight: 25,
    target:
      '100% material issue/return/unused items recorded; target saving against approved BOM/budget per project.'
  },
  {
    name: 'Material Loading & Unloading',
    weight: 10,
    target: '70% availability for loading and unloading of material.'
  },
  {
    name: 'Release Payment / Meter Installation Saving',
    weight: 15,
    target:
      '100% external payments and expenses pre-approved, recorded, receipted and reconciled; zero unauthorised collections.'
  },
  {
    name: 'Complaint Closing',
    weight: 10,
    target: '100% closing of complaints against due date.'
  }
];

export const DEFAULT_SALES_KRA: KRAItem[] = [
  { name: 'Sales Achievement', weight: 40, target: '5 bookings per month' },
  { name: 'Recovery', weight: 25, target: 'At least 95% of amount due' },
  { name: 'Project Completion Flow', weight: 20, target: 'At least 80% of projects due' },
  { name: 'Project Cost Control / Saving', weight: 15, target: 'At least 10% saving vs approved budget (details note attached)' }
];

export const DEFAULT_MARKETING_KRA: KRAItem[] = [
  { name: 'Sales Achievement against Leads', weight: 30, target: 'Maximum conversion of leads' },
  { name: 'Calling / Follow-up', weight: 25, target: 'At least 98% of amount due' },
  {
    name: 'Social Media Posting (Facebook, Instagram, WhatsApp, IndiaMART, Justdial, Boost 360)',
    weight: 20,
    target: 'At least 80% of projects due, at least daily posting'
  },
  {
    name: 'Lead Handling & CRM Updates and Follow-up',
    weight: 15,
    target: 'At least 100% CRM update and follow-up (data from CRM)'
  }
];

export const DEFAULT_ADMIN_KRA: KRAItem[] = [
  { name: 'Work Completion', weight: 40, target: 'As per CRM' },
  { name: 'Recovery and Update in CRM', weight: 25, target: 'At least 95% of amount due' },
  { name: 'Project Completion Flow', weight: 20, target: 'At least 80% of projects due' },
  { name: 'Project Cost Control / Saving', weight: 15, target: 'At least 10% saving vs approved budget' }
];

export const DEFAULT_ADMIN_KRA_2: KRAItem[] = [
  { name: 'Work Completion', weight: 35, target: 'As per CRM' },
  { name: 'Recovery and Update in CRM', weight: 25, target: 'At least 95% of amount due' },
  { name: 'Project Completion Flow', weight: 20, target: 'At least 80% of projects due' },
  { name: 'Project Cost Control / Saving', weight: 15, target: 'At least 10% saving vs approved budget' },
  { name: 'Other Activity', weight: 5, target: 'File and CO related work' }
];

// Fixed ids so a template the admin deletes stays deleted (deletions are tracked by id)
const SEED_TEMPLATES: Array<Omit<KRATemplate, 'createdAt' | 'updatedAt'>> = [
  { id: 'kra_tpl_seed_field', role: 'field_employee', title: 'Field Employee KRA (Default)', kras: DEFAULT_FIELD_KRA, isDefault: true },
  { id: 'kra_tpl_seed_sales', role: 'sales_person', title: 'Sales KRA', kras: DEFAULT_SALES_KRA },
  { id: 'kra_tpl_seed_marketing', role: 'telecaller', title: 'Marketing Team KRA', kras: DEFAULT_MARKETING_KRA },
  { id: 'kra_tpl_seed_admin', role: 'admin', title: 'Admin KRA', kras: DEFAULT_ADMIN_KRA },
  { id: 'kra_tpl_seed_admin_2', role: 'admin', title: 'Admin KRA (2) — with Other Activity', kras: DEFAULT_ADMIN_KRA_2 }
];

let seedChecked = false;

export function computeGrade(total: number): KRAScore['grade'] {
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 70) return 'B';
  if (total >= 60) return 'C';
  return 'D';
}

export function computeIncentivePct(total: number): number {
  if (total >= 90) return 10;
  if (total >= 80) return 7;
  if (total >= 70) return 5;
  return 0;
}

export function recalcScore(kras: KRAScoreItem[]): {
  total: number;
  items: KRAScoreItem[];
} {
  const items = kras.map(k => {
    const pct = Math.max(0, Math.min(100, Number(k.achievementPct) || 0));
    const score = +((k.weight * pct) / 100).toFixed(2);
    return { ...k, achievementPct: pct, score };
  });
  const total = +items.reduce((s, k) => s + k.score, 0).toFixed(2);
  return { total, items };
}

export const kraService = {
  // ================== TEMPLATES ==================
  async getAllTemplates(): Promise<KRATemplate[]> {
    const deleted = await getDeletedRecordIdsSet();
    const local = await db.kraTemplates.toArray();
    const valid = local.filter(t => !deleted.has(t.id));

    const sync = async () => {
      try {
        lastTplSync = Date.now();
        const remote = await fetchCollectionFromFirestore<KRATemplate>(
          'kraTemplates',
          500
        );
        if (Array.isArray(remote) && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(r => !freshDeleted.has(r.id));
          if (validRemote.length > 0) await db.kraTemplates.bulkPut(validRemote);
        }
      } catch (e) {
        console.warn('KRA template sync note:', e);
      }
    };

    if (!seedChecked) {
      seedChecked = true;
      if (valid.length === 0) await sync();
      const existing = await db.kraTemplates.toArray();
      const freshDeleted = await getDeletedRecordIdsSet();
      const ids = new Set(existing.map(t => t.id));
      const titles = new Set(existing.map(t => t.title.trim().toLowerCase()));
      const now = new Date().toISOString();
      for (const seed of SEED_TEMPLATES) {
        if (ids.has(seed.id) || freshDeleted.has(seed.id) || titles.has(seed.title.toLowerCase())) continue;
        const tpl: KRATemplate = { ...seed, createdAt: now, updatedAt: now };
        await db.kraTemplates.put(tpl);
        saveRecordToFirestore('kraTemplates', tpl.id, tpl);
      }
      const refreshed = await db.kraTemplates.toArray();
      return refreshed
        .filter(t => !freshDeleted.has(t.id))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    if (Date.now() - lastTplSync > SYNC_INTERVAL) sync().catch(() => {});
    return valid.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
  },

  async getTemplateForRole(role: UserRole): Promise<KRATemplate | undefined> {
    const all = await this.getAllTemplates();
    return (
      all.find(t => t.role === role) ||
      all.find(t => t.role === 'all' && t.isDefault) ||
      all.find(t => t.isDefault)
    );
  },

  async createTemplate(
    data: Omit<KRATemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<KRATemplate> {
    this.assertWeightsValid(data.kras);
    const id =
      'kra_tpl_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    const now = new Date().toISOString();
    const tpl: KRATemplate = { id, createdAt: now, updatedAt: now, ...data };
    await db.kraTemplates.put(tpl);
    saveRecordToFirestore('kraTemplates', id, tpl);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return tpl;
  },

  async updateTemplate(
    id: string,
    patch: Partial<Omit<KRATemplate, 'id' | 'createdAt'>>
  ): Promise<KRATemplate> {
    const existing = await db.kraTemplates.get(id);
    if (!existing) throw new Error('Template not found');
    if (patch.kras) this.assertWeightsValid(patch.kras);
    const updated: KRATemplate = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await db.kraTemplates.put(updated);
    saveRecordToFirestore('kraTemplates', id, updated);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return updated;
  },

  async deleteTemplate(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'kraTemplates');
    await db.kraTemplates.delete(id);
    deleteRecordFromFirestore('kraTemplates', id).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  assertWeightsValid(kras: KRAItem[]) {
    const total = kras.reduce((s, k) => s + (Number(k.weight) || 0), 0);
    if (Math.round(total) !== 100) {
      throw new Error(
        `KRA weights must total 100% — currently ${total}%. Please adjust before saving.`
      );
    }
    const bad = kras.find(k => !k.name?.trim());
    if (bad) throw new Error('Each KRA must have a name.');
  },

  // ================== SCORES ==================
  async getAllScores(): Promise<KRAScore[]> {
    const deleted = await getDeletedRecordIdsSet();
    const local = await db.kraScores.toArray();
    const valid = local.filter(s => !deleted.has(s.id));

    const sync = async () => {
      try {
        lastScoreSync = Date.now();
        const remote = await fetchCollectionFromFirestore<KRAScore>(
          'kraScores',
          3000
        );
        if (Array.isArray(remote) && remote.length > 0) {
          const freshDeleted = await getDeletedRecordIdsSet();
          const validRemote = remote.filter(r => !freshDeleted.has(r.id));
          if (validRemote.length > 0) await db.kraScores.bulkPut(validRemote);
        }
      } catch (e) {
        console.warn('KRA score sync note:', e);
      }
    };

    if (valid.length === 0) {
      await sync();
      const refreshed = await db.kraScores.toArray();
      return refreshed.filter(s => !deleted.has(s.id));
    }
    if (Date.now() - lastScoreSync > SYNC_INTERVAL) sync().catch(() => {});
    return valid.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  },

  async getScoresByEmployee(employeeId: string): Promise<KRAScore[]> {
    const all = await this.getAllScores();
    return all.filter(s => s.employeeId === employeeId);
  },

  async getScore(
    employeeId: string,
    year: number,
    month: number
  ): Promise<KRAScore | undefined> {
    const all = await this.getAllScores();
    return all.find(
      s => s.employeeId === employeeId && s.year === year && s.month === month
    );
  },

  async upsertScore(params: {
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    designation?: string;
    year: number;
    month: number;
    templateId?: string;
    kras: KRAScoreItem[];
    managerRemarks?: string;
    status?: KRAScore['status'];
    reviewerId?: string;
    reviewerName?: string;
  }): Promise<KRAScore> {
    const { items, total } = recalcScore(params.kras);
    const grade = computeGrade(total);
    const incentivePct = computeIncentivePct(total);
    const now = new Date().toISOString();

    const existing = await this.getScore(
      params.employeeId,
      params.year,
      params.month
    );
    const id =
      existing?.id ||
      'kra_sc_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);

    const record: KRAScore = {
      id,
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      employeeRole: params.employeeRole,
      designation: params.designation,
      year: params.year,
      month: params.month,
      templateId: params.templateId,
      kras: items,
      totalScore: total,
      grade,
      incentivePct,
      managerRemarks: params.managerRemarks,
      status: params.status || existing?.status || 'draft',
      reviewedByUserId:
        params.status === 'approved' ? params.reviewerId : existing?.reviewedByUserId,
      reviewedByUserName:
        params.status === 'approved'
          ? params.reviewerName
          : existing?.reviewedByUserName,
      reviewedAt: params.status === 'approved' ? now : existing?.reviewedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    await db.kraScores.put(record);
    saveRecordToFirestore('kraScores', id, record);
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
    return record;
  },

  async deleteScore(id: string): Promise<void> {
    await markRecordAsDeleted(id, 'kraScores');
    await db.kraScores.delete(id);
    deleteRecordFromFirestore('kraScores', id).catch(() => {});
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  },

  // Build a fresh (unscored) sheet for an employee + month using role template
  async buildSheetFromTemplate(
    role: UserRole
  ): Promise<{ templateId?: string; items: KRAScoreItem[] }> {
    const tpl = await this.getTemplateForRole(role);
    const kras = tpl?.kras || DEFAULT_FIELD_KRA;
    const items: KRAScoreItem[] = kras.map(k => ({
      name: k.name,
      weight: k.weight,
      target: k.target,
      actual: '',
      achievementPct: 0,
      score: 0,
      remarks: ''
    }));
    return { templateId: tpl?.id, items };
  }
};
