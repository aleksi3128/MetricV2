/**
 * Le fil d'une conversation — ses tours, ses actions, son attente.
 *
 * Sorti de `Assistant.tsx` le jour où un second écran en a eu besoin : le planning pose son
 * propre fil sous la grille (`docs/planning-natation.md` §5.4). Deux copies d'une
 * conversation auraient donné deux façons d'annuler un ajout, deux attentes, et deux
 * condensés publiés dont un finirait par manquer. Ce module est **la** conversation ; les
 * écrans ne décident que de ce qui l'entoure — l'en-tête, la saisie, sa place.
 *
 * ## Ce qu'il ne décide pas
 *
 * Rien de ce qu'il affiche n'est calculé ici. Le condensé, les actions et leur niveau, le
 * total d'un programme de nage proposé : tout arrive du serveur, relu. Ce module offre le
 * geste qui va avec — annuler, confirmer, adopter, oublier.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AiBlock, Button, Chip, ExternalLinkButton, Markdown } from '@/components/ui';
import { activityApi } from '@/features/activity/api';
import {
  assistantApi,
  type ActionReport,
  type MemoryEntry,
  type UndoRef,
} from '@/features/assistant/api';
import type { PlanKind, ProposedSession } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { hoursMinutes, longDate, plural } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { CircuitCard } from '../activity/CircuitCard';
import { SwimProgramView } from '../planning/SwimProgram';
import type { Exchange } from './useConversation';
import styles from './Conversation.module.css';

// ── Ce que l'assistant a fait, ou demande à faire (`IA-15`) ──

const KIND_LABELS: Record<PlanKind, string> = {
  course: 'Course',
  muscu: 'Muscu',
  natation: 'Natation',
  autre: 'Autre',
};

/** Ce qui repart vers le serveur à l'adoption — les champs d'une saisie, rien d'autre. */
function toPayload(session: ProposedSession): Record<string, unknown> {
  return {
    date: session.date,
    time: session.time,
    kind: session.kind,
    title: session.title,
    duration_min: session.duration_min,
    note: session.note,
    program: session.program,
  };
}

/**
 * Une proposition de planning, **à adopter** (`docs/planning-natation.md` §5.3).
 *
 * Le bloc IA de l'ancienne carte « Proposer un planning », passé dans le fil : c'est la
 * même chose qu'on fait, et le projet n'a qu'une façon de dire « proposé ». Chaque séance
 * se retire sans renoncer aux autres, et « Adopter » n'envoie **que ce qui reste** — une
 * séance retirée ne peut pas être écrite par un désaccord d'index.
 *
 * Les programmes de nage arrivent **lus** : lignes réécrites, total. Rien n'est relu ici.
 */
