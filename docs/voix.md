# La voix — dicter, écouter, et la douleur dite à voix haute

Lot **R8** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences COA-01, COA-02, COA-04, et la part vocale de MED-01.

Le cahier veut que tout puisse se faire à la voix, le texte en secours. Le plan d'ensemble
prévoyait une transcription **cloud** en français, payante. Ce lot ne l'appelle pas : il pose
la voix sur ce que le navigateur sait déjà faire, sans clé ni coût, et laisse le service
cloud comme une décision à prendre avec l'utilisateur.

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Transcrire | **La reconnaissance vocale du navigateur** (`SpeechRecognition`), en `fr-FR` | Elle part chez Apple ou Google selon l'appareil ; sur un appareil qui ne l'a pas, le micro ne s'affiche pas — le texte reste |
| D2 | La transcription cloud | **Pas dans ce lot** : un service payant, et les modèles gratuits que le dépôt emploie ne lisent pas l'audio | La qualité est celle du navigateur ; le service cloud se décide avec l'utilisateur (R0) |
| D3 | Répondre à voix haute (COA-02) | **La synthèse du navigateur** (`speechSynthesis`), une voix française de l'appareil | Rien ne sort de l'appareil ; la voix est celle du système, pas une voix de studio |
| D4 | Un message dicté | **Part tout seul** à la fin de la dictée, et **sa réponse est lue** | Une erreur de reconnaissance part avec le message : on la voit dans la bulle, et on corrige au tour suivant |
| D5 | Une réponse écrite | **« Écouter »** sur chaque réponse | — |
| D6 | Le markdown lu à voix haute | **Retiré avant la lecture** : ni `**`, ni puces, ni liens dits | — |
| D7 | Une douleur dictée (MED-01) | **Le modèle la structure en proposition** — zone, côté, intensité, base, moment, type, boiterie — montrée dans un `AiBlock` ; « Reprendre » remplit le formulaire, qu'on vérifie et enregistre | Le modèle propose, le serveur relit les bornes, l'utilisateur décide : la règle du dépôt |
| D8 | Le ton du coach (COA-04) | **Cash, motivant, technique** ; il contredit quand il le faut, et nomme son principe | Une phrase de plus dans la consigne |

---

## 2. Les surfaces

- `lib/voice.ts` : dicter, lire, retirer le markdown — une seule implémentation.
- L'assistant : un micro à côté de l'envoi ; « Écouter » sur chaque réponse.
- Le relevé de douleur : « Dicter », puis la proposition et « Reprendre ».
- `POST /api/pain/parse` `{text}` : la proposition structurée, bornée, ou un refus clair.
- `assistant/conversation.py` : le ton.

---

## 3. Ce que ce lot ne fait pas

- **L'appel vocal en temps réel** (COA-01, V2).
- **La transcription cloud** et **une voix de synthèse de qualité studio** : sur accord.
- **Le dossier médical dicté** : R9, qui réemploiera la dictée.

---

## 4. Journal

### R8 livré (20 octobre 2026)

Livré tel que planifié, **sans aucun service payant** : la dictée et la lecture sont celles
du navigateur. Éprouvé à l'écran avec une reconnaissance de théâtre — la question dictée
part, la réponse revient et se lit sans ses `**`.

#### Ce que le passage à l'écran a trouvé

- **« Dicter » s'affichait dans le relevé de douleur sans clé IA**, alors que la phrase est
  lue par le modèle : dicter n'aurait mené qu'à un refus. Le bouton n'apparaît qu'avec
  l'assistance — comme le micro de l'assistant.
- Le bouton collait au titre « Nouvelle douleur ».

#### Laissé, et pourquoi

- **Rien n'a été dit à un vrai micro.** La reconnaissance de Safari dans une application
  installée sur l'écran d'accueil d'iPhone est la grande inconnue du lot : si elle manque,
  le micro ne s'affiche pas, et la transcription cloud devient la seule voie — une décision
  à prendre avec l'utilisateur, payante.
- **La voix lue est celle du système**, pas une voix de studio.

