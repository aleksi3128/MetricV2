/**
 * L'assistant (`IA-09` → `IA-16`).
 *
 * Un écran de discussion, et rien d'autre : la hauteur entière, un fil qui défile, une
 * saisie collée en bas. Ce qui vivait au-dessous — le carnet, ses formulaires — est passé
 * dans des feuilles. Un chat dont il faut faire défiler la page pour retrouver le champ
 * n'est pas un chat, c'est un formulaire avec un historique.
 *
 * ## Ce que cet écran ne décide pas
 *
 * Il ne construit aucun contexte : le condensé est assemblé **par le serveur**, à partir
 * des services qui en détiennent chacun la règle. Il ne décide pas non plus de ce qui
 * mérite d'être retenu ni de ce qui s'écrit dans les données — le carnet se remplit côté
 * serveur, les actions y sont validées et exécutées. Cet écran reçoit un compte rendu et
 * offre le geste qui va avec : annuler un ajout, confirmer un changement, oublier une note.
 *
 * ## Le fil vit sur le serveur
 *
 * Il n'y vivait pas : cet écran rendait l'historique à chaque question et le perdait au
 * rechargement. Depuis que la conversation peut **écrire**, le passé ne peut plus venir de
 * l'appelant — un client fabriquerait sinon le passé qui justifie l'action qu'il veut voir
 * prendre. L'écran ne rend donc qu'un identifiant de fil, et le serveur lit le reste.
 *
 * ## La hauteur, et pourquoi `dvh`
 *
 * L'écran occupe ce que la coquille lui laisse, calculé une fois en CSS. `100dvh` et non
 * `100vh` : sur iOS, le clavier système réduit le viewport **dynamique**, si bien que la
 * saisie remonte avec lui sans une ligne de JavaScript. Avec `vh`, elle resterait sous le
 * clavier — le défaut classique des interfaces de discussion sur téléphone.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  Badge,
  Button,
  Chip,
  ChipStrip,
  Empty,
  Field,
  Sheet,
  SheetGroup,
  SheetRow,
} from '@/components/ui';
import { IconBook, IconMic, IconThreads } from '@/components/ui/icons';
import { dictate, dictationSupported, speak } from '@/lib/voice';
import { useAiStatus } from '@/features/ai/useAiStatus';
import { assistantApi, type MemoryEntry } from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { shortDate } from '@/lib/format';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Assistant.module.css';
import { PendingTurn, TurnView } from './assistant/Conversation';
import { pastFrom, useConversation } from './assistant/useConversation';

function useInvalidateMemory() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.assistant.all() });
  };
}

// ── Les fils (`IA-13`) ────────────────────────────────

function ThreadSheet({
  open,
  onClose,
  current,
  onOpenThread,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  onOpenThread: (id: string | null) => void;
}) {
  const client = useQueryClient();
  const { notify } = useToast();
  // Deux appuis pour détruire. Cette feuille était la seule surface destructrice du
  // projet à partir d'un appui unique : supprimer une discussion effaçait un fil entier,
  // sans annulation, à côté d'un bouton qui sert à l'ouvrir. Le carnet juste en dessous
  // et le catalogue d'exercices arment déjà de cette façon.
  const [armed, setArmed] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: keys.assistant.threads(),
    queryFn: assistantApi.threads,
    enabled: open,
  });

  /** Le fil dont on corrige le titre, et le titre en cours de frappe. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const rename = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => assistantApi.renameThread(id, next),
    onSuccess: () => {
      setRenaming(null);
      setTitle('');
      void client.invalidateQueries({ queryKey: keys.assistant.all() });
      notify('Discussion renommée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Renommage impossible.', 'recover');
    },
  });

  const forget = useMutation({
    mutationFn: (id: string) => assistantApi.forgetThread(id),
    onSuccess: (_result, id) => {
      setArmed(null);
      void client.invalidateQueries({ queryKey: keys.assistant.threads() });
      if (id === current) onOpenThread(null);
      notify('Discussion supprimée.', 'signal');
    },
    onError: (caught: unknown) => {
      setArmed(null);
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  const threads = data?.threads ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tes discussions"
      lede="Tout est gardé. Rien ne s’efface tout seul."
    >
      <SheetRow
        label="Nouvelle discussion"
        hint="+"
        onClick={() => {
          onOpenThread(null);
          onClose();
        }}
      />

      {threads.length === 0 ? (
        <p className={styles.hint}>Aucune discussion pour l’instant.</p>
      ) : (
        <SheetGroup title="Précédentes">
          {threads.map((thread) => (
            <div key={thread.thread_id} className={styles.threadRow}>
              {/* Ouvrir prend toute la largeur : c'est ce qu'on vient faire neuf fois sur
                  dix. « Supprimer » tenait à côté sur la même ligne et lui prenait une
                  centaine de pixels — à 360 px, un titre de discussion s'y réduisait à
                  deux mots suivis de points de suspension. */}
              {renaming === thread.thread_id ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename.mutate({ id: thread.thread_id, next: title });
                  }}
                >
                  <Field
                    label="Titre de la discussion"
                    value={title}
                    autoFocus
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                  />
                  <div className="row">
                    <Button
                      type="submit"
                      variant="primary"
                      busy={rename.isPending}
                      disabled={title.trim() === ''}
                    >
                      Enregistrer
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setRenaming(null);
                        setTitle('');
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              ) : (
                <SheetRow
                  label={thread.title}
                  // Le fil du planning se dit comme tel : rouvert d'ici, il garde sa consigne
                  // de notation, et c'est sous la grille du planning qu'il vit.
                  hint={`${thread.scope === 'planning' ? 'planning · ' : ''}${String(thread.messages)} message${thread.messages > 1 ? 's' : ''}`}
                  onClick={() => {
                    onOpenThread(thread.thread_id);
                    onClose();
                  }}
                />
              )}
              {renaming !== thread.thread_id && (
                <div className={styles.threadActions}>
                  {/* Le modèle nomme le fil à son ouverture, et il se trompe : « Où j'en
                    suis » pour une discussion qui a fini par porter sur une blessure.
                    Sans ce geste, la seule issue était de supprimer le fil — donc la
                    conversation avec son mauvais titre. */}
                  <Chip
                    aria-label={`Renommer « ${thread.title} »`}
                    onClick={() => {
                      setRenaming(thread.thread_id);
                      setTitle(thread.title);
                    }}
                  >
                    Renommer
                  </Chip>
                  <Chip
                    className={cx(armed === thread.thread_id && styles.armed)}
                    disabled={forget.isPending}
                    aria-label={
                      armed === thread.thread_id
                        ? `Supprimer « ${thread.title} » — confirmer`
                        : `Supprimer « ${thread.title} »`
                    }
                    onClick={() => {
                      if (armed !== thread.thread_id) {
                        setArmed(thread.thread_id);
                        return;
                      }
                      forget.mutate(thread.thread_id);
                    }}
                  >
                    {armed === thread.thread_id ? 'Confirmer ?' : 'Supprimer'}
                  </Chip>
                </div>
              )}
            </div>
          ))}
        </SheetGroup>
      )}
    </Sheet>
  );
}

