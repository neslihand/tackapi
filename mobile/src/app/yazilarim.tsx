// Yazılarım ve önerilerim: the visitor's articles and term suggestions with their status and the editor's note.
// An unpublished article is corrected and sent again; anything can be withdrawn (a second tap confirms).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Eyebrow, Loading, Notice } from '@/components/UI';
import { useAccount } from '@/lib/account';
import { t } from '@/lib/i18n';
import { colors, serif, space } from '@/lib/theme';
import { kindName, statusName, writingApi, type MyArticle, type MyTerm, type Status } from '@/lib/writing';

const TONE: Record<Status, string> = { draft: colors.soft, pending: colors.goldText, published: colors.emeraldLight, rejected: colors.danger };

export default function MyWriting() {
  const account = useAccount();
  const [articles, setArticles] = useState<MyArticle[] | null>(null);
  const [terms, setTerms] = useState<MyTerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    if (!account.user) return;
    setLoading(true); setError(null);
    Promise.all([writingApi.mine(), writingApi.myTerms()]).then(([a, tm]) => { setArticles(a); setTerms(tm); }, e => { setArticles(a => a ?? []); setError(String(e?.message ?? e)); })
      .finally(() => setLoading(false));
  }, [account.user]);
  useFocusEffect(load);   // back from the editor: the list shows the new status

  async function withdraw(key: string, run: () => Promise<void>) {
    if (confirm !== key) { setConfirm(key); return; }
    setConfirm(null);
    try { await run(); load(); } catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  if (!account.ready) return <Loading />;
  if (!account.user) return <Empty title={t('Önce giriş yap.', 'Sign in first.')} action={<Button icon="person-circle-outline" label={t('Giriş yap', 'Sign in')} onPress={() => router.push('/giris?sonra=/yazilarim')} />} />;
  if (!articles) return <Loading />;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.goldText} />}>
    <Eyebrow>✦ {t('YAZILARIM VE ÖNERİLERİM', 'MY WRITING AND SUGGESTIONS')}</Eyebrow>
    <View style={{ flexDirection: 'row', gap: space.s }}>
      <Button style={{ flex: 1 }} icon="create-outline" label={t('Yazı gönder', 'Send an article')} onPress={() => router.push('/yazi')} />
      <Button style={{ flex: 1 }} kind="plain" icon="book-outline" label={t('Terim öner', 'Suggest a term')} onPress={() => router.push('/terim-oner')} />
    </View>
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    {!articles.length && !terms.length && <Text style={s.small}>{t('Henüz yazı ya da terim önerin yok.', 'You have no articles or term suggestions yet.')}</Text>}

    {!!articles.length && <Text style={s.head}>{t('Yazıların', 'Your articles')}</Text>}
    {articles.map(a => {
      const key = `a${a.id}`;
      return <View key={a.id} style={s.row}>
        <View style={s.rowTop}><Text style={s.title}>{a.title}</Text><Text style={[s.status, { color: TONE[a.status], borderColor: TONE[a.status] }]}>{statusName(a.status)}</Text></View>
        <Text style={s.small}>{kindName(a.kind)} · {new Date(a.updated_at).toLocaleDateString()}</Text>
        {a.status === 'rejected' && a.reject_reason && <Notice tone="warn" icon="create-outline">{t('Editör notu', 'Editor’s note')}: {a.reject_reason}</Notice>}
        <View style={s.actions}>
          {a.status === 'published' ? <Action label={t('Oku', 'Read')} onPress={() => router.push(`/makale/${a.slug}`)} />
            : <Action label={a.status === 'rejected' ? t('Düzelt ve yeniden gönder', 'Correct and send again') : t('Düzenle', 'Edit')} onPress={() => router.push(`/yazi?duzenle=${a.id}`)} />}
          <Action danger label={confirm === key ? (a.status === 'published' ? t('Yayından kalkıp silinecek, emin misin?', 'It will be taken down and deleted; sure?') : t('Geri çekmek için yeniden dokun', 'Tap again to withdraw')) : t('Geri çek', 'Withdraw')}
            onPress={() => withdraw(key, () => writingApi.withdraw(a.id))} />
        </View>
      </View>;
    })}

    {!!terms.length && <Text style={s.head}>{t('Terim önerilerin', 'Your term suggestions')}</Text>}
    {terms.map(x => {
      const key = `t${x.id}`;
      return <View key={x.id} style={s.row}>
        <View style={s.rowTop}><Text style={s.title}>{x.term}</Text><Text style={[s.status, { color: TONE[x.status], borderColor: TONE[x.status] }]}>{statusName(x.status)}</Text></View>
        <Text style={s.small} numberOfLines={3}>{x.definition}</Text>
        {x.status === 'rejected' && x.reject_reason && <Notice tone="warn" icon="create-outline">{t('Editör notu', 'Editor’s note')}: {x.reject_reason}</Notice>}
        <View style={s.actions}>
          {x.status === 'published' ? <Action label={t('Sözlükte aç', 'Open in glossary')} onPress={() => router.push(`/terim/${x.slug}`)} />
            : <Action danger label={confirm === key ? t('Geri çekmek için yeniden dokun', 'Tap again to withdraw') : t('Geri çek', 'Withdraw')} onPress={() => withdraw(key, () => writingApi.withdrawTerm(x.id))} />}
        </View>
      </View>;
    })}
  </ScrollView>;
}

function Action({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={[s.action, danger && { color: colors.danger }]}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  small: { color: colors.soft, fontSize: 12, lineHeight: 17 },
  head: { fontFamily: serif, fontSize: 20, color: colors.ink, marginTop: space.s },
  row: { padding: 12, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontFamily: serif, fontSize: 17, color: colors.ink },
  status: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: space.m, flexWrap: 'wrap', marginTop: 2 },
  action: { color: colors.emeraldLight, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
