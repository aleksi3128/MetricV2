/**
 * Décoder un code-barres, dans le navigateur (`NUT-13`).
 *
 * ## Pourquoi une bibliothèque, alors que le web a une API pour ça
 *
 * `BarcodeDetector` existe — et **WebKit ne l'implémente pas**. Ni Safari, ni Chrome, ni
 * Firefox sur iOS : ils partagent tous le même moteur. Vérifié le 9 septembre 2026 sur
 * caniuse et MDN, qui la classent « disponibilité limitée, hors Baseline ».
 *
 * La cible d'usage de ce projet est un iPhone. S'appuyer dessus aurait donné un scan qui
 * marche sur la machine de développement et **nulle part sur le téléphone** — le pire des
 * défauts, celui qu'aucune capture d'audit ne montre.
 *
 * ## Ce que la dépendance coûte, et pourquoi elle est chargée tard
 *
 * `@undecaf/zbar-wasm` : 233 Ko de WebAssembly et 15 Ko de JavaScript. C'est `zbar`, la
 * bibliothèque de référence pour l'EAN-13 des emballages, compilée. ZXing sait lire trente
 * formats pour un mégaoctet ; vingt-neuf ne serviraient jamais ici.
 *
 * **L'import est dynamique, et c'est la moitié de la décision.** Le module n'est chargé
 * qu'à l'ouverture de la surface de scan : le paquet initial de l'application ne bouge pas
 * d'un octet, et quelqu'un qui ne scanne jamais ne télécharge jamais le décodeur. Le
 * `.wasm` part dans `/assets`, empreinté — le service worker le met donc en cache à la
 * première lecture, comme n'importe quel autre fichier de l'application.
 *
 * ## Ce qu'on accepte de lire
 *
 * Les symbologies alimentaires seulement. `zbar` sait aussi lire du QR et du Code 128 ;
 * viser un colis ou un billet de train rendrait alors une suite de caractères qui partirait
 * vers Open Food Facts pour rien. Filtrer ici évite une requête et un message d'erreur qui
 * n'auraient aucun sens pour qui a simplement mal visé.
 */

// Import de **type seulement** : le module lui-même est chargé plus bas, dynamiquement.
import type * as zbarTypes from '@undecaf/zbar-wasm';

import wasmUrl from '@undecaf/zbar-wasm/dist/zbar.wasm?url';

/** Les symbologies qu'un emballage alimentaire porte. Le reste est ignoré. */
const FOOD_SYMBOLS = new Set(['ZBAR_EAN13', 'ZBAR_EAN8', 'ZBAR_UPCA', 'ZBAR_UPCE', 'ZBAR_ISBN13']);

type ZBar = typeof zbarTypes;

/**
 * Le module, chargé une seule fois.
 *
 * La promesse est mémorisée et non le module : deux appels rapprochés — et il y en a, la
 * boucle de décodage tourne plusieurs fois par seconde — ne doivent pas lancer deux
 * téléchargements.
 */
let loading: Promise<ZBar> | null = null;

async function decoder(): Promise<ZBar> {
  loading ??= (async () => {
    const zbar = await import('@undecaf/zbar-wasm');
    // Sans cela, le module cherche `zbar.wasm` à côté de lui — c'est-à-dire à une adresse
    // qui n'existe pas une fois le bundle empreinté par Vite.
    zbar.setModuleArgs({ locateFile: () => wasmUrl });
    return zbar;
  })();
  return loading;
}

/** Charge le décodeur sans rien décoder — pour que le premier cadrage ne l'attende pas. */
export async function warmUp(): Promise<void> {
  await decoder();
}

/**
 * Le premier code-barres alimentaire de cette image, ou `null`.
 *
 * `null` est le cas **normal** : sur une vidéo, la très grande majorité des images ne
 * porte aucun code lisible. Ce n'est donc pas une erreur, et l'appelant ne fait que
 * réessayer sur l'image suivante.
 */
export async function readBarcode(image: ImageData): Promise<string | null> {
  const zbar = await decoder();
  const symbols = await zbar.scanImageData(image);

  for (const symbol of symbols) {
    if (!FOOD_SYMBOLS.has(symbol.typeName)) continue;
    const value = symbol.decode().trim();
    if (value !== '') return value;
  }
  return null;
}