// ── Le carnet (`IA-11`) ───────────────────────────────

/**
 * Le carnet, dans une feuille.
 *
 * Il occupait le bas de l'écran, sous le fil : deux formulaires et une liste qu'il fallait
 * dépasser pour revenir à la question. Il se lit et s'écrit **sans clé API** — c'est
 * `IA-07` pris au mot, et la feuille ne change rien à cela.
 */
function MemorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateMemory();
  const { notify } = useToast();

  const { data } = useQuery({
    queryKey: keys.assistant.memory(),
    queryFn: assistantApi.memory,
    enabled: open,
  });

  const [topic, setTopic] = useState('autre');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<MemoryEntry | null>(null);
  const [armed, setArmed] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? assistantApi.update(editing.id, editing.token, topic, note)
        : assistantApi.remember(topic, note),
    onSuccess: () => {
      setNote('');
      setEditing(null);
      setTopic('autre');
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const forget = useMutation({
    mutationFn: (entry: MemoryEntry) => assistantApi.forget(entry.id, entry.token),
    onSuccess: () => {
      setArmed(null);
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
    },
  });

  /**
   * Marque une note comme n'étant plus vraie, ou la réactive.
   *
   * **Ce n'est pas une suppression, donc pas deux appuis.** Le motif « armer puis
   * confirmer » existe parce que le projet n'a aucune annulation ; ici l'inverse est vrai
   * — le même bouton défait ce qu'il vient de faire. Le demander confirmerait un geste
   * réversible, et finirait par faire ignorer la confirmation là où elle compte.
   *
   * La date vient du serveur. Un écran ne date aucune donnée.
   */
  const resolve = useMutation({
    mutationFn: (entry: MemoryEntry) =>
      assistantApi.update(entry.id, entry.token, entry.topic, entry.note, entry.resolved === null),
    onSuccess: invalidate,
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Changement impossible.', 'recover');
    },
  });

  const entries = data?.memories ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ce que l’assistant sait de toi"
      lede="Ce carnet part avec chaque question. Jamais un chiffre — il serait faux le mois suivant."
    >
      {entries.length === 0 ? (
        <Empty title="Carnet vide">
          Note ce qui explique tes chiffres sans y figurer. L’assistant en retient aussi tout seul
          au fil des questions — tu peux corriger ou oublier ce qu’il garde.
        </Empty>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.memory_id} className={styles.item}>
              <div className={styles.itemBody}>
                <div className={styles.meta}>
                  <span>{entry.topic}</span>
                  {entry.source === 'ai' && <Badge tone="signal">retenue seule</Badge>}
                  {/* Une note résolue reste au carnet, et le dit. La retirer perdrait ce
                      qu'elle apprend — ce qui a déjà lâché est ce qu'un coach surveille. */}
                  {entry.resolved !== null && (
                    <Badge tone="load">résolu le {shortDate(`${entry.resolved}T12:00:00`)}</Badge>
                  )}
                  {entry.created !== null && <span>{shortDate(`${entry.created}T12:00:00`)}</span>}
                </div>
                <span>{entry.note}</span>
              </div>

              <div className={styles.itemActions}>
                {/* Le nom accessible désigne **quelle** note : deux « Corriger » nus ne se
                    distinguent pas à la synthèse vocale, et le carnet en porte autant que
                    de lignes. Même règle que le bouton d'oubli juste à côté. */}
                <Button
                  variant="quiet"
                  aria-label={`Corriger ${entry.note}`}
                  onClick={() => {
                    setEditing(entry);
                    setTopic(entry.topic);
                    setNote(entry.note);
                  }}
                >
                  Corriger
                </Button>
                <Button
                  variant="quiet"
                  busy={resolve.isPending}
                  aria-label={
                    entry.resolved === null
                      ? `Marquer résolu : ${entry.note}`
                      : `Réactiver : ${entry.note}`
                  }
                  onClick={() => {
                    resolve.mutate(entry);
                  }}
                >
                  {entry.resolved === null ? 'Résolu' : 'Réactiver'}
                </Button>
                {/* Deux appuis pour détruire : le projet n'a pas d'annulation. */}
                <Button
                  variant="quiet"
                  busy={forget.isPending}
                  aria-label={
                    armed === entry.id
                      ? `Oublier ${entry.note} — confirmer`
                      : `Oublier ${entry.note}`
                  }
                  onClick={() => {
                    if (armed !== entry.id) {
                      setArmed(entry.id);
                      return;
                    }
                    forget.mutate(entry);
                  }}
                >
                  {armed === entry.id ? 'Confirmer ?' : 'Oublier'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SheetGroup title={editing ? 'Corriger la note' : 'Noter quelque chose'}>
        <form
          className={styles.memoryForm}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <ChipStrip label="Sujet">
            {(data?.topics ?? []).map((option) => (
              <Chip
                key={option}
                selected={topic === option}
                onClick={() => {
                  setTopic(option);
                }}
              >
                {option}
              </Chip>
            ))}
          </ChipStrip>

          <Field
            label="La note"
            value={note}
            placeholder="Genou droit sensible depuis le 12 juillet"
            hint="Ce qu’aucun fichier ne porte, et qui vaudra encore dans six mois."
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />

          <div className="row">
            <Button
              type="submit"
              variant="primary"
              busy={save.isPending}
              disabled={note.trim() === ''}
            >
              {editing ? 'Enregistrer' : 'Noter'}
            </Button>
            {editing && (
              <Button
                variant="quiet"
                onClick={() => {
                  setEditing(null);
                  setNote('');
                  setTopic('autre');
                }}
              >
                Annuler
              </Button>
            )}
          </div>
        </form>
      </SheetGroup>
    </Sheet>
  );
}

