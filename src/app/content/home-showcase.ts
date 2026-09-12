import { environment } from '../../environments/environment';

/**
 * The pictures the home page leads with.
 *
 * Every one is from the published promo gallery, made on the horde from the
 * prompt it carries, so a tile is both evidence and an offer: pressing it opens
 * the studio with that prompt already written. The list is hand-written rather
 * than fetched because the home page is prerendered and the gallery's own index
 * refuses cross-origin reads from a development origin; the prompts and models
 * are copied verbatim from the gallery's manifest, and the titles and subjects
 * are this page's own words for them.
 */
export interface ShowcasePicture {
  /** The gallery id, which is also the directory the picture is published in. */
  id: string;
  /** Two to four words for the picture, shown in the caption. */
  title: string;
  /** The prompt the picture was made from, verbatim. */
  prompt: string;
  /** The model it was made on. */
  model: string;
  /** What the picture is of, which is what keeps two of a kind apart. */
  subject: string;
}

/**
 * How many tiles the mosaic shows at once; the rest rotate through them. Nine
 * is what closes the grid: four columns of three, with the first tile taking
 * four of the twelve cells, leaves no hole for the eye to finish on.
 */
export const HOME_MOSAIC_TILES = 9;

/**
 * How many of them a two-column screen shows. Six fills three rows exactly, and
 * the three it drops are lazy, so a phone never fetches a picture it hides.
 */
export const HOME_MOSAIC_PHONE_TILES = 6;

/**
 * The nine the page paints with, each of a different thing so that no two tiles
 * read as the same picture, and the first of them the one that takes the span.
 */
export const HOME_SHOWCASE_FIRST: readonly ShowcasePicture[] = [
  {
    id: 'snail-cathedral',
    title: 'Snail cathedral',
    prompt:
      'a snail whose shell is a gothic cathedral with lit stained-glass windows, crawling through a garden at dusk',
    model: 'AlbedoBase XL 3.1',
    subject: 'snail',
  },
  {
    id: 'whale-library',
    title: 'Whale library',
    prompt:
      'the inside of a whale as a public library, bookshelves along the ribs, readers in armchairs, warm lamplight',
    model: 'Cheyenne',
    subject: 'whale',
  },
  {
    id: 'moon-laundry',
    title: 'Laundry on the moon',
    prompt:
      'an astronaut hanging laundry on a line strung between two craters, Earth rising behind, photograph',
    model: 'Flux.1-Schnell fp8 (Compact)',
    subject: 'astronaut',
  },
  {
    id: 'umbrella-jellyfish',
    title: 'Umbrella jellyfish',
    prompt:
      'jellyfish made of open umbrellas drifting through a rainy city street at night, neon reflections',
    model: 'AlbedoBase XL 3.1',
    subject: 'jellyfish',
  },
  {
    id: 'tram-on-rainbow',
    title: 'Tram on a rainbow',
    prompt:
      'a vintage tram running along a rainbow over a valley, passengers waving, painting',
    model: 'AlbedoBase XL 3.1',
    subject: 'tram',
  },
  {
    id: 'fox-fishing-stars',
    title: 'Fox fishing for stars',
    prompt:
      'a fox fishing for stars from a wooden boat on a lake that reflects the night sky, illustration',
    model: 'Cheyenne',
    subject: 'fox',
  },
  {
    id: 'floating-market-sky',
    title: 'Market in the sky',
    prompt:
      'a floating market of boats drifting through the sky between clouds, lanterns, painting',
    model: 'Stable Cascade 1.0',
    subject: 'boats',
  },
  {
    id: 'owl-tram-driver',
    title: 'Owl tram driver',
    prompt:
      "an owl in a conductor's cap driving a night tram through a snowy town, warm windows, illustration",
    model: 'AlbedoBase XL 3.1',
    subject: 'owl',
  },
  {
    id: 'hedgehog-hot-air',
    title: 'Hedgehog aeronaut',
    prompt:
      'a hedgehog piloting a dandelion seed like a hot air balloon over a meadow, macro illustration',
    model: 'AlbedoBase XL 3.1',
    subject: 'hedgehog',
  },
];

