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
 * ## Le viseur **plein**, et ce qu'il ajoute au réduit
 *
 * Le scan commence un cran plus tôt, dans l'étape de choix, sur un viseur réduit
 * (`NUT-27`). Celui-ci est ce qu'un appui dessus déplie, et il existe pour deux raisons :
 * **voir pourquoi ça ne lit pas** — un code trop loin, une mise au point qui ne se fait
 * pas, un reflet — et **la seconde porte**, le champ des treize chiffres.
 *
 * ## Deux portes, et la caméra n'est pas la seule
 *
 * C'est la règle du dépôt — *un geste n'est jamais la seule porte*. Le champ des chiffres
 * est toujours là, sous le viseur. Il sert le code effacé, l'emballage déjà jeté, la
 * caméra refusée, `make dev-lan` en clair (où le navigateur interdit la caméra hors
 * contexte sécurisé), et la vérification automatisée, qui n'a pas d'objectif.
 *
 * ## La mécanique n'est pas ici
 *
 * Caméra, boucle de décodage, lampe et recherche du produit vivent dans `useScanner` :
 * deux surfaces s'en servent, et deux copies auraient fini par laisser une caméra allumée
 * dans l'une des deux.
 */

import { useRef } from 'react';

import { Button, Field } from '@/components/ui';
import type { Product } from '@/features/nutrition/api';

import styles from '../Nutrition.module.css';
import { cameraAvailable } from './scanner';
import { useScanner } from './useScanner';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanner = useScanner({ videoRef, onProduct: onFound });
  const unknown = scanner.error?.code === 'product_not_found';

  return (
    <div className={styles.scan}>
      {scanner.scanning ? (
        <div className={styles.viewfinder}>
          <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
          {/* **Le viseur cadre pour de bon depuis `NUT-26`.** Il disait seulement où
              viser ; c'est maintenant cette fenêtre-là qui part au décodeur, avec six
              points de marge tout autour pour ne pas couper les zones de silence d'un code
              qui la remplit. Le cadre et ce qui est lu disent enfin la même chose. */}
          <span className={styles.target} aria-hidden="true" />
          {scanner.torch !== null && (
            <button
              type="button"
              className={styles.torch}
              aria-pressed={scanner.torch}
              aria-label={scanner.torch ? 'Éteindre la lampe' : 'Allumer la lampe'}
              onClick={scanner.toggleTorch}
            >
              {scanner.torch ? 'lampe allumée' : 'lampe'}
            </button>
          )}
          <p className={styles.scanHint}>Vise le code-barres de l’emballage.</p>
        </div>
      ) : (
        scanner.cameraError !== null && <p className={styles.note}>{scanner.cameraError}</p>
      )}

      {scanner.pending && <p className={styles.note}>Recherche du produit…</p>}

      {scanner.error !== null && (
        <div className={styles.scanError}>
          <p className={styles.error} role="alert">
            {scanner.error.message}
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
          scanner.lookUp(scanner.code.trim());
        }}
        noValidate
      >
        <Field
          label="Code-barres"
          inputMode="numeric"
          autoComplete="off"
          placeholder="3017620422003"
          value={scanner.code}
          onChange={(event) => {
            scanner.setCode(event.target.value);
          }}
        />
        <Button
          type="submit"
          variant="ghost"
          busy={scanner.pending}
          disabled={scanner.code.trim() === ''}
        >
          Chercher ce code
        </Button>
      </form>

      <div className={styles.scanActions}>
        {!scanner.scanning && cameraAvailable() && (
          <Button variant="quiet" onClick={scanner.restart}>
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
