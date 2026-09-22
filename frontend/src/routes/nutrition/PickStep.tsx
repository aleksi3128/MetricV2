/**
 * Ajouter un aliment à un plat — une porte, puis trois chemins (`NUT-23`).
 *
 * ## Ce qu'il y avait avant, et pourquoi c'était faux
 *
 * Deux boutons côte à côte : **« Ajouter un aliment »**, qui ouvrait la caméra, et
 * **« Ajouter à la main »**, qui posait une ligne vierge. L'ordre disait lequel est le
 * principal, et il disait faux. Passé les premières semaines, le geste quotidien est de
 * reprendre un aliment **déjà connu** — et celui-là n'avait aucune porte à lui : il fallait
 * passer par « à la main », taper le nom, et espérer que le catalogue réponde. Le même
 * libellé, « Ajouter un aliment », désignait par ailleurs une *création d'entrée* sur la
 * page catalogue : deux gestes très différents sous un seul nom.
 *
 * Une porte, donc, et trois chemins déclarés : le catalogue, le code-barres, la main.
 *
 * **Ce que ça coûte** : un appui de plus pour scanner. C'est le prix d'un vocabulaire
 * unique, et il se paie une fois par aliment neuf plutôt qu'à chaque aliment connu.
 *
 * ## Une étape, pas une feuille de plus
 *
 * Le raisonnement complet est en tête de `ScanStep.tsx` et vaut ici mot pour mot : deux
 * `Sheet` empilées partagent l'écouteur `Échap`, le verrou de défilement et la restitution
 * du focus, et chacun des trois casse.
 *
 * ## Le scan a déjà commencé (`NUT-27`)
 *
 * Le code-barres n'est plus un bouton qui mène à une caméra : **la caméra est là**, en
 * tête de l'étape, dans un viseur réduit qui décode dès l'ouverture. Ouvrir « Ajouter un
 * aliment » l'emballage en main suffit donc à le lire — un appui de moins, et surtout plus
 * d'appui à faire *avant* de viser.
 *
 * Le viseur réduit est une **cible** : il déplie le viseur plein (`ScanStep`). C'est là
 * qu'on va quand ça ne lit pas — voir grand ce que la caméra voit, comprendre que le code
 * est trop loin ou que la mise au point ne se fait pas — et c'est là que vit la seconde
 * porte, le champ des treize chiffres.
 *
 * **Sans caméra joignable, le bouton revient.** Un cadre noir qui ne montre rien se lit
 * comme une panne ; un bouton nommé mène à l'étape qui, elle, dit pourquoi la caméra
 * manque. C'est le cas d'un navigateur sans permission, de `make dev-lan` en clair, et de
 * la batterie d'écrans.
 *
 * La **saisie à la main** reste sous la liste : elle est ce qui reste quand ni le
 * catalogue ni un code-barres n'ont répondu.
 *
 * ## La liste est plafonnée, et le dit
 *
 * Douze lignes au plus. Un catalogue de deux cents aliments repousserait sinon la saisie à
 * la main et le retour à un écran et demi de défilement. Le compte de ce qui n'est pas
 * montré est écrit : une liste tronquée en silence fait croire qu'un aliment a disparu du
 * catalogue.
 */

import { useRef, useState } from 'react';

import { Button, Field, SheetRow } from '@/components/ui';
import type { Ingredient, Product } from '@/features/nutrition/api';
import { integer } from '@/lib/format';
import { fold } from '@/lib/text';

import styles from '../Nutrition.module.css';
import { useScanner } from './useScanner';

/** Voir l'en-tête : au-delà, les deux autres chemins sortent de l'écran. */
const SHOWN = 12;

