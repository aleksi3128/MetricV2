# Le dossier médical, chiffré, et la mémoire longue du coach

Lot **R9** de [`runfurther-dans-metric.md`](runfurther-dans-metric.md), plan du 20/10/2026.
Exigences MED-03, COA-03.

Le cahier traite l'application comme un coffre-fort : le dossier médical — profil
biomécanique, semelles, praticiens, consultations, opérations, traitements — est **chiffré par
l'application** avant d'aller sur Nextcloud, avec une clé qui n'y va jamais. Il se dicte, l'IA
le range, l'utilisateur valide. Et le coach s'en souvient, avec ses propres décisions passées.

Décisions prises seul (délégation du 19/10).

---

## 1. Les décisions

| # | Question | Décision | Ce que ça coûte |
|---|---|---|---|
| D1 | Le chiffrement | **AES-256-GCM** (`cryptography`), une enveloppe par entrée — nonce de 12 octets, authentifiée | — |
| D2 | La clé | **`MEDICAL_KEY` dans l'`.env` du serveur**, 32 octets en base64, produite par `make medical-key` ; jamais sur Nextcloud, jamais à l'écran | **Clé perdue, dossier illisible** — aucune annulation, aucune récupération. Elle se recopie sur papier |
| D3 | Sans clé | **Le dossier est fermé** : `503`, un code du catalogue, une phrase qui dit quoi faire. Rien ne s'écrit en clair « en attendant » | — |
| D4 | Ce qui reste en clair | **L'identifiant et le jeton d'une ligne, rien d'autre** — ni la nature, ni la date : « opération, mars 2024 » est déjà une donnée médicale | Le fichier ne se lit plus dans un tableur ; c'est le prix du coffre |
| D5 | Une entrée | **nature** (profil, semelles, praticien, consultation, opération, antécédent, traitement), **date** facultative, **titre**, **détails**, **praticien** facultatif | — |
| D6 | Dicter (MED-03) | **La dictée de R8**, puis une **proposition** rangée par le modèle, montrée dans un `AiBlock` ; rien ne s'écrit sans « Reprendre » puis « Enregistrer » | La phrase dictée part au modèle : c'est le seul moment où un morceau du dossier quitte le serveur |
| D7 | Ce que le coach en lit (COA-03) | **Les titres** des entrées de profil, semelles, antécédents et traitements — jamais les détails, jamais les praticiens, jamais les consultations | Le minimum utile (§6 du cahier) : un coach qui sait « pied hyperlaxe, semelles sur mesure » ; pas un dossier envoyé à chaque question |
| D8 | Ses décisions passées | **Les cinq dernières modifications du planning** et leur raison entrent au contexte | — |
| D9 | Les journaux | **Jamais un contenu** : une erreur de déchiffrement se journalise par l'identifiant de la ligne | — |
| D10 | Les identifiants Garmin | **Restent dans l'`.env`**, hors de Nextcloud : ils sont déjà hors de la base | Le cahier demandait un chiffrement applicatif ; l'`.env` du serveur en tient lieu, écart dit. *Sans objet depuis le 28 octobre : la synchro et ses identifiants sont retirés* |

---

## 2. Les données

`medical/entries.csv` : `entry_id`, `sealed` (l'entrée entière, chiffrée, en base64), `created`.
Famille *mesure*.

---

## 3. Les surfaces

- `core/crypto.py` : sceller, ouvrir — et l'erreur d'une clé absente ou fausse.
- `domains/medical/` : `GET/POST /api/medical`, `PATCH/DELETE /api/medical/{id}` sous
  `If-Match`, `POST /api/medical/parse`.
- `make medical-key`.
- `assistant/context.py` : D7 et D8.
- Un écran `/dossier`, dans « Plus » : les entrées par nature, la saisie, la dictée.

---

## 4. Ce que ce lot ne fait pas

- **L'export PDF pour un praticien** (MED-07, V2).
- **Changer de clé** : il faudrait tout rechiffrer ; à écrire le jour où ce sera utile.

---

## 5. Journal

### R9 livré (20 octobre 2026)

Livré tel que planifié. Rejoué sur la vraie API, stockage en mémoire et clé de passage :
quatre entrées saisies par les routes, **aucun mot d'elles dans le fichier** — ni le titre,
ni la nature, ni le praticien —, et l'écran les relit en clair, rangées par nature. Sans clé,
`503 medical_not_configured`, rien d'écrit, et l'écran recopie la phrase du serveur sans
offrir de saisie.

La vue du dossier porte **le jour du serveur**, qui borne la date d'une entrée : l'écran
n'a pas à le prendre au téléphone.

#### Ce que le passage à l'écran a trouvé

- **L'intertitre d'une nature collait à la carte d'au-dessus** et flottait loin de la
  sienne : la règle, première de sa section, perdait sa marge haute. Rendue.
- **« Nature » était le seul libellé en casse de phrase**, entre « Titre » et « Date » en
  capitales : il prend le style d'un `Field`.
- L'exemple du titre était coupé à 360 px : raccourci.

#### Laissé, et pourquoi

- **Aucune vraie clé n'a été produite** : `make medical-key` l'écrit, et c'est à
  l'utilisateur de la poser dans l'`.env` du serveur — **et de la recopier sur papier**.
  Perdue, le dossier est illisible.
- **La dictée n'a été éprouvée qu'en test**, contre une doublure du modèle : comme en R8,
  rien n'a été dit à un vrai micro.
- Les identifiants Garmin restent dans l'`.env` (D10) — écart au cahier, dit.
