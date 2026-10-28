/**
 * L'assistant (`IA-09` → `IA-16`).
 *
 * Un écran de discussion, et rien d'autre : la hauteur entière, un fil qui défile, une
 * saisie collée en bas. Ce qui vivait au-dessous — le carnet, ses formulaires — est passé
 * dans des feuilles, chacune dans son fichier (`assistant/ThreadSheet.tsx`,
 * `assistant/MemorySheet.tsx`). Un chat dont il faut faire défiler la page pour retrouver le champ
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

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button, Chip, ChipStrip, Empty, LinkButton, Skeleton } from '@/components/ui';
import { IconBook, IconMic, IconThreads } from '@/components/ui/icons';
import { dictate, dictationSupported, speak } from '@/lib/voice';
import { useAiStatus } from '@/features/ai/useAiStatus';
import { assistantApi } from '@/features/assistant/api';
import { ApiError } from '@/lib/api';
import { keys } from '@/lib/query';

import styles from './Assistant.module.css';
import { PendingTurn, TurnView } from './assistant/Conversation';
import { MemorySheet, type MemoryTab } from './assistant/MemorySheet';
import { ThreadSheet } from './assistant/ThreadSheet';
import { pastFrom, useConversation } from './assistant/useConversation';

/**
 * Des débuts de question pour le fil du planning, pas des réponses : ils remplissent le
 * champ, rien de plus. Venus de la carte qui vivait sous la grille de `/planning` (M-20).
 */
const PLANNING_STARTERS = [
  'Ma semaine de natation',
  'Une séance technique',
  'Ajuste à ce que j’ai nagé',
];

// ── Écran ─────────────────────────────────────────────

