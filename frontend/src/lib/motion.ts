import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

// Site-wide scroll motion, after the reference sites (Monoform, Frentavo, Swash, Shopify Editions, Hart, Polpharma).
//
// Smooth scrolling: the wheel glides with inertia (Lenis), driven by GSAP's ticker so every ScrollTrigger scene stays
// in step. Touch, keyboard, the scrollbar and nested scroll areas (chat, menus, dialogs) scroll natively. The maps are not
// left out: they do not use the wheel (lib/mapZoom.ts zooms them on a pinch), and a native scroll starting over a map
// while a glide was still running pulled the page two ways at once, so the page shook.
//
// Depth: elements opt in with data attributes and are picked up wherever they appear, also after lazy loads:
//   data-speed="0.9"  travels at 0.9 of the scroll (it lags; above 1 it runs ahead). It sits at its laid-out place
//                     when its block is centred on screen, or at the top of the page.
//   data-drift        a clipped frame whose image glides against it, slightly enlarged (Frentavo, Polpharma).
//   data-layer        a decorative layer (girih) that drifts slowly inside its clipped section (Hart).
//   data-unfold       a band that opens from an inset, rounded panel to full width as it scrolls in (Monoform).
//   data-stagger      its children rise out of a mask one after another the first time it comes into view.
//   data-columns="1 0.86 1.1"  a grid whose columns travel at these speeds, so they slide past each other (Frentavo).
//   data-curtain      footer content that settles as the footer slides up over the page (Polpharma).
// Reduced motion turns all of it off.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)');
let lenis: Lenis | null = null;

export function useSmoothScroll() {
  useEffect(() => {
    const query = reducedMotion();
    const start = () => {
      if (query.matches || lenis) return;
      lenis = new Lenis({ lerp: 0.09, autoRaf: false, allowNestedScroll: true, prevent: node => node.matches('dialog, [role="dialog"], .mobile-menu') });
      lenis.on('scroll', ScrollTrigger.update);
    };
    const stop = () => { lenis?.destroy(); lenis = null; };
    const change = () => { stop(); start(); };
    const tick = (time: number) => lenis?.raf(time * 1000);
    start();
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    query.addEventListener('change', change);
    // A route change jumps to the top: drop any glide still running so it does not pull the new page back down.
    const route = () => lenis?.scrollTo(0, { immediate: true, force: true });
    window.addEventListener('hashchange', route);
    // Pages grow as images, lazy pages and filters arrive: measure the scroll scenes again once the layout settles.
    let timer = 0;
    const resize = new ResizeObserver(() => { clearTimeout(timer); timer = window.setTimeout(() => ScrollTrigger.refresh(), 150); });
    resize.observe(document.body);
    return () => {
      query.removeEventListener('change', change); window.removeEventListener('hashchange', route);
      gsap.ticker.remove(tick); gsap.ticker.lagSmoothing(500, 33);
      resize.disconnect(); clearTimeout(timer); stop();
    };
  }, []);
}

// Stops a glide in progress, before a script moves the page itself.
export function settleScroll() { lenis?.scrollTo(window.scrollY, { immediate: true, force: true }); }

const clipped = (el: Element | null) => Boolean(el && /hidden|clip/.test(getComputedStyle(el).overflow));

