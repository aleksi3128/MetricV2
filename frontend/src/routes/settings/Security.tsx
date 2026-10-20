/**
 * Sécurité et données (`docs/exploitation-securite.md`) : les passkeys, l'export complet,
 * la sauvegarde, et ce que l'IA a coûté ce mois-ci.
 *
 * Deux absences sont des décisions et non des oublis : **pas de bouton « tout supprimer »**
 * (D5) — sans annulation, c'est le pire geste à laisser à portée de pouce — et **pas de
 * restauration** (D7) : elle se fait à la main, dans Nextcloud.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Progress, Rule, Skeleton, SwipeRow } from '@/components/ui';
import { accountApi, passkeyApi, type PasskeyItem } from '@/features/account/api';
import { ApiError } from '@/lib/api';
import { downloadAuthorized } from '@/lib/download';
import { passkeySupported, createPasskey } from '@/lib/passkey';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Security.module.css';

function failure(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function Passkeys() {
  const client = useQueryClient();
  const { notify } = useToast();
  const { data, isPending, error } = useQuery({
    queryKey: keys.account.passkeys(),
    queryFn: passkeyApi.list,
  });
  const add = useMutation({
    mutationFn: async () => {
      const options = await passkeyApi.registerOptions();
      return passkeyApi.register(await createPasskey(options), 'Cet appareil');
    },
    onSuccess: (list) => {
      client.setQueryData(keys.account.passkeys(), list);
      notify('Passkey ajoutée. Le mot de passe reste en secours.', 'effort');
    },
    onError: (caught: unknown) => {
      notify(failure(caught, 'L’ajout n’a pas abouti.'), 'recover');
    },
  });
  const remove = useMutation({
    mutationFn: (item: PasskeyItem) => passkeyApi.remove(item.id, item.token),
    onSuccess: (list) => {
      client.setQueryData(keys.account.passkeys(), list);
      notify('Passkey retirée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(failure(caught, 'Retrait impossible.'), 'recover');
    },
  });

  return (
    <Card>
      <div className="spread">
        <h3>Passkey</h3>
        {data !== undefined && (
          <Badge tone={data.items.length > 0 ? 'effort' : 'load'}>
            {data.items.length > 0 ? 'active' : 'aucune'}
          </Badge>
        )}
      </div>
      {isPending ? (
        <Skeleton lines={2} />
      ) : error ? (
        <p className={styles.note}>{failure(error, 'Le serveur n’a pas répondu.')}</p>
      ) : !data.configured ? (
        <p className={styles.note}>
          Fermée sur ce serveur&nbsp;: PASSKEY_RP_ID et PASSKEY_ORIGIN sont vides. Le mot de passe
          reste la porte d’entrée.
        </p>
      ) : (
        <div className={styles.stack}>
          <p className={styles.note}>
            Face ID ou Touch ID à la place du mot de passe. Le mot de passe reste en secours&nbsp;:
            sans annulation, perdre son téléphone ne doit pas fermer la porte.
          </p>
          {data.items.length > 0 && (
            <ul className={styles.list}>
              {data.items.map((item) => (
                <li key={item.id}>
                  <SwipeRow
                    actionLabel={`Retirer « ${item.name} »`}
                    busy={remove.isPending}
                    onAction={() => {
                      remove.mutate(item);
                    }}
                  >
                    <div className={styles.key}>
                      <span>{item.name}</span>
                      <span className={styles.meta}>{item.created_text}</span>
                    </div>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}
          {passkeySupported() ? (
            <Button
              busy={add.isPending}
              onClick={() => {
                add.mutate();
              }}
            >
              Ajouter une passkey
            </Button>
          ) : (
            <p className={styles.note}>Ce navigateur ne connaît pas les passkeys.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Data() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: keys.account.view(),
    queryFn: accountApi.view,
  });

  async function exportAll(today: string) {
    setBusy(true);
    try {
      await downloadAuthorized('/api/export', `metric-${today}.zip`);
    } catch {
      notify('L’export n’a pas abouti. Réessaie.', 'recover');
    } finally {
      setBusy(false);
    }
  }

  if (isPending) {
    return (
      <Card>
        <Skeleton lines={3} />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <p className={styles.note}>{failure(error, 'Le serveur n’a pas répondu.')}</p>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <h3>Mes données</h3>
        <div className={styles.stack}>
          <p className={styles.note}>
            Tout, en une archive&nbsp;: chaque fichier en JSON, les .fit d’origine, et le dossier
            médical
            <strong> en clair</strong> — garde-la à l’abri.
          </p>
          <Button busy={busy} onClick={() => void exportAll(data.today)}>
            Exporter mes données
          </Button>
          <p className={styles.note}>{data.backup.text}</p>
        </div>
      </Card>
      <Card>
        <h3>Usage de l’IA</h3>
        <div className={styles.stack}>
          {data.usage.share !== null && (
            <Progress
              done={data.usage.share}
              total={1}
              bare
              tone={data.usage.share >= 0.8 ? 'recover' : 'effort'}
            />
          )}
          <p className={styles.note}>{data.usage.text}</p>
        </div>
      </Card>
    </>
  );
}

export function Security() {
  // Trois cartes là où les autres sections n'en ont qu'une : sans cet écart, elles se
  // touchaient — vu à 360 px.
  return (
    <>
      <Rule>Sécurité et données</Rule>
      <div className={styles.stack}>
        <Passkeys />
        <Data />
      </div>
    </>
  );
}
