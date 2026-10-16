export interface CalendarEventParams {
  title: string;
  details: string;
  dateStr: string; // YYYY-MM-DD
  startHour?: number;
  endHour?: number;
  location?: string;
}

function formatCalendarDate(dateStr: string, hour = 10, minute = 0): string {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] || new Date().getFullYear();
  const m = String(parts[1] || 1).padStart(2, '0');
  const d = String(parts[2] || 1).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}00`;
}

/**
 * Generates direct Google Calendar web event URL
 */
export function getGoogleCalendarUrl(params: CalendarEventParams): string {
  const startH = params.startHour ?? 10;
  const endH = params.endHour ?? 11;

  const startUtc = formatCalendarDate(params.dateStr, startH, 0);
  const endUtc = formatCalendarDate(params.dateStr, endH, 0);

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', params.title);
  url.searchParams.set('dates', `${startUtc}/${endUtc}`);
  url.searchParams.set('details', params.details);
  if (params.location) {
    url.searchParams.set('location', params.location);
  }

  return url.toString();
}

/**
 * Generates and triggers download of an .ics calendar file
 */
export function generateIcsFile(params: CalendarEventParams): void {
  if (typeof window === 'undefined') return;

  const startH = params.startHour ?? 10;
  const endH = params.endHour ?? 11;

  const dtStart = formatCalendarDate(params.dateStr, startH, 0);
  const dtEnd = formatCalendarDate(params.dateStr, endH, 0);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `iptv-event-${Date.now()}@iptv-billing`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IPTV Billing Manager//UA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${params.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${params.details.replace(/\n/g, '\\n')}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Нагадування за 7 днів: ${params.title.replace(/\n/g, ' ')}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Термін списання: ${params.title.replace(/\n/g, ' ')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${params.title.replace(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄ_]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
