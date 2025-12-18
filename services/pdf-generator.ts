import { jsPDF } from 'jspdf';

export interface DocumentPdfData {
    type: 'INVOICE' | 'BL';
    dmsRef: string;
    date: string;
    companyName?: string;
    codeClient?: string;
    totalHT: number;
    totalTVA?: number;
    totalTTC?: number;
    observation?: string;
    lines: {
        numLigne: number;
        codeArticle: string;
        designation: string;
        quantite: number;
        prixUnitaire: number;
        remise?: number;
        tauxTVA?: number;
        montantHT: number;
        montantTTC?: number;
        numBL?: string;  // For invoice lines: BL reference (for grouping)
        dateBL?: string; // For invoice lines: BL date
    }[];
}

// Interface for BL group in invoice
interface BLGroup {
    numBL: string;
    dateBL?: string;
    lines: DocumentPdfData['lines'];
    totalHT: number;
}

interface CompanyInfo {
    companyName?: string;
    companyAddress?: string;
    companyPostalCode?: string;
    companyCity?: string;
    companyCountry?: string;
    companyPhone?: string;
    companyFax?: string;
    companyEmail?: string;
    companyWebsite?: string;
    companyTaxId?: string;
    companyRegistration?: string;
    companyCapital?: string;
    companyBankName?: string;
    companyBankRib?: string;
    documentLogoUrl?: string;
    documentFooterText?: string;
}

interface GeneratePdfOptions {
    currencySymbol?: string;
    decimalPlaces?: number;
    companyInfo?: CompanyInfo;
    summaryOnly?: boolean; // If true, show only BL headers without line details (for invoices)
}

/**
 * Group invoice lines by BL number
 */
const groupLinesByBL = (lines: DocumentPdfData['lines']): BLGroup[] => {
    const groups: Map<string, BLGroup> = new Map();
    const noBlLines: DocumentPdfData['lines'] = [];

    lines.forEach(line => {
        if (line.numBL) {
            const existing = groups.get(line.numBL);
            if (existing) {
                existing.lines.push(line);
                existing.totalHT += line.montantHT;
            } else {
                groups.set(line.numBL, {
                    numBL: line.numBL,
                    dateBL: line.dateBL,
                    lines: [line],
                    totalHT: line.montantHT,
                });
            }
        } else {
            noBlLines.push(line);
        }
    });

    // Convert map to array and sort by BL number
    const result = Array.from(groups.values()).sort((a, b) => a.numBL.localeCompare(b.numBL));

    // Add lines without BL as a separate group at the end
    if (noBlLines.length > 0) {
        result.push({
            numBL: '',
            dateBL: undefined,
            lines: noBlLines,
            totalHT: noBlLines.reduce((sum, l) => sum + l.montantHT, 0),
        });
    }

    return result;
};

/**
 * Generate a PDF document for an invoice (Facture) or delivery note (BL)
 * with a DUPLICATA watermark
 */