export function Assistant() {
  const { enabled, pending: statusPending, message } = useAiStatus();
  // Tant qu'on ne sait pas, on laisse écrire. Déclarer l'assistance indisponible avant
  // d'avoir posé la question afficherait un écran d'échec à chaque ouverture.
  const usable = enabled || statusPending;

  const [question, setQuestion] = useState('');
  /**
   * Les deux feuilles s'ouvrent **par l'adresse** — `?ouvre=discussions`, `?ouvre=memoire`
   * pour le carnet, `?ouvre=profil` pour le profil (M-05) — et un fil s'ouvre de même —
   * `?fil=<identifiant>`.
   *
   * Une surface qu'on atteint depuis ailleurs — un favori, un lien gardé ; le tableau de
   * bord y menait jusqu'à M-22 — a besoin d'être adressable : sans cela, le lien ouvrirait
   * la conversation et l'utilisateur aurait un appui de plus à faire, sans savoir lequel.
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
  const [decided, setDecided] = useState(params.has('fil') || params.get('portee') === 'planning');
  /**
   * **`?portee=planning` ouvre le fil du planning** — l'entrée « Demander au planning » de
   * `/planning` y mène (M-20).
   *
   * Une portée et non un identifiant : la première fois, le fil n'existe pas encore, et
   * l'écran n'en invente aucun. Il demande au serveur le fil du planning ; s'il y en a un,
   * il l'ouvre, sinon la première question part avec `scope: "planning"` et c'est le
   * serveur qui ouvre le fil — l'unique, qu'une seconde question sans identifiant
   * rouvrirait plutôt que d'en créer un autre.
   *
   * Tenu dans un état et pas relu dans l'adresse : celle-ci perd `?portee` à la fermeture
   * d'une feuille, comme `?fil`, et le fil ne doit pas changer de nature pour autant. Il
   * cesse quand on ouvre un autre fil depuis la feuille.
   */
  const [planningEntry, setPlanningEntry] = useState(params.get('portee') === 'planning');
  /**
   * Le titre rendu avec la première réponse d'un fil neuf. Le fil n'est pas relu après
   * une réponse — il afficherait le tour en double —, et sans ce titre l'en-tête restait
   * sur « Nouvelle discussion » dans un fil qui venait d'en recevoir un.
   */
  const [answeredTitle, setAnsweredTitle] = useState<string | null>(null);

  function openThread(id: string | null): void {
    setDecided(true);
    setChosen(id);
  }

  /** Un fil choisi dans la feuille : il porte sa propre portée, lue sur lui. */
  function switchThread(id: string | null): void {
    openThread(id);
    setPlanningEntry(false);
    setAnsweredTitle(null);
  }
  const [threadsOpen, setThreadsOpen] = useState(asked === 'discussions');
  const [memoryOpen, setMemoryOpen] = useState(asked === 'memoire' || asked === 'profil');
  const [memoryTab, setMemoryTab] = useState<MemoryTab>(asked === 'profil' ? 'profil' : 'carnet');

  function forget(): void {
    if (!params.has('ouvre') && !params.has('fil') && !params.has('portee')) return;
    const next = new URLSearchParams(params);
    next.delete('ouvre');
    next.delete('fil');
    next.delete('portee');
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
   * Le fil du planning, demandé seulement par l'entrée de `/planning` et tant qu'aucun fil
   * n'a été choisi. `thread: null` n'est pas une erreur : c'est la première fois.
   */
  const planningThread = useQuery({
    queryKey: keys.assistant.planningThread(),
    queryFn: assistantApi.planningThread,
    enabled: planningEntry && chosen === null,
  });
  const resolving = planningEntry && chosen === null;

  /**
   * Le fil réellement ouvert — **dérivé au rendu**, pas posé par un effet.
   *
   * Un `useEffect` qui appellerait `setThreadId` provoquerait un rendu en cascade pour une
   * valeur qu'on sait déjà calculer ici. La reprise n'est qu'un défaut : elle s'applique
   * tant que rien n'a été choisi, et le choix l'emporte dès qu'il existe.
   */
  const threadId =
    chosen ??
    (resolving
      ? (planningThread.data?.thread?.thread_id ?? null)
      : decided
        ? null
        : (resume.data?.resume ?? null));

  /**
   * La conversation — ses tours, la question en vol, l'attente. **La même** que celle du
   * fil Planning (`routes/assistant/Conversation.tsx`) : deux copies auraient donné deux
   * façons d'annuler un ajout et deux attentes.
   */
  const conversation = useConversation({
    threadId,
    // Ne part que sans fil : celle d'un fil existant est écrite côté serveur. Mais c'est
    // ce qui fait que la première question de l'entrée du planning ouvre **le** fil du
    // planning, et non une discussion ordinaire.
    scope: planningEntry ? 'planning' : '',
    onAnswer: (result) => {
      openThread(result.thread_id);
      setAnsweredTitle(result.title === '' ? null : result.title);
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
   * Le fil du planning — par l'entrée de `/planning`, ou rouvert depuis la feuille. Il a
   * son titre, une mention, et ses trois débuts de question ; un fil ordinaire n'en a
   * aucun. La portée se lit sur le fil : l'écran ne fait que l'afficher.
   */
  const inPlanning = planningEntry || opened.data?.scope === 'planning';
  const title =
    opened.data?.title ?? answeredTitle ?? (inPlanning ? 'Planning' : 'Nouvelle discussion');

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
        <h2 className={styles.title}>{title}</h2>
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
              // L'en-tête ouvre le carnet, comme il l'a toujours fait ; le profil est à un
              // onglet de là.
              setMemoryTab('carnet');
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
            Le carnet et le profil, eux, restent utilisables : ils se lisent et s’écrivent à la
            main.
          </Empty>
        )}

        {/* L'état vide reste **un** état sur quatre : il ne peut pas disparaître, sinon
            un fil neuf serait un écran blanc sans rien qui dise quoi faire. Mais il tient
            en une ligne — le paragraphe qui décrivait ce que l'assistant lit et les quatre
            questions toutes faites sont partis avec le reste. */}
        {/* `inFlight` compte comme un tour : sans lui, « le fil commence ici » restait
            affiché **au-dessus de la question qu'on vient d'envoyer**. L'état vide
            décrivait alors un écran que l'utilisateur n'avait plus sous les yeux. */}
        {inPlanning && (
          <div className={styles.scopeNote}>
            <p className={styles.welcomeText}>
              Le fil du planning : chaque natation s’y écrit dans la notation — CR, EF, R15 — et
              rien n’entre au planning avant que tu adoptes.
            </p>
            <LinkButton variant="quiet" to="/planning">
              Voir le planning
            </LinkButton>
          </div>
        )}

        {/* Le fil du planning se cherche avant de s'afficher : sans cette attente, l'écran
            dirait « le fil commence ici » au-dessus d'un fil qui existe. */}
        {usable && resolving && planningThread.isPending && <Skeleton lines={3} />}

        {usable && resolving && planningThread.error !== null && (
          <Empty title="Fil du planning illisible">
            {planningThread.error instanceof ApiError
              ? planningThread.error.message
              : 'Le serveur est injoignable.'}
          </Empty>
        )}

        {usable &&
          shown.length === 0 &&
          inFlight === null &&
          !(resolving && (planningThread.isPending || planningThread.error !== null)) && (
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

      {/* Les débuts de question du planning, champ vide : un appui remplit, rien ne part. */}
      {inPlanning && usable && question === '' && inFlight === null && (
        <div className={styles.starters}>
          <ChipStrip label="Pour commencer">
            {PLANNING_STARTERS.map((starter) => (
              <Chip
                key={starter}
                onClick={() => {
                  setQuestion(starter);
                  composer.current?.focus();
                }}
              >
                {starter}
              </Chip>
            ))}
          </ChipStrip>
        </div>
      )}

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
          switchThread(id);
          conversation.clear();
          following.current = true;
          // L'adresse cesse d'annoncer le fil qu'on vient de quitter.
          forget();
        }}
      />

      <MemorySheet
        open={memoryOpen}
        tab={memoryTab}
        onTab={setMemoryTab}
        onClose={() => {
          setMemoryOpen(false);
          forget();
        }}
      />
    </div>
  );
}
