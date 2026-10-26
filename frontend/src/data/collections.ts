// Thematic groupings over the artifact collection. Artifacts join an era through `artifact.period`.

export type Era = {
  id: string;
  period: string;
  century: string;
  span: string;
  title: string;
  text: string;
  tone: string;
  accent: string;
};

// Era notes stay general on purpose; each artifact page carries its own sources.
export const eras: Era[] = [
  {
    id: "mengucekli",
    period: "Mengücekli",
    century: "XIII",
    span: "13. yüzyıl",
    title: "Taşın bahçeye dönüştüğü çağ",
    text: "Erzincan, Kemah ve Divriği çevresinde hüküm süren Mengücekliler döneminden kalan Divriği'de cami ile darüşşifa aynı yapı kütlesinde buluşur. UNESCO, taç kapılardaki zengin taş oymacılığını eserin öne çıkan özelliği olarak anar.",
    tone: "#f6efe0",
    accent: "#7a5a24",
  },
  {
    id: "erken-osmanli",
    period: "Erken Osmanlı",
    century: "XV",
    span: "15. yüzyıl",
    title: "Çininin rengiyle açılan kapılar",
    text: "Osmanlı'nın ilk merkezlerinden Bursa'da Yeşil Külliye, renkli çini yüzeylerin ve işlemeli ayrıntıların mimariyle buluştuğu erken dönemin izlerini taşır.",
    tone: "#efe6d1",
    accent: "#1f5847",
  },
  {
    id: "klasik-osmanli",
    period: "Klasik Osmanlı",
    century: "XVI",
    span: "16. yüzyıl",
    title: "Kubbenin, avlunun ve külliyenin ustalığı",
    text: "Mimar Sinan'ın İstanbul ve Edirne'deki yapılarında kubbe, avlu ve külliye düzeni; ibadeti, eğitimi, sağlığı ve yardımlaşmayı aynı kent dokusunda bir araya getirir.",
    tone: "#f3e9d6",
    accent: "#6e4f1f",
  },
];

export type Season = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  artifactIds: string[];
};

// Discovery seasons are ordered routes; the admin panel can edit them locally.
export const seasons: Season[] = [
  {
    id: "sinanin-izleri",
    kicker: "TEMATİK ROTA",
    title: "Mimar Sinan'ın İzleri",
    description: "Bir ustanın hayalinden, şehirlerin hafızasına: dört Sinan eseri, yapım tarihlerine göre sıralı.",
    artifactIds: ["haseki", "suleymaniye", "rustem-pasa", "selimiye"],
  },
  {
    id: "istanbulun-sakli-mirasi",
    kicker: "ŞEHİR KOLEKSİYONU",
    title: "İstanbul'un Saklı Mirası",
    description: "Her gün önünden geçtiğin, henüz tanımadığın üç vakıf eseri.",
    artifactIds: ["suleymaniye", "rustem-pasa", "haseki"],
  },
  {
    id: "anadolunun-tas-isciligi",
    kicker: "ZAMANIN İZİNDE",
    title: "Anadolu'nun Taş ve Çini İşçiliği",
    description: "Taşa sabırla işlenen kapılardan çininin rengine uzanan bir yolculuk.",
    artifactIds: ["divrigi", "yesil-kulliye"],
  },
];
