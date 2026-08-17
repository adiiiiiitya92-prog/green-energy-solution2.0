import { leadService, filterLeadsForUser } from './leadService';
import { productService } from './productService';
import { quotationService } from './quotationService';
import { complaintService } from './complaintService';
import { challanService } from './challanService';
import { deletionRequestService } from './deletionRequestService';
import { useAuthStore } from '../store/authStore';

const GROQ_API_KEY =
  (import.meta as any).env?.VITE_GROQ_API_KEY ||
  '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';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestedActions?: string[];
}

export interface SoftwareLiveContext {
  currentUser?: {
    name: string;
    role: string;
    email?: string;
  };
  currentPage: string;
  leads: {
    total: number;
    byStage: Record<string, number>;
    totalCapacityKw: number;
    todayFollowUps: number;
  };
  inventory: {
    totalProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    topCategories: string[];
    lowStockItems: string[];
  };
  quotations: {
    total: number;
    totalAmount: number;
  };
  complaints: {
    total: number;
    open: number;
    resolved: number;
  };
  challans: {
    total: number;
    pending: number;
  };
  pendingDeletionsCount: number;
}

/**
 * Gathers real-time live data strictly scoped to the logged-in user's dashboard
 */
export async function getLiveSoftwareContext(): Promise<SoftwareLiveContext> {
  const { currentUser, currentRole } = useAuthStore.getState();
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';

  let totalLeads = 0;
  const byStage: Record<string, number> = {};
  let totalCapacityKw = 0;
  let todayFollowUps = 0;
  const visibleLeadIds = new Set<string>();

  try {
    const rawLeads = await leadService.getLeads();
    // Strictly filter leads visible on this user's dashboard based on their role/assignment
    const userLeads = filterLeadsForUser(rawLeads, currentUser, currentRole);
    totalLeads = userLeads.length;
    const todayStr = new Date().toISOString().split('T')[0];

    userLeads.forEach((l) => {
      visibleLeadIds.add(l.id);
      byStage[l.status] = (byStage[l.status] || 0) + 1;
      const capMatch = l.requirement?.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
      if (capMatch) {
        totalCapacityKw += parseFloat(capMatch[1]) || 0;
      }
      if (l.nextFollowUpDate && l.nextFollowUpDate.startsWith(todayStr)) {
        todayFollowUps++;
      }
    });
  } catch (_) {}

  let totalProducts = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  const topCategories: string[] = [];
  const lowStockItems: string[] = [];

  try {
    const products = await productService.getProducts();
    totalProducts = products.length;
    const catSet = new Set<string>();

    products.forEach((p) => {
      if (p.category) catSet.add(p.category);
      if (p.stockQuantity <= 0) {
        outOfStockCount++;
        lowStockItems.push(`${p.name} (0 in stock)`);
      } else if (p.stockQuantity <= (p.minStockThreshold || 5)) {
        lowStockCount++;
        lowStockItems.push(`${p.name} (${p.stockQuantity} remaining)`);
      }
    });
    topCategories.push(...Array.from(catSet));
  } catch (_) {}

  let totalQuotations = 0;
  let totalQuotationAmount = 0;
  try {
    const quotations = await quotationService.getQuotations();
    // Scope quotations to user's visible leads or whole system if super_admin
    const userQuotes =
      currentRole === 'super_admin'
        ? quotations
        : quotations.filter((q) => !q.leadId || visibleLeadIds.has(q.leadId));

    totalQuotations = userQuotes.length;
    userQuotes.forEach((q) => {
      totalQuotationAmount += q.totalPayable || q.totalAmount || 0;
    });
  } catch (_) {}

  let totalComplaints = 0;
  let openComplaints = 0;
  let resolvedComplaints = 0;
  try {
    const complaints = await complaintService.getComplaints();
    const userComplaints =
      currentRole === 'super_admin'
        ? complaints
        : complaints.filter((c) => !c.leadId || visibleLeadIds.has(c.leadId));

    totalComplaints = userComplaints.length;
    userComplaints.forEach((c) => {
      if (c.status === 'open' || c.status === 'in_progress') openComplaints++;
      else if (c.status === 'resolved' || c.status === 'closed') resolvedComplaints++;
    });
  } catch (_) {}

  let totalChallans = 0;
  let pendingChallans = 0;
  try {
    const challans = await challanService.getChallans();
    totalChallans = challans.length;
    challans.forEach((ch) => {
      if (ch.status === 'draft' || ch.status === 'dispatched') pendingChallans++;
    });
  } catch (_) {}

  let pendingDeletionsCount = 0;
  if (currentRole === 'super_admin') {
    try {
      const deletions = await deletionRequestService.getPendingRequests();
      pendingDeletionsCount = deletions.length;
    } catch (_) {}
  }

  return {
    currentUser: currentUser
      ? {
          name: currentUser.fullName || 'User',
          role: currentRole || 'admin',
          email: currentUser.email
        }
      : undefined,
    currentPage: currentPath,
    leads: {
      total: totalLeads,
      byStage,
      totalCapacityKw: Math.round(totalCapacityKw * 10) / 10,
      todayFollowUps
    },
    inventory: {
      totalProducts,
      lowStockCount,
      outOfStockCount,
      topCategories,
      lowStockItems: lowStockItems.slice(0, 5)
    },
    quotations: {
      total: totalQuotations,
      totalAmount: totalQuotationAmount
    },
    complaints: {
      total: totalComplaints,
      open: openComplaints,
      resolved: resolvedComplaints
    },
    challans: {
      total: totalChallans,
      pending: pendingChallans
    },
    pendingDeletionsCount
  };
}

