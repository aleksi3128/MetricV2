/**
 * Un morceau de `settings.csv`, éditable depuis l'écran qu'il règle (M-04).
 *
 * ── Un seul fichier, un seul jeton ────────────────────────────────────────
 *
 * Les objectifs, la cible d'eau, l'adresse de Cadence, les repères de course, la piste mise
 * en avant, le profil de l'assistant et les créneaux de rappel vivent **dans le même
 * fichier**, sous un même jeton `If-Match` (`STO-05`). Tant qu'ils étaient sur un seul
 * écran, un seul formulaire tenait le jeton. Depuis M-04, cinq écrans en tiennent un — et
 * une écriture sur `/routine` rend périmé celui que garde `/activite/courses`.
 *
 * Deux règles le tiennent :
 *
 * * **le jeton est celui de la lecture en cache au moment d'enregistrer**, la même requête
 *   (`keys.settings.all()`) pour tous les écrans : une écriture en remplace la valeur
 *   par la vue que le serveur rend, jeton neuf compris, et l'écran suivant l'y trouve ;
 * * **toute écriture dans le fichier invalide ses trois lectures** — réglages, profil,
 *   rappels — par `afterSettingsFileWrite`, d'où qu'elle parte.
 *
 * Un conflit, s'il arrive quand même, remonte : il ne se force pas (`CLAUDE.md` §2). Le
 * brouillon est alors abandonné, et l'écran repart de ce que le fichier vaut.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { settingsApi, type SettingsView } from './api';
import { changes, toDraft, type SettingsDraft, type SettingsKey } from './form';

/** Les trois lectures de `settings.csv`, chacune avec son jeton. */
const FILE_READS = {
  settings: keys.settings.all(),
  profile: keys.assistant.profile(),
  notifications: keys.notifications.all(),
} as const;

/**
 * Ce que toute écriture dans `settings.csv` rend périmé — d'où qu'elle parte.
 *
 * Les trois lectures du fichier portent chacune son jeton : les réglages, le profil de
 * l'assistant, les rappels. Une écriture par l'une change le jeton des deux autres ; sans
 * cette fonction, la suivante partirait en `409` sans que rien ne l'explique. `from` est la
 * lecture qui vient d'écrire et qui se tient à jour elle-même, par la vue que le serveur
 * rend ; sans `from` — une écriture que le serveur fait dans le fichier par une autre route,
 * comme « Mettre en avant » une piste —, les trois se relisent.
 */
export function afterSettingsFileWrite(client: QueryClient, from?: keyof typeof FILE_READS): void {
  for (const [name, key] of Object.entries(FILE_READS)) {
    if (name !== from) void client.invalidateQueries({ queryKey: key });
  }
}

export interface SettingsDraftOptions {
  /** Ce que ces réglages changent ailleurs, au-delà du fichier lui-même. */
  invalidates: readonly (readonly unknown[])[];
  /** Le toast d'un enregistrement réussi. */
  saved: string;
  /** Après un enregistrement réussi — refermer un panneau déplié, par exemple. */
  onSaved?: (() => void) | undefined;
}

export function useSettingsDraft(fields: readonly SettingsKey[], options: SettingsDraftOptions) {
  const client = useQueryClient();
  const { notify } = useToast();

  const { data, isPending, error } = useQuery({
    queryKey: keys.settings.all(),
    queryFn: settingsApi.read,
  });

  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [refusal, setRefusal] = useState<ApiError | null>(null);

  const values: SettingsDraft | null = data ? (draft ?? toDraft(data.values)) : null;
  const pending = data && values ? changes(values, data.values, fields) : {};
  const count = Object.keys(pending).length;

  const save = useMutation({
    // La vue passée est **celle en cache à l'appui** : son jeton est le plus récent que
    // l'écran connaisse, éventuellement remplacé par l'écriture d'un autre écran.
    mutationFn: (view: SettingsView) =>
      settingsApi.update(changes(draft ?? toDraft(view.values), view.values, fields), view.token),

    onSuccess: (updated) => {
      client.setQueryData(keys.settings.all(), updated);
      afterSettingsFileWrite(client, 'settings');
      for (const key of options.invalidates) void client.invalidateQueries({ queryKey: key });
      setDraft(null);
      setRefusal(null);
      options.onSaved?.();
      notify(options.saved, 'effort');
    },

    onError: (caught: unknown) => {
      setRefusal(caught instanceof ApiError ? caught : null);
      if (caught instanceof ApiError && caught.code === 'conflict') {
        // La garde a parlé : l'écran doit repartir de ce que le fichier vaut vraiment.
        void client.invalidateQueries({ queryKey: keys.settings.all() });
        setDraft(null);
      }
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  return {
    data,
    isPending,
    error,
    /** Le brouillon, ou les valeurs en vigueur tant que rien n'est saisi. */
    values,
    refusal,
    /** Le nombre de réglages de ce formulaire qui attendent d'être enregistrés. */
    count,
    dirty: count > 0,
    saving: save.isPending,
    set: (key: SettingsKey) => (event: { target: { value: string } }) => {
      const value = event.target.value;
      if (!data) return;
      setDraft((current) => ({ ...(current ?? toDraft(data.values)), [key]: value }));
    },
    save: () => {
      const view = client.getQueryData<SettingsView>(keys.settings.all()) ?? data;
      if (view) save.mutate(view);
    },
    reset: () => {
      setDraft(null);
      setRefusal(null);
    },
  };
}
