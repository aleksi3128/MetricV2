/**
 * La voix, telle que le navigateur la sait (`docs/voix.md`, D1–D6).
 *
 * **Une seule implémentation** pour dicter et pour lire : l'assistant et le relevé de
 * douleur passent par ici. Deux façons de démarrer la reconnaissance finiraient par ne
 * plus rendre la même chose.
 *
 * Rien n'est appelé côté serveur. La reconnaissance part chez le fournisseur du navigateur
 * (Apple, Google) ; la lecture reste sur l'appareil. Là où l'une ou l'autre manque, la
 * fonction le dit, et l'écran n'affiche pas le bouton : le texte reste la voie.
 */

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return recognitionClass() !== null;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Démarre une dictée en français. `onText` reçoit le texte entendu jusque-là ;
 * `onDone` le texte final, à l'arrêt — vide si rien n'a été compris. Rend la fonction
 * qui arrête.
 */
export function dictate({
  onText,
  onDone,
  onError,
}: {
  onText: (text: string) => void;
  onDone: (text: string) => void;
  onError: (message: string) => void;
}): () => void {
  const Klass = recognitionClass();
  if (Klass === null) {
    onError('La dictée n’est pas disponible sur ce navigateur.');
    return () => undefined;
  }
  const recognition = new Klass();
  recognition.lang = 'fr-FR';
  recognition.interimResults = true;
  recognition.continuous = true;
  let finals = '';
  let heard = '';
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result === undefined) continue;
      if (result.isFinal) finals += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    heard = `${finals}${interim}`.trim();
    onText(heard);
  };
  recognition.onerror = (event) => {
    // « no-speech » n'est pas une panne : rien n'a été dit. Le reste se dit en clair.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    onError(
      event.error === 'not-allowed'
        ? 'Le micro est refusé pour ce site : autorise-le dans les réglages du navigateur.'
        : 'La dictée s’est interrompue. Réessaie, ou écris.',
    );
  };
  recognition.onend = () => {
    onDone(heard);
  };
  recognition.start();
  return () => {
    recognition.stop();
  };
}

/** Le markdown d'une réponse, rendu dicible : ni `**`, ni puces, ni adresses (D6). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lit un texte à voix haute, d'une voix française de l'appareil. Coupe ce qui se lisait. */
export function speak(text: string): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(plainText(text));
  utterance.lang = 'fr-FR';
  const voice = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('fr'));
  if (voice !== undefined) utterance.voice = voice;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