/**
 * La région de l'image qu'on donne à décoder, en pixels **de la source**.
 *
 * ## Pourquoi on ne lit plus l'image entière
 *
 * La boucle réduisait chaque image à 640 px de large et la passait entière. Mesuré sur un
 * banc d'EAN-13 synthétiques (`zbar` réel, 18 scènes par ligne — taille dans le cadre ×
 * angle) : **tout code occupant 18 % ou moins de la largeur du cadre échouait**, même
 * parfaitement net. La réduction jetait les barres avant que le décodeur les voie. C'est
 * le cas d'un petit code, ou d'un téléphone tenu à distance normale.
 *
 * | ce qu'on décode | net | légèrement flou |
 * |---|---|---|
 * | image entière → 640 px (avant) | 9/18 | 9/18 |
 * | fenêtre → 640 px | 11/18 | 9/18 |
 * | fenêtre → 1024 px | 14/18 | 12/18 |
 * | fenêtre → 1024 px, caméra 1920 (livré) | 15/18 | 14/18 |
 *
 * Demander 1920 à la caméra **ne sert à rien seul** : `1920 → 640` reste à 9/18. Les deux
 * vont ensemble, et c'est la largeur d'analyse qui porte le gain.
 *
 * ## La marge autour du cadre n'est pas une précaution de principe
 *
 * Découper pile sur le rectangle dessiné fait perdre un code qui le remplit à 95 % : ses
 * zones de silence tombent dehors, et `zbar` refuse un symbole sans elles. Vérifié au
 * banc — 76 % de la largeur échoue là où 88 % lit. Le cadre dit **où viser** ; l'analyse
 * prend six points de pourcentage de plus tout autour.
 *
 * Cette marge **coûte** : à 76 %, les mêmes scènes donnaient 16/18 et 15/18. Un point de
 * moins en résolution utile contre un code cadré large qui redevient lisible — l'échec
 * qu'elle évite est celui qu'on produit en visant bien.
 *
 * ## `object-fit: cover`
 *
 * La vidéo est affichée dans un cadre 4/3 qui **rogne** ce qui dépasse. Le rectangle
 * dessiné est posé sur ce qu'on voit, donc sur la partie visible de la source — pas sur la
 * source entière. Sans ce calcul, viser le bord d'un flux 16/9 décoderait une région que
 * personne n'a à l'écran.
 */
export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Le cadre dessiné : `inset: 22% 12%` dans `Nutrition.module.css`. */
const TARGET_INSET_X = 0.12;
const TARGET_INSET_Y = 0.22;

/** Ce que l'analyse prend en plus, de chaque côté. Voir l'en-tête : les zones de silence. */
const MARGIN = 0.06;

export function analysisRect(
  source: { width: number; height: number },
  display: { width: number; height: number },
): Rect {
  // La part de la source réellement visible, une fois `cover` appliqué.
  const displayRatio = display.width / display.height;
  const sourceRatio = source.width / source.height;
  const visibleWidth = sourceRatio > displayRatio ? source.height * displayRatio : source.width;
  const visibleHeight = sourceRatio > displayRatio ? source.height : source.width / displayRatio;
  const visibleX = (source.width - visibleWidth) / 2;
  const visibleY = (source.height - visibleHeight) / 2;

  const insetX = Math.max(0, TARGET_INSET_X - MARGIN);
  const insetY = Math.max(0, TARGET_INSET_Y - MARGIN);

  return {
    sx: visibleX + visibleWidth * insetX,
    sy: visibleY + visibleHeight * insetY,
    sw: visibleWidth * (1 - 2 * insetX),
    sh: visibleHeight * (1 - 2 * insetY),
  };
}

/** La caméra est-elle seulement joignable ici ?
 *
 * Faux hors contexte sécurisé — `http://` sur une adresse de réseau local, ce qu'est
 * `make dev-lan`. Ce n'est pas une panne : c'est une règle du navigateur, et la surface
 * de scan doit le dire plutôt que d'échouer sans expliquer.
 */
export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined;
}
