export type Artifact = {
  id: string;
  slug: string;
  name: string;
  city: string;
  period: string;
  category: string;
  year: string;
  architect: string;
  description: string;
  coordinates: [number, number];
  image: string;
  // Text equivalent of what the illustration shows; used as alt text and as a visible image description.
  imageAlt?: string;
  sourceReferences: { title: string; url: string }[];
  chapters: { title: string; short: string; story: string; child: string }[];
  // focus: the detail's position on the illustration, in percent [x, y]; the story stage zooms there.
  detail: { title: string; text: string; focus?: [number, number] };
};

// Coordinates are approximate discovery markers, not entrances or navigation data.
// `story` passages contain original imagined atmosphere; the UI labels this mode.
// Images are original, representative illustrations, not documentary photographs.
export const artifacts: Artifact[] = [
  {
    id: "suleymaniye",
    slug: "suleymaniye",
    name: "Süleymaniye Külliyesi",
    city: "İstanbul",
    period: "Klasik Osmanlı",
    category: "Külliye",
    year: "1550–1557",
    architect: "Mimar Sinan",
    description: "Bir tepenin üzerinde, ibadeti, öğrenmeyi ve dayanışmayı aynı şehir hikâyesinde buluşturan Sinan eseri.",
    coordinates: [41.0162, 28.9642],
    image: "/images/suleymaniye.svg",
    imageAlt: "Ay ışığında bir cami silueti: ortada yüksek bir ana kubbe ve onu kademeli olarak saran yarım kubbeler, köşelerde şerefeli dört ince minare. Önde küçük kubbelerle örtülü, sivri kemerli bir revak ve geniş basamaklar; iki yanda servi ağaçları.",
    sourceReferences: [
      { title: "TDV İslâm Ansiklopedisi — Süleymaniye Camii ve Külliyesi", url: "https://islamansiklopedisi.org.tr/suleymaniye-camii-ve-kulliyesi" },
      { title: "Kültür Portalı — İstanbul'un Tarihi Alanları", url: "https://kulturportali.gov.tr/portal/istanbuluntarihialanlari-1" },
    ],
    chapters: [
      {
        title: "Bir tepenin hayali",
        short: "Kanuni Sultan Süleyman'ın yaptırdığı külliyeyi Mimar Sinan tasarladı. Cami, 1550–1557 yılları arasında inşa edildi.",
        story: "Bir an dur; şehrin çizgilerini zihninde sil. Tepede henüz bir kubbe yok. Sinan'ın tasarımıyla burada şekillenecek yapıyı hayal et: önce bir çizgi, sonra gökyüzüne uzanan taşlar.",
        child: "Bu büyük yapıyı Mimar Sinan tasarladı. Sence kocaman bir kubbe yapmak için önce ne çizmek gerekir?",
      },
      {
        title: "Birlikte yaşamanın mimarisi",
        short: "Külliye, caminin çevresindeki medreseler, darüşşifa ve imaret gibi yapılarla eğitim, sağlık ve yardımlaşmayı bir araya getiriyordu.",
        story: "Hayalindeki avludan üç ayrı yol açılsın: biri bir dersliğe, biri şifa arayışına, diğeri paylaşılan bir sofraya. Külliyenin farklı yapıları bu ortak yaşamı düşünmeye davet eder.",
        child: "Külliye bir bina ailesi gibidir. Burada öğrenmek, iyileşmek ve yemek paylaşmak için farklı yapılar vardı.",
      },
      {
        title: "Göğe çizilen denge",
        short: "Ana kubbe, yarım kubbelerle desteklenen bir düzenin merkezindedir. Dört minare, avlunun köşelerinde yükselir.",
        story: "Bakışın kemerlerden kubbeye doğru yükselsin. Taşın ağır olduğunu biliyorsun; yine de çizgilerin arasında hafiflik arıyorsun. Hayalindeki bu sessiz yükselişi bir eskize dönüştür.",
        child: "Büyük kubbeyi bul, sonra yanındaki yarım kubbelere bak. Bu şekilleri kâğıda çizerek küçük bir mimarlık oyunu oynayabilirsin.",
      },
      {
        title: "Bir şehrin hafızası",
        short: "Süleymaniye Koruma Alanı, UNESCO Dünya Mirası listesindeki İstanbul'un Tarihi Alanları'nın dört bileşeninden biridir.",
        story: "Avludan ayrılırken geriye dön. Bu hayalî yürüyüşten yanında götürdüğün şey bir taş değil, bir soru olsun: Bir şehrin hafızasını yarına nasıl taşıyabiliriz?",
        child: "Bu çevre dünya mirasının bir parçası. Eski yapılara dikkatle bakmak ve onları korumak hepimizin keşfine değer katar.",
      },
    ],
    detail: { title: "Kubbenin yanındaki yarım kubbeler", text: "Ana kubbe ile iki yarım kubbenin ilişkisi, iç mekânın düzenini anlamak için iyi bir başlangıçtır. İllüstrasyonda büyük ve küçük örtüleri ayırt etmeyi dene.", focus: [50, 42] },
  },
  {
    id: "selimiye",
    slug: "selimiye",
    name: "Selimiye Camii",
    city: "Edirne",
    period: "Klasik Osmanlı",
    category: "Cami",
    year: "1568–1575",
    architect: "Mimar Sinan",
    description: "Edirne'nin ufkunu biçimlendiren dört minare ve tek büyük kubbe: Sinan'ın mekân arayışında bir doruk.",
    coordinates: [41.678, 26.5593],
    image: "/images/selimiye.svg",
    imageAlt: "Gece gökyüzü önünde tek ve geniş bir ana kubbe; yapının dört köşesinde birden fazla şerefeli, çok yüksek ve ince dört minare. Ön cephede yan kubbeler, küçük kubbeli sivri kemerli bir revak ve basamaklar; iki yanda serviler.",
    sourceReferences: [
      { title: "UNESCO — Selimiye Mosque and its Social Complex", url: "https://whc.unesco.org/en/list/1366/" },
      { title: "Kültür Portalı — Selimiye Camii", url: "https://kulturportali.gov.tr/turkiye/edirne/gezilecekyer/selimiye-camii" },
    ],
    chapters: [
      {
        title: "Edirne'ye bir armağan",
        short: "II. Selim'in yaptırdığı Selimiye'yi Mimar Sinan tasarladı. Kültür Portalı, inşa dönemini 1568–1575 olarak verir.",
        story: "Edirne'ye yaklaşan hayalî bir yolcu ol. Uzakta beliren çizgileri yavaşça seç: dört minare ve aralarında bir kubbe. Yolculuğunun pusulası artık gökyüzündeki bu biçim olsun.",
        child: "Selimiye Edirne'dedir. Mimarı Sinan, bu yapı için büyük bir kubbe ve dört ince minare tasarladı.",
      },
      {
        title: "Kubbenin altında buluşmak",
        short: "Büyük merkezî kubbe sekiz taşıyıcıya oturur. Pencereler, iç mekânın aydınlık karakterine katkıda bulunur.",
        story: "Hayalindeki kapıdan gir ve başını kaldır. Işığın taş üzerindeki yolunu izle. Gözün bir noktada durmak yerine kubbenin altında genişleyen mekânı dolaşsın.",
        child: "Bir kubbeyi taşıyan sekiz güçlü destek düşün. Bir masanın ayakları gibi, onlar da üstlerindeki ağırlığı taşımaya yardım eder.",
      },
      {
        title: "Küçük bir parçadaki dünya",
        short: "İç mekânın İznik çinileri, yapının mimarisiyle birlikte öne çıkan sanat özelliklerindendir.",
        story: "Şimdi büyük kubbeyi bir an unut. Hayalinde küçücük bir renk parçasına yaklaş. Uzakta tek bir yüzey gibi görünen şey, yakından bakınca kendi ritmini fısıldayan desenlere dönüşsün.",
        child: "Çiniler renkli seramik levhalardır. Bir deseni seç; içinde tekrar eden yaprak ya da çiçek şekillerini aramayı dene.",
      },
      {
        title: "Ortak bir miras",
        short: "Selimiye Camii ve Külliyesi 2011'de UNESCO Dünya Mirası Listesi'ne alındı.",
        story: "Hayalî yolcunun defteri kapanırken son sayfaya bir kubbe çiz. Yanına tarih yerine bir düşünce yaz: Güzelliği fark etmek, onu korumayı öğrenmenin ilk adımı olabilir.",
        child: "Selimiye dünya mirası olarak korunuyor. Sen de keşfettiğin bir ayrıntıyı çizip bu yapı hakkındaki merakını paylaşabilirsin.",
      },
    ],
    detail: { title: "Sekiz taşıyıcı, tek kubbe", text: "Merkezî kubbenin sekiz taşıyıcıya dayanan düzeni, Selimiye'nin mimari özelliğidir. Görsel bir yorum olan çizim, ölçülü yapı planı yerine geçmez.", focus: [50, 38] },
  },
  {
    id: "divrigi",
    slug: "divrigi",
    name: "Divriği Ulu Camii ve Darüşşifası",
    city: "Sivas",
    period: "Mengücekli",
    category: "Cami ve Darüşşifa",
    year: "1228–1229",
    architect: "Ahlatlı Hürrem Şah",
    description: "Taşın bir bahçeye dönüştüğü kapılar; ibadet ve şifayı yan yana getiren bir Anadolu mirası.",
    coordinates: [39.3711, 38.1215],
    image: "/images/divrigi.svg",
    imageAlt: "Kesme taş bir yapının ortasında yükselen, yoğun bezemeli taç kapı: sivri kemerli girişin üzerinde sarkıt biçimli taş bezemeler, iki yanında kalp biçimli ve yıldız motifli kabartmalar. Sağda konik külahlı bir kubbe ve tek minare; arkada dağlar ve dolunay.",
    sourceReferences: [
      { title: "UNESCO — Great Mosque and Hospital of Divriği", url: "https://whc.unesco.org/en/list/358/" },
      { title: "Divriği Kaymakamlığı — Divriği Ulu Camii", url: "https://www.divrigi.gov.tr/divrigi-ulu-camii" },
    ],
    chapters: [
      {
        title: "Anadolu'da iki kapı",
        short: "Mengücekli dönemine ait topluluğun kuruluşunu UNESCO 1228–1229'a tarihler. Cami Ahmet Şah, darüşşifa Turan Melek tarafından yaptırıldı.",
        story: "Hayalinde taş bir patikadan yukarı çık. Önünde iki ayrı ihtiyaç aynı yapıda buluşsun: bir araya gelmek ve iyileşmek. Divriği'nin hikâyesine bu eşikten bak.",
        child: "Burada bir cami ile eski bir hastane yan yanadır. Darüşşifa, geçmişte hastalara bakılan yapının adıdır.",
      },
      {
        title: "Şifaya ayrılan mekân",
        short: "Darüşşifa, merkezinde havuz bulunan yüksek bir iç mekân çevresinde düzenlenmiştir. Topluluğun başmimarı Ahlatlı Hürrem Şah'tır.",
        story: "Bir su damlasını düşün. Hayalindeki sessiz mekânda düşsün, küçük halkalar oluştursun. Taş duvarların arasında durup iyileşmeye ayrılan bir yerin insana ne hissettireceğini düşün.",
        child: "Eski hastanenin ortasında bir havuz bulunur. Sence bir yapının içinde avlu ya da havuz olması nasıl bir his verir?",
      },
      {
        title: "Taşta açan bahçe",
        short: "Anıtsal kapılardaki derin taş oymalar; geometrik biçimler ve bitkisel bezemelerle farklı kompozisyonlar oluşturur.",
        story: "Hayalindeki bakış bir taş yaprağın kıvrımında yürüsün. Gölge değiştikçe başka bir çizgi belirir gibi olsun. Bu sessiz bahçede çiçekler açmaz; keşfettikçe çoğalan ayrıntılar açar.",
        child: "Kapıya uzaktan ve yakından bakmayı hayal et. Taşın içinde hangi bitki biçimlerini bulabilirsin? Ayrıntılara dokunmadan gözlem yapmak yeterli.",
      },
      {
        title: "Taşı geleceğe taşımak",
        short: "Divriği Ulu Camii ve Darüşşifası, 1985'ten beri UNESCO Dünya Mirası Listesi'ndedir.",
        story: "Keşfin sonunda hayalî defterine tek bir çizgi kopyala. Bütün kapıyı yanında götüremezsin; ama ona dikkatle bakmayı öğrenebilirsin. Bazen bir yolculuktan kalan en iyi hatıra budur.",
        child: "Bu taş yapı yüzlerce yıldır ayakta. Onu korumak, gelecekteki çocukların da aynı kapıları keşfedebilmesini sağlar.",
      },
    ],
    detail: { title: "Derin oyma, değişen gölge", text: "Kapı bezemelerinin üç boyutlu taş işçiliği UNESCO değerlendirmesinde öne çıkar. Motiflerin derinliği, ışık ve gölgeyi mimarinin parçasına dönüştürür.", focus: [48, 56] },
  },
  {
    id: "yesil-kulliye",
    slug: "yesil-kulliye",
    name: "Bursa Yeşil Külliye",
    city: "Bursa",
    period: "Erken Osmanlı",
    category: "Külliye",
    year: "1419–1424",
    architect: "Hacı İvaz Paşa",
    description: "Bursa'nın yamaçlarında, çininin rengiyle ve erken Osmanlı mimarisinin katmanlarıyla açılan bir keşif.",
    coordinates: [40.1818, 29.0753],
    image: "/images/yesil-kulliye.svg",
    imageAlt: "Solda iki kubbeli ve iki minareli bir taş cami; giriş kapısının üstünde mavi-yeşil çini bir pano. Sağda yüzeyi yeşil-turkuaz çinilerle kaplı, kubbeli, çokgen planlı bir türbe; aralarında servi ağaçları, arkada dağlar.",
    sourceReferences: [
      { title: "Kültür Portalı — Yeşil Külliyesi", url: "https://www.kulturportali.gov.tr/turkiye/bursa/gezilecekyer/yesil-kulliyesi" },
      { title: "Kültür Portalı — Yeşil Türbe", url: "https://kulturportali.gov.tr/turkiye/bursa/gezilecekyer/yesil-turbe" },
      { title: "Lale — Bursa Çelebi Mehmed (Yeşil) Camii Kalemişleri", url: "https://dergipark.org.tr/en/pub/lale/article/861102" },
      { title: "UNESCO — Bursa and Cumalıkızık", url: "https://whc.unesco.org/en/list/1452/" },
    ],
    chapters: [
      {
        title: "Bursa'da yeni bir sayfa",
        short: "Çelebi Mehmed'in külliyesi erken Osmanlı dönemindendir. Yeşil Cami'nin kitabesi 1419'u, bezemelerinin tamamlanması 1424'ü işaret eder.",
        story: "Hayalinde Bursa'nın yamaçlarına bir defter aç. İlk sayfayı taş, ikincisini renk doldursun. Bir yapının bir anda değil, farklı emeklerin zaman içinde birleşmesiyle oluştuğunu düşün.",
        child: "Bir bina yapmakla onu süslemek farklı zamanlarda bitebilir. Yeşil Cami'nin taşları ve desenleri de böyle aşamalarla oluştu.",
      },
      {
        title: "Bir yapı ailesi",
        short: "Yeşil Külliye; cami, türbe, medrese, imaret ve hamam gibi farklı işlevlerdeki yapılardan oluşur.",
        story: "Hayalindeki küçük haritaya her yapı için bir işaret koy. İşaretleri birleştirince tek bir bina değil, öğrenmenin ve gündelik yaşamın birbirine değdiği bir çevre belirsin.",
        child: "Buradaki binalar farklı görevler üstleniyordu. Medreseyi bir okul gibi düşünebilirsin; imaret ise yemek paylaşımıyla ilgiliydi.",
      },
      {
        title: "Rengin hafızası",
        short: "Hacı İvaz Paşa'nın tasarladığı Yeşil Türbe, cephelerindeki yeşil ve turkuaz çinilerle tanınır.",
        story: "Hayalindeki renk kutusundan bir turkuaz seç. Gökyüzünün mü, bir taşın mı rengi olduğuna karar verme. Bırak, bu yolculuğun hatırası kelimelerden önce bir renkle başlasın.",
        child: "Çini, renkli ve sırlı bir seramik kaplamadır. Yeşil Türbe'yi hatırlamak için defterine kendi turkuaz desenini çizebilirsin.",
      },
      {
        title: "Şehrin dokusunda bir iz",
        short: "Yeşil Külliye, 2014'te Dünya Mirası Listesi'ne alınan Bursa ve Cumalıkızık alanının bileşenlerindendir.",
        story: "Hayalî haritandaki çizgileri mahalleye doğru uzat. Bir yapının hikâyesinin duvarında bitmediğini fark et: sokak, komşu yapı ve uzaktaki yamaç da aynı sayfaya sığabilir.",
        child: "Miras bazen tek bir bina değildir. Birbirine bağlı sokaklar ve yapılar birlikte bir şehrin geçmişini anlatabilir.",
      },
    ],
    detail: { title: "Turkuaz bir yüzey", text: "Yeşil Türbe'nin dış yüzeyindeki çiniler, külliyenin ayırt edici ayrıntılarındandır. Buradaki çizim renk ve siluet üzerine özgün bir yorumdur.", focus: [71, 64] },
  },
  {
    id: "rustem-pasa",
    slug: "rustem-pasa",
    name: "Rüstem Paşa Camii",
    city: "İstanbul",
    period: "Klasik Osmanlı",
    category: "Cami",
    year: "1561 dolayları",
    architect: "Mimar Sinan",
    description: "Eminönü'nün ticaret dokusu üzerinde yükselen, çini desenleriyle yakından bakmayı ödüllendiren bir Sinan eseri.",
    coordinates: [41.0176, 28.9689],
    image: "/images/rustem-pasa.svg",
    imageAlt: "Yüksek bir taş kaide üzerinde tek kubbeli, tek minareli bir cami. Kaidenin alt katında sıra sıra sivri kemerli açıklıklar ve yana doğru yükselen bir merdiven; üst katta beş küçük kubbeli, kemerleri mavi çini desenleriyle çevrili bir revak.",
    sourceReferences: [
      { title: "İBB Kültürel Miras — Rüstem Paşa Külliyesi", url: "https://kulturelmiras.ibb.istanbul/rustem-pasa-kulliyesi/" },
    ],
    chapters: [
      {
        title: "Çarşının üstünde",
        short: "Mimar Sinan'ın eseridir. İBB kaydı yapım yılını 1561 kabul eder; tamamlanmasını Mihrimah Sultan'la ilişkilendirir.",
        story: "Hayalindeki çarşıda adımlar birbirine karışsın. Sonra bir eşik bul ve yavaşla. Bu yolculukta büyük bir manzara arama; sakince bakabileceğin bir ayrıntı sana yetsin.",
        child: "Rüstem Paşa Camii'ni de Mimar Sinan tasarladı. Aynı mimarın eserleri birbirine benzemek zorunda mı? Keşfederken karşılaştırabilirsin.",
      },
      {
        title: "Altında süren hayat",
        short: "Cami, yol seviyesindeki dükkân ve depoların oluşturduğu yüksek bir platform üzerinde yer alır.",
        story: "Bir yapıyı yalnızca karşıdan değil, kat kat düşün. Hayalindeki kesitte aşağıda gündelik hayat, yukarıda başka bir mekân açılsın. Şehrin hikâyeleri üst üste yazılmış sayfalar gibi görünsün.",
        child: "Bu caminin altında dükkânlar bulunur. Bir yapının zeminden yükselmesi, çevresindeki alanı kullanmanın farklı bir yoludur.",
      },
      {
        title: "Duvarlardaki bahçe",
        short: "Yoğun çini bezemelerinde bitkisel kompozisyonlar öne çıkar. İç mekân ve son cemaat duvarı çinilerle kaplıdır.",
        story: "Hayalinde bir deseni izlerken küçük bir bahçede yürüyormuş gibi ol. Bir yaprak başka bir çizgiye bağlansın. Acele etmediğinde bir duvarın ne kadar çok şey düşündürebildiğini keşfet.",
        child: "Çini desenlerinden birini seç. İçinde gördüğün bitki biçimini kendi hayal gücünle tamamlayıp kâğıda aktarabilirsin.",
      },
      {
        title: "Yakından bakmanın değeri",
        short: "Rüstem Paşa, klasik dönem çini sanatını ve ticaretle ilişkili cami yerleşimini birlikte inceleme imkânı verir.",
        story: "Hayalî ziyaretin sona ererken kendine küçük bir görev ver: Bir sonraki yürüyüşte göz hizanın üzerindeki ayrıntıları fark et. Bazen bir keşif, yalnızca başını kaldırmakla başlar.",
        child: "Keşfettiğin ayrıntıyı bir arkadaşına anlat. Eski yapılara dokunmadan da onları inceleyebilir, çizimler ve kelimelerle hatırlayabilirsin.",
      },
    ],
    detail: { title: "Bitkisel çini desenleri", text: "Çini yüzeylerdeki bitkisel kompozisyonlar yapının belirgin özelliğidir. Özgün illüstrasyondaki desenler, tarihî çinilerin birebir kopyası değildir.", focus: [49, 66] },
  },
  {
    id: "haseki",
    slug: "haseki",
    name: "Haseki Sultan Külliyesi",
    city: "İstanbul",
    period: "Klasik Osmanlı",
    category: "Külliye",
    year: "1538–1551",
    architect: "Mimar Sinan",
    description: "Hürrem Sultan'ın adıyla anılan; eğitim, paylaşım ve şifayı bir mahallede buluşturan yapı topluluğu.",
    coordinates: [41.0076, 28.941],
    image: "/images/haseki.svg",
    imageAlt: "Yan yana iki kubbesi ve tek minaresi olan taş bir cami; ortadaki sivri kemerli girişin üstünde küçük mavi bir çini pano. İki yanında küçük kubbelerle örtülü, sivri kemerli alçak yapı kanatları; çevrede servi ağaçları.",
    sourceReferences: [
      { title: "TDV İslâm Ansiklopedisi — Haseki Külliyesi", url: "https://islamansiklopedisi.org.tr/haseki-kulliyesi" },
    ],
    chapters: [
      {
        title: "Bir mahallede başlayan hikâye",
        short: "Hürrem Sultan adına Sinan'ın yaptığı külliye aşamalarla gelişti. Cami 1538–39'a, darüşşifa 1551'e tarihlenir.",
        story: "Hayalinde bir mahalle haritasını masaya yay. Tek seferde çizilmiş bir bütün yerine, zamanla eklenen mekânlar düşün. Her yeni çizgi, bir ihtiyaca verilmiş cevap olsun.",
        child: "Külliyenin bütün binaları aynı anda yapılmadı. Bir mahalle gibi, zaman içinde yeni yapılarla büyüdü.",
      },
      {
        title: "Paylaşmaya ayrılmış yer",
        short: "Toplulukta cami, medrese, sıbyan mektebi, imaret, çeşme ve darüşşifa bulunur.",
        story: "Hayalî defterinde bir sayfayı öğrenmeye, bir sayfayı paylaşmaya ayır. Son sayfayı boş bırak: İnsanların birlikte yaşaması için başka nasıl mekânlara ihtiyaç duyabileceğini oraya çiz.",
        child: "Sıbyan mektebi çocukların eğitim aldığı yerdi. Bir külliyede çocuklar için de bir okul bulunması ne güzel bir keşif!",
      },
      {
        title: "Zamanın eklediği kubbe",
        short: "Başlangıçta tek kubbeli olan cami, 1612'de ikinci bir kubbeli mekân eklenerek genişletildi.",
        story: "Hayalinde eski bir çizimin üzerine yeni bir çizgi ekle. İlkini silme; ikisi yan yana kalsın. Bir yapının zaman içinde değişmesini, sayfada büyüyen bu şekille düşün.",
        child: "Caminin önce bir kubbesi vardı; daha sonra ikinci kubbe eklendi. Eski yapılar da zamanla değişebilir.",
      },
      {
        title: "Gündelik yaşamın mirası",
        short: "Haseki'nin yapıları, vakıf mimarisinin eğitim ve sağlık gibi gündelik ihtiyaçlarla ilişkisini okumaya yardımcı olur.",
        story: "Hayalî yürüyüşün bittiğinde en büyük yapıyı değil, en çok düşündüren mekânı hatırla. Bir kapı, bir avlu ya da bir derslik; geçmişe açılan yolun küçük olabilir.",
        child: "Kendi mahallende insanların buluştuğu yerleri düşün. Bugünün okullarıyla geçmişin eğitim yapıları arasında nasıl benzerlikler bulabilirsin?",
      },
    ],
    detail: { title: "İki kubbe, iki dönem", text: "Caminin ikinci kubbesi ilk tasarımdan sonra eklendi. Bu değişiklik, tarihî yapıların farklı dönemlerin izlerini birlikte taşıyabildiğini gösterir.", focus: [49, 48] },
  },
];

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  artifactId: string;
};

