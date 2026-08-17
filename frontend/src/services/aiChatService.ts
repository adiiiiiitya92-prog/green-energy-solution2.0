import { leadService } from './leadService';
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
 * Gathers real-time live data from across the entire CRM/ERP application
 */
export async function getLiveSoftwareContext(): Promise<SoftwareLiveContext> {
  const { currentUser, currentRole } = useAuthStore.getState();
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';

  let totalLeads = 0;
  const byStage: Record<string, number> = {};
  let totalCapacityKw = 0;
  let todayFollowUps = 0;

  try {
    const rawLeads = await leadService.getLeads();
    totalLeads = rawLeads.length;
    const todayStr = new Date().toISOString().split('T')[0];

    rawLeads.forEach((l) => {
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
    totalQuotations = quotations.length;
    quotations.forEach((q) => {
      totalQuotationAmount += q.totalPayable || q.totalAmount || 0;
    });
  } catch (_) {}

  let totalComplaints = 0;
  let openComplaints = 0;
  let resolvedComplaints = 0;
  try {
    const complaints = await complaintService.getComplaints();
    totalComplaints = complaints.length;
    complaints.forEach((c) => {
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
  try {
    const deletions = await deletionRequestService.getPendingRequests();
    pendingDeletionsCount = deletions.length;
  } catch (_) {}

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
  const stageBreakdown = Object.entries(context.leads.byStage)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(', ') || 'No leads yet';

  return `You are "Setu AI", the intelligent, friendly, and expert AI assistant built directly into the "Green Energy Solution" Solar ERP & CRM Platform.

You have LIVE real-time visibility into the user's software dashboard, lead pipeline, inventory, and operations.

=== CURRENT LIVE SOFTWARE DATA & DASHBOARD COUNTS ===
- Logged-in User: ${context.currentUser?.name || 'User'} (Role: ${context.currentUser?.role || 'Admin'})
- Current Page Location: ${context.currentPage}
- Total Customer Leads: ${context.leads.total} leads
- Leads by Pipeline Stage: ${stageBreakdown}
- Total Installed / Sanctioned Solar Capacity: ${context.leads.totalCapacityKw} kW
- Today's Due Follow-Ups: ${context.leads.todayFollowUps} leads
- Total Products in Inventory: ${context.inventory.totalProducts} items
- Low / Out of Stock Items (${context.inventory.lowStockCount + context.inventory.outOfStockCount}): ${
    context.inventory.lowStockItems.join(', ') || 'None (Healthy Stock)'
  }
- Total Quotations Generated: ${context.quotations.total} (Total Value: ₹${context.quotations.totalAmount.toLocaleString(
    'en-IN'
  )})
- Active Customer Complaints: ${context.complaints.open} open (${context.complaints.resolved} resolved out of ${
    context.complaints.total
  })
- Delivery Challans: ${context.challans.total} total (${context.challans.pending} pending/dispatched)
- Pending Deletion Approvals (Admin review): ${context.pendingDeletionsCount} requests

=== SOLAR INDUSTRY & TECHNICAL KNOWLEDGE BASE ===
1. PM Surya Ghar Muft Bijli Yojana (Central Subsidy):
   - 1 kW System: ₹30,000 subsidy (approx. 4-5 units/day generation)
   - 2 kW System: ₹60,000 subsidy (approx. 8-10 units/day generation)
   - 3 kW to 10 kW System: ₹78,000 maximum fixed subsidy (approx. 12-15 units/day for 3kW)
   - Payback Period: ~3 to 4 years. 25-year performance warranty.
2. Technical Specifications:
   - Panels: Waaree / Adani / Vikram / Tata Mono PERC & TopCon Bifacial (540W - 580W, ALMM & DCR certified).
   - Inverters: Growatt, Solis, Sungrow, Deye On-Grid MPPT Inverters.
   - Earthing & Protection: 3 Earthings (AC, DC, Lightning Arrester) with earth resistance < 5 Ohms as per MNRE OM 07.06.24. Solid Copper ESE Lightning Arrester.
   - Net Metering: Bi-directional meter connected to state DISCOM grid.
3. Software Navigation & Features:
   - Leads & Pipeline: /leads (Manage customer lifecycle, stage shifts, KYC docs, booking, installations, receipts).
   - Quotation Generator: Inside lead view or /quotation-doc (custom BOM, pricing, PM Surya Ghar subsidy calc, 8-page proposal PDF).
   - Work Completion Report (WCR): Inside lead view -> Documents -> WCR (Auto-fills consumer details, specifications, Groq AI Aadhar reader on Page 2).
   - DCR Certificate & CFA Agreement: Inside lead view -> Documents tab.
   - Delivery Challans & Stock: /challans and /inventory-panel.
   - Shadow Analysis (3D Visualizer): /shadow-analysis (Sun position, Azimuth, Elevation, hourly shading simulation).
   - Field Visits: /visits (GPS-tagged geo-location photos, survey logs).

=== YOUR BEHAVIOR & GUIDELINES ===
- Answer directly, helpfully, and professionally in conversational Hindi + English (Hinglish) or pure English as preferred by user.
- When asked about counts or dashboard metrics (e.g. "Total leads kitne hain?", "Installation pending kitne hain?"), ALWAYS give the exact live numbers from the live data above.
- When asked how to do something in the software, provide clear step-by-step instructions with clickable markdown links (e.g. [Lead Pipeline](/leads), [Inventory Panel](/inventory-panel), [Shadow Analysis](/shadow-analysis)).
- Format responses cleanly with bold headings, bullet points, emoji icons, and concise summaries.
- Keep answers engaging, crisp, and accurately grounded in solar science and this ERP system.`;
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
    return "Maaf kijiye, abhi server se response lene me samasya aayi. Kripya thodi der baad dobara poochiye.";
  } catch (err: any) {
    console.error('AI Support Bot error:', err);
    return `Error: ${err.message || 'Unable to connect to AI server. Please check your internet connection.'}`;
  }
}