function build(el: HTMLElement, moved: HTMLElement[]) {
  const centre = (box: DOMRect) => Math.max(0, box.top + window.scrollY + box.height / 2 - window.innerHeight / 2);
  const data = el.dataset;
  if (data.speed !== undefined) {
    const speed = Number(data.speed) || 1, host = el.parentElement ?? el;
    const setY = gsap.quickSetter(el, 'y', 'px') as (value: number) => void;
    let anchor = 0;
    const place = (scroll: number) => setY((1 - speed) * (scroll - anchor));
    moved.push(el);
    ScrollTrigger.create({
      trigger: host, start: 'top bottom', end: 'bottom top',
      onRefresh: self => {
        anchor = centre(host.getBoundingClientRect());
        place(gsap.utils.clamp(self.start, self.end, self.scroll()));
      },
      onUpdate: self => place(self.scroll()),
    });
  }
  if (data.columns !== undefined) {
    // Columns are read from the laid-out positions on every refresh, so filters and breakpoints are followed.
    const speeds = data.columns.split(' ').map(Number);
    let items: HTMLElement[] = [], factors: number[] = [], anchor = 0;
    const place = (scroll: number) => items.forEach((item, i) => gsap.set(item, { y: factors[i] * (scroll - anchor) }));
    moved.push(el);
    ScrollTrigger.create({
      trigger: el, start: 'top bottom', end: 'bottom top',
      onRefresh: self => {
        items.forEach(item => gsap.set(item, { clearProps: 'transform' }));
        items = [...el.children] as HTMLElement[];
        const lefts = [...new Set(items.map(item => item.offsetLeft))].sort((a, b) => a - b);
        factors = items.map(item => lefts.length > 1 ? 1 - (speeds[lefts.indexOf(item.offsetLeft) % speeds.length] || 1) : 0);
        anchor = centre(el.getBoundingClientRect());
        place(gsap.utils.clamp(self.start, self.end, self.scroll()));
      },
      onUpdate: self => place(self.scroll()),
    });
  }
  if (data.drift !== undefined) {
    const media = el.querySelector(':scope > img, :scope > svg, :scope > video');
    if (media) gsap.fromTo(media, { yPercent: -6, scale: 1.14 }, { yPercent: 6, scale: 1.14, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  }
  if (data.layer !== undefined && clipped(el.parentElement)) {
    gsap.fromTo(el, { yPercent: -5, scale: 1.12 }, { yPercent: 5, scale: 1.12, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  }
  if (data.unfold !== undefined) {
    gsap.fromTo(el, { clipPath: 'inset(0% 4% 0% 4% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 25%', scrub: true } });
  }
  if (data.stagger !== undefined && el.children.length) {
    // A mask rather than a fade, so text never sits half transparent.
    gsap.fromTo(el.children, { y: 16, clipPath: 'inset(100% 0% 0% 0%)' }, { y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.28, ease: 'power3.out', stagger: 0.04, clearProps: 'clipPath,transform', scrollTrigger: { trigger: el, start: 'top bottom', once: true } });
  }
  if (data.curtain !== undefined) {
    gsap.fromTo(el, { yPercent: -28 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: el.closest('footer') ?? el, start: 'top bottom', end: 'bottom bottom', scrub: true } });
  }
}

// Finds the marked elements on the current page, now and as more of it mounts, and starts their motion.
export function useParallax(page: string) {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const query = reducedMotion();
    let context: gsap.Context | null = null;
    let seen = new WeakSet<Element>();
    let moved: HTMLElement[] = [];
    const scan = () => {
      if (query.matches) return;
      const fresh = [...root.querySelectorAll<HTMLElement>('[data-speed], [data-columns], [data-drift], [data-layer], [data-unfold], [data-stagger], [data-curtain]')].filter(el => !seen.has(el));
      if (!fresh.length) return;
      fresh.forEach(el => seen.add(el));
      context ??= gsap.context(() => {});
      context.add(() => fresh.forEach(el => build(el, moved)));
    };
    const reset = () => {
      context?.revert(); context = null;
      moved.forEach(el => gsap.set(el.dataset.columns !== undefined ? el.children : el, { clearProps: 'transform' }));
      moved = []; seen = new WeakSet();
    };
    let timer = 0;
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = window.setTimeout(scan, 120); });
    observer.observe(root, { childList: true, subtree: true });
    const change = () => { reset(); scan(); };
    query.addEventListener('change', change);
    scan();
    return () => { observer.disconnect(); clearTimeout(timer); query.removeEventListener('change', change); reset(); };
  }, [page]);
}
