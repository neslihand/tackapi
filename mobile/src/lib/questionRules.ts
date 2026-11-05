// Cevabı Bekleyen Sorular: what the phone decides itself. The queue and the answers are on the server (questions.py).
import { t } from './i18n';

export type TicketStatus = 'submitted' | 'researching' | 'answered' | 'unresolved' | 'rejected';
export type Ticket = { id: number; monument: string; monument_name: string; question: string; status: TicketStatus; answer: string | null; answer_source: string | null;
  note: string | null; created_at: string; answered_at: string | null; unread: boolean };

/** The server takes questions of 5 to 500 characters; a shorter one is not offered for following. */
export const canFollow = (question: string) => { const n = question.trim().length; return n >= 5 && n <= 500; };
export const unreadCount = (list: readonly Pick<Ticket, 'unread'>[]) => list.filter(q => q.unread).length;

export function statusLabel(status: TicketStatus) {
  return {
    submitted: t('Editöre iletildi', 'Sent to the editors'),
    researching: t('Araştırılıyor', 'Being researched'),
    answered: t('Cevaplandı', 'Answered'),
    unresolved: t('Kaynaklarda bulunamadı', 'Not found in the sources'),
    rejected: t('Cevaplanamadı', 'Not answered'),
  }[status];
}
