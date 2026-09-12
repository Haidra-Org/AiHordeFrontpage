import { environment } from '../../environments/environment';
import { PromoGalleryImage } from '../types/promo-gallery';

/**
 * The pictures the home page leads with.
 *
 * Every one is from the published promo gallery, made on the horde from the
 * prompt it carries, so a tile is both evidence and an offer: pressing it shows
 * the prompt, and pressing that opens the studio with it already written. The
 * list is hand-written rather than fetched because the home page is prerendered
 * and the gallery's own index refuses cross-origin reads from a development
 * origin; every field but the two below is copied verbatim from the gallery
 * manifest, which is what lets a tile hand the picture dialog the same record
 * the gallery page would.
 */
export interface ShowcasePicture extends PromoGalleryImage {
  /** Two to four words for the picture, shown in the caption. */
  title: string;
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
    subject: 'snail',
    file: 'gallery/snail-cathedral/result.webp',
    prompt:
      'a snail whose shell is a gothic cathedral with lit stained-glass windows, crawling through a garden at dusk',
    model: 'AlbedoBase XL 3.1',
    seed: '43002',
    tags: ['whimsy'],
    seconds: 54.5,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a snail whose shell is a gothic cathedral with lit stained-glass windows, crawling through a garden at dusk',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43002',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'whale-library',
    title: 'Whale library',
    subject: 'whale',
    file: 'gallery/whale-library/result.webp',
    prompt:
      'the inside of a whale as a public library, bookshelves along the ribs, readers in armchairs, warm lamplight',
    model: 'Cheyenne',
    seed: '43005',
    tags: ['whimsy'],
    seconds: 116.2,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'the inside of a whale as a public library, bookshelves along the ribs, readers in armchairs, warm lamplight',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43005',
      },
      models: ['Cheyenne'],
      nsfw: false,
    },
  },
  {
    id: 'moon-laundry',
    title: 'Laundry on the moon',
    subject: 'astronaut',
    file: 'gallery/moon-laundry/result.webp',
    prompt:
      'an astronaut hanging laundry on a line strung between two craters, Earth rising behind, photograph',
    model: 'Flux.1-Schnell fp8 (Compact)',
    seed: '43006',
    tags: ['whimsy', 'flux', 'photo'],
    seconds: 135.9,
    kudos: 84,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'an astronaut hanging laundry on a line strung between two craters, Earth rising behind, photograph',
      params: {
        width: 1024,
        height: 1024,
        steps: 4,
        cfg_scale: 1,
        sampler_name: 'k_euler',
        karras: true,
        n: 1,
        seed: '43006',
        clip_skip: 1,
      },
      models: ['Flux.1-Schnell fp8 (Compact)'],
      nsfw: false,
    },
  },
  {
    id: 'umbrella-jellyfish',
    title: 'Umbrella jellyfish',
    subject: 'jellyfish',
    file: 'gallery/umbrella-jellyfish/result.webp',
    prompt:
      'jellyfish made of open umbrellas drifting through a rainy city street at night, neon reflections',
    model: 'AlbedoBase XL 3.1',
    seed: '43012',
    tags: ['whimsy'],
    seconds: 66,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'jellyfish made of open umbrellas drifting through a rainy city street at night, neon reflections',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43012',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'tram-on-rainbow',
    title: 'Tram on a rainbow',
    subject: 'tram',
    file: 'gallery/tram-on-rainbow/result.webp',
    prompt:
      'a vintage tram running along a rainbow over a valley, passengers waving, painting',
    model: 'AlbedoBase XL 3.1',
    seed: '43016',
    tags: ['whimsy', 'art'],
    seconds: 79.9,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a vintage tram running along a rainbow over a valley, passengers waving, painting',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43016',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'fox-fishing-stars',
    title: 'Fox fishing for stars',
    subject: 'fox',
    file: 'gallery/fox-fishing-stars/result.webp',
    prompt:
      'a fox fishing for stars from a wooden boat on a lake that reflects the night sky, illustration',
    model: 'Cheyenne',
    seed: '43042',
    tags: ['whimsy', 'art'],
    seconds: 194,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a fox fishing for stars from a wooden boat on a lake that reflects the night sky, illustration',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43042',
      },
      models: ['Cheyenne'],
      nsfw: false,
    },
  },
  {
    id: 'floating-market-sky',
    title: 'Market in the sky',
    subject: 'boats',
    file: 'gallery/floating-market-sky/result.webp',
    prompt:
      'a floating market of boats drifting through the sky between clouds, lanterns, painting',
    model: 'Stable Cascade 1.0',
    seed: '43078',
    tags: ['whimsy', 'art'],
    seconds: 205.1,
    kudos: 71,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a floating market of boats drifting through the sky between clouds, lanterns, painting',
      params: {
        width: 1024,
        height: 1024,
        steps: 24,
        cfg_scale: 4,
        sampler_name: 'k_euler_a',
        karras: false,
        n: 1,
        seed: '43078',
      },
      models: ['Stable Cascade 1.0'],
      nsfw: false,
    },
  },
  {
    id: 'owl-tram-driver',
    title: 'Owl tram driver',
    subject: 'owl',
    file: 'gallery/owl-tram-driver/result.webp',
    prompt:
      "an owl in a conductor's cap driving a night tram through a snowy town, warm windows, illustration",
    model: 'AlbedoBase XL 3.1',
    seed: '43025',
    tags: ['whimsy', 'art'],
    seconds: 53.8,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        "an owl in a conductor's cap driving a night tram through a snowy town, warm windows, illustration",
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43025',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'hedgehog-hot-air',
    title: 'Hedgehog aeronaut',
    subject: 'hedgehog',
    file: 'gallery/hedgehog-hot-air/result.webp',
    prompt:
      'a hedgehog piloting a dandelion seed like a hot air balloon over a meadow, macro illustration',
    model: 'AlbedoBase XL 3.1',
    seed: '43063',
    tags: ['whimsy', 'art'],
    seconds: 46.7,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a hedgehog piloting a dandelion seed like a hot air balloon over a meadow, macro illustration',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43063',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
];