export const quizQuestions: QuizQuestion[] = [
  {
    id: "sinanin-izi",
    question: "Süleymaniye Külliyesi'nin mimarı kimdir?",
    options: ["Hacı İvaz Paşa", "Mimar Sinan", "Ahlatlı Hürrem Şah", "Sedefkâr Mehmed Ağa"],
    answer: 1,
    explanation: "Kanuni'nin yaptırdığı Süleymaniye, Mimar Sinan'ın eseridir.",
    artifactId: "suleymaniye",
  },
  {
    id: "edirnenin-kubbesi",
    question: "Selimiye Camii hangi şehrin siluetinde yükselir?",
    options: ["Bursa", "Sivas", "İstanbul", "Edirne"],
    answer: 3,
    explanation: "Selimiye, Edirne'de yer alır ve şehrin simgelerindendir.",
    artifactId: "selimiye",
  },
  {
    id: "sifa-kapisi",
    question: "Divriği'deki darüşşifanın tarihî işlevi neydi?",
    options: ["Hastalara bakmak", "Tahıl depolamak", "Kervanları ağırlamak", "Kitap basmak"],
    answer: 0,
    explanation: "Darüşşifa, sağlık hizmeti verilen tarihî hastane yapısıdır.",
    artifactId: "divrigi",
  },
  {
    id: "bursanin-rengi",
    question: "Yeşil Türbe'nin dış yüzeyinde hangi malzeme öne çıkar?",
    options: ["Ahşap paneller", "Bronz levhalar", "Yeşil ve turkuaz çiniler", "Cam mozaikler"],
    answer: 2,
    explanation: "Türbenin ayırt edici özelliklerinden biri renkli çini kaplamalarıdır.",
    artifactId: "yesil-kulliye",
  },
  {
    id: "hasekinin-banisi",
    question: "Haseki Sultan Külliyesi kimin adına inşa edildi?",
    options: ["Turan Melek", "Hürrem Sultan", "II. Selim", "Çelebi Mehmed"],
    answer: 1,
    explanation: "Mimar Sinan bu külliyeyi Hürrem Sultan adına tasarladı.",
    artifactId: "haseki",
  },
];
