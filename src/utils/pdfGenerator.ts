import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './currency';

/**
 * Universal autoTable runner compatible with both ESM, CommonJS, and Vite bundle formats
 */
function runAutoTable(docInstance: any, options: any) {
  if (typeof autoTable === 'function') {
    (autoTable as any)(docInstance, options);
  } else if ((autoTable as any)?.default && typeof (autoTable as any).default === 'function') {
    (autoTable as any).default(docInstance, options);
  } else if ((autoTable as any)?.autoTable && typeof (autoTable as any).autoTable === 'function') {
    (autoTable as any).autoTable(docInstance, options);
  } else if (typeof docInstance.autoTable === 'function') {
    docInstance.autoTable(options);
  } else {
    throw new Error('autoTable plugin is not available on jsPDF instance');
  }
}

/**
 * Multi-layer robust PDF file downloader for desktop WebViews (Edge WebView2 / Tauri) and browsers.
 */
function downloadPDFDocument(doc: jsPDF, filename: string) {
  // Layer 1: DOM-attached Blob URL download (standard in Chromium / WebView2)
  try {
    const blob = doc.output('blob');
    if (blob && blob.size > 0) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 2500);
      return;
    }
  } catch (blobErr) {
    console.warn('Blob URL download failed, trying data URI:', blobErr);
  }

  // Layer 2: Base64 Data URI with DOM anchor
  try {
    const dataUri = doc.output('datauristring');
    if (dataUri && dataUri.length > 50) {
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
        } catch (_) {}
      }, 2500);
      return;
    }
  } catch (dataUriErr) {
    console.warn('Data URI download failed, trying doc.save:', dataUriErr);
  }

  // Layer 3: Native doc.save
  try {
    doc.save(filename);
    return;
  } catch (saveErr) {
    console.warn('doc.save failed, trying window.open:', saveErr);
  }

  // Layer 4: Fallback window.open with Blob
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (openErr) {
    console.error('All PDF download mechanisms failed:', openErr);
    throw new Error('Could not download or open the generated PDF.');
  }
}

export interface PDFReportConfig {
  title: string;
  subtitle?: string;
  period: string;
  accountName: string;
  docRef?: string;
  kpis?: {
    label: string;
    value: string;
    type?: 'income' | 'expense' | 'savings' | 'neutral';
  }[];
  tables: {
    title?: string;
    head: string[][];
    body: (string | number)[][];
    foot?: string[][];
  }[];
  filename: string;
}

