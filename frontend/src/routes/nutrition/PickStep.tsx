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
 * ## L'ordre des trois
 *
 * Le **scan en tête**, au-dessus même de la recherche : c'est le geste qu'on vient faire
 * en connaissance de cause — on a l'emballage en main — et non celui qu'on prend faute de
 * mieux. C'est aussi la place qu'il occupe déjà dans `AddFoodSheet`, et deux surfaces qui
 * ajoutent un aliment n'ont pas à ranger leurs chemins dans deux ordres différents.
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

import { useState } from 'react';

import { Button, Field, SheetRow } from '@/components/ui';
import type { Ingredient } from '@/features/nutrition/api';
import { integer } from '@/lib/format';
import { fold } from '@/lib/text';

import styles from '../Nutrition.module.css';

/** Voir l'en-tête : au-delà, les deux autres chemins sortent de l'écran. */
const SHOWN = 12;

export function PickStep({
  catalogue,
  onPick,
  onScan,
  onManual,
  onBack,
}: {
  catalogue: readonly Ingredient[];
  /** Un aliment du catalogue : sa ligne arrive remplie, il ne reste que le poids. */
  onPick: (ingredient: Ingredient) => void;
  onScan: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');

  const needle = fold(query.trim());
  const matching =
    needle === '' ? catalogue : catalogue.filter((item) => fold(item.name).includes(needle));
  const shown = matching.slice(0, SHOWN);
  const hidden = matching.length - shown.length;

  return (
    <div className={styles.pick}>
      {/* **Le scan en tête.** Il était sous la liste, avec les deux autres actions : c'est
          pourtant le geste qui demande de sortir un emballage et de viser, celui qu'on
          vient faire en connaissance de cause plutôt qu'après avoir cherché. Le mettre en
          premier aligne aussi cette étape sur `AddFoodSheet`, où il occupe déjà cette
          place — deux surfaces qui ajoutent un aliment n'ont pas à ranger leurs chemins
          dans deux ordres différents. */}
      <Button variant="ghost" onClick={onScan}>
        Scanner un code-barres
      </Button>

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