export function PickStep({
  catalogue,
  onPick,
  onProduct,
  onScan,
  onManual,
  onBack,
}: {
  catalogue: readonly Ingredient[];
  /** Un aliment du catalogue : sa ligne arrive remplie, il ne reste que le poids. */
  onPick: (ingredient: Ingredient) => void;
  /** Un produit lu par le viseur réduit — même destination qu'un scan du viseur plein. */
  onProduct: (product: Product) => void;
  /** Déplier le viseur plein : c'est ce que le viseur réduit fait quand on le touche. */
  onScan: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanner = useScanner({ videoRef, onProduct });

  const needle = fold(query.trim());
  const matching =
    needle === '' ? catalogue : catalogue.filter((item) => fold(item.name).includes(needle));
  const shown = matching.slice(0, SHOWN);
  const hidden = matching.length - shown.length;

  return (
    <div className={styles.pick}>
      {/* Le viseur réduit, qui décode déjà. Une **cible** : il déplie le viseur plein.
          Son nom accessible est celui qu'avait le bouton — l'audit des surfaces et les
          tests visent ce nom-là, et il dit toujours ce que la touche fait. */}
      {scanner.scanning ? (
        <button
          type="button"
          className={styles.mini}
          aria-label="Scanner un code-barres"
          onClick={onScan}
        >
          <video ref={videoRef} className={styles.miniVideo} playsInline muted autoPlay />
          <span className={styles.miniTarget} aria-hidden="true" />
          <span className={styles.miniHint}>
            {scanner.pending ? 'recherche du produit…' : 'vise un code-barres · agrandir'}
          </span>
        </button>
      ) : (
        <Button variant="ghost" onClick={onScan}>
          Scanner un code-barres
        </Button>
      )}

      {/* Un code lu qui ne donne rien se dit **ici**, sous le viseur qui l'a lu : renvoyer
          au viseur plein pour lire le message obligerait à comprendre d'abord qu'il s'est
          passé quelque chose. « Réessayer » rallume, puisque la caméra s'est coupée sur le
          code lu. */}
      {scanner.error !== null && (
        <div className={styles.scanError}>
          <p className={styles.error} role="alert">
            {scanner.error.message}
          </p>
          <Button variant="quiet" onClick={scanner.restart}>
            Réessayer
          </Button>
        </div>
      )}

      <Field
        label="Chercher un aliment"
        placeholder="riz"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />

      {/* Trois états ici, et le troisième n'est pas le second : un catalogue vide et une
          recherche sans résultat ne se réparent pas du même geste. */}
      {catalogue.length === 0 ? (
        <p className={styles.empty}>
          Ton catalogue est vide. Un aliment scanné y entre tout seul après le repas ; d’ici là, le
          code-barres et la saisie à la main suffisent.
        </p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>
          Aucun aliment ne porte ce nom. Scanne-le, ou saisis-le à la main — il entrera au catalogue
          avec le repas.
        </p>
      ) : (
        <div className={styles.pickList}>
          {shown.map((item) => (
            <SheetRow
              key={item.id}
              label={item.name}
              // L'indice est une **mesure** qui appartient à la ligne, pas une phrase qui
              // explique un choix : il est donc lu avec le nom, et `aria-label` n'a rien à
              // redéfinir ici (voir `SheetRow`).
              hint={
                item.calories_100g === null
                  ? 'valeurs inconnues'
                  : `${integer(item.calories_100g)} kcal/100 g`
              }
              onClick={() => {
                onPick(item);
              }}
            />
          ))}
          {hidden > 0 && (
            <p className={styles.empty}>
              {hidden === 1
                ? 'Un autre aliment correspond — précise ta recherche.'
                : `${integer(hidden)} autres aliments correspondent — précise ta recherche.`}
            </p>
          )}
        </div>
      )}

      {/* Le dernier chemin, et la sortie. En dessous de la liste : la saisie à la main
          est ce qui reste quand ni le catalogue ni un code-barres n'ont répondu. */}
      <div className={styles.pickActions}>
        <Button variant="quiet" onClick={onManual}>
          Saisir à la main
        </Button>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    </div>
  );
}
