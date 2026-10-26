"""RAG değerlendirmesi: data/eval_questions.json içindeki sorularla arama ve cevap kalitesini ölçer.

Ölçütler
  route_ok     : beklenen rotalardan (eser / sehir_donem / sehir_diger) en az bir parça geldi mi
  page_ok      : beklenen sayfa kaynaklar arasında mı
  mention_ok   : cevapta beklenen ifadeler geçiyor mu (gerçek modelle anlamlı)
  refuse_ok    : kaynakta olmayan bir şey sorulduğunda 'bilgi yok' dendi mi
  grounded     : doğrulama adımında desteksiz yıl/ad bulunmadı mı
Kullanım: python eval_rag.py --dsn ...   (sahte mod: VAKIF_FAKE_LLM=1)
"""
import json, os, sys, argparse
sys.path.insert(0, os.path.dirname(__file__))
import rag
from db import DB
import gemini_client as G

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--out', default=os.path.join(DATA, 'eval_results.json'))
    a = ap.parse_args()
    db = DB(a.dsn)
    Q = json.load(open(os.path.join(DATA, 'eval_questions.json'), encoding='utf-8'))
    res, agg = [], {}
    for q in Q:
        r = rag.answer(db, q['q'], q['slug'], q.get('mode', 'standard'), q.get('lang', 'tr'))
        e = q['expect']
        row = dict(id=q['id'], q=q['q'], routes=r['routes'], verification=r['verification'])
        if 'routes' in e:
            row['route_ok'] = all(r['routes'].get(x, 0) > 0 for x in e['routes'])
        if 'pages' in e:
            pages = ' '.join(s['pages'] for s in r['sources'])
            row['page_ok'] = all(str(p) in pages for p in e['pages'])
        if not G.FAKE:
            if 'must_mention' in e:
                row['mention_ok'] = all(x.lower() in r['answer'].lower() for x in e['must_mention'])
            if e.get('must_refuse'):
                row['refuse_ok'] = any(k in r['answer'].lower() for k in ('bilgi yok', 'kaynaklarımızda', 'yer almıyor', 'bulunmuyor'))
            row['grounded'] = not r['verification']['unsupported_years'] and len(r['verification']['unsupported_names']) <= 1
        row['answer'] = r['answer']
        row['usage'] = r.get('usage')
        row['cached'] = r.get('cached')
        u = r.get('usage') or {}
        agg.setdefault('_tokens', []).append(u.get('approx_prompt_tokens', 0))
        agg.setdefault('_calls', []).append(u.get('llm_calls', 0))
        res.append(row)
        for k in ('route_ok', 'page_ok', 'mention_ok', 'refuse_ok', 'grounded'):
            if k in row:
                agg.setdefault(k, []).append(row[k])
        print(q['id'], {k: row[k] for k in row if k.endswith('_ok') or k == 'grounded'}, r['routes'])
    toks, calls = agg.pop('_tokens', []), agg.pop('_calls', [])
    summary = {k: f'{sum(v)}/{len(v)}' for k, v in agg.items()}
    if toks:
        summary['ort_prompt_token'] = round(sum(toks) / len(toks))
        summary['ort_llm_cagri'] = round(sum(calls) / len(calls), 2)
        summary['eco'] = rag.ECO
    print('ÖZET', summary)
    json.dump(dict(summary=summary, results=res), open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()