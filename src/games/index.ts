import type { GameDefinition, GameId } from '../core/types';
import { rule } from './rule';
import { order } from './order';
import { numbers } from './numbers';
import { location } from './location';
import { words } from './words';
import { sequence } from './sequence';
export const GAMES: Record<GameId, GameDefinition> = { numbers, location, words, sequence, rule, order };
