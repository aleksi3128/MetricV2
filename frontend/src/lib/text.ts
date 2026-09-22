/**
 * Replier une chaîne pour la **comparer**, jamais pour la ranger.
 *
 * Chercher « epaules » doit trouver « épaules », et « Développé » se tape rarement avec
 * son accent sur un clavier de téléphone quand on est entre deux séries. La même chose
 * vaut pour « crème fraîche » devant une assiette.
 *
 * **Il ne décide rien.** Il filtre une liste affichée ; c'est `app/core/text.py`, côté
 * serveur, qui décide si deux noms désignent le même exercice ou le même aliment. Les deux
 * se ressemblent et c'est voulu — mais l'un range des pixels, l'autre fusionne un
 * historique de charge, et seul le second a besoin d'être la seule implémentation de sa
 * règle.
 *
 * Il vivait dans `routes/activity/shared.ts`, où seule la recherche des charges s'en
 * servait. Le catalogue d'aliments en a besoin aussi, et importer un module d'`activity`
 * depuis `nutrition` aurait lié deux domaines pour quatre lignes.
 *
 * `Combobox` en garde un **plus strict**, privé : il retire aussi la ponctuation et
 * réduit les espaces, parce qu'il décide si une suggestion vaut encore d'être montrée.
 * Ce n'est pas la même question, et les fusionner ferait dépendre l'affichage d'une liste
 * du comportement d'un champ de saisie.
 */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
