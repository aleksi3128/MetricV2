/**
 * Ajouter un aliment à un plat — une porte, puis deux chemins (`NUT-23`, `UI-07`).
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
 * Une porte, donc, et les chemins déclarés derrière elle : le catalogue et le code-barres.
 *
 * **Ce que ça coûte** : un appui de plus pour scanner. C'est le prix d'un vocabulaire
 * unique, et il se paie une fois par aliment neuf plutôt qu'à chaque aliment connu.
 *
 * ## La saisie à la main a quitté cette étape
 *
 * Elle y était le troisième chemin, sous la liste. Elle en est **retirée à la demande de
 * l'utilisateur** : deux aliments sur trois se reprennent au catalogue, le reste se scanne,
 * et la porte se payait à chaque ouverture en hauteur prise à la liste.
 *
 * **Ce que ça coûte, et il faut le dire** : un aliment sans code-barres que le catalogue
 * ignore — le riz en vrac, les œufs, les légumes du marché — ne s'ajoute plus directement
 * à un plat. Il reste deux chemins vers lui, et aucun n'est ici : un code-barres **inconnu**
 * ouvre toujours « Ajouter cet aliment à la main » dans `ScanStep`, et `/nutrition/catalogue`
 * crée l'entrée une fois pour toutes — après quoi l'aliment est dans la liste ci-dessous.
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
 * Douze lignes au plus. Le compte de ce qui n'est pas montré est écrit : une liste tronquée
 * en silence fait croire qu'un aliment a disparu du catalogue.
 *
 * Le plafond répondait d'abord à la mise en page — un catalogue de deux cents aliments
 * repoussait la saisie à la main et le retour à un écran et demi de défilement. C'est
 * `.pickZone` qui en répond maintenant : les deux chemins restants ne quittent plus le bas
 * de la feuille. Il reste pour ce qu'il dit en propre — deux cents lignes à faire défiler
 * ne sont pas une liste, c'est une botte de foin, et le compte des autres invite au geste
 * qui la réduit vraiment, préciser la recherche.
 *
 * ## Ce qui bouge, et ce qui ne bouge plus (`UI-07`)
 *
 * La feuille se redimensionnait à chaque caractère tapé : douze lignes pour le catalogue
 * entier, deux pour « riz ». Le panneau sautait donc sous le pouce entre deux appuis, et la
 * cible visée n'était plus là où on l'avait vue. La hauteur est tenue par `Sheet`, et
 * l'étape la remplit : le viseur et la recherche en haut, les deux chemins en bas, la liste
 * qui défile entre eux. Rien ici ne décide de sa propre hauteur.
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
  onBack,
}: {
  catalogue: readonly Ingredient[];
  /** Un aliment du catalogue : sa ligne arrive remplie, il ne reste que le poids. */
  onPick: (ingredient: Ingredient) => void;
  /** Un produit lu par le viseur réduit — même destination qu'un scan du viseur plein. */
  onProduct: (product: Product) => void;
  /** Déplier le viseur plein : c'est ce que le viseur réduit fait quand on le touche. */
  onScan: () => void;
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

      {/* **La zone qui défile, de hauteur constante** (`UI-07`).

          La liste raccourcit à chaque caractère tapé, et c'est ce qui faisait le plus
          bouger la feuille : douze lignes pour un catalogue entier, deux pour « riz », et
          le panneau se redimensionnait sous le pouce entre deux appuis. Le champ de
          recherche remontait donc pendant qu'on y tapait, et le retour avec lui.

          Un conteneur à part plutôt que `flex: 1` sur chacun des trois états : le vide du
          catalogue et la recherche sans résultat doivent occuper la **même** place que la
          liste, sinon la feuille rebouge à l'instant précis où l'on cherche un aliment
          qu'elle ne connaît pas. */}
      <div className={styles.pickZone}>
        {/* Trois états ici, et le troisième n'est pas le second : un catalogue vide et une
            recherche sans résultat ne se réparent pas du même geste. */}
        {catalogue.length === 0 ? (
          <p className={styles.empty}>
            Ton catalogue est vide. Un aliment scanné y entre tout seul après le repas ; d’ici là,
            le code-barres et la saisie à la main suffisent.
          </p>
        ) : shown.length === 0 ? (
          <p className={styles.empty}>
            Aucun aliment ne porte ce nom. Scanne-le, ou saisis-le à la main — il entrera au
            catalogue avec le repas.
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
      </div>

      {/* La sortie, et elle seule. « Saisir à la main » était ici — voir l'en-tête pour
          ce que son retrait coûte et par où la saisie à la main passe désormais. Le
          conteneur reste : il tient le bas de l'étape, et c'est ce qui permet à la liste
          de défiler entre lui et la recherche. */}
      <div className={styles.pickActions}>
        <Button variant="quiet" onClick={onBack}>
          Retour
        </Button>
      </div>
    </div>
  );
}
