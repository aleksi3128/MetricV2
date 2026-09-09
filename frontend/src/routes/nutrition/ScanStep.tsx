/**
 * Scanner un aliment — l'étape qui prend la feuille, et qui la rend (`NUT-13`).
 *
 * ## Une étape, et non une feuille par-dessus la feuille
 *
 * Deux `Sheet` empilées partageraient trois choses, et chacune casse : l'écouteur `Échap`
 * posé sur `document` — une touche fermerait le scanner **et** la saisie du repas, dans un
 * projet qui n'a aucune annulation ; le verrou `body { overflow: hidden }`, dont les deux
 * restaurations se croisent au démontage ; et la restitution du focus, qui s'exécute deux
 * fois dans un ordre dépendant du démontage.
 *
 * L'étape n'a aucun de ces problèmes, et rend exactement le geste attendu : une surface
 * qui s'ouvre, qui se referme, et qui ramène là où on était.
 *
 * ## Deux portes, et la caméra n'est pas la seule
 *
 * C'est la règle du dépôt — *un geste n'est jamais la seule porte*. Le champ des chiffres
 * est toujours là, sous le viseur. Il sert le code effacé, l'emballage déjà jeté, la
 * caméra refusée, `make dev-lan` en clair (où le navigateur interdit la caméra hors
 * contexte sécurisé), et la vérification automatisée, qui n'a pas d'objectif.
 *
 * ## Le flux s'arrête, toujours
 *
 * Une caméra laissée allumée ne se voit pas dans l'application : elle se voit à la pastille
 * de l'iPhone, longtemps après. Le flux est donc coupé au démontage, à la sortie de
 * l'étape, et dès qu'un code est lu — avant même que la réponse du serveur arrive.
 */

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Button, Field } from '@/components/ui';
import { nutritionApi, type Product } from '@/features/nutrition/api';
import { ApiError } from '@/lib/api';

import styles from '../Nutrition.module.css';
import { cameraAvailable, readBarcode, warmUp } from './scanner';

/** Intervalle entre deux lectures d'image.
 *
 * Décoder soixante images par seconde ne trouve pas un code plus vite — il faut le temps
 * de bouger la main — et chauffe le téléphone pendant qu'on cadre.
 */
const INTERVAL_MS = 160;

/** Largeur d'analyse. Au-delà, `zbar` travaille plus longtemps sans mieux lire. */
const ANALYSIS_WIDTH = 640;

export function ScanStep({
  onBack,
  onFound,
  onManual,
}: {
  onBack: () => void;
  onFound: (product: Product) => void;
  /** « Ajouter à la main » — la suite que promet le message d'un produit inconnu. */
  onManual: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [scanning, setScanning] = useState(cameraAvailable());
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const look = useMutation({
    mutationFn: (barcode: string) => nutritionApi.product(barcode),
    onSuccess: onFound,
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
      const element = video.current;
      // Les toutes premières images n'ont pas encore de dimensions : la caméra vient de
      // s'ouvrir. Ce n'est pas un échec, on repasse.
      if (stopped || element === null || element.videoWidth === 0) {
        schedule();
        return;
      }

      const scale = ANALYSIS_WIDTH / element.videoWidth;
      canvas.width = ANALYSIS_WIDTH;
      canvas.height = Math.round(element.videoHeight * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return;

      context.drawImage(element, 0, 0, canvas.width, canvas.height);
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
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
        if (stopped) {
          media.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        stream.current = media;
        if (video.current !== null) {
          video.current.srcObject = media;
          await video.current.play();
        }
        // Charger le décodeur pendant qu'on cadre, et non au premier code : sans cela, la
        // première image utile attend un téléchargement de 233 Ko.
        void warmUp();
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
  }, [scanning]);

  const error = look.error instanceof ApiError ? look.error : null;
  const unknown = error?.code === 'product_not_found';

  return (
    <div className={styles.scan}>
      {scanning ? (
        <div className={styles.viewfinder}>
          <video ref={video} className={styles.video} playsInline muted autoPlay />
          {/* Le viseur ne mesure rien et ne cadre rien pour de bon : `zbar` lit l'image
              entière. Il dit où viser, ce qui suffit à rendre le geste sûr. */}
          <span className={styles.target} aria-hidden="true" />
          <p className={styles.scanHint}>Vise le code-barres de l’emballage.</p>
        </div>
      ) : (
        cameraError !== null && <p className={styles.note}>{cameraError}</p>
      )}

      {look.isPending && <p className={styles.note}>Recherche du produit…</p>}

      {error !== null && (
        <div className={styles.scanError}>
          <p className={styles.error} role="alert">
            {error.message}
          </p>
          {unknown && (
            <Button variant="ghost" onClick={onManual}>
              Ajouter cet aliment à la main
            </Button>
          )}
        </div>
      )}

      <form
        className={styles.scanForm}
        onSubmit={(event) => {
          event.preventDefault();
          look.mutate(code.trim());
        }}
        noValidate
      >
        <Field
          label="Code-barres"
          inputMode="numeric"
          autoComplete="off"
          placeholder="3017620422003"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
        <Button type="submit" variant="ghost" busy={look.isPending} disabled={code.trim() === ''}>
          Chercher ce code
        </Button>
      </form>

      <div className={styles.scanActions}>
        {!scanning && cameraAvailable() && (
          <Button
            variant="quiet"
            onClick={() => {
              look.reset();
              setCameraError(null);
              setScanning(true);
            }}
          >
            Scanner à nouveau
          </Button>
        )}
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    </div>
  );
}
