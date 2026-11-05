// What the route screen says about a saved pack, and the sizes it shows. Pure, so it can be tested without a device.

export type PackStatus = 'none' | 'ready' | 'damaged' | 'stops_changed' | 'new_version';

/** `missing`: saved pieces no longer on the device. `latest`: the server's version, null when offline or unknown:
 *  without a connection a pack is taken as it is, so it keeps opening on the trip. */
export function packStatus(pack: { slugs: string[]; version?: string } | null, stops: string[], latest: string | null, missing: number): PackStatus {
  if (!pack) return 'none';
  if (missing > 0) return 'damaged';
  if (stops.some(slug => !pack.slugs.includes(slug))) return 'stops_changed';
  return latest && pack.version !== latest ? 'new_version' : 'ready';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function sizeBucket(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? 'under_10mb' : mb < 50 ? '10_50mb' : mb < 200 ? '50_200mb' : 'over_200mb';
}
