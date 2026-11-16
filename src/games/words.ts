import { parameters } from '../core/config';
import type { GameDefinition } from '../core/types';
import { shuffle } from './random';

// Собственный список простых предметов и явлений, без внешних словарей.
export const WORDS = [
  'окно', 'кошка', 'река', 'книга', 'чайник', 'облако', 'яблоко', 'шарф',
  'лодка', 'лампа', 'цветок', 'дорога', 'птица', 'ложка', 'гора', 'мяч',
  'дерево', 'ключ', 'хлеб', 'мост', 'чашка', 'камень', 'солнце', 'письмо',
  'зонт', 'сыр', 'поезд', 'морковь', 'скамейка', 'снег', 'свеча', 'барабан',
  'ведро', 'море', 'рюкзак', 'собака', 'дом', 'звезда', 'сапог', 'ковёр',
  'лимон', 'дверь', 'часы', 'велосипед', 'гриб', 'рыба', 'тетрадь', 'колокол',
  'лиса', 'стол', 'карандаш', 'колесо', 'молоко', 'трава', 'шляпа', 'ракушка',
  'вишня', 'зеркало', 'корзина', 'лист', 'печенье', 'палатка', 'белка', 'лестница',
  'парус', 'фонарь', 'сахар', 'конверт', 'тыква', 'пчела', 'ручей', 'пуговица',
  'подушка', 'берёза', 'клубника', 'песок', 'перчатка', 'гитара', 'чай', 'колос',
] as const;
export const ENGLISH_WORDS = [
  'window', 'cat', 'river', 'book', 'kettle', 'cloud', 'apple', 'scarf',
  'boat', 'lamp', 'flower', 'road', 'bird', 'spoon', 'mountain', 'ball',
  'tree', 'key', 'bread', 'bridge', 'cup', 'stone', 'sun', 'letter',
  'umbrella', 'cheese', 'train', 'carrot', 'bench', 'snow', 'candle', 'drum',
  'bucket', 'sea', 'backpack', 'dog', 'house', 'star', 'boot', 'carpet',
  'lemon', 'door', 'clock', 'bicycle', 'mushroom', 'fish', 'notebook', 'bell',
  'fox', 'table', 'pencil', 'wheel', 'milk', 'grass', 'hat', 'shell',
  'cherry', 'mirror', 'basket', 'leaf', 'cookie', 'tent', 'squirrel', 'ladder',
  'sail', 'lantern', 'sugar', 'envelope', 'pumpkin', 'bee', 'stream', 'button',
  'pillow', 'birch', 'strawberry', 'sand', 'glove', 'guitar', 'tea', 'wheat',
] as const;
export const words: GameDefinition = {
  icon: 'whole-word', maxLevel: 7,
  parameters: level => parameters('words', level),
  generate(level, random = Math.random, language = 'ru') {
    const params = parameters('words', level);
    const pool = shuffle(language === 'en' ? ENGLISH_WORDS : WORDS, random).slice(0, params.count + params.distractors!);
    return { game: 'words', language, level, params, words: pool.slice(0, params.count), options: shuffle(pool, random) };
  },
  evaluate(challenge, answer) {
    if (challenge.game !== 'words' || !Array.isArray(answer) || answer.length !== challenge.params.count ||
        new Set<string | number>(answer).size !== answer.length || !answer.every(word => typeof word === 'string' && challenge.options.includes(word))) return null;
    return { correct: answer.filter(word => challenge.words.includes(word as string)).length, total: challenge.params.count };
  },
};
