import jsPDF from 'jspdf';
import dayjs from 'dayjs';
import type { ProductChallan, Receipt, PaymentMethod } from '../types';

/**
 * Lightweight, on-demand PDF generation for Change 2 (Product Challan) and
 * Change 4 (Installation Payment Receipt). Kept in a separate module (decoupled)
 * and reusing jsPDF — no server cron/queue, no stored PDFs (generated on click).
 */

function header(doc: jsPDF, title: string, refNo: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 28, 210, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('GREEN ENERGY SOLUTION', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Solar Rooftop Systems & EPC Solutions', 14, 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 196, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`No: ${refNo}`, 196, 19, { align: 'right' });
}

function footer(doc: jsPDF, note: string) {
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 282, 196, 282);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(note, 14, 288);
  doc.text('Computer-generated document.', 196, 288, { align: 'right' });
}

function methodLabel(m?: PaymentMethod): string {
  const map: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other'
  };
  return (m && map[m]) || '—';
}

export async function generateProductChallanPdf(ch: ProductChallan): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  header(doc, 'DELIVERY CHALLAN', ch.challanNo);

  doc.setTextColor(30, 41, 59);
  let y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Date: ${dayjs(ch.date || ch.createdAt).format('DD MMM YYYY')}`, 14, y);
  if (ch.vehicleNo) doc.text(`Vehicle No: ${ch.vehicleNo}`, 196, y, { align: 'right' });
  y += 8;

  // Customer box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, 24, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('BILL / SHIP TO', 18, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(ch.customerSnapshot?.name || '—', 18, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (ch.customerSnapshot?.phone) doc.text(`Phone: ${ch.customerSnapshot.phone}`, 18, y + 19);
  if (ch.customerSnapshot?.address) {
    const addr = doc.splitTextToSize(ch.customerSnapshot.address, 110);
    doc.text(addr, 95, y + 13);
  }
  y += 32;

  // Items table
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y, 182, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('#', 18, y + 5.5);
  doc.text('Product', 26, y + 5.5);
  doc.text('Qty', 150, y + 5.5, { align: 'right' });
  doc.text('Unit', 170, y + 5.5);
  y += 8;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  (ch.items || []).forEach((it, idx) => {
    if (y > 265) { doc.addPage(); y = 20; }
    if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 7, 'F'); }
    doc.text(String(idx + 1), 18, y + 5);
    const name = doc.splitTextToSize(`${it.productName}${it.brand ? ' (' + it.brand + ')' : ''}`, 118);
    doc.text(name, 26, y + 5);
    doc.text(String(it.qty ?? ''), 150, y + 5, { align: 'right' });
    doc.text(it.unit || 'Nos', 170, y + 5);
    y += Math.max(7, name.length * 4.5);
  });

  y += 6;
  if (ch.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Notes:', 14, y);
    doc.setFont('helvetica', 'normal');
    const notes = doc.splitTextToSize(ch.notes, 182);
    doc.text(notes, 14, y + 5);
    y += 5 + notes.length * 4.5;
  }

  if (ch.status === 'cancelled') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('** CANCELLED **', 105, y + 8, { align: 'center' });
  }

  // Signatures
  const sy = 258;
  doc.setDrawColor(148, 163, 184);
  doc.line(20, sy, 75, sy);
  doc.line(135, sy, 190, sy);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Prepared by: ${ch.createdByName || ''}`, 20, sy + 5);
  doc.text('Receiver Signature', 135, sy + 5);

  footer(doc, 'Material handed over in good condition.');
  return doc.output('blob');
}

export async function generateInstallationReceiptPdf(r: Receipt): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  header(doc, 'PAYMENT RECEIPT', r.receiptNo);

  doc.setTextColor(30, 41, 59);
  let y = 42;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date: ${dayjs(r.createdAt).format('DD MMM YYYY, hh:mm A')}`, 14, y);
  y += 10;

  const rows: [string, string][] = [
    ['Received From (Supervisor)', r.supervisorName || r.supervisorId],
    ['Lead / Client', r.leadName || r.leadId],
    ['Payment Method', methodLabel(r.method)],
    ['Transaction / Reference', r.transactionId || '—'],
    ['Approved By', r.approvedByName || r.approvedBy],
  ];

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, rows.length * 9 + 6, 2, 2, 'F');
  y += 8;
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8.5);
    doc.text(k, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    doc.text(String(v), 196, y, { align: 'right' });
    y += 9;
  });

  y += 10;
  // Amount highlight
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(14, y, 182, 18, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AMOUNT APPROVED', 20, y + 11);
  doc.setFontSize(15);
  doc.text(`INR ${Number(r.amount || 0).toLocaleString('en-IN')}`, 190, y + 12, { align: 'right' });
  y += 26;

  if (r.description) {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Remark:', 14, y);
    doc.setFont('helvetica', 'normal');
    const desc = doc.splitTextToSize(r.description, 182);
    doc.text(desc, 14, y + 5);
  }

  footer(doc, 'This is an official payment receipt. Please retain for records.');
  return doc.output('blob');
}

/** Open a generated PDF blob in a new tab for view / print / download. */
export function openPdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  // If popups blocked, fall back to download
  const win = window.open(url, '_blank');
  if (!win) {
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
