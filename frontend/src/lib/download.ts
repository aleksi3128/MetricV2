/**
 * Enregistrer un fichier servi par une route **authentifiée**.
 *
 * Un `<a href download>` nu ne marcherait pas : le navigateur n'attache pas le jeton de
 * session à une navigation. On récupère les octets avec le jeton, on en fait une URL
 * d'objet, et on déclenche l'enregistrement depuis un lien éphémère. L'URL est révoquée
 * aussitôt : elle n'a servi qu'à un clic.
 *
 * Né dans `useFitDownload` (le `.fit` d'une course), partagé depuis que le coach sert aussi
 * un fichier — la séance pour la montre. Deux copies du même détour auraient fini par ne
 * plus attacher le jeton de la même façon.
 */

import { tokenStore } from '@/lib/api';

export async function downloadAuthorized(path: string, filename: string): Promise<void> {
  const token = tokenStore.read();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('indisponible');

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
