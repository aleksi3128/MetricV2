/**
 * L'état d'une conversation, sans son dessin — séparé de `Conversation.tsx` pour que le
 * module de composants n'exporte que des composants.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  assistantApi,
  type ActionReport,
  type ChatReply,
  type MemoryEntry,
  type ThreadMessage,
  type ThreadScope,
} from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';

/** Une question, sa réponse, et ce que l'assistant a fait à ce tour-là. */
export interface Exchange {
  question: string;
  reply: string;
  actions: ActionReport[];
  remembered: MemoryEntry[];
  /**
   * Le condensé envoyé au modèle **pour ce tour-là**.
   *
   * Il vivait dans un état d'écran, unique, remplacé à chaque question : le `<details>`
   * n'existait donc que sur le dernier échange et disparaissait dès le suivant. On ne
   * pouvait plus vérifier sur quoi s'appuyait une réponse d'il y a trois tours, ce qui
   * vide `IA-09` de ce qui le rendait vérifiable.
   */
  context: string[];
  /** Le message du serveur quand le tour a échoué. La question reste rejouable. */
  failure?: string;
  /**
   * Le fil où la réponse est arrivée — celui que le serveur a rendu, jamais deviné. Une
   * action en attente se confirme **dans ce fil** : sa portée dit ce qui s'y confirme
   * (M-20). Absent du passé relu, qui ne range aucune action en attente.
   */
  thread?: string;
}

/** Le passé d'un fil, **dérivé** de ce que le serveur rend — jamais recopié dans un état. */
export function pastFrom(messages: ThreadMessage[]): Exchange[] {
  const rebuilt: Exchange[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const turn = messages[index];
    if (turn?.role !== 'user') continue;
    const answer = messages[index + 1];
    rebuilt.push({
      question: turn.content,
      reply: answer?.role === 'assistant' ? answer.content : '',
      // **Les actions sont rejouées**, moins leur annulation — que le serveur ne range
      // pas, justement parce que le jeton d'une ligne périme dès qu'elle change. Ce qui
      // reste ne périme pas : un lien Cadence porte la séance entière, et retrouver la
      // séance qu'on s'est fait proposer est précisément ce qu'on vient chercher en
      // rouvrant un fil.
      actions: answer?.role === 'assistant' ? (answer.actions ?? []) : [],
      remembered: [],
      context: answer?.role === 'assistant' ? (answer.context ?? []) : [],
    });
  }
  return rebuilt;
}

// ── L'état d'une conversation ─────────────────────────

/**
 * Poser une question, attendre, recevoir — et garder la trace des tours de la session.
 *
 * `inFlight` est la question en vol, affichée avant même la réponse. Deux raisons, et la
 * seconde est un correctif : dans une messagerie, ce qu'on envoie apparaît **tout de
 * suite** ; et les trois points étaient pilotés par `isPending`, qui les laissait affichés
 * après l'arrivée de la réponse. Ici l'état est à nous, et il est remis à zéro dans
 * `onSettled` — donc au succès **comme** à l'échec.
 *
 * `step` est ce que le serveur dit faire, **jamais deviné** : une suite d'étapes sur une
 * minuterie serait une valeur inventée. `draft` est la réponse pendant qu'elle s'écrit —
 * le même `reply`, arrivé plus tôt, que le serveur ne diffuse que s'il l'a prouvé final.
 */
export function useConversation({
  threadId,
  scope = '',
  onAnswer,
  onFailure,
}: {
  threadId: string | null;
  scope?: ThreadScope;
  onAnswer?: (reply: ChatReply) => void;
  onFailure?: () => void;
}) {
  const { notify } = useToast();
  const client = useQueryClient();
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const ask = useMutation({
    mutationFn: (asked: string) =>
      assistantApi.askStreaming(
        asked,
        threadId,
        setStep,
        (text) => {
          setDraft((current) => current + text);
        },
        () => {
          setDraft('');
        },
        scope,
      ),
    onSuccess: (result, asked) => {
      /*
       * **Ce que l'assistant vient d'écrire se relit partout** (M-10).
       *
       * L'annulation et la confirmation invalidaient déjà tout ; la réponse qui écrit, non.
       * Une douleur notée laissait `/corps` et le cadre du coach sur l'ancien état, un
       * effort perçu laissait `/charge` et l'accueil sans lui, jusqu'à la navigation
       * suivante. L'écran ne sait pas quel domaine une action touche — il n'apprend aucune
       * action par son nom —, d'où l'invalidation large, qui couvre `CROSS_CUTTING`.
       *
       * **Sauf l'assistant lui-même.** Elle part avant que l'échange soit rangé dans
       * `exchanges` : la requête du fil ouvert est encore active, se relisait, rendait le
       * tour qu'on vient d'avoir — et l'écran l'affichait deux fois, la copie rangée sans
       * son « Annuler ». Vu sur le banc ; le fil, lui, n'a rien à relire.
       */
      if (result.actions.some((report) => report.status === 'done')) {
        void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'assistant' });
      }
      onAnswer?.(result);
      setExchanges((current) => [
        ...current.filter((turn) => turn.question !== asked || turn.failure === undefined),
        {
          question: asked,
          reply: result.reply,
          actions: result.actions,
          remembered: result.remember,
          context: result.context,
          thread: result.thread_id,
        },
      ]);
    },
    onError: (caught: unknown, asked) => {
      const why = caught instanceof ApiError ? caught.message : 'Question impossible.';
      notify(why, 'recover');
      /*
       * **L'échec reste dans le fil, avec sa question.**
       *
       * Elle revenait dans le champ de saisie : il fallait la renvoyer à la main, et si
       * l'on avait commencé à taper autre chose entre-temps, elle était simplement
       * perdue. Ici elle garde sa place dans la conversation, à l'endroit où elle a
       * échoué, et un bouton la rejoue.
       */
      setExchanges((current) => [
        ...current.filter((turn) => turn.question !== asked || turn.failure === undefined),
        { question: asked, reply: '', actions: [], remembered: [], context: [], failure: why },
      ]);
      onFailure?.();
    },
    onSettled: () => {
      setInFlight(null);
      setStep(null);
      setDraft('');
    },
  });

  /** Envoie une question. Rend `false` si rien n'est parti — vide, ou une autre en vol. */
  function send(question: string): boolean {
    const cleaned = question.trim();
    if (cleaned === '' || inFlight !== null) return false;
    setInFlight(cleaned);
    ask.mutate(cleaned);
    return true;
  }

  /** Rejoue une question échouée, en retirant le tour raté. `offset` : les tours du passé. */
  function retry(asked: string, position: number, offset: number): void {
    if (inFlight !== null) return;
    setExchanges((current) => current.filter((_turn, index) => index + offset !== position));
    setInFlight(asked);
    ask.mutate(asked);
  }

  return {
    exchanges,
    clear: () => {
      setExchanges([]);
    },
    inFlight,
    step,
    draft,
    send,
    retry,
  };
}