// ── Écran ─────────────────────────────────────────────

export function Assistant() {
  const { enabled, pending: statusPending, message } = useAiStatus();
  // Tant qu'on ne sait pas, on laisse écrire. Déclarer l'assistance indisponible avant
  // d'avoir posé la question afficherait un écran d'échec à chaque ouverture.
  const usable = enabled || statusPending;

  const [question, setQuestion] = useState('');
  /**
   * Les deux feuilles s'ouvrent **par l'adresse** — `?ouvre=memoire` — et un fil s'ouvre
   * de même — `?fil=<identifiant>`.
   *
   * Le tableau de bord y mène directement, et une surface qu'on atteint depuis un autre
   * écran a besoin d'être adressable : sans cela, le lien ouvrirait la conversation et
   * l'utilisateur aurait un appui de plus à faire, sans savoir lequel.
   *
   * **`?fil` est ce qui fait tenir la lecture du jour.** La carte d'accueil ouvre un fil
   * dont le premier message est celui de l'assistant, et l'écran doit arriver *dedans* :
   * poser le texte dans le champ de saisie ferait répondre le modèle à une phrase qu'il
   * ne se souviendrait pas d'avoir écrite, puisque `_history` ne la porterait pas.
   *
   * `?ouvre` est **retiré à la fermeture** : sans quoi le bouton système « précédent »
   * rouvrirait la feuille qu'on vient de refermer, ce qui est le piège classique d'un
   * état d'interface porté par l'URL.
   *
   * `?fil` reste, lui, **tant qu'on est dans ce fil-là** : ce n'est pas un état
   * d'interface mais une adresse, et recharger la page doit ramener où l'on était. Il
   * n'est retiré qu'en ouvrant un autre fil, moment où il annoncerait autre chose que ce
   * qu'on lit. `replace` évite d'ajouter une entrée d'historique dans les deux cas.
   */
  const [params, setParams] = useSearchParams();
  const asked = params.get('ouvre');
  const [chosen, setChosen] = useState<string | null>(params.get('fil'));
  /**
   * Vrai dès que l'utilisateur a **pris la main** sur le fil : ouvert celui-ci, fermé
   * celui-là, ou posé une question. Tant que c'est faux, la reprise automatique peut
   * décider ; après, elle se tait — un rattrapage qui rouvrirait un fil qu'on vient de
   * fermer serait une porte qui se rouvre toute seule.
   *
   * Un `?fil` dans l'adresse compte comme un choix : c'est une adresse, pas un défaut.
   */
  const [decided, setDecided] = useState(params.has('fil'));

  function openThread(id: string | null): void {
    setDecided(true);
    setChosen(id);
  }
  const [threadsOpen, setThreadsOpen] = useState(asked === 'discussions');
  const [memoryOpen, setMemoryOpen] = useState(asked === 'memoire');

  function forget(): void {
    if (!params.has('ouvre') && !params.has('fil')) return;
    const next = new URLSearchParams(params);
    next.delete('ouvre');
    next.delete('fil');
    setParams(next, { replace: true });
  }

  const stream = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  /**
   * Le fil suit-il le bas ?
   *
   * Une référence et non un état : elle change à chaque pixel de défilement, et en faire
   * un état redessinerait la conversation entière pendant qu'on la relit.
   */
  const following = useRef(true);

  /**
   * Reprendre la conversation en cours, quand il y en a une.
   *
   * Ouvrir l'assistant deux minutes après l'avoir fermé et retomber sur une page vide,
   * c'est perdre le contexte de ce qu'on était en train de faire — et devoir le réexpliquer
   * au modèle. Au-delà d'une heure, on revient pour autre chose, et rouvrir donnerait au
   * modèle un passé qui ne parle plus de rien.
   *
   * **C'est le serveur qui tranche.** Il rend un identifiant ou rien ; l'écran n'a aucun
   * écart de temps à mesurer, ce qui serait un second calcul de date (`HEAT-32`).
   *
   * Ne s'applique **qu'au montage et sur un écran vierge** : ni sur un `?fil` explicite —
   * qui est une adresse —, ni après avoir fermé un fil à la main, geste qu'un rattrapage
   * automatique annulerait sous le doigt.
   */
  const resume = useQuery({
    queryKey: keys.assistant.threads(),
    queryFn: assistantApi.threads,
  });

  /**
   * Le fil réellement ouvert — **dérivé au rendu**, pas posé par un effet.
   *
   * Un `useEffect` qui appellerait `setThreadId` provoquerait un rendu en cascade pour une
   * valeur qu'on sait déjà calculer ici. La reprise n'est qu'un défaut : elle s'applique
   * tant que rien n'a été choisi, et le choix l'emporte dès qu'il existe.
   */
  const threadId = chosen ?? (decided ? null : (resume.data?.resume ?? null));

  /**
   * La conversation — ses tours, la question en vol, l'attente. **La même** que celle du
   * fil Planning (`routes/assistant/Conversation.tsx`) : deux copies auraient donné deux
   * façons d'annuler un ajout et deux attentes.
   */
  const conversation = useConversation({
    threadId,
    onAnswer: (result) => {
      openThread(result.thread_id);
      following.current = true;
    },
    onFailure: () => {
      following.current = true;
    },
  });
  const { exchanges, inFlight, draft } = conversation;

  const opened = useQuery({
    queryKey: keys.assistant.thread(threadId ?? ''),
    queryFn: () => assistantApi.thread(threadId ?? ''),
    enabled: threadId !== null && exchanges.length === 0,
  });

  /** Le passé du fil, **dérivé** de ce que le serveur rend — jamais recopié dans un état. */
  const past = useMemo(() => pastFrom(opened.data?.messages ?? []), [opened.data]);

  // Chronologique : le plus ancien en haut, le dernier en bas, comme une conversation.
  const shown = [...past, ...exchanges];

  /**
   * La saisie grandit avec ce qu'on y écrit, jusqu'à un plafond.
   *
   * Elle était figée à `rows={1}` : coller ses notes de séance — six exercices — revenait
   * à les taper dans une fente d'une ligne, sans jamais voir plus d'une phrase de ce
   * qu'on venait d'écrire. C'est le champ que C07 remplira le plus.
   *
   * Le plafond est en CSS (`max-height`) et non ici : au-delà, le champ défile de
   * lui-même. Sans lui, une note de quinze lignes mangerait la conversation entière.
   *
   * Remettre `height` à `auto` avant de lire `scrollHeight` n'est pas une précaution :
   * sans cela, la hauteur ne redescend jamais quand on efface.
   */
  useEffect(() => {
    const node = composer.current;
    if (node === null) return;
    node.style.height = 'auto';
    node.style.height = `${String(node.scrollHeight)}px`;
  }, [question]);

  /**
   * Le fil se pose en bas à l'arrivée d'un message — **sauf si on est remonté**.
   *
   * Sans cette garde, relire une réponse d'il y a dix questions se ferait arracher dès que
   * la suivante arrive. C'est le défaut le plus courant des interfaces de discussion, et
   * il ne coûte qu'une référence à éviter.
   *
   * **`draft` est dans les dépendances, et il a fallu y penser.** Le nombre de messages ne
   * bouge pas pendant qu'une réponse se diffuse : sans lui, une réponse longue grandirait
   * sous le bas de l'écran et on la regarderait partir. Le lot qui allonge les réponses
   * est exactement celui qui rend cette dépendance nécessaire.
   */
  useEffect(() => {
    if (!following.current) return;
    const node = stream.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [shown.length, inFlight, draft]);

  function send(): void {
    if (!conversation.send(question)) return;
    setQuestion('');
    following.current = true;
  }

  // ── La voix (`docs/voix.md`) ──
  // Un message dicté part de lui-même à la fin de la dictée (D4), et sa réponse est lue :
  // c'est ce qui fait de la dictée un message vocal plutôt qu'un clavier de plus.
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const stopDictation = useRef<(() => void) | null>(null);
  const spoken = useRef<string | null>(null);
  const canDictate = dictationSupported();

  function toggleDictation(): void {
    if (listening) {
      stopDictation.current?.();
      return;
    }
    setVoiceError(null);
    setListening(true);
    stopDictation.current = dictate({
      onText: setQuestion,
      onDone: (text) => {
        setListening(false);
        stopDictation.current = null;
        if (text.trim() === '' || !conversation.send(text)) return;
        spoken.current = text;
        setQuestion('');
        following.current = true;
      },
      onError: (message) => {
        setListening(false);
        setVoiceError(message);
      },
    });
  }

  const lastQuestion = shown.at(-1)?.question;
  const lastReply = shown.at(-1)?.reply ?? '';
  useEffect(() => {
    if (spoken.current === null || inFlight !== null) return;
    if (lastQuestion !== spoken.current || lastReply === '') return;
    spoken.current = null;
    speak(lastReply);
  }, [lastQuestion, lastReply, inFlight]);

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        {/* Le titre du fil, et non « Assistant » : l'onglet du bas le dit déjà, et ce
            qu'on cherche ici est de quelle discussion il s'agit. */}
        <h2 className={styles.title}>{opened.data?.title ?? 'Nouvelle discussion'}</h2>
        {/* Deux icônes et non deux libellés : « Mémoire » et « Discussions » prenaient
            plus de la moitié de la barre, et le titre du fil — la seule chose qui change
            d'un écran à l'autre — s'y retrouvait tronqué à « Nouvelle discu… ». */}
        <div className={styles.barActions}>
          <Button
            variant="quiet"
            className={styles.iconButton}
            aria-label="Mémoire"
            aria-haspopup="dialog"
            aria-expanded={memoryOpen}
            onClick={() => {
              setMemoryOpen(true);
            }}
          >
            <IconBook size={20} />
          </Button>
          <Button
            variant="ghost"
            className={styles.iconButton}
            aria-label="Discussions"
            aria-haspopup="dialog"
            aria-expanded={threadsOpen}
            onClick={() => {
              setThreadsOpen(true);
            }}
          >
            <IconThreads size={20} />
          </Button>
        </div>
      </header>

      <div
        className={styles.stream}
        ref={stream}
        onScroll={(event) => {
          const node = event.currentTarget;
          // 40 px de marge : on « suit » encore si on est presque en bas, sinon un demi-
          // pixel d'inertie suffirait à décrocher le fil.
          following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
        }}
      >
        {!usable && (
          <Empty title="Assistance indisponible">
            {message}
            <br />
            Le carnet, lui, reste utilisable : il se lit et s’écrit à la main.
          </Empty>
        )}

        {/* L'état vide reste **un** état sur quatre : il ne peut pas disparaître, sinon
            un fil neuf serait un écran blanc sans rien qui dise quoi faire. Mais il tient
            en une ligne — le paragraphe qui décrivait ce que l'assistant lit et les quatre
            questions toutes faites sont partis avec le reste. */}
        {/* `inFlight` compte comme un tour : sans lui, « le fil commence ici » restait
            affiché **au-dessus de la question qu'on vient d'envoyer**. L'état vide
            décrivait alors un écran que l'utilisateur n'avait plus sous les yeux. */}
        {usable && shown.length === 0 && inFlight === null && (
          <p className={styles.welcomeText}>Pose ta question : le fil commence ici.</p>
        )}

        {shown.map((turn, index) => (
          <TurnView
            key={`${String(index)}-${turn.question.slice(0, 24)}`}
            turn={turn}
            busy={inFlight !== null}
            onRetry={() => {
              following.current = true;
              conversation.retry(turn.question, index, past.length);
            }}
          />
        ))}

        {inFlight !== null && (
          <PendingTurn question={inFlight} draft={draft} step={conversation.step} />
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="question">
          Ta question
        </label>
        <textarea
          id="question"
          className={styles.input}
          ref={composer}
          rows={1}
          value={question}
          placeholder={usable ? 'Écris ta question…' : 'Assistance indisponible'}
          disabled={!usable}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          onKeyDown={(event) => {
            // Entrée envoie, Maj+Entrée passe à la ligne — la convention de toutes les
            // messageries. `isComposing` protège les claviers à composition (accents,
            // idéogrammes) : sans lui, valider un caractère enverrait le message.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        {canDictate && usable && (
          <Button
            variant={listening ? 'primary' : 'ghost'}
            className={styles.send}
            aria-label={listening ? 'Arrêter la dictée' : 'Dicter ta question'}
            aria-pressed={listening}
            disabled={inFlight !== null}
            onClick={toggleDictation}
          >
            <IconMic size={20} />
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          className={styles.send}
          busy={inFlight !== null}
          disabled={question.trim() === '' || !usable}
          aria-label="Envoyer"
        >
          ↑
        </Button>
      </form>

      {voiceError !== null && (
        <p className={styles.voiceError} role="alert">
          {voiceError}
        </p>
      )}

      <ThreadSheet
        open={threadsOpen}
        current={threadId}
        onClose={() => {
          setThreadsOpen(false);
          forget();
        }}
        onOpenThread={(id) => {
          openThread(id);
          conversation.clear();
          following.current = true;
          // L'adresse cesse d'annoncer le fil qu'on vient de quitter.
          forget();
        }}
      />

      <MemorySheet
        open={memoryOpen}
        onClose={() => {
          setMemoryOpen(false);
          forget();
        }}
      />
    </div>
  );
}
