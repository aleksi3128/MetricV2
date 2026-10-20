/**
 * Le dossier médical (`docs/dossier-medical.md`, MED-03).
 *
 * **Chiffré avant d'aller sur Nextcloud**, avec une clé qui n'y va jamais. L'écran ne voit
 * le dossier qu'en clair, et n'en garde rien : pas de brouillon en mémoire du navigateur.
 * Sans clé, le serveur le dit, et l'écran recopie sa phrase — rien ne s'écrit en attendant.
 *
 * Une entrée se dicte : le modèle la range en **proposition**, montrée dans un `AiBlock`,
 * et rien n'est écrit sans « Reprendre » puis « Enregistrer ».
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import {
  AiBlock,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  PageHead,
  Rule,
  Skeleton,
  SwipeRow,
  TextArea,
} from '@/components/ui';
import { useAiStatus } from '@/features/ai/useAiStatus';
import {
  medicalApi,
  type MedicalEntry,
  type MedicalKind,
  type MedicalProposal,
  type MedicalView,
} from '@/features/medical/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';
import { dictate, dictationSupported } from '@/lib/voice';

import styles from './Dossier.module.css';

const KINDS: readonly { value: MedicalKind; label: string }[] = [
  { value: 'profil', label: 'Profil' },
  { value: 'semelles', label: 'Semelles' },
  { value: 'praticien', label: 'Praticiens' },
  { value: 'consultation', label: 'Consultations' },
  { value: 'opération', label: 'Opérations' },
  { value: 'antécédent', label: 'Antécédents' },
  { value: 'traitement', label: 'Traitements' },
];

function EntryForm({
  today,
  editing,
  onDone,
}: {
  today: string;
  editing: MedicalEntry | null;
  onDone: (view: MedicalView) => void;
}) {
  const ai = useAiStatus();
  const [kind, setKind] = useState<MedicalKind | null>(editing?.kind ?? null);
  const [day, setDay] = useState(editing?.date ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [details, setDetails] = useState(editing?.details ?? '');
  const [practitioner, setPractitioner] = useState(editing?.practitioner ?? '');
  const [missing, setMissing] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [proposal, setProposal] = useState<MedicalProposal | null>(null);
  const stop = useRef<(() => void) | null>(null);

  const parse = useMutation({ mutationFn: medicalApi.parse, onSuccess: setProposal });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        kind: kind ?? 'antécédent',
        date: day === '' ? null : day,
        title: title.trim(),
        details: details.trim(),
        practitioner: practitioner.trim(),
      };
      return editing === null
        ? medicalApi.create(payload)
        : medicalApi.update(editing.id, editing.token, payload);
    },
    onSuccess: onDone,
  });
  const error = save.error instanceof ApiError ? save.error : null;

  function toggleDictation(): void {
    if (listening) {
      stop.current?.();
      return;
    }
    setProposal(null);
    setHeard('');
    setListening(true);
    stop.current = dictate({
      onText: setHeard,
      onDone: (text) => {
        setListening(false);
        stop.current = null;
        if (text.trim().length >= 3) parse.mutate(text);
      },
      onError: (message) => {
        setListening(false);
        setMissing(message);
      },
    });
  }

  function adopt(item: MedicalProposal): void {
    if (item.kind !== null) setKind(item.kind);
    if (item.date !== null) setDay(item.date);
    if (item.title !== null) setTitle(item.title);
    if (item.details !== null) setDetails(item.details);
    if (item.practitioner !== null) setPractitioner(item.practitioner);
    setProposal(null);
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    const gaps = [kind === null && 'la nature', title.trim() === '' && 'le titre'].filter(
      (gap): gap is string => typeof gap === 'string',
    );
    if (gaps.length > 0) {
      setMissing(`Il manque ${gaps.join(' et ')}.`);
      return;
    }
    setMissing(null);
    save.mutate();
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {dictationSupported() && ai.enabled && (
        <div className={styles.choices}>
          <Button
            variant={listening ? 'primary' : 'ghost'}
            aria-pressed={listening}
            busy={parse.isPending}
            onClick={toggleDictation}
          >
            {listening ? 'Terminer' : 'Dicter'}
          </Button>
        </div>
      )}
      {(listening || heard !== '') && proposal === null && (
        <p className={styles.details}>{heard === '' ? 'Je t’écoute…' : `« ${heard} »`}</p>
      )}
      {parse.error !== null && (
        <p className={styles.error} role="alert">
          {parse.error instanceof ApiError ? parse.error.message : 'La lecture a échoué.'}
        </p>
      )}
      {proposal !== null && (
        <AiBlock
          tag="Proposé"
          actions={
            <>
              <Button
                variant="primary"
                onClick={() => {
                  adopt(proposal);
                }}
              >
                Reprendre dans l’entrée
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setProposal(null);
                }}
              >
                Écarter
              </Button>
            </>
          }
        >
          {proposal.summary}
        </AiBlock>
      )}

      <p className={styles.label}>Nature</p>
      <div className={styles.choices} role="group" aria-label="Nature">
        {KINDS.map((item) => (
          <Chip
            key={item.value}
            selected={kind === item.value}
            onClick={() => {
              setKind(item.value);
            }}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <Field
        label="Titre"
        value={title}
        maxLength={120}
        placeholder="Pied hyperlaxe…"
        error={error?.messageFor('title')}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <Field
        label="Date"
        type="date"
        max={today}
        hint="Facultative."
        value={day}
        error={error?.messageFor('date')}
        onChange={(event) => {
          setDay(event.target.value);
        }}
      />
      <TextArea
        label="Détails"
        value={details}
        maxLength={2000}
        rows={3}
        error={error?.messageFor('details')}
        onChange={(event) => {
          setDetails(event.target.value);
        }}
      />
      <Field
        label="Praticien"
        value={practitioner}
        maxLength={120}
        hint="Facultatif."
        onChange={(event) => {
          setPractitioner(event.target.value);
        }}
      />
      {(missing ?? error?.message) && (
        <p className={styles.error} role="alert">
          {missing ?? error?.message}
        </p>
      )}
      <Button variant="primary" type="submit" busy={save.isPending} className={styles.finish}>
        Enregistrer
      </Button>
    </form>
  );
}

export function Dossier() {
  const client = useQueryClient();
  const { notify } = useToast();
  const [form, setForm] = useState<{ editing: MedicalEntry | null } | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: keys.medical.all(),
    queryFn: medicalApi.view,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: (entry: MedicalEntry) => medicalApi.remove(entry.id, entry.token),
    onSuccess: (view) => {
      client.setQueryData(keys.medical.all(), view);
      notify('Entrée retirée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow="Santé" title="Dossier médical">
        Chiffré avant d’aller sur ton Nextcloud : la clé reste sur le serveur. Le coach n’en lit que
        les titres du profil, des semelles, des antécédents et des traitements.
      </PageHead>

      {isPending ? (
        <Card>
          <Skeleton />
        </Card>
      ) : error ? (
        <Card>
          <Empty title="Dossier fermé">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : (
        <>
          <Card>
            {form === null ? (
              <Button
                onClick={() => {
                  setForm({ editing: null });
                }}
              >
                Ajouter une entrée
              </Button>
            ) : (
              <>
                <h3>{form.editing === null ? 'Nouvelle entrée' : 'Corriger l’entrée'}</h3>
                <EntryForm
                  key={form.editing?.token ?? 'new'}
                  today={data.today}
                  editing={form.editing}
                  onDone={(view) => {
                    client.setQueryData(keys.medical.all(), view);
                    setForm(null);
                    notify('Entrée enregistrée, chiffrée.', 'effort');
                  }}
                />
                <Button
                  variant="quiet"
                  onClick={() => {
                    setForm(null);
                  }}
                >
                  Annuler
                </Button>
              </>
            )}
          </Card>

          {data.entries.length === 0 && (
            <Card>
              <Empty title="Dossier vide">
                Ton profil biomécanique, tes semelles, tes praticiens : une entrée à la fois, à la
                main ou à la voix.
              </Empty>
            </Card>
          )}

          {KINDS.map((kind) => {
            const entries = data.entries.filter((entry) => entry.kind === kind.value);
            if (entries.length === 0) return null;
            return (
              <section key={kind.value} className={styles.group} aria-label={kind.label}>
                <Rule>{kind.label}</Rule>
                <Card flush>
                  <ul className={styles.list}>
                    {entries.map((entry) => (
                      <li key={`${entry.entry_id}-${entry.token}`}>
                        <SwipeRow
                          actionLabel={`Retirer « ${entry.title} »`}
                          busy={remove.isPending}
                          onAction={() => {
                            remove.mutate(entry);
                          }}
                        >
                          <div className={styles.entry}>
                            <span>{entry.title}</span>
                            {(entry.date !== null || entry.practitioner !== '') && (
                              <span className={styles.meta}>
                                {[
                                  entry.date === null ? null : shortDate(entry.date),
                                  entry.practitioner || null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                            {entry.details !== '' && (
                              <p className={styles.details}>{entry.details}</p>
                            )}
                            <div className={styles.actions}>
                              <Chip
                                aria-label={`Corriger « ${entry.title} »`}
                                onClick={() => {
                                  setForm({ editing: entry });
                                }}
                              >
                                corriger
                              </Chip>
                            </div>
                          </div>
                        </SwipeRow>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
