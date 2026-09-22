/**
 * Scanner un aliment : la caméra, la boucle de décodage, et le produit au bout (`NUT-27`).
 *
 * ## Pourquoi un hook plutôt qu'un composant
 *
 * Deux surfaces scannent désormais. Le viseur **réduit** de l'étape de choix, qui part dès
 * qu'on ouvre « Ajouter un aliment », et le viseur **plein** qu'un appui dessus déplie.
 * Ce sont deux mises en page d'une seule mécanique : ouvrir la caméra, décoder cinq images
 * par seconde, couper le flux, demander le produit.
 *
 * Écrire cette mécanique deux fois aurait donné deux boucles, deux façons de relâcher le
 * flux et, tôt ou tard, une caméra laissée allumée dans l'une des deux. C'est la même
 * raison qui fait qu'il n'y a qu'un `lib/swipe.ts`.
 *
 * ## Le flux s'arrête, toujours
 *
 * Une caméra laissée allumée ne se voit pas dans l'application : elle se voit à la pastille
 * de l'iPhone, longtemps après. Le flux est coupé au **démontage** et **dès qu'un code est
 * lu**, avant même que la réponse du serveur arrive.
 *
 * Le démontage suffit, et c'est vérifié plutôt que supposé : `Sheet` rend `null` quand il
 * est fermé, et `MealSheet` ne rend l'étape de choix que pendant qu'elle est à l'écran.
 * Fermer la feuille, changer d'étape ou ouvrir une fiche démonte donc la surface, et le
 * nettoyage de l'effet relâche la piste.
 *
 * ## Ce que la boucle donne à décoder
 *
 * La fenêtre de visée seule, portée à `ANALYSIS_WIDTH`. Le raisonnement, les mesures et la
 * géométrie sont en tête d'`analysisRect` : à 640 px sur l'image entière, un code occupant
 * 18 % du cadre échouait même parfaitement net.
 */

import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { nutritionApi, type Product } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';

import { analysisRect, cameraAvailable, readBarcode, warmUp } from './scanner';

/**
 * Intervalle entre deux lectures d'image.
 *
 * Décoder soixante images par seconde ne trouve pas un code plus vite — il faut le temps
 * de bouger la main — et chauffe le téléphone pendant qu'on cadre.
 */
const INTERVAL_MS = 160;

/**
 * Largeur d'analyse, sur la **fenêtre de visée** et non sur l'image entière.
 *
 * C'était 640 px sur l'image entière, avec pour commentaire « au-delà, `zbar` travaille
 * plus longtemps sans mieux lire ». Le banc dit le contraire : à 640 px, tout code
 * occupant 18 % ou moins de la largeur du cadre échouait, **même parfaitement net** — la
 * réduction jetait les barres avant le décodeur.
 *
 * Ce que ça rapporte, sur ces mêmes scènes : 9/18 → **15/18** net, 9/18 → **14/18**
 * légèrement flou. Ce que ça coûte : 32,7 ms par image contre 11,4, mesuré sur la machine
 * de développement, à doubler sur un téléphone. Sur un cycle de 160 ms, c'est un quart du
 * temps au lieu d'un quinzième — et on ne cadre que quelques secondes.
 */
const ANALYSIS_WIDTH = 1024;

export interface Scanner {
  /** La caméra tourne-t-elle ? Faux avant l'autorisation, après un code lu, après un refus. */
  scanning: boolean;
  /** Ce qui empêche la caméra, en français, ou `null`. */
  cameraError: string | null;
  /** `null` quand la piste ne déclare pas de lampe : la bascule ne s'affiche pas. */
  torch: boolean | null;
  toggleTorch: () => void;
  /** Rallumer après un code lu ou une erreur. */
  restart: () => void;
  /** Une recherche de produit est en cours. */
  pending: boolean;
  error: ApiError | null;
  /** Chercher un code saisi à la main — la seconde porte. */
  lookUp: (barcode: string) => void;
  /** Le dernier code lu ou saisi, pour le montrer dans le champ. */
  code: string;
  setCode: (value: string) => void;
}

