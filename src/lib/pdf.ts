// PDF Export utility
export async function exportElementToPDF(elementId: string, filename: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  const element = document.getElementById(elementId);
  if (!element) throw new Error('Element not found');

  const canvas = await html2canvas(element, {
    scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
  const imgX = (pdfWidth - canvas.width * ratio) / 2;

  pdf.addImage(imgData, 'PNG', imgX, 10, canvas.width * ratio, canvas.height * ratio);
  pdf.save(`${filename}.pdf`);
}