function ProposalCard({ report }: { report: ActionReport }) {
  const client = useQueryClient();
  const { notify } = useToast();
  const sessions = report.sessions ?? [];
  const dropped = report.dropped ?? [];
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [settled, setSettled] = useState<'adopted' | 'declined' | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const kept = sessions.filter((_, index) => !removed.has(index));

  const adopt = useMutation({
    mutationFn: () =>
      assistantApi.confirmAction(report.name, { sessions: kept.map((item) => toPayload(item)) }),
    onSuccess: (result) => {
      if (result.status !== 'done') {
        notify(result.summary, 'recover');
        return;
      }
      setSettled('adopted');
      setSummary(result.summary);
      // Une adoption écrit au planning, que le tableau de bord et l'assiduité lisent aussi.
      void client.invalidateQueries();
      notify(result.summary, 'effort');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Adoption impossible.', 'recover');
    },
  });

  if (settled === 'declined') return null;

  if (settled === 'adopted') {
    return (
      <div className={cx(styles.action, styles.action_effort)}>
        <div className={styles.actionBody}>
          <span className={styles.actionMark} aria-hidden="true" />
          <p className={styles.actionText}>{summary}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.proposal}>
      <AiBlock
        tag="Proposition"
        actions={
          <>
            <Button
              variant="primary"
              busy={adopt.isPending}
              disabled={kept.length === 0}
              onClick={() => {
                adopt.mutate();
              }}
            >
              Adopter{kept.length > 0 ? ` (${String(kept.length)})` : ''}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setSettled('declined');
              }}
            >
              Pas d&apos;accord
            </Button>
          </>
        }
      >
        <p>{report.summary}</p>
        <ul className={styles.proposed}>
          {sessions.map((session, index) => {
            const out = removed.has(index);
            return (
              <li
                key={`${session.date}-${session.title}-${String(index)}`}
                className={cx(styles.proposedItem, out && styles.proposedOut)}
              >
                <div className={styles.proposedBody}>
                  <strong>
                    {longDate(`${session.date}T12:00:00`)} — {session.title}
                  </strong>
                  <span className={styles.proposedMeta}>
                    {[
                      session.time ?? 'sans heure',
                      KIND_LABELS[session.kind],
                      hoursMinutes(session.duration_min),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {session.swim !== null && !out && <SwimProgramView program={session.swim} />}
                </div>
                {/* Le « Pas d'accord » appliqué à une liste : on retire une séance sans
                    renoncer aux autres. Réversible tant que rien n'est écrit. */}
                <Button
                  variant="quiet"
                  aria-label={`${out ? 'Remettre' : 'Retirer'} ${session.title} de la proposition`}
                  onClick={() => {
                    setRemoved((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    });
                  }}
                >
                  {out ? 'Remettre' : 'Retirer'}
                </Button>
              </li>
            );
          })}
        </ul>
        {dropped.length > 0 && <DroppedList dropped={dropped} />}
      </AiBlock>
    </div>
  );
}

