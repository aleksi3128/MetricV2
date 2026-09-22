/**
 * Récupération du `.fit` d'une course, depuis une route **authentifiée**
 * (`docs/import-fit.md`, **F1**).
 *
 * Un `<a href="/api/activity/runs/3/fit" download>` nu ne marcherait pas : le navigateur
 * n'attache pas le jeton de session à une navigation. On récupère donc les octets avec le
 * jeton, on en fait une URL d'objet, et on déclenche l'enregistrement depuis un lien
 * éphémère — le même détour que `usePhoto`, pour la même raison.
 *
 * L'URL d'objet est révoquée aussitôt : elle n'a servi qu'à un clic, et la garder
 * retiendrait 130 Ko par sortie consultée jusqu'au rechargement de la page.
 */

import { useState } from 'react';

import { activityApi } from '@/features/activity/api';
import { downloadAuthorized } from '@/lib/download';

export function useFitDownload(): {
  download: (id: number, day: string) => Promise<void>;
  busy: boolean;
  failed: boolean;
} {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download(id: number, day: string): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      await downloadAuthorized(activityApi.runFitPath(id), `course-${day}.fit`);
    } catch {
      // Un fichier qu'on n'a pas pu reprendre n'est pas une erreur d'écran : la course
      // reste entière sans lui, et le bouton le dit à sa place.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return { download, busy, failed };
}