/**
 * **La référence du `<video>` vient de la surface**, elle n'est pas rendue par le hook.
 *
 * Un objet qui mélange une référence et des valeurs de rendu fait tomber la règle
 * `react-hooks` sur les références lues pendant le rendu — et elle a raison sur le fond :
 * l'élément appartient à la mise en page, le hook ne fait que le piloter. Les deux
 * surfaces déclarent donc leur propre `useRef`, et ce qui revient d'ici ne contient que
 * des valeurs qu'un rendu peut lire.
 */
export function useScanner({
  videoRef,
  onProduct,
}: {
  /** Nommée `…Ref` à dessein : c'est ce qui dit au compilateur React que sa cible se mute. */
  videoRef: RefObject<HTMLVideoElement | null>;
  onProduct: (product: Product) => void;
}): Scanner {
  const stream = useRef<MediaStream | null>(null);

  const [scanning, setScanning] = useState(cameraAvailable());
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // La lampe : proposée seulement si la piste vidéo la déclare. Une cible qui ne fait rien
  // est pire que pas de cible — et sur la moitié des appareils, `torch` n'existe pas.
  const [torch, setTorch] = useState<boolean | null>(null);

  const look = useMutation({
    mutationFn: (barcode: string) => nutritionApi.product(barcode),
    onSuccess: onProduct,
  });

  /**
   * Ce que la boucle fait d'un code lu. Une référence, et non la valeur : la boucle vit
   * dans un effet qui ne se rejoue qu'au démarrage de la caméra, et lirait sinon la
   * mutation du premier rendu. Même parade que `Sheet` avec son `onClose`.
   */
  const found = useRef<(barcode: string) => void>(() => undefined);
  useEffect(() => {
    found.current = (barcode: string) => {
      setCode(barcode);
      setScanning(false);
      look.mutate(barcode);
    };
  });

  useEffect(() => {
    if (!scanning) return;

    let stopped = false;
    let timer: number | undefined;
    const canvas = document.createElement('canvas');

    function release(): void {
      stream.current?.getTracks().forEach((track) => {
        track.stop();
      });
      stream.current = null;
    }

    async function tick(): Promise<void> {
      const element = videoRef.current;
      // Les toutes premières images n'ont pas encore de dimensions : la caméra vient de
      // s'ouvrir. Ce n'est pas un échec, on repasse.
      if (stopped || element === null || element.videoWidth === 0) {
        schedule();
        return;
      }

      // La fenêtre de visée, dans les pixels de la source. Le rectangle dessiné est posé
      // sur ce qu'on **voit** — une vidéo en `object-fit: cover` est rognée — donc la
      // géométrie part de la taille de l'élément autant que de celle du flux.
      const box = element.getBoundingClientRect();
      const rect = analysisRect(
        { width: element.videoWidth, height: element.videoHeight },
        { width: box.width, height: box.height },
      );

      canvas.width = ANALYSIS_WIDTH;
      canvas.height = Math.round((rect.sh * ANALYSIS_WIDTH) / rect.sw);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return;

      context.drawImage(
        element,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);

      let barcode: string | null;
      try {
        barcode = await readBarcode(frame);
      } catch {
        // Un décodeur qui ne se charge pas ne doit pas emporter la surface : le champ des
        // chiffres reste, et c'est lui qui garantit qu'on peut toujours ajouter l'aliment.
        stopped = true;
        release();
        setCameraError('Le lecteur de codes-barres n’a pas pu démarrer. Saisis le code à la main.');
        setScanning(false);
        return;
      }

      if (stopped) return;
      if (barcode === null) {
        schedule();
        return;
      }

      stopped = true;
      release();
      found.current(barcode);
    }

    function schedule(): void {
      if (stopped) return;
      timer = window.setTimeout(() => {
        void tick();
      }, INTERVAL_MS);
    }

    async function start(): Promise<void> {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          // `ideal` et non `exact` : sur un ordinateur portable il n'y a pas de caméra
          // arrière, et `exact` y ferait échouer un scan qui marcherait très bien.
          //
          // **1920 et non 1280**, et seulement parce que la largeur d'analyse a suivi : le
          // banc donne 9/18 pour `1920 → 640`, exactement comme `1280 → 640`. Une source
          // plus fine ne sert à rien si on la jette au rééchantillonnage.
          //
          // Le 4/3 est demandé pour la même raison que le cadre est en 4/3 : un flux 16/9
          // affiché en `cover` perd ses bords, et ces pixels-là sont décodés pour rien.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        if (stopped) {
          media.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        stream.current = media;
        if (videoRef.current !== null) {
          videoRef.current.srcObject = media;
          await videoRef.current.play();
        }

        const track = media.getVideoTracks()[0];
        if (track !== undefined) {
          // **L'autofocus continu, là où il existe.** Le flou est l'autre moitié des
          // échecs, et aucun traitement d'image ne le rattrape. Sans effet sur iPhone —
          // Safari n'expose pas `focusMode`, et l'autofocus y est déjà continu — mais
          // gagnant sur Android, où la mise au point reste sinon là où elle était.
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as never);
          } catch {
            // Contrainte inconnue de ce navigateur : la caméra tourne quand même.
          }
          // La lampe, seulement si la piste la déclare.
          const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
          setTorch(capabilities?.torch === true ? false : null);
        }
        // Charger le décodeur pendant qu'on cadre, et non au premier code : sans cela, la
        // première image utile attend un téléchargement de 233 Ko.
        //
        // **Le rejet est avalé, et c'est délibéré.** Le préchargement est une avance prise,
        // pas une étape : s'il échoue, la boucle réessaiera au premier décodage et c'est
        // *elle* qui le dira à l'utilisateur. Sans ce `catch`, un décodeur injoignable
        // partait en rejet non capté — vu d'abord dans la console de la batterie, ce qui
        // veut dire qu'un navigateur hors ligne l'aurait affiché pareil.
        warmUp().catch(() => undefined);
        schedule();
      } catch (error) {
        const denied = error instanceof DOMException && error.name === 'NotAllowedError';
        setCameraError(
          denied
            ? 'La caméra est refusée pour ce site. Saisis le code à la main, ou autorise-la dans les réglages du navigateur.'
            : 'La caméra n’est pas disponible ici. Saisis le code à la main.',
        );
        setScanning(false);
      }
    }

    void start();

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      release();
    };
    // `videoRef` en dépendance : c'est une référence, elle ne change jamais d'identité —
    // mais la déclarer évite d'avoir à expliquer son absence à chaque relecture.
  }, [scanning, videoRef]);

  /**
   * Allumer ou éteindre la lampe de la caméra.
   *
   * Un placard sombre et un emballage mat suffisent à faire échouer un scan qu'aucune
   * résolution ne rattrape. La bascule n'existe que si la piste a déclaré `torch` : une
   * cible qui ne fait rien est pire que pas de cible.
   */
  const toggleTorch = useCallback((): void => {
    const track = stream.current?.getVideoTracks()[0];
    if (track === undefined) return;
    setTorch((current) => {
      if (current === null) return null;
      const next = !current;
      track.applyConstraints({ advanced: [{ torch: next }] } as never).catch(() => {
        // Refusée en cours de route — certaines caméras ne l'acceptent qu'au démarrage. On
        // retire la bascule plutôt que de laisser une cible qui ne répond pas.
        setTorch(null);
      });
      return next;
    });
  }, []);

  const restart = useCallback((): void => {
    look.reset();
    setCameraError(null);
    setScanning(true);
  }, [look]);

  return {
    scanning,
    cameraError,
    torch,
    toggleTorch,
    restart,
    pending: look.isPending,
    error: look.error instanceof ApiError ? look.error : null,
    lookUp: (barcode: string) => {
      look.mutate(barcode);
    },
    code,
    setCode,
  };
}
