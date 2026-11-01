// Bugün's cards in screen order. A card returning null takes no space; later tasks add theirs here (P6–P8) and the
// first-run choice (P4) may reorder them.
import type { ComponentType } from 'react';
import { ContinueCard } from './ContinueCard';
import { DailyCard } from './DailyCard';
import { HuntCard } from './HuntCard';
import { NearbyCard } from './NearbyCard';
import { ReadingCards } from './ReadingCards';
import { RecallCard } from './RecallCard';
import { SeasonCard } from './SeasonCard';
import { TodayHeader } from './TodayHeader';
import { TravelCard } from './TravelCard';

export type HomeCard = { key: string; Card: ComponentType };

export const HOME_CARDS: HomeCard[] = [
  { key: 'header', Card: TodayHeader },
  { key: 'daily', Card: DailyCard },
  { key: 'hunt', Card: HuntCard },
  { key: 'recall', Card: RecallCard },
  { key: 'travel', Card: TravelCard },
  { key: 'nearby', Card: NearbyCard },
  { key: 'continue', Card: ContinueCard },
  { key: 'season', Card: SeasonCard },
  { key: 'reading', Card: ReadingCards },
];