export const generateDocumentPdf = (data: DocumentPdfData, options: GeneratePdfOptions = {}): void => {
    const { currencySymbol = 'TND', decimalPlaces = 3, companyInfo, summaryOnly = false } = options;
    const doc = new jsPDF('p', 'mm', 'a4');

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    const rowHeight = 8;

    // Check if this invoice has BL grouping (has lines with numBL)
    const hasBLGrouping = data.type === 'INVOICE' && data.lines.some(l => l.numBL);
    const blGroups = hasBLGrouping ? groupLinesByBL(data.lines) : [];

    // Helper function to format price
    const formatPrice = (price: number): string => {
        return price.toFixed(decimalPlaces) + ' ' + currencySymbol;
    };

    // Helper function to add DUPLICATA watermark
    const addWatermark = () => {
        doc.saveGraphicsState();
        doc.setGState(doc.GState({ opacity: 0.15 }));
        doc.setTextColor(128, 128, 128);
        doc.setFontSize(60);
        doc.setFont('helvetica', 'bold');

        const text = 'DUPLICATA';
        const centerX = pageWidth / 2;
        const centerY = pageHeight / 2;

        doc.text(text, centerX, centerY, {
            angle: 45,
            align: 'center',
        });

        doc.restoreGraphicsState();
    };

    // Helper function to add page number footer
    const addPageNumber = (currentPage: number, totalPages: number) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${currentPage} / ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    };

    // Calculate total pages needed
    const calculateTotalPages = (): number => {
        const headerHeight = companyInfo ? 60 : 20;
        const docInfoHeight = 40;
        const tableHeaderHeight = 8;
        const totalsHeight = 60;
        const footerReserve = 35;
        const blHeaderHeight = 10; // Height for BL group header

        const firstPageAvailable = pageHeight - margin - headerHeight - docInfoHeight - tableHeaderHeight - totalsHeight - footerReserve;
        const subsequentPageAvailable = pageHeight - margin - tableHeaderHeight - totalsHeight - footerReserve;

        let totalContentHeight = 0;

        if (hasBLGrouping) {
            if (summaryOnly) {
                // Only BL headers: each group takes blHeaderHeight + a small summary row
                totalContentHeight = blGroups.length * (blHeaderHeight + rowHeight);
            } else {
                // Full content with BL headers
                blGroups.forEach(group => {
                    totalContentHeight += blHeaderHeight; // BL header
                    totalContentHeight += group.lines.length * rowHeight; // Lines
                    totalContentHeight += rowHeight; // BL subtotal
                });
            }
        } else {
            totalContentHeight = data.lines.length * rowHeight;
        }

        if (totalContentHeight <= firstPageAvailable) {
            return 1;
        }

        const remainingAfterFirst = totalContentHeight - firstPageAvailable;
        const additionalPages = Math.ceil(remainingAfterFirst / subsequentPageAvailable);

        return 1 + additionalPages;
    };

    const totalPages = calculateTotalPages();
    let currentPage = 1;

    // Add watermark first (background)
    addWatermark();

    let yPos = margin;

    // === COMPANY HEADER (if company info provided) ===
    if (companyInfo) {
        const headerStartY = yPos;

        // Left side: Logo or Company Name
        if (companyInfo.documentLogoUrl) {
            try {
                if (companyInfo.documentLogoUrl.startsWith('data:image')) {
                    doc.addImage(companyInfo.documentLogoUrl, 'AUTO', margin, yPos, 40, 15);
                    yPos += 18;
                }
            } catch (e) {
                if (companyInfo.companyName) {
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 51, 102);
                    doc.text(companyInfo.companyName, margin, yPos + 8);
                    yPos += 12;
                }
            }
        } else if (companyInfo.companyName) {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 51, 102);
            doc.text(companyInfo.companyName, margin, yPos + 8);
            yPos += 12;
        }

        // Company address and contact info
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);

        if (companyInfo.companyAddress) {
            doc.text(companyInfo.companyAddress, margin, yPos);
            yPos += 4;
        }

        const locationParts: string[] = [];
        if (companyInfo.companyPostalCode) locationParts.push(companyInfo.companyPostalCode);
        if (companyInfo.companyCity) locationParts.push(companyInfo.companyCity);
        if (companyInfo.companyCountry) locationParts.push(companyInfo.companyCountry);
        if (locationParts.length > 0) {
            doc.text(locationParts.join(' - '), margin, yPos);
            yPos += 4;
        }

        const contactParts: string[] = [];
        if (companyInfo.companyPhone) contactParts.push(`Tél: ${companyInfo.companyPhone}`);
        if (companyInfo.companyFax) contactParts.push(`Fax: ${companyInfo.companyFax}`);
        if (contactParts.length > 0) {
            doc.text(contactParts.join('  |  '), margin, yPos);
            yPos += 4;
        }

        const webParts: string[] = [];
        if (companyInfo.companyEmail) webParts.push(companyInfo.companyEmail);
        if (companyInfo.companyWebsite) webParts.push(companyInfo.companyWebsite);
        if (webParts.length > 0) {
            doc.text(webParts.join('  |  '), margin, yPos);
            yPos += 4;
        }

        // Right side: Legal info
        let rightY = headerStartY + 4;
        const rightX = pageWidth - margin;
        doc.setFontSize(7);

        if (companyInfo.companyTaxId) {
            doc.text(`MF: ${companyInfo.companyTaxId}`, rightX, rightY, { align: 'right' });
            rightY += 3.5;
        }
        if (companyInfo.companyRegistration) {
            doc.text(`RC: ${companyInfo.companyRegistration}`, rightX, rightY, { align: 'right' });
            rightY += 3.5;
        }
        if (companyInfo.companyCapital) {
            doc.text(`Capital: ${companyInfo.companyCapital}`, rightX, rightY, { align: 'right' });
            rightY += 3.5;
        }
        if (companyInfo.companyBankName || companyInfo.companyBankRib) {
            if (companyInfo.companyBankName) {
                doc.text(`Banque: ${companyInfo.companyBankName}`, rightX, rightY, { align: 'right' });
                rightY += 3.5;
            }
            if (companyInfo.companyBankRib) {
                doc.text(`RIB: ${companyInfo.companyBankRib}`, rightX, rightY, { align: 'right' });
                rightY += 3.5;
            }
        }

        yPos = Math.max(yPos, rightY) + 5;

        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
    }

    // === DOCUMENT HEADER ===
    let docTitle = data.type === 'INVOICE' ? 'FACTURE' : 'BON DE LIVRAISON';
    if (summaryOnly && hasBLGrouping) {
        docTitle = 'FACTURE (Récapitulatif BL)';
    }
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 51, 102);
    doc.text(docTitle, margin, yPos + 8);

    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text(`N° ${data.dmsRef}`, pageWidth - margin, yPos + 8, { align: 'right' });

    yPos += 16;

    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);

    yPos += 10;

    // === DOCUMENT INFO ===
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(data.date, margin + 25, yPos);
    yPos += 6;

    if (data.companyName) {
        doc.setFont('helvetica', 'bold');
        doc.text('Client:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(data.companyName, margin + 25, yPos);
        yPos += 6;
    }

    if (data.codeClient) {
        doc.setFont('helvetica', 'bold');
        doc.text('Code Client:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(data.codeClient, margin + 25, yPos);
        yPos += 6;
    }

    if (data.observation) {
        doc.setFont('helvetica', 'bold');
        doc.text('Observation:', margin, yPos);
        doc.setFont('helvetica', 'normal');
        const obsLines = doc.splitTextToSize(data.observation, contentWidth - 30);
        doc.text(obsLines, margin + 30, yPos);
        yPos += (obsLines.length * 5);
    }

    yPos += 10;

    // Calculate TVA groups for totals
    const tvaGroups: Record<number, { baseHT: number; montantTVA: number }> = {};

    // Helper to check for page break
    const checkPageBreak = (requiredSpace: number = 60) => {
        if (yPos > pageHeight - requiredSpace) {
            addPageNumber(currentPage, totalPages);
            doc.addPage();
            currentPage++;
            addWatermark();
            yPos = margin;
        }
    };

    // Column widths for detail table
    const colWidths = {
        numLigne: 12,
        codeArticle: 28,
        designation: 52,
        quantite: 18,
        prixUnitaire: 24,
        remise: 14,
        tauxTVA: 14,
        montantHT: 28,
    };

    // Helper to draw table header
    const drawTableHeader = () => {
        doc.setFillColor(0, 51, 102);
        doc.rect(margin, yPos, contentWidth, rowHeight, 'F');

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);

        let xPos = margin + 2;
        doc.text('N°', xPos, yPos + 5.5);
        xPos += colWidths.numLigne;
        doc.text('Code Article', xPos, yPos + 5.5);
        xPos += colWidths.codeArticle;
        doc.text('Désignation', xPos, yPos + 5.5);
        xPos += colWidths.designation;
        doc.text('Qté', xPos, yPos + 5.5);
        xPos += colWidths.quantite;
        doc.text('P.U. HT', xPos, yPos + 5.5);
        xPos += colWidths.prixUnitaire;
        doc.text('Rem%', xPos, yPos + 5.5);
        xPos += colWidths.remise;
        doc.text('TVA%', xPos, yPos + 5.5);
        xPos += colWidths.tauxTVA;
        doc.text('Montant HT', xPos, yPos + 5.5);

        yPos += rowHeight;
    };

    // Helper to draw a single line row
    const drawLineRow = (line: DocumentPdfData['lines'][0], index: number) => {
        checkPageBreak();

        if (index % 2 === 0) {
            doc.setFillColor(245, 247, 250);
            doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
        }

        doc.setDrawColor(220, 220, 220);
        doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(7);

        let xPos = margin + 2;
        doc.text(String(line.numLigne || index + 1), xPos, yPos + 5.5);
        xPos += colWidths.numLigne;
        doc.text(line.codeArticle || '', xPos, yPos + 5.5);
        xPos += colWidths.codeArticle;

        const maxDesigWidth = colWidths.designation - 2;
        let designation = line.designation || '';
        while (doc.getTextWidth(designation) > maxDesigWidth && designation.length > 3) {
            designation = designation.slice(0, -4) + '...';
        }
        doc.text(designation, xPos, yPos + 5.5);
        xPos += colWidths.designation;

        doc.text(String(line.quantite), xPos, yPos + 5.5);
        xPos += colWidths.quantite;
        doc.text(line.prixUnitaire.toFixed(decimalPlaces), xPos, yPos + 5.5);
        xPos += colWidths.prixUnitaire;
        doc.text(line.remise ? `${line.remise}%` : '-', xPos, yPos + 5.5);
        xPos += colWidths.remise;

        const tauxTVA = line.tauxTVA ?? 0;
        doc.text(tauxTVA > 0 ? `${tauxTVA}%` : '-', xPos, yPos + 5.5);
        xPos += colWidths.tauxTVA;

        doc.text(formatPrice(line.montantHT), xPos, yPos + 5.5);

        // Accumulate TVA groups
        if (tauxTVA > 0) {
            if (!tvaGroups[tauxTVA]) {
                tvaGroups[tauxTVA] = { baseHT: 0, montantTVA: 0 };
            }
            tvaGroups[tauxTVA].baseHT += line.montantHT;
            tvaGroups[tauxTVA].montantTVA += line.montantHT * (tauxTVA / 100);
        }

        yPos += rowHeight;
    };

    // Helper to draw BL group header
    const drawBLGroupHeader = (group: BLGroup) => {
        checkPageBreak(20);

        // BL header background
        doc.setFillColor(230, 240, 250);
        doc.rect(margin, yPos, contentWidth, 10, 'F');

        doc.setDrawColor(0, 102, 204);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos, margin, yPos + 10);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        doc.line(margin, yPos + 10, pageWidth - margin, yPos + 10);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 51, 102);

        if (group.numBL) {
            let blText = `BL N° ${group.numBL}`;
            if (group.dateBL) {
                blText += ` - Date: ${group.dateBL}`;
            }
            doc.text(blText, margin + 3, yPos + 6.5);

            // Show group total on the right
            doc.setFontSize(8);
            doc.text(`Total HT: ${formatPrice(group.totalHT)}`, pageWidth - margin - 3, yPos + 6.5, { align: 'right' });
        } else {
            doc.text('Autres lignes (sans BL)', margin + 3, yPos + 6.5);
            doc.setFontSize(8);
            doc.text(`Total HT: ${formatPrice(group.totalHT)}`, pageWidth - margin - 3, yPos + 6.5, { align: 'right' });
        }

        yPos += 12;
    };

    // Helper to draw BL subtotal row
    const drawBLSubtotal = (group: BLGroup) => {
        doc.setFillColor(240, 245, 250);
        doc.rect(margin, yPos, contentWidth, rowHeight, 'F');

        doc.setDrawColor(180, 200, 220);
        doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 51, 102);

        const subtotalText = group.numBL ? `Sous-total BL ${group.numBL}` : 'Sous-total autres lignes';
        doc.text(subtotalText, margin + 5, yPos + 5.5);
        doc.text(formatPrice(group.totalHT), pageWidth - margin - 5, yPos + 5.5, { align: 'right' });

        yPos += rowHeight + 5;
    };

    // === RENDER CONTENT ===
    if (hasBLGrouping && summaryOnly) {
        // Summary mode: only BL headers with totals
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 51, 102);
        doc.text('Récapitulatif par Bon de Livraison', margin, yPos);
        yPos += 8;

        // Summary table header
        doc.setFillColor(0, 51, 102);
        doc.rect(margin, yPos, contentWidth, rowHeight, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);

        doc.text('N° BL', margin + 5, yPos + 5.5);
        doc.text('Date BL', margin + 50, yPos + 5.5);
        doc.text('Nb Articles', margin + 95, yPos + 5.5);
        doc.text('Total HT', pageWidth - margin - 5, yPos + 5.5, { align: 'right' });

        yPos += rowHeight;

        // Summary rows
        blGroups.forEach((group, index) => {
            checkPageBreak();

            if (index % 2 === 0) {
                doc.setFillColor(245, 247, 250);
                doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
            }

            doc.setDrawColor(220, 220, 220);
            doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(40, 40, 40);

            doc.text(group.numBL || 'Sans BL', margin + 5, yPos + 5.5);
            doc.text(group.dateBL || '-', margin + 50, yPos + 5.5);
            doc.text(String(group.lines.length), margin + 95, yPos + 5.5);

            doc.setFont('helvetica', 'bold');
            doc.text(formatPrice(group.totalHT), pageWidth - margin - 5, yPos + 5.5, { align: 'right' });

            // Accumulate TVA from group lines
            group.lines.forEach(line => {
                const tauxTVA = line.tauxTVA ?? 0;
                if (tauxTVA > 0) {
                    if (!tvaGroups[tauxTVA]) {
                        tvaGroups[tauxTVA] = { baseHT: 0, montantTVA: 0 };
                    }
                    tvaGroups[tauxTVA].baseHT += line.montantHT;
                    tvaGroups[tauxTVA].montantTVA += line.montantHT * (tauxTVA / 100);
                }
            });

            yPos += rowHeight;
        });
    } else if (hasBLGrouping) {
        // Full content with BL grouping
        blGroups.forEach(group => {
            drawBLGroupHeader(group);
            drawTableHeader();

            group.lines.forEach((line, index) => {
                drawLineRow(line, index);
            });

            drawBLSubtotal(group);
        });
    } else {
        // Standard mode without BL grouping (for BL documents or invoices without BL info)
        drawTableHeader();

        data.lines.forEach((line, index) => {
            drawLineRow(line, index);
        });
    }

    // === TOTALS ===
    yPos += 10;
    checkPageBreak();

    const calculatedTotalTVA = Object.values(tvaGroups).reduce((sum, g) => sum + g.montantTVA, 0);
    const totalTVA = data.totalTVA ?? calculatedTotalTVA;
    const totalTTC = data.totalTTC ?? (data.totalHT + totalTVA);

    const tvaGroupsArray = Object.entries(tvaGroups).sort(([a], [b]) => Number(a) - Number(b));
    const totalBoxHeight = 28 + (tvaGroupsArray.length * 6);
    const totalBoxWidth = 90;
    const totalBoxX = pageWidth - margin - totalBoxWidth;

    doc.setFillColor(240, 242, 245);
    doc.rect(totalBoxX, yPos, totalBoxWidth, totalBoxHeight, 'F');
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.3);
    doc.rect(totalBoxX, yPos, totalBoxWidth, totalBoxHeight, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 51, 102);

    let totalYPos = yPos + 6;

    doc.text('Total HT:', totalBoxX + 5, totalYPos);
    doc.text(formatPrice(data.totalHT), totalBoxX + totalBoxWidth - 5, totalYPos, { align: 'right' });
    totalYPos += 6;

    if (tvaGroupsArray.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);

        tvaGroupsArray.forEach(([rate, group]) => {
            doc.text(`TVA ${rate}%:`, totalBoxX + 5, totalYPos);
            doc.text(formatPrice(group.montantTVA), totalBoxX + totalBoxWidth - 5, totalYPos, { align: 'right' });
            totalYPos += 6;
        });
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 51, 102);
    doc.text('Total TVA:', totalBoxX + 5, totalYPos);
    doc.text(formatPrice(totalTVA), totalBoxX + totalBoxWidth - 5, totalYPos, { align: 'right' });
    totalYPos += 8;

    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.2);
    doc.line(totalBoxX + 5, totalYPos - 3, totalBoxX + totalBoxWidth - 5, totalYPos - 3);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Total TTC:', totalBoxX + 5, totalYPos);
    doc.text(formatPrice(totalTTC), totalBoxX + totalBoxWidth - 5, totalYPos, { align: 'right' });

    yPos += totalBoxHeight + 10;

    // === FOOTER ===
    let footerY = pageHeight - 25;
    if (companyInfo?.documentFooterText) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const footerLines = doc.splitTextToSize(companyInfo.documentFooterText, contentWidth);
        doc.text(footerLines, pageWidth / 2, footerY, { align: 'center' });
        footerY += (footerLines.length * 4) + 2;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(128, 128, 128);
    doc.text('Ce document est un DUPLICATA', pageWidth / 2, pageHeight - 15, { align: 'center' });

    doc.setFontSize(8);
    const now = new Date();
    const genDate = `Document généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`;
    doc.text(genDate, pageWidth / 2, pageHeight - 10, { align: 'center' });

    addPageNumber(currentPage, totalPages);

    // Save the PDF
    let fileName = `${data.type === 'INVOICE' ? 'Facture' : 'BL'}_${data.dmsRef}`;
    if (summaryOnly) {
        fileName += '_Recap';
    }
    fileName += '_DUPLICATA.pdf';
    doc.save(fileName);
};