/**
 * Builds system prompt with live CRM state and Solar Industry knowledge
 */
function buildSystemPrompt(context: SoftwareLiveContext): string {
  const stageBreakdown =
    Object.entries(context.leads.byStage)
      .map(([stage, count]) => `${stage}: ${count}`)
      .join(', ') || '0 leads';

  return `You are "Setu AI", the dedicated AI assistant built exclusively for Green Energy Solution Admin and Super Admin users.

=== USER-SCOPED DASHBOARD CONTEXT ===
- User: ${context.currentUser?.name || 'Admin'} (Role: ${context.currentUser?.role || 'admin'})
- Current Active Page: ${context.currentPage}
- Customer Leads in User's Dashboard: ${context.leads.total} total leads
- Pipeline Status Breakdown: ${stageBreakdown}
- Total Installed / Sanctioned Solar Capacity: ${context.leads.totalCapacityKw} kW
- Today's Follow-ups Due: ${context.leads.todayFollowUps} leads
- Total Inventory Items: ${context.inventory.totalProducts} items
- Low / Out of Stock: ${context.inventory.lowStockCount + context.inventory.outOfStockCount} (${
    context.inventory.lowStockItems.join(', ') || 'Stock Healthy'
  })
- Quotations on Dashboard: ${context.quotations.total} (Total Value: ₹${context.quotations.totalAmount.toLocaleString(
    'en-IN'
  )})
- Complaints: ${context.complaints.open} open (${context.complaints.resolved} resolved)
- Challans: ${context.challans.total} total (${context.challans.pending} pending)
- Pending Deletion Approvals: ${context.pendingDeletionsCount}

=== SOLAR KNOWLEDGE BASE ===
1. PM Surya Ghar Muft Bijli Yojana Central Subsidy:
   - 1 kW: ₹30,000 | 2 kW: ₹60,000 | 3 kW to 10 kW: ₹78,000 maximum fixed subsidy.
   - Payback Period: ~3 to 4 years. 25-year panel performance warranty.
2. Technical Specs:
   - Panels: Waaree / Adani / Vikram / Premier Mono PERC & TopCon Bifacial (540W-580W, ALMM/DCR).
   - Inverters: Growatt, Solis, Sungrow MPPT On-Grid Inverters.
   - Earthing & Protection: 3 Earthings (AC, DC, Lightning Arrester) with earth resistance < 5 Ohms as per MNRE OM 07.06.24. Solid Copper ESE Lightning Arrester.
3. System Navigation:
   - [Leads & Pipeline](/leads) | [Inventory](/inventory-panel) | [Shadow Analysis](/shadow-analysis) | [Challans](/challans) | [Visits](/visits)

=== STRICT RESPONSE GUIDELINES ===
- Answer ONLY about this user's dashboard counts, their active lead pipeline, their inventory, documentation (WCR, DCR, Quotation, CFA), or solar technical questions.
- NEVER invent or discuss unrelated topics outside this ERP and solar domain.
- When asked about counts (e.g. "Meri total leads kitni hain?", "Aaj kitne follow up hain?"), reply using the EXACT numbers from the LIVE DASHBOARD CONTEXT above.
- Speak in clear, friendly, and respectful Hinglish or English.
- Use clean formatting with bullet points and bold highlights.`;
}

/**
 * Sends a user message to Groq AI with live software context and conversation history
 */
export async function sendAiSupportMessage(
  userQuery: string,
  history: ChatMessage[] = []
): Promise<string> {
  try {
    const liveContext = await getLiveSoftwareContext();
    const systemPrompt = buildSystemPrompt(liveContext);

    // Format chat history (last 8 messages for context window efficiency)
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map((m) => ({
        role: m.role,
        content: m.content
      })),
      { role: 'user', content: userQuery }
    ];

    const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
    let lastError: any = null;

    for (const model of models) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            temperature: 0.3,
            max_tokens: 800
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.warn(`Groq model ${model} failed (${response.status}):`, errText);
          lastError = new Error(errText);
          continue;
        }

        const data = await response.json();
        let reply = data.choices?.[0]?.message?.content || '';

        // Clean out any raw thinking tags if present (e.g. <think>...</think>)
        reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        if (reply) {
          return reply;
        }
      } catch (modelErr) {
        lastError = modelErr;
        console.warn(`Attempt with ${model} error, trying fallback:`, modelErr);
      }
    }

    if (lastError) {
      throw lastError;
    }
    return 'Maaf kijiye, abhi server se response lene me samasya aayi. Kripya thodi der baad dobara poochiye.';
  } catch (err: any) {
    console.error('AI Support Bot error:', err);
    return `Error: ${err.message || 'Unable to connect to AI server. Please check your internet connection.'}`;
  }
}
