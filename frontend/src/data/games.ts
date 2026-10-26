export type MiniGameId = 'puzzle' | 'detective';
export type MiniGame = {
  id: MiniGameId;
  number: string;
  kind: string;
  title: string;
  tags: string[];
  description: string;
  cta: string;
  meta: string;
  coverLabel: string;
  coverNote: string;
};

export const miniGames: MiniGame[] = [
  {
    id: 'puzzle', number: '01', kind: 'GÖRSEL YAPBOZ', title: 'Kayıp Parçalar', tags: ['PARÇALA', 'BİRLEŞTİR', 'KEŞFET'],
    description: 'Tarihin birbirinden ayrılan parçalarını buluştur. Motifi tamamla, ardındaki kültürel miras hikâyesini keşfet.',
    cta: 'Oyunu dene', meta: '3 seviye · 3×3’ten 5×5’e', coverNote: 'PARÇALARI BİRLEŞTİR',
    coverLabel: 'Koyu yeşil zemin üzerinde altın çerçeveli dokuz yapboz parçası; ortadaki parçada altın bir yıldız.',
  },
  {
    id: 'detective', number: '02', kind: 'İPUCU DEDEKTİFLİĞİ', title: 'Miras Dedektifi', tags: ['İPUCUNU BUL', 'TAHMİN ET', 'ÖĞREN'],
    description: 'Gizemli bir eserin kimliğini ortaya çıkar. Her yeni ipucunu incele, tahminini yap ve hikâyesini açığa çıkar.',
    cta: 'Dosyayı aç', meta: '3 seviye · 3–5 ipucu', coverNote: 'DOSYAYI ARAŞTIR',
    coverLabel: 'Üst üste duran parşömen dosyalar, altın çerçeveli bir büyüteç ve kırmızı bir balmumu mühür.',
  },
];
