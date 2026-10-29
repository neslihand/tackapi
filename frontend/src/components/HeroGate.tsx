import { Fragment, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, KeyRound, MapPin } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useContent } from '../lib/contentStore';
import { useAmbience } from '../lib/ambience';
import { Atmosphere, magnet, release } from './Atmosphere';
import { settleScroll } from '../lib/motion';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';

gsap.registerPlugin(ScrollTrigger);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Share of the hero's scroll distance at which the courtyard copy is fully on screen. "Kapıyı Aç" travels here.
const COURTYARD_AT = 0.9;
// The index beside the door: what the platform holds, in three steps.
const note = (): [string, string, string][] => [['I', t('Hikâyesini', 'Hear its'), t('dinle.', 'story.')], ['II', t('Haritada', 'Find it'), t('bul.', 'on the map.')], ['III', t('Pasaportuna', 'Stamp your'), t('mühürle.', 'passport.')]];
// The carved stone facade (public/images/cephe.webp) fills the hero; its two wooden leaves are cut from the same photo
// (kanat-sol / kanat-sag) and swing inward to 96° on a smoothstep, darkening as they turn from the light, while the
// camera pushes into the doorway ever faster (t^2.2).
const OPEN_ANGLE = 96;
const smooth = (t: number) => t * t * (3 - 2 * t);
const push = (t: number) => Math.pow(t, 2.2);

// One leaf: its own crop of the facade photo and a shade that deepens as it turns from the light.
function DoorLeaf({ side }: { side: 'left' | 'right' }) {
  return <div className={`fc-leaf ${side}`}><img src={`/images/kanat-${side === 'left' ? 'sol' : 'sag'}.webp`} alt="" draggable={false} /><span className="fc-leaf-shade" /></div>;
}

// The platform in three verbs, after the inventory project's aim: keep the culture alive, record it, hand it on.
const pillars = () => [
  [t('Yaşat', 'Keep alive'), t('Eserlerin hikâyelerini merakla okunur kılar.', 'Makes the works’ stories a pleasure to read.')],
  [t('Kaydet', 'Record'), t('Envanter bilgisini kaynaklarıyla bir arada tutar.', 'Keeps the inventory together with its sources.')],
  [t('Aktar', 'Hand on'), t('Rotalar, oyunlar ve pasaportla mirası yeni nesillere taşır.', 'Carries the heritage to new generations through routes, games and a passport.')],
];

// Behind the door: a stone arcade a little way in, standing against a warm stone light that turns to the emerald night
// as the camera passes through the door, then through the arcade's middle arch, into the courtyard.
function Interior() {
  return <div className="fc-interior">
    <div className="fi-sky" />
    <div className="fi-night" />
    <img className="fi-arches" src="/images/avlu-tavan.webp" alt="" />
    <span className="fc-doorglow" />
  </div>;
}

