/**
 * Google Calendar Deep Link Generator
 * Cria links para abrir eventos pré-preenchidos no Google Calendar
 * Não requer OAuth — abre diretamente no browser do usuário
 */

/**
 * Formata uma data para o padrão YYYYMMDD do Google Calendar
 */
function toGCal(dateStr) {
  return dateStr.replace(/-/g, '');
}

/**
 * Gera um link para criar evento no Google Calendar
 */
export function generateCalendarLink({ title, date, details = '', location = 'UNA AURA' }) {
  const dateFormatted = toGCal(date);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${dateFormatted}/${dateFormatted}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Gera um arquivo .ics para importar no Google Calendar ou agenda nativa
 */
export function generateICSFile(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UNA AURA//Cobrancas//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach(ev => {
    const dateFormatted = toGCal(ev.date);
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dateFormatted}`,
      `DTEND;VALUE=DATE:${dateFormatted}`,
      `SUMMARY:${ev.title}`,
      `DESCRIPTION:${(ev.details || '').replace(/\n/g, '\\n')}`,
      `LOCATION:UNA AURA`,
      `UID:una-aura-${ev.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}@unaaura.com`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Lembrete: ${ev.title}`,
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Faz o download do arquivo .ics
 */
export function downloadICS(events, filename = 'cobrancas-una-aura.ics') {
  const content = generateICSFile(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Formata mensagem de WhatsApp para cobrança
 */
export function generateWhatsAppMessage({ clienteName, valor, dataVencimento, parcela, totalParcelas, pedido }) {
  const fmtValor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  const fmtData = new Date(dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR');
  const parcelaInfo = totalParcelas > 1 ? ` (parcela ${parcela}/${totalParcelas})` : '';

  return encodeURIComponent(
    `Olá ${clienteName}! 👋\n\n` +
    `Passando para lembrar sobre sua conta na *UNA AURA* ✨\n\n` +
    `📋 *Pedido:* ${pedido || 'S/N'}\n` +
    `💎 *Valor:* ${fmtValor}${parcelaInfo}\n` +
    `📅 *Vencimento:* ${fmtData}\n\n` +
    `Ficamos à disposição para qualquer dúvida ou para negociarmos a melhor forma de pagamento para você. 🌸\n\n` +
    `_UNA AURA — O brilho que já existe em você_`
  );
}
