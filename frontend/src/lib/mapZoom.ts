import type L from 'leaflet';

// Zooming a map on the page the way people expect from a map: a trackpad pinch (which the browser sends as a wheel
// event with ctrlKey) or Ctrl/⌘ + the wheel zooms the map around the pointer instead of zooming the whole page; Safari's
// pinch gestures likewise. A plain wheel still scrolls the page, and `onPlainWheel` can tell the visitor how to zoom.
// Returns the clean-up function.
export function pinchZoom(map: L.Map, box: HTMLElement, onPlainWheel?: () => void) {
  let pending = 0;
  const step = () => map.options.zoomSnap || 0.25;
  const zoomBy = (amount: number, around?: L.Point) => {
    pending += amount;
    const whole = Math.trunc(pending / step()) * step();
    if (!whole) return;
    pending -= whole;
    const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + whole));
    if (around) map.setZoomAround(around, zoom, { animate: false }); else map.setZoom(zoom, { animate: false });
  };
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) { onPlainWheel?.(); return; }
    event.preventDefault();
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    zoomBy(-event.deltaY * lines * 0.01, map.mouseEventToContainerPoint(event as unknown as MouseEvent));
  };
  // Safari (macOS) pinches with its own gesture events: stop the page zoom and follow the pinch's scale.
  let last = 1;
  const gesture = (event: Event) => {
    event.preventDefault();
    const scale = (event as Event & { scale?: number }).scale ?? 1;
    if (event.type === 'gesturestart') { last = 1; return; }
    zoomBy(Math.log2(scale / last)); last = scale;
  };
  box.addEventListener('wheel', wheel, { passive: false });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) box.addEventListener(type, gesture, { passive: false } as AddEventListenerOptions);
  return () => {
    box.removeEventListener('wheel', wheel);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) box.removeEventListener(type, gesture);
  };
}