export function HeroGate() {
  const section = useRef<HTMLElement>(null);
  const courtyard = useRef<HTMLDivElement>(null);
  const travel = useRef<gsap.core.Tween | null>(null);
  // The courtyard at night: drone, wind and ney-like phrases (lib/ambience.ts), off until asked for.
  const sound = useAmbience('story', 0);
  const { artifacts } = useContent();
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add({ motion: '(prefers-reduced-motion: no-preference)', small: '(max-width: 800px)' }, context => {
      if (!context.conditions?.motion) return;
      const small = Boolean(context.conditions.small);
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: small ? 0.6 : 1, invalidateOnRefresh: true },
      });
      // Scene 1 → 2: the copy steps aside and the shade lifts off the facade, so the door stands in full light.
      timeline.to('.fc-copy', { y: -90, autoAlpha: 0, ease: 'power1.in', duration: 0.12 }, 0)
        .to('.fc-note', { y: -60, autoAlpha: 0, ease: 'power1.in', duration: 0.1 }, 0)
        .to('.hero-bottom, .en-lantern', { autoAlpha: 0, duration: 0.1 }, 0)
        .to('.fc-shade', { opacity: 0.35, duration: 0.2 }, 0)
        .to('.en-fog', { opacity: 1, yPercent: -18, duration: 0.36 }, 0.04);
      // The leaves swing inward and the courtyard light spills through the doorway.
      timeline.fromTo('.fc-leaf.left', { rotateY: 0 }, { rotateY: OPEN_ANGLE, ease: smooth, duration: 0.26 }, 0.1)
        .fromTo('.fc-leaf.right', { rotateY: 0 }, { rotateY: -OPEN_ANGLE, ease: smooth, duration: 0.26 }, 0.1)
        .to('.fc-leaf-shade', { opacity: 0.7, ease: smooth, duration: 0.26 }, 0.1)
        .fromTo('.fc-doorglow', { opacity: 0 }, { opacity: 1, ease: smooth, duration: 0.26 }, 0.12)
        // The camera passes through the doorway, and the arcade behind it comes up to meet it.
        .to('.fc-stage', { scale: small ? 4.4 : 4.6, ease: push, duration: 0.34 }, 0.22)
        .to('.fc-shade', { opacity: 0, duration: 0.2 }, 0.22)
        .fromTo('.fi-sky', { scale: 1 }, { scale: 0.6, ease: push, duration: 0.34 }, 0.22)
        // Then through the arcade's middle arch: it grows past the camera and leaves the emerald night behind it.
        .fromTo('.fi-arches', { scale: 1 }, { scale: 7, ease: 'power2.in', duration: 0.24 }, 0.42)
        .to('.fi-night', { opacity: 1, ease: 'power1.inOut', duration: 0.09 }, 0.51)
        .to('.fi-arches', { autoAlpha: 0, ease: 'power1.in', duration: 0.05 }, 0.61)
        .fromTo('.courtyard-scene', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, 0.62)
        .set('.fc-frame, .fc-fill', { autoAlpha: 0 }, 0.68)
        // Scene 3: the courtyard, on the entrance's own emerald.
        .fromTo('.cy-kitabe', { '--rule': 0 }, { '--rule': 1, ease: 'power2.out', duration: 0.14 }, 0.68)
        .to({}, { duration: 0.08 });
      // The courtyard copy, one tween per word and per line: a staggered fromTo here sets its start state on the first
      // target only, so the others showed until the playhead reached them, then vanished and came back.
      gsap.utils.toArray<HTMLElement>('.cy-copy .reveal-line > span').forEach((word, i) => timeline.fromTo(word, { yPercent: 115 }, { yPercent: 0, ease: 'power3.out', duration: 0.12 }, 0.7 + i * 0.035));
      gsap.utils.toArray<HTMLElement>('.cy-copy .cy-fade').forEach((line, i) => timeline.fromTo(line, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.1, ease: 'power2.out' }, 0.78 + i * 0.03));
    });
    return () => { match.revert(); travel.current?.kill(); };
  }, []);
  function stopTravel() { travel.current?.kill(); travel.current = null; ['wheel', 'touchstart', 'keydown'].forEach(type => window.removeEventListener(type, stopTravel)); }
  function focusCourtyard() { courtyard.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }
  function openGate() {
    const el = section.current;
    if (!el) return;
    if (reduced()) { courtyard.current?.scrollIntoView({ behavior: 'instant' }); focusCourtyard(); return; }
    const target = el.offsetTop + (el.offsetHeight - window.innerHeight) * COURTYARD_AT;
    stopTravel(); settleScroll();
    const proxy = { y: window.scrollY };
    const distance = Math.abs(target - proxy.y) / window.innerHeight;
    travel.current = gsap.to(proxy, { y: target, duration: Math.min(4.2, 1.2 + distance), ease: 'power1.inOut', onUpdate: () => window.scrollTo(0, proxy.y), onComplete: () => { stopTravel(); focusCourtyard(); } });
    ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, stopTravel, { passive: true }));
  }
  function skipIntro() {
    stopTravel(); settleScroll();
    const next = document.getElementById('vizyon');
    window.scrollTo({ top: next ? next.offsetTop - 70 : (section.current?.offsetHeight ?? 0), behavior: 'instant' });
    document.getElementById('vision-title')?.focus({ preventScroll: true });
  }
  function parallax(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || reduced()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX / rect.width - 0.5, y = event.clientY / rect.height - 0.5;
    event.currentTarget.style.setProperty('--mouse-x', x.toFixed(3));
    event.currentTarget.style.setProperty('--mouse-y', y.toFixed(3));
  }
  return <section id="giris" className="hero-scroll hero-facade" ref={section} data-nav-theme="dark" aria-label={t('Tarihe açılan kapı', 'A door to history')}>
    <div className="hero-sticky" onPointerMove={parallax}>
      <div className="gate-scene">
        {/* The facade, sized to cover the screen at the photo's own proportions so the leaves stay on its doorway. */}
        <div className="fc-fill" aria-hidden="true" />
        <div className="fc-frame" aria-hidden="true"><div className="fc-stage">
          <Interior />
          <img className="fc-facade" src="/images/cephe.webp" alt="" fetchPriority="high" draggable={false} />
          <div className="fc-doors"><DoorLeaf side="left" /><DoorLeaf side="right" /></div>
        </div></div>
        <Atmosphere />
        <div className="fc-shade" aria-hidden="true" />
        <div className="en-lantern" aria-hidden="true" />
        {/* The copy stands to the left of the door, over the shade, so the door keeps the centre of the picture. */}
        <div className="fc-copy">
          <p className="en-index"><span>N° 01</span><i aria-hidden="true" /><span>{t('Anadolu’nun vakıf mirası', 'The waqf heritage of Anatolia')}</span></p>
          <h1 className="fc-title"><span className="fc-line"><span>{t('Taşa yazılmış', 'Trace kindness')}</span></span> <span className="fc-line"><span>{t('iyiliklerin', 'carved')}</span></span> <span className="fc-line"><span><em>{t('izini sür.', 'in stone.')}</em></span></span></h1>
          <div className="en-lede"><span className="en-rule" aria-hidden="true" /><p className="hero-description">{t('Camiler, çeşmeler, hanlar… Yüzyıllardır şehirlere hizmet eden vakıf eserleri, hikâyelerini anlatmak için seni bekliyor.', 'Mosques, fountains, caravanserais… The waqf works that have served our cities for centuries are waiting to tell you their stories.')}</p></div>
          {/* Two ways in: the door itself for the curious, the map for whoever already stands before a building. */}
          <div className="hero-actions">
            <button className="button gold en-key" onClick={openGate} onPointerMove={magnet} onPointerLeave={release}><span className="en-key-icon" aria-hidden="true"><KeyRound size={17} /></span><span className="en-key-label">{t('Kapıyı arala', 'Open the door')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></button>
            <Link className="hero-secondary en-link" to="/harita" onPointerMove={magnet} onPointerLeave={release}><span>{t('Yakınındaki eseri bul', 'Find a work near you')}</span><span className="en-link-arrow" aria-hidden="true"><MapPin size={16} /></span></Link>
          </div>
        </div>
        {/* What lies behind the door, as a small index on the other side of it. */}
        <ol className="fc-note" aria-label={t('EŞİK’te seni neler bekliyor', 'What awaits you at EŞİK')}>{note().map(([n, text, em]) => <li key={n}><span aria-hidden="true">{n}</span>{text} <em>{em}</em></li>)}</ol>
        <div className="hero-bottom en-bar">
          <button onClick={openGate} className="scroll-invite en-scroll"><span className="en-scroll-track" aria-hidden="true"><i /></span><span className="en-scroll-text"><b>{t('Kaydır', 'Scroll')}</b><small>{t('kapı aralansın', 'and the door opens')}</small></span></button>
          <p className="hero-edition en-count"><span>{t('ANADOLU KOLEKSİYONU', 'ANATOLIAN COLLECTION')}</span><span className="en-ticks" aria-hidden="true">{artifacts.map(a => <i key={a.id} />)}</span><b>{String(artifacts.length).padStart(2, '0')} {t('eser', 'works')} · {String(new Set(artifacts.map(a => a.city)).size).padStart(2, '0')} {t('şehir', 'cities')}</b></p>
          <div className="hero-controls"><button className={`en-sound ${sound.on ? 'on' : ''}`} onClick={sound.toggle} aria-pressed={sound.on} aria-label={sound.on ? t('Ortam sesini kapat', 'Turn the ambient sound off') : t('Ortam sesini aç', 'Turn the ambient sound on')}><span className="en-eq" aria-hidden="true"><i /><i /><i /><i /></span><span>{t('SES', 'SOUND')} {sound.on ? t('AÇIK', 'ON') : t('KAPALI', 'OFF')}</span></button><button className="en-skip" onClick={skipIntro}>{t('Girişi atla', 'Skip the intro')} <ArrowDown size={14} aria-hidden="true" /></button></div>
        </div>
      </div>
      <div className="gate-bloom" aria-hidden="true" />
      <div className="courtyard-scene" ref={courtyard}>
        {/* The courtyard introduces the platform: its aim set as an inscription (kitabe), the mission under it, and the
            three verbs with the way in along the floor. */}
        <div className="cy-copy cy-mission">
          <div className="cy-kitabe">
            <p className="cy-index cy-fade"><span>N° 02</span><i aria-hidden="true" />{t('Vakıf Eserleri Envanter Projesi', 'Waqf Works Inventory Project')}</p>
            <h2 tabIndex={-1}>{t('Kadim bir kültür,', 'An ancient culture,').split(' ').map((word, i) => <Fragment key={`a${i}`}>{i > 0 && ' '}<span className="reveal-line"><span>{word}</span></span></Fragment>)} {t('yaşayan bir hafıza.', 'a living memory.').split(' ').map((word, i) => <Fragment key={`b${i}`}>{i > 0 && ' '}<span className="reveal-line"><span><em>{word}</em></span></span></Fragment>)}</h2>
          </div>
          <p className="cy-fade cy-lead">{t('Yüzyıllardır şehirlere hizmet eden camiler, çeşmeler, hanlar ve medreseler; her biri bir iyiliğin taşa işlenmiş hâli. EŞİK, Vakıf Katılım’ın kadim vakıf kültürünü yaşatmak, kayıt altına almak ve gelecek nesillere aktarmak için yürüttüğü', 'Mosques, fountains, caravanserais and madrasas that have served our cities for centuries; each one an act of kindness set in stone. EŞİK is a digital discovery platform built within the')} <b>{t('Vakıf Eserleri Envanter Projesi', 'Waqf Works Inventory Project')}</b>{t(' kapsamında geliştirilen dijital keşif platformudur.', ', which Vakıf Katılım carries out to keep the ancient waqf culture alive, to record it and to hand it on to future generations.')}</p>
          <div className="cy-label">
            <ol className="cy-pillars cy-fade">{pillars().map(([verb, text], i) => <li key={verb}><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><b>{verb}</b><small>{text}</small></li>)}</ol>
            <div className="cy-actions cy-fade"><Link className="button gold en-key" to="/kesfet" onPointerMove={magnet} onPointerLeave={release}><span className="en-key-label">{t('Koleksiyonu keşfet', 'Explore the collection')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link><Link className="hero-secondary en-link" to="/hakkinda" onPointerMove={magnet} onPointerLeave={release}><span>{t('Projeyi tanı', 'About the project')}</span><span className="en-link-arrow" aria-hidden="true"><ArrowRight size={16} /></span></Link></div>
          </div>
        </div>
        <span className="cy-note">{t('VAKIF KATILIM · VAKIF ESERLERİ ENVANTER PROJESİ', 'VAKIF KATILIM · WAQF WORKS INVENTORY PROJECT')}</span>
      </div>
    </div>
  </section>;
}
