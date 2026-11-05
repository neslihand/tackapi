// How a route's estimate is worded (routePlan.ts). The words say what it is based on.
import { t } from './i18n';
import { formatDistance } from './passport';
import { isLongTrip, type RoutePlan } from './routePlan';

export const durationLabel = (minutes: number) => minutes < 60 ? t(`${minutes} dakika`, `${minutes} minutes`) : minutes === 60 ? t('1 saat', '1 hour') : t(`${minutes / 60} saat`, `${minutes / 60} hours`);
export const durationChip = (minutes: number) => isLongTrip(minutes) ? t(`Seyahat · ${durationLabel(minutes)}`, `Trip · ${durationLabel(minutes)}`) : durationLabel(minutes);

/** An editor's duration comes first and says who gave it; otherwise the phone's estimate with what it is based on. */
export const timeLabel = (minutes: number | null | undefined, plan: RoutePlan) => minutes ? t(`Editörün kontrol ettiği süre: ${durationLabel(minutes)}.`, `Duration checked by an editor: ${durationLabel(minutes)}.`) : planLabel(plan);

export function planLabel(plan: RoutePlan) {
  if (plan.minutes !== null) return t(`Yürüyüş: yaklaşık ${plan.minutes} dakika (kuş uçuşu ${formatDistance(plan.lengthM)}, durak başına 10 dakika ile tahmin).`,
    `Walk: about ${plan.minutes} minutes (estimated from ${formatDistance(plan.lengthM)} as the crow flies and 10 minutes at each stop).`);
  if (!plan.placed) return t('Durakların konumu henüz yok; süre hesaplanamıyor.', 'The stops have no location yet, so no duration can be estimated.');
  return t(`Yürüyüş rotası değil: duraklar birbirine uzak (kuş uçuşu toplam ${formatDistance(plan.lengthM)}). Araçla, şehir gezisi olarak planla.`,
    `Not a walking route: the stops are far apart (${formatDistance(plan.lengthM)} in total as the crow flies). Plan it as a city trip by vehicle.`);
}
