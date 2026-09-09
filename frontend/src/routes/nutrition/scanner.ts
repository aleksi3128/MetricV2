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

/** La caméra est-elle seulement joignable ici ?
 *
 * Faux hors contexte sécurisé — `http://` sur une adresse de réseau local, ce qu'est
 * `make dev-lan`. Ce n'est pas une panne : c'est une règle du navigateur, et la surface
 * de scan doit le dire plutôt que d'échouer sans expliquer.
 */
export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined;
}