/** The rest of the gallery, which rotates into the tiles over time. */
export const HOME_SHOWCASE_REST: readonly ShowcasePicture[] = [
  {
    id: 'cat-air-traffic',
    title: 'Cat air traffic control',
    prompt:
      'a cat in a control tower directing paper airplanes with glowing batons, night, cinematic',
    model: 'Juggernaut XL',
    subject: 'cat',
  },
  {
    id: 'origami-wolf-pack',
    title: 'Origami wolves',
    prompt:
      'a pack of origami wolves howling at a paper moon in a folded-paper forest, studio light',
    model: 'AlbedoBase XL 3.1',
    subject: 'wolves',
  },
  {
    id: 'tortoise-city',
    title: 'City on a tortoise',
    prompt:
      'a giant tortoise with a walled medieval city on its shell, crossing a river at dawn, matte painting',
    model: 'Cheyenne',
    subject: 'tortoise',
  },
  {
    id: 'bear-cafe',
    title: 'Bear cafe',
    prompt:
      'a brown bear in an apron serving espresso to squirrels at a tiny forest cafe, morning light, photograph',
    model: 'Juggernaut XL',
    subject: 'bear',
  },
  {
    id: 'goldfish-in-lightbulb',
    title: 'Goldfish in a lightbulb',
    prompt:
      'a goldfish swimming inside a lit lightbulb hanging in a dark workshop, macro photograph',
    model: 'Juggernaut XL',
    subject: 'goldfish',
  },
  {
    id: 'bookshelf-canyon',
    title: 'Bookshelf canyon',
    prompt:
      'hikers walking through a canyon whose walls are towering bookshelves, shafts of light, matte painting',
    model: 'Cheyenne',
    subject: 'hikers',
  },
  {
    id: 'lantern-fish-city',
    title: 'Lantern-fish city',
    prompt:
      'a city at night lit entirely by giant floating lantern-fish, people walking under them',
    model: 'AlbedoBase XL 3.1',
    subject: 'lanterns',
  },
  {
    id: 'lighthouse-in-teacup',
    title: 'Lighthouse in a teacup',
    prompt:
      'a working lighthouse standing in a teacup on a windowsill, beam sweeping the room, night',
    model: 'DreamShaper XL',
    subject: 'lighthouse',
  },
  {
    id: 'piano-forest',
    title: 'Piano in the forest',
    prompt:
      'a grand piano growing out of a forest floor like a tree, roots and moss, a fox playing it',
    model: 'AlbedoBase XL 3.1',
    subject: 'piano',
  },
  {
    id: 'submarine-desert',
    title: 'Submarine in the dunes',
    prompt:
      'a yellow submarine surfacing through sand dunes, camels watching, midday, photograph',
    model: 'Juggernaut XL',
    subject: 'submarine',
  },
  {
    id: 'ship-in-bottle-sea',
    title: 'Ship in a bottle',
    prompt:
      'a full-size sailing ship sealed in a giant glass bottle floating on a real sea, photograph',
    model: 'Juggernaut XL',
    subject: 'ship',
  },
];

/** Every gallery picture the home page can show, first paint then the rest. */
export const HOME_SHOWCASE: readonly ShowcasePicture[] = [
  ...HOME_SHOWCASE_FIRST,
  ...HOME_SHOWCASE_REST,
];

/**
 * Where a gallery picture is published. The gallery is promotional material
 * rather than evidence, so it is served beside the library under its own
 * prefix, which is configuration rather than an address in the code.
 */
export function showcaseImageUrl(picture: ShowcasePicture): string {
  return `${environment.promoBaseUrl.replace(/\/+$/, '')}/gallery/${picture.id}/result.webp`;
}