/** The rest of the gallery, which rotates into the tiles over time. */
export const HOME_SHOWCASE_REST: readonly ShowcasePicture[] = [
  {
    id: 'cat-air-traffic',
    title: 'Cat air traffic control',
    subject: 'cat',
    file: 'gallery/cat-air-traffic/result.webp',
    prompt:
      'a cat in a control tower directing paper airplanes with glowing batons, night, cinematic',
    model: 'Juggernaut XL',
    seed: '43013',
    tags: ['whimsy'],
    seconds: 176.3,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a cat in a control tower directing paper airplanes with glowing batons, night, cinematic',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43013',
      },
      models: ['Juggernaut XL'],
      nsfw: false,
    },
  },
  {
    id: 'origami-wolf-pack',
    title: 'Origami wolves',
    subject: 'wolves',
    file: 'gallery/origami-wolf-pack/result.webp',
    prompt:
      'a pack of origami wolves howling at a paper moon in a folded-paper forest, studio light',
    model: 'AlbedoBase XL 3.1',
    seed: '43017',
    tags: ['whimsy'],
    seconds: 79.7,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a pack of origami wolves howling at a paper moon in a folded-paper forest, studio light',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43017',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'tortoise-city',
    title: 'City on a tortoise',
    subject: 'tortoise',
    file: 'gallery/tortoise-city/result.webp',
    prompt:
      'a giant tortoise with a walled medieval city on its shell, crossing a river at dawn, matte painting',
    model: 'Cheyenne',
    seed: '43018',
    tags: ['whimsy', 'art'],
    seconds: 195.6,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a giant tortoise with a walled medieval city on its shell, crossing a river at dawn, matte painting',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43018',
      },
      models: ['Cheyenne'],
      nsfw: false,
    },
  },
  {
    id: 'bear-cafe',
    title: 'Bear cafe',
    subject: 'bear',
    file: 'gallery/bear-cafe/result.webp',
    prompt:
      'a brown bear in an apron serving espresso to squirrels at a tiny forest cafe, morning light, photograph',
    model: 'Juggernaut XL',
    seed: '43019',
    tags: ['whimsy', 'photo'],
    seconds: 77.8,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a brown bear in an apron serving espresso to squirrels at a tiny forest cafe, morning light, photograph',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43019',
      },
      models: ['Juggernaut XL'],
      nsfw: false,
    },
  },
  {
    id: 'goldfish-in-lightbulb',
    title: 'Goldfish in a lightbulb',
    subject: 'goldfish',
    file: 'gallery/goldfish-in-lightbulb/result.webp',
    prompt:
      'a goldfish swimming inside a lit lightbulb hanging in a dark workshop, macro photograph',
    model: 'Juggernaut XL',
    seed: '43035',
    tags: ['whimsy', 'photo'],
    seconds: 199.9,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a goldfish swimming inside a lit lightbulb hanging in a dark workshop, macro photograph',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43035',
      },
      models: ['Juggernaut XL'],
      nsfw: false,
    },
  },
  {
    id: 'bookshelf-canyon',
    title: 'Bookshelf canyon',
    subject: 'hikers',
    file: 'gallery/bookshelf-canyon/result.webp',
    prompt:
      'hikers walking through a canyon whose walls are towering bookshelves, shafts of light, matte painting',
    model: 'Cheyenne',
    seed: '43036',
    tags: ['whimsy', 'art'],
    seconds: 196.8,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'hikers walking through a canyon whose walls are towering bookshelves, shafts of light, matte painting',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43036',
      },
      models: ['Cheyenne'],
      nsfw: false,
    },
  },
  {
    id: 'lantern-fish-city',
    title: 'Lantern-fish city',
    subject: 'lanterns',
    file: 'gallery/lantern-fish-city/result.webp',
    prompt:
      'a city at night lit entirely by giant floating lantern-fish, people walking under them',
    model: 'AlbedoBase XL 3.1',
    seed: '43054',
    tags: ['whimsy'],
    seconds: 25.2,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a city at night lit entirely by giant floating lantern-fish, people walking under them',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43054',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'lighthouse-in-teacup',
    title: 'Lighthouse in a teacup',
    subject: 'lighthouse',
    file: 'gallery/lighthouse-in-teacup/result.webp',
    prompt:
      'a working lighthouse standing in a teacup on a windowsill, beam sweeping the room, night',
    model: 'DreamShaper XL',
    seed: '43081',
    tags: ['whimsy'],
    seconds: 203.7,
    kudos: 30,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a working lighthouse standing in a teacup on a windowsill, beam sweeping the room, night',
      params: {
        width: 1024,
        height: 1024,
        steps: 5,
        cfg_scale: 2,
        sampler_name: 'k_dpmpp_sde',
        karras: true,
        n: 1,
        seed: '43081',
      },
      models: ['DreamShaper XL'],
      nsfw: false,
    },
  },
  {
    id: 'piano-forest',
    title: 'Piano in the forest',
    subject: 'piano',
    file: 'gallery/piano-forest/result.webp',
    prompt:
      'a grand piano growing out of a forest floor like a tree, roots and moss, a fox playing it',
    model: 'AlbedoBase XL 3.1',
    seed: '43008',
    tags: ['whimsy'],
    seconds: 49.5,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a grand piano growing out of a forest floor like a tree, roots and moss, a fox playing it',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43008',
      },
      models: ['AlbedoBase XL 3.1'],
      nsfw: false,
    },
  },
  {
    id: 'submarine-desert',
    title: 'Submarine in the dunes',
    subject: 'submarine',
    file: 'gallery/submarine-desert/result.webp',
    prompt:
      'a yellow submarine surfacing through sand dunes, camels watching, midday, photograph',
    model: 'Juggernaut XL',
    seed: '43010',
    tags: ['whimsy', 'photo'],
    seconds: 155.7,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a yellow submarine surfacing through sand dunes, camels watching, midday, photograph',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43010',
      },
      models: ['Juggernaut XL'],
      nsfw: false,
    },
  },
  {
    id: 'ship-in-bottle-sea',
    title: 'Ship in a bottle',
    subject: 'ship',
    file: 'gallery/ship-in-bottle-sea/result.webp',
    prompt:
      'a full-size sailing ship sealed in a giant glass bottle floating on a real sea, photograph',
    model: 'Juggernaut XL',
    seed: '43049',
    tags: ['whimsy', 'photo'],
    seconds: 219.2,
    kudos: 39,
    width: 1024,
    height: 1024,
    request: {
      prompt:
        'a full-size sailing ship sealed in a giant glass bottle floating on a real sea, photograph',
      params: {
        width: 1024,
        height: 1024,
        steps: 25,
        cfg_scale: 5,
        sampler_name: 'k_dpmpp_2m',
        karras: true,
        n: 1,
        seed: '43049',
      },
      models: ['Juggernaut XL'],
      nsfw: false,
    },
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
  return `${environment.promoBaseUrl.replace(/\/+$/, '')}/${picture.file}`;
}
