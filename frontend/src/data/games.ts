import { t } from '../lib/i18n.ts';
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

export const miniGames = (): MiniGame[] => [
  {
    id: 'puzzle', number: '01', kind: t('GÖRSEL YAPBOZ', 'PICTURE PUZZLE'), title: t('Kayıp Parçalar', 'The Lost Pieces'), tags: [t('PARÇALA', 'TAKE APART'), t('BİRLEŞTİR', 'PUT TOGETHER'), t('KEŞFET', 'DISCOVER')],
    description: t('Tarihin birbirinden ayrılan parçalarını buluştur. Motifi tamamla, ardındaki kültürel miras hikâyesini keşfet.', 'Bring history’s scattered pieces back together. Complete the motif and discover the heritage story behind it.'),
    cta: t('Oyunu dene', 'Try the game'), meta: t('3 seviye · 3×3’ten 5×5’e', '3 levels · from 3×3 to 5×5'), coverNote: t('PARÇALARI BİRLEŞTİR', 'PUT THE PIECES TOGETHER'),
    coverLabel: t('Koyu yeşil zemin üzerinde altın çerçeveli dokuz yapboz parçası; ortadaki parçada altın bir yıldız.', 'Nine gold-framed puzzle pieces on dark green; a gold star on the middle piece.'),
  },
  {
    id: 'detective', number: '02', kind: t('İPUCU DEDEKTİFLİĞİ', 'CLUE DETECTIVE'), title: t('Miras Dedektifi', 'Heritage Detective'), tags: [t('İPUCUNU BUL', 'FIND THE CLUE'), t('TAHMİN ET', 'GUESS'), t('ÖĞREN', 'LEARN')],
    description: t('Gizemli bir eserin kimliğini ortaya çıkar. Her yeni ipucunu incele, tahminini yap ve hikâyesini açığa çıkar.', 'Uncover the identity of a mysterious work. Study each new clue, make your guess and reveal its story.'),
    cta: t('Dosyayı aç', 'Open the file'), meta: t('3 seviye · 3–5 ipucu', '3 levels · 3–5 clues'), coverNote: t('DOSYAYI ARAŞTIR', 'INVESTIGATE THE FILE'),
    coverLabel: t('Üst üste duran parşömen dosyalar, altın çerçeveli bir büyüteç ve kırmızı bir balmumu mühür.', 'Stacked parchment files, a gold-framed magnifier and a red wax seal.'),
  },
];
