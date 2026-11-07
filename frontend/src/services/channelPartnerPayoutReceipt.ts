import { PAYOUT_MODE_LABEL, type ChannelPartnerPayout } from './channelPartnerPayoutService';
import { getQuotationImageOverrides } from './quotationTemplateService';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Opens a printable payout receipt in a new tab (Print → Save as PDF to download it). */
export async function openPayoutReceipt(p: ChannelPartnerPayout): Promise<void> {
  // Open the tab synchronously so pop-up blockers allow it, then fill it once the heavy PDF module has loaded.
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups for this site to view the receipt.');
    return;
  }
  win.document.write('<p style="font-family:Arial;padding:24px;color:#64748b">Preparing receipt…</p>');

  const { getDefaultQuotationImages, numberToWordsINR } = await import('./pdfService');
  const defaults = getDefaultQuotationImages();
  const overrides = getQuotationImageOverrides();
  const logo = overrides.logo || defaults.logo;
  const stamp = overrides.stamp || defaults.stamp;

  const rows: [string, string][] = [
    ['Customer quotation', inr(p.customerPrice)],
    ['Rate given to channel partner', inr(p.partnerRate)],
    ['Margin', inr(p.margin)],
    [`GST deducted (${p.gstPct}%)`, `− ${inr(p.gst)}`],
    ['Calculated incentive', inr(p.incentive)]
  ];

  win.document.open();
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payout Receipt ${esc(p.receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; background: #f1f5f9; }
  .page { max-width: 760px; margin: 24px auto; background: #fff; padding: 36px 40px; border: 1px solid #e2e8f0; border-radius: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #15803d; padding-bottom: 16px; }
  .head img { height: 64px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: #15803d; }
  .title p { margin: 4px 0 0; font-size: 12px; color: #475569; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin: 22px 0; font-size: 13px; }
  .grid b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #64748b; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  td:last-child { text-align: right; font-weight: bold; }
  .paid { margin-top: 18px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .paid .amt { font-size: 26px; font-weight: 900; color: #15803d; }
  .words { font-size: 12px; color: #334155; margin-top: 6px; font-style: italic; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; font-size: 12px; color: #475569; }
  .sign { text-align: center; }
  .sign img { height: 80px; display: block; margin: 0 auto 4px; }
  .note { margin-top: 26px; font-size: 10px; color: #94a3b8; text-align: center; }
  .bar { max-width: 760px; margin: 16px auto 0; text-align: right; }
  .bar button { background: #0f172a; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-weight: bold; cursor: pointer; }
  @media (max-width: 600px) { .page { margin: 0; border-radius: 0; padding: 22px 18px; } .grid { grid-template-columns: 1fr; } .head img { height: 48px; } }
  @media print { body { background: #fff; } .page { margin: 0; border: 0; } .bar { display: none; } }
</style></head>
<body>
  <div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="page">
    <div class="head">
      <img src="${esc(logo)}" alt="Logo">
      <div class="title">
        <h1>INCENTIVE PAYOUT RECEIPT</h1>
        <p>Receipt No: <b>${esc(p.receiptNo)}</b></p>
        <p>Date of payment: <b>${esc(fmtDate(p.paidAt))}</b></p>
      </div>
    </div>

    <div class="grid">
      <div><b>Paid to (Channel Partner)</b>${esc(p.partnerName)}</div>
      <div><b>Payment mode</b>${esc(PAYOUT_MODE_LABEL[p.mode] || p.mode)}${p.reference ? `<br>Ref: ${esc(p.reference)}` : ''}</div>
      <div><b>Customer / Lead</b>${esc(p.leadName)}${p.leadPhone ? ` • ${esc(p.leadPhone)}` : ''}</div>
      <div><b>Paid by</b>${esc(p.paidByName)}</div>
    </div>

    <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>

    <div class="paid">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#166534;font-weight:bold">Amount Paid</div>
        <div class="words">${esc(numberToWordsINR(p.amount))}</div>
      </div>
      <div class="amt">${esc(inr(p.amount))}</div>
    </div>
    ${p.notes ? `<p style="font-size:12px;color:#334155;margin-top:14px"><b>Notes:</b> ${esc(p.notes)}</p>` : ''}

    <div class="foot">
      <div>Generated on ${esc(fmtDate(p.createdAt))}</div>
      <div class="sign">${stamp ? `<img src="${esc(stamp)}" alt="Stamp">` : ''}Authorised Signatory</div>
    </div>
    <p class="note">This is a computer-generated receipt for channel partner incentive payout.</p>
  </div>
</body></html>`);
  win.document.close();
}