/** Ce que la relecture a écarté. Le taire laisserait croire à une proposition complète. */
function DroppedList({ dropped }: { dropped: string[] }) {
  return (
    <div className={styles.dropped}>
      <p>Écarté à la relecture :</p>
      <ul>
        {dropped.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Une action, avec le geste qui va avec.
 *
 * Trois états, trois discours, et la différence entre eux est ce qui rend le lot tenable :
 *
 * * `done` — c'est écrit. Un bouton défait, en appelant la route du domaine : le geste
 *   que l'utilisateur ferait lui-même depuis l'écran concerné.
 * * `pending` — **rien n'est écrit**. L'action dit ce qu'elle changerait, et deux boutons
 *   tranchent. Le projet n'a pas de corbeille : effacer se demande.
 * * `refused` — rien n'a eu lieu, et la phrase dit pourquoi. Elle vient du serveur, en
 *   français, et s'affiche telle quelle.
 */
export function ActionCard({ report }: { report: ActionReport }) {
  if (
    report.name === 'plan.propose' &&
    report.status === 'pending' &&
    (report.sessions ?? []).length > 0
  ) {
    return <ProposalCard report={report} />;
  }
  return <PlainAction report={report} />;
}

function PlainAction({ report }: { report: ActionReport }) {
  const client = useQueryClient();
  const { notify } = useToast();
  const [settled, setSettled] = useState<'undone' | 'confirmed' | 'dismissed' | null>(null);

  /**
   * Le circuit que cette action a créé, tel qu'il est **maintenant**.
   *
   * La liste n'est demandée que si l'action en a produit un : les autres cartes ne paient
   * pas une requête pour rien. Le rapprochement se fait sur l'identifiant stable — une
   * position se décale, un identifiant non — et un circuit supprimé depuis ne se retrouve
   * pas, donc « Fait » disparaît de lui-même plutôt que d'échouer à l'appui.
   */
  const { data: circuits } = useQuery({
    queryKey: keys.activity.circuits(),
    queryFn: activityApi.circuits,
    enabled: report.resource_id !== null,
  });
  const circuit = circuits?.circuits.find((item) => item.circuit_id === report.resource_id);

  /** Une écriture de l'assistant touche un domaine quelconque : on rafraîchit large. */
  function refreshEverything(): void {
    void client.invalidateQueries();
  }

  const undo = useMutation({
    mutationFn: (ref: UndoRef) => assistantApi.undo(ref),
    onSuccess: () => {
      setSettled('undone');
      refreshEverything();
      notify('Annulé.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Annulation impossible.', 'recover');
    },
  });

  const confirm = useMutation({
    mutationFn: () => assistantApi.confirmAction(report.name, report.args),
    onSuccess: (result) => {
      if (result.status !== 'done') {
        notify(result.summary, 'recover');
        return;
      }
      setSettled('confirmed');
      refreshEverything();
      notify(result.summary, 'effort');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Impossible.', 'recover');
    },
  });

  if (settled === 'dismissed') return null;

  const tone =
    report.status === 'refused' ? 'recover' : report.status === 'pending' ? 'load' : 'effort';
  const dropped = report.dropped ?? [];

  return (
    <div className={cx(styles.action, styles[`action_${tone}`])}>
      <div className={styles.actionBody}>
        <span className={styles.actionMark} aria-hidden="true" />
        <p className={styles.actionText}>
          {settled === 'undone' ? 'Annulé.' : settled === 'confirmed' ? 'Fait.' : report.summary}
        </p>
      </div>

      {dropped.length > 0 && <DroppedList dropped={dropped} />}

      {/* Le lien arrive **fabriqué par le serveur** et se rend en bouton, jamais recopié
          dans le texte de la réponse. Une adresse tapée par un modèle est du texte non
          vérifié : le suffixe qui distingue quinze répétitions de quinze secondes s'y perd
          en silence, et la séance se lance quand même — fausse.

          Il vient **avant** « Annuler », et c'est le point de l'écran : ce qu'on veut faire
          d'une séance qu'on vient de recevoir, c'est l'ouvrir. La défaire est le geste
          rare, et il reste à un appui. */}
      {settled === null && report.link !== null && (
        <ExternalLinkButton
          variant="primary"
          className={styles.actionOpen}
          href={report.link}
          aria-label="Ouvrir cette séance dans Cadence"
        >
          Ouvrir dans Cadence
        </ExternalLinkButton>
      )}

      {/* La carte de séance est celle de `/activite/seances` — **la seule
          implémentation**. Trois copies auraient donné trois façons de dire « Fait »,
          trois arrondis de durée, et le jour où l'une change les deux autres mentent.

          L'import traverse `routes/` : c'est inhabituel, et c'est le moindre mal. La
          séance appartient au domaine Activité ; ce qui est partagé ici, c'est un geste
          métier, pas une primitive d'interface. */}
      {settled === null && circuit !== undefined && (
        <div className={styles.actionCircuit}>
          <CircuitCard circuit={circuit} />
        </div>
      )}

      {settled === null && report.status === 'done' && report.undo !== null && (
        <Button
          variant="quiet"
          busy={undo.isPending}
          onClick={() => {
            undo.mutate(report.undo as UndoRef);
          }}
        >
          Annuler
        </Button>
      )}

      {settled === null && report.status === 'pending' && (
        <div className={styles.actionChoice}>
          <Button
            variant="primary"
            busy={confirm.isPending}
            onClick={() => {
              confirm.mutate();
            }}
          >
            Confirmer
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setSettled('dismissed');
            }}
          >
            Non
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Ce qui vient d'être retenu (`IA-10`) ──────────────

/**
 * Le carnet se remplit **tout seul**, et cette ligne annonce ce qu'il vient d'y écrire.
 *
 * L'écran demandait « à retenir ? » et attendait un appui. Ce qui remplace cette
 * validation est le geste inverse — la note est déjà écrite, on la retire si elle est
 * fausse. Une ligne discrète et non un bloc : c'est une conséquence de la réponse, pas un
 * second interlocuteur.
 */
export function RememberedNote({ note }: { note: MemoryEntry }) {
  const client = useQueryClient();
  const { notify } = useToast();
  const [gone, setGone] = useState(false);

  const forget = useMutation({
    mutationFn: () => assistantApi.forget(note.id, note.token),
    onSuccess: () => {
      setGone(true);
      void client.invalidateQueries({ queryKey: keys.assistant.all() });
      notify('Oublié.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Impossible de retirer.', 'recover');
    },
  });

  if (gone) return null;

  return (
    <p className={styles.kept}>
      <span className={styles.keptMark} aria-hidden="true">
        ↳
      </span>
      <span className={styles.keptText}>
        Je retiens : <strong>{note.note}</strong>
      </span>
      <Button
        variant="quiet"
        busy={forget.isPending}
        aria-label={`Oublier ${note.note}`}
        onClick={() => {
          forget.mutate();
        }}
      >
        Oublier
      </Button>
    </p>
  );
}

// ── Un tour ───────────────────────────────────────────

/** Une question, sa réponse, ce qu'elle a fait, et sur quoi elle s'appuyait. */
export function TurnView({
  turn,
  busy,
  onRetry,
}: {
  turn: Exchange;
  /** Une autre question est en vol : rejouer celle-ci attendrait son tour. */
  busy: boolean;
  onRetry: () => void;
}) {
  const { notify } = useToast();
  /** Un retour sur le bouton et non un toast : le geste est local à une bulle. */
  const [copied, setCopied] = useState(false);

  function copy(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        notify('Copie impossible sur cet appareil.', 'recover');
      });
  }

  return (
    <div className={styles.turn}>
      <p className={cx(styles.bubble, styles.mine)}>{turn.question}</p>

      {turn.reply !== '' && (
        <div className={cx(styles.bubble, styles.theirs)}>
          {/* Le modèle écrit du markdown ; il s'affichait en clair, ses `-` et ses `**`
              compris. Rendu en nœuds React, jamais en HTML injecté. */}
          <Markdown>{turn.reply}</Markdown>
        </div>
      )}

      {turn.reply !== '' && (
        <div className={styles.replyActions}>
          {/* Une pastille et non un bouton discret : sans bordure, « Copier » se lisait
              comme une légende posée sous la bulle, et rien ne disait qu'on pouvait
              appuyer dessus. */}
          <Chip
            aria-label="Copier la réponse"
            onClick={() => {
              copy(turn.reply);
            }}
          >
            {copied ? 'Copié' : 'Copier'}
          </Chip>
        </div>
      )}

      {/* Un tour qui a échoué garde sa question et propose de la rejouer. */}
      {turn.failure !== undefined && (
        <div className={styles.failure} role="alert">
          <span>{turn.failure}</span>
          <Button variant="ghost" disabled={busy} onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      )}

      {turn.actions.map((report, position) => (
        <ActionCard key={`${report.name}-${String(position)}`} report={report} />
      ))}

      {turn.remembered.map((note) => (
        <RememberedNote key={note.memory_id} note={note} />
      ))}

      {/* Le condensé accompagne **la** réponse qu'il a produite, et lui seule — `IA-09`
          rendu vérifiable plutôt que déclaratif. */}
      {turn.context.length > 0 && (
        <details className={styles.facts}>
          <summary>
            Ce qui a été envoyé ({turn.context.length} {plural(turn.context.length, 'ligne')}, aucun
            fichier)
          </summary>
          <ul>
            {turn.context.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * La question en vol et ce qui lui répond déjà.
 *
 * Trois états, et non deux, parce que l'attente en a trois : le texte dès qu'il arrive ; à
 * défaut l'étape en cours, qui vient du serveur ; à défaut les trois points. La durée varie
 * du simple au triple selon qu'une seconde passe est nécessaire — ou une relance, dans le
 * fil Planning — et rien de tout cela ne se devine côté écran.
 */
export function PendingTurn({
  question,
  draft,
  step,
}: {
  question: string;
  draft: string;
  step: string | null;
}) {
  return (
    <div className={styles.turn}>
      <p className={cx(styles.bubble, styles.mine)}>{question}</p>
      <p
        className={cx(
          styles.bubble,
          styles.theirs,
          draft === '' && step === null && styles.thinking,
        )}
        aria-label={draft === '' ? 'L’assistant réfléchit' : undefined}
        aria-live="polite"
      >
        {draft !== '' ? (
          draft
        ) : step !== null ? (
          <span className={styles.step}>{step}…</span>
        ) : (
          <>
            <span />
            <span />
            <span />
          </>
        )}
      </p>
    </div>
  );
}
