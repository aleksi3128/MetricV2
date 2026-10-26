/**
 * Le fil Planning, sous la grille (`docs/planning-natation.md` §5).
 *
 * **La même conversation** que `/assistant` — ses tours, ses cartes d'action, son attente —
 * dans un fil à part : un seul, qui garde sa consigne. Le serveur y enseigne la notation au
 * modèle, relit chaque programme proposé, relance une fois sur une faute, et écarte ce qui
 * reste faux en le disant. Cet écran n'en vérifie rien : il affiche et offre d'adopter.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il n'écrit rien de lui-même. Dans ce fil, l'assistant **propose** : les séances arrivent
 * dans un bloc IA, se retirent une à une, et rien n'entre au planning avant « Adopter ».
 *
 * Il ne se fige pas en bas de l'écran comme `/assistant` : sa saisie suit la page, sous la
 * grille. Le fil entier se relit sur `/assistant`, où il porte le badge « planning ».
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  Button,
  Card,
  Chip,
  ChipStrip,
  Empty,
  LinkButton,
  Skeleton,
  TextArea,
} from '@/components/ui';
import { useAiStatus } from '@/features/ai/useAiStatus';
import { assistantApi } from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import { PendingTurn, TurnView } from '../assistant/Conversation';
import { pastFrom, useConversation } from '../assistant/useConversation';
import styles from '../Planning.module.css';

/** Les tours montrés sous la grille. Au-delà, le fil se relit sur `/assistant`. */
const SHOWN = 3;

/** Des débuts de question, pas des réponses : ils remplissent le champ, rien de plus. */
const STARTERS = ['Ma semaine de natation', 'Une séance technique', 'Ajuste à ce que j’ai nagé'];

export function PlanningChat() {
  const client = useQueryClient();
  const { notify } = useToast();
  const { enabled, pending: statusPending, message } = useAiStatus();
  const usable = enabled || statusPending;
  const [question, setQuestion] = useState('');
  const [armed, setArmed] = useState(false);
  /** Le fil ouvert par la première question de cette session, avant que la liste le sache. */
  const [opened, setOpened] = useState<string | null>(null);
  /**
   * Vrai dès qu'une réponse est arrivée dans cette session. Le fil n'est **plus relu**
   * ensuite : une adoption invalide tout, et le relire ferait apparaître en double les
   * tours que la session tient déjà — moins leur proposition en attente, que le serveur ne
   * range pas. C'est la garde de `/assistant`, pour la même raison.
   */
  const [answered, setAnswered] = useState(false);

  const thread = useQuery({
    queryKey: keys.assistant.planningThread(),
    queryFn: assistantApi.planningThread,
    enabled: !answered,
  });
  const threadId = thread.data?.thread?.thread_id ?? opened;

  const conversation = useConversation({
    threadId,
    scope: 'planning',
    onAnswer: (reply) => {
      setOpened(reply.thread_id);
      setAnswered(true);
    },
  });

  const past = useMemo(() => pastFrom(thread.data?.thread?.messages ?? []), [thread.data]);
  const shown = [...past, ...conversation.exchanges];
  const hidden = Math.max(0, shown.length - SHOWN);
  const visible = shown.slice(hidden);

  const clear = useMutation({
    mutationFn: (id: string) => assistantApi.forgetThread(id),
    onSuccess: () => {
      setArmed(false);
      setOpened(null);
      setAnswered(false);
      conversation.clear();
      void client.invalidateQueries({ queryKey: keys.assistant.all() });
      notify('Fil vidé.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(
        caught instanceof ApiError ? caught.message : 'Impossible de vider le fil.',
        'recover',
      );
    },
  });

  function send(): void {
    if (conversation.send(question)) setQuestion('');
  }

  return (
    <Card>
      <div className="spread">
        <div>
          <h3>Demander au planning</h3>
          <p className={styles.note}>
            L’assistant écrit chaque natation dans la notation — CR, EF, R15 — et propose : rien
            n&apos;entre au planning avant que tu adoptes.
          </p>
        </div>
      </div>

      {!usable && (
        <Empty title="Assistance indisponible">
          {message} La planification à la main, elle, reste entière.
        </Empty>
      )}

      {usable && thread.isPending && <Skeleton lines={2} />}

      {usable && thread.error !== null && (
        <Empty title="Fil illisible">
          {thread.error instanceof ApiError ? thread.error.message : 'Le serveur est injoignable.'}
        </Empty>
      )}

      {usable && !thread.isPending && thread.error === null && (
        <div className={styles.chat}>
          {hidden > 0 && threadId !== null && (
            <LinkButton variant="quiet" to={`/assistant?fil=${threadId}`}>
              {`Les ${String(hidden)} échanges précédents, sur l’assistant`}
            </LinkButton>
          )}

          {shown.length === 0 && conversation.inFlight === null && (
            <div className={styles.starters}>
              <ChipStrip label="Pour commencer">
                {STARTERS.map((starter) => (
                  <Chip
                    key={starter}
                    onClick={() => {
                      setQuestion(starter);
                    }}
                  >
                    {starter}
                  </Chip>
                ))}
              </ChipStrip>
            </div>
          )}

          {visible.map((turn, index) => (
            <TurnView
              key={`${String(index + hidden)}-${turn.question.slice(0, 24)}`}
              turn={turn}
              busy={conversation.inFlight !== null}
              onRetry={() => {
                conversation.retry(turn.question, index + hidden, past.length);
              }}
            />
          ))}

          {conversation.inFlight !== null && (
            <PendingTurn
              question={conversation.inFlight}
              draft={conversation.draft}
              step={conversation.step}
            />
          )}

          <form
            className={styles.chatForm}
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <TextArea
              label="Ta demande"
              value={question}
              rows={2}
              placeholder="Deux natations cette semaine, pas le mercredi"
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
              onKeyDown={(event) => {
                // Entrée envoie, Maj+Entrée passe à la ligne — comme sur `/assistant`.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <Button
              type="submit"
              variant="primary"
              className={styles.submit}
              busy={conversation.inFlight !== null}
              disabled={question.trim() === ''}
            >
              Demander
            </Button>
          </form>

          {/* Deux appuis pour vider : le fil part entier, sans annulation. Ce qui a été
              adopté reste au planning — vider le fil n'efface que la conversation. */}
          {threadId !== null && shown.length > 0 && (
            <Button
              variant="quiet"
              busy={clear.isPending}
              aria-label={
                armed ? 'Vider le fil du planning — confirmer' : 'Vider le fil du planning'
              }
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                clear.mutate(threadId);
              }}
            >
              {armed ? 'Confirmer ?' : 'Vider le fil'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