export function generateReportPDF(config: PDFReportConfig) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // ~595.28 pt
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2; // ~515.28 pt

  // 100% Grayscale Business Palette
  const black: [number, number, number] = [0, 0, 0];
  const charcoal: [number, number, number] = [31, 41, 55]; // Gray-800
  const grayMuted: [number, number, number] = [107, 114, 128]; // Gray-500
  const grayBorder: [number, number, number] = [209, 213, 219]; // Gray-300
  const grayFill: [number, number, number] = [243, 244, 246]; // Gray-100

  const docId = config.docRef || `RM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const dateStr = formatDate(new Date());

  // =========================================================================
  // 1. Business Statement Letterhead
  // =========================================================================
  // Organization Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(black[0], black[1], black[2]);
  doc.text('rMoney', marginX, 40);

  // Sub-letterhead
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
  doc.text('PERSONAL FINANCIAL MANAGEMENT SYSTEM', marginX, 50);

  // Document Classification (Right-aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(black[0], black[1], black[2]);
  doc.text('OFFICIAL FINANCIAL STATEMENT', pageWidth - marginX, 35, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
  doc.text(`REFERENCE: ${docId}`, pageWidth - marginX, 44, { align: 'right' });
  doc.text(`ISSUED: ${dateStr}`, pageWidth - marginX, 52, { align: 'right' });

  // Formal Rule Divider
  doc.setDrawColor(black[0], black[1], black[2]);
  doc.setLineWidth(1.5);
  doc.line(marginX, 58, pageWidth - marginX, 58);

  // =========================================================================
  // 2. Statement Title & Metadata Ledger
  // =========================================================================
  let currentY = 78;

  // Primary Statement Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(black[0], black[1], black[2]);
  doc.text(config.title.toUpperCase(), marginX, currentY);
  currentY += 13;

  if (config.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
    doc.text(config.subtitle, marginX, currentY);
    currentY += 14;
  } else {
    currentY += 4;
  }

  // 4-Column Audit Scope Grid
  const scopeBoxHeight = 28;
  doc.setFillColor(grayFill[0], grayFill[1], grayFill[2]);
  doc.setDrawColor(grayBorder[0], grayBorder[1], grayBorder[2]);
  doc.setLineWidth(0.75);
  doc.rect(marginX, currentY, contentWidth, scopeBoxHeight, 'FD');

  const colW = contentWidth / 4;

  const scopeColumns = [
    { label: 'REPORTING SCOPE', val: config.accountName },
    { label: 'STATEMENT PERIOD', val: config.period },
    { label: 'CLASSIFICATION', val: 'Personal Accounting' },
    { label: 'ACCOUNTING BASIS', val: 'Cash Basis (Reconciled)' },
  ];

  scopeColumns.forEach((col, idx) => {
    const colX = marginX + idx * colW + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
    doc.text(col.label, colX, currentY + 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(black[0], black[1], black[2]);
    doc.text(col.val, colX, currentY + 20);

    if (idx < 3) {
      doc.setDrawColor(grayBorder[0], grayBorder[1], grayBorder[2]);
      doc.setLineWidth(0.5);
      doc.line(marginX + (idx + 1) * colW, currentY, marginX + (idx + 1) * colW, currentY + scopeBoxHeight);
    }
  });

  currentY += scopeBoxHeight + 14;

  // =========================================================================
  // 3. Grayscale Executive Summary KPI Table / Cards
  // =========================================================================
  if (config.kpis && config.kpis.length > 0) {
    const kpiCount = config.kpis.length;
    const gap = 6;
    const kpiWidth = (contentWidth - (kpiCount - 1) * gap) / kpiCount;
    const kpiHeight = 38;

    config.kpis.forEach((kpi, idx) => {
      const x = marginX + idx * (kpiWidth + gap);

      // Box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(charcoal[0], charcoal[1], charcoal[2]);
      doc.setLineWidth(0.75);
      doc.rect(x, currentY, kpiWidth, kpiHeight, 'FD');

      // Top rule
      doc.setDrawColor(black[0], black[1], black[2]);
      doc.setLineWidth(1.5);
      doc.line(x, currentY, x + kpiWidth, currentY);

      // Micro label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
      doc.text(kpi.label.toUpperCase(), x + 6, currentY + 12);

      // Numeric figure
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(black[0], black[1], black[2]);
      doc.text(kpi.value, x + 6, currentY + 28);
    });

    currentY += kpiHeight + 16;
  }

  // =========================================================================
  // 4. Financial Data Tables (autoTable)
  // =========================================================================
  for (const tbl of config.tables) {
    if (tbl.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(black[0], black[1], black[2]);
      doc.text(tbl.title.toUpperCase(), marginX, currentY);
      currentY += 6;
    }

    // Determine smart column alignments: right-align numbers/currencies, center dates/types
    const columnStyles: { [key: number]: any } = {};
    if (tbl.head && tbl.head.length > 0) {
      const headerRow = tbl.head[0];
      headerRow.forEach((hdr, colIndex) => {
        const lower = hdr.toLowerCase();
        if (
          lower.includes('amount') ||
          lower.includes('spent') ||
          lower.includes('budget') ||
          lower.includes('variance') ||
          lower.includes('%') ||
          lower.includes('total') ||
          lower.includes('balance') ||
          lower.includes('net') ||
          lower.includes('used')
        ) {
          columnStyles[colIndex] = { halign: 'right' };
        } else if (lower.includes('date') || lower.includes('type') || lower.includes('count') || lower.includes('status')) {
          columnStyles[colIndex] = { halign: 'center' };
        } else {
          columnStyles[colIndex] = { halign: 'left' };
        }
      });
    }

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: tbl.head,
      body: tbl.body,
      foot: tbl.foot,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        textColor: black,
        cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
        lineColor: grayBorder,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: grayFill,
        textColor: black,
        fontStyle: 'bold',
        fontSize: 7.5,
        lineWidth: { top: 1.5, bottom: 1.5 },
        lineColor: black,
        cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      footStyles: {
        fillColor: grayFill,
        textColor: black,
        fontStyle: 'bold',
        fontSize: 8,
        lineWidth: { top: 1.5, bottom: 2.5 },
        lineColor: black,
      },
      columnStyles: columnStyles,
    });

    const lastAutoTable = (doc as any).lastAutoTable;
    if (lastAutoTable) {
      currentY = lastAutoTable.finalY + 18;
    }
  }

  // =========================================================================
  // 5. Running Headers and Footers Across All Pages
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Running Header for Page 2+
    if (i > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
      doc.text(`rMoney Financial Statement • ${config.title.toUpperCase()}`, marginX, 24);
      doc.text(`Period: ${config.period}`, pageWidth - marginX, 24, { align: 'right' });

      doc.setDrawColor(black[0], black[1], black[2]);
      doc.setLineWidth(0.5);
      doc.line(marginX, 28, pageWidth - marginX, 28);
    }

    // Running Footer on every page
    const footerY = 812;
    doc.setDrawColor(black[0], black[1], black[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, footerY, pageWidth - marginX, footerY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(grayMuted[0], grayMuted[1], grayMuted[2]);
    doc.text('CONFIDENTIAL • FOR PERSONAL TAX & FINANCIAL RECORD KEEPING ONLY', marginX, footerY + 10);

    doc.setFont('helvetica', 'normal');
    doc.text('Generated by rMoney Pro', pageWidth / 2, footerY + 10, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.text(`PAGE ${i} OF ${totalPages}`, pageWidth - marginX, footerY + 10, { align: 'right' });
  }

  // Multi-tier download mechanism
  downloadPDFDocument(doc, config.filename);
}
