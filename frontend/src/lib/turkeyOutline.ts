// A simplified outline of Türkiye in real latitude/longitude, for the night map on the Heritage Map page.
// It is drawn as a Leaflet polygon, so every pin placed by its coordinates lands in the right place on it (a picture
// stretched over a rectangle cannot do that). Coasts and borders are simplified to a few kilometres; islands and
// small bays are left out.
export type LatLng = [number, number];

// Anatolia, clockwise from Üsküdar: the Black Sea coast, the eastern and southern borders, the Mediterranean, the
// Aegean and the Marmara coasts.
export const ANATOLIA: LatLng[] = [
  [41.03, 29.02], [41.18, 29.61], [41.17, 30.25], [41.12, 30.65], [41.09, 31.12], [41.28, 31.42], [41.46, 31.79],
  [41.75, 32.39], [41.89, 33.0], [41.98, 33.76], [42.03, 34.5], [42.1, 34.95], [42.03, 35.15], [41.8, 35.2],
  [41.73, 35.95], [41.29, 36.33], [41.35, 36.75], [41.13, 37.29], [40.98, 37.88], [40.92, 38.39], [40.98, 39.2],
  [41.0, 39.72], [41.02, 40.52], [41.25, 41.1], [41.4, 41.43], [41.52, 41.55],
  // Georgia, Armenia, Nakhchivan, Iran
  [41.47, 42.6], [41.51, 42.83], [41.25, 43.47], [40.95, 43.6], [40.6, 43.65], [40.1, 43.68], [40.02, 44.35],
  [39.85, 44.6], [39.72, 44.82], [39.4, 44.42], [39.0, 44.28], [38.4, 44.35], [38.0, 44.25], [37.7, 44.6],
  [37.35, 44.8], [37.15, 44.79],
  // Iraq, Syria
  [37.25, 44.25], [37.3, 43.8], [37.25, 43.0], [37.11, 42.36], [37.07, 41.22], [36.84, 40.04], [36.71, 38.95],
  [36.83, 38.0], [36.66, 37.1], [36.62, 36.75], [36.3, 36.6], [36.2, 36.45], [35.9, 36.15], [35.82, 35.95],
  // the Mediterranean
  [36.08, 35.93], [36.41, 35.88], [36.59, 36.17], [36.84, 36.2], [36.77, 35.79], [36.57, 35.37], [36.8, 34.95],
  [36.79, 34.63], [36.6, 34.31], [36.3, 34.0], [36.15, 33.5], [36.02, 32.8], [36.27, 32.31], [36.54, 32.0],
  [36.78, 31.44], [36.88, 30.7], [36.6, 30.56], [36.2, 30.4], [36.29, 30.15], [36.2, 29.64], [36.27, 29.3],
  [36.65, 29.1], [36.72, 28.8], [36.85, 28.27], [36.68, 27.4], [37.04, 28.33], [37.03, 27.43],
  // the Aegean
  [37.24, 27.6], [37.37, 27.25], [37.86, 27.26], [38.05, 26.9], [38.32, 26.3], [38.64, 26.5], [38.42, 27.13],
  [38.67, 26.75], [38.8, 26.97], [39.07, 26.89], [39.32, 26.69], [39.58, 27.0], [39.48, 26.07], [39.75, 26.15],
  [40.15, 26.4],
  // the Dardanelles and the Marmara
  [40.34, 26.69], [40.42, 27.3], [40.5, 27.85], [40.35, 27.97], [40.38, 28.88], [40.43, 29.15], [40.53, 28.83],
  [40.65, 29.27], [40.76, 29.92], [40.76, 29.38], [40.88, 29.2], [40.99, 29.03],
];

// Thrace, clockwise from Sarıyer: the Black Sea coast, the Bulgarian and Greek borders, the Saros gulf, the Gallipoli
// peninsula and the Marmara coast back to the Bosphorus.
export const THRACE: LatLng[] = [
  [41.17, 29.05], [41.25, 29.02], [41.35, 28.68], [41.63, 28.1], [41.88, 27.98], [41.97, 28.0], [41.98, 27.55],
  [42.08, 27.0], [41.72, 26.33], [41.3, 26.6], [40.9, 26.35], [40.73, 26.04], [40.63, 26.9], [40.45, 26.4],
  [40.05, 26.18], [40.41, 26.67], [40.61, 27.11], [40.98, 27.51], [40.97, 27.95], [41.07, 28.25], [41.02, 28.58],
  [40.97, 28.87], [41.01, 28.99],
];

// Names written on the water and the land, as on the old schematic picture.
export const GEO_LABELS: { text: string; at: LatLng; className: string }[] = [
  { text: 'Karadeniz', at: [42.55, 35.2], className: 'sea' },
  { text: 'Akdeniz', at: [35.45, 31.4], className: 'sea' },
  { text: 'Ege Denizi', at: [38.4, 25.55], className: 'sea vertical' },
  { text: 'ANADOLU', at: [39.15, 35.0], className: 'land' },
];
