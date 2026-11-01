// "Sorularım": questions the visitor chose to follow when Esere Sor found nothing in the sources. They belong to the account
// and are never kept on the device, so another account on this phone cannot see them.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAccount } from './account';
import { request } from './api';
import { currentLang } from './i18n';
import { unreadCount, type Ticket } from './questionRules';

export const questionsApi = {
  follow: (slug: string, question: string) => request<Ticket>(`/api/monuments/${encodeURIComponent(slug)}/questions?lang=${currentLang()}`, { method: 'POST', body: JSON.stringify({ question: question.trim(), lang: currentLang() }) }),
  mine: () => request<Ticket[]>(`/api/me/questions?lang=${currentLang()}`),
  seen: (id: number) => request<{ first: boolean; hours: number | null }>(`/api/me/questions/${id}/seen`, { method: 'POST' }),
  remove: (id: number) => request<void>(`/api/me/questions/${id}`, { method: 'DELETE' }),
};

/** For the way into Sorularım: quietly nothing without an account or a connection. */
export function useQuestionCounts() {
  const account = useAccount();
  const signedIn = Boolean(account.user);
  const [counts, setCounts] = useState({ total: 0, unread: 0 });
  useFocusEffect(useCallback(() => {
    if (!signedIn) return;
    let live = true;
    questionsApi.mine().then(list => { if (live) setCounts({ total: list.length, unread: unreadCount(list) }); }, () => {});
    return () => { live = false; };
  }, [signedIn]));
  return signedIn ? counts : { total: 0, unread: 0 };
}
