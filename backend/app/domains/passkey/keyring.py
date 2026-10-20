"""Les passkeys enregistrées, **sur le disque du serveur** (D2).

Une clé publique n'est pas un secret, mais se connecter ne doit pas dépendre de Nextcloud :
un stockage injoignable fermerait la porte au moment où l'on en a besoin pour regarder ce
qui ne va pas. Le fichier s'écrit d'un coup — un temporaire, puis un renommage — pour
qu'une coupure en pleine écriture ne laisse pas un trousseau illisible.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

FILE = "passkeys.json"


@dataclass(frozen=True, slots=True)
class Key:
    #: L'identifiant de la passkey, en base64url — stable : c'est lui qui la désigne.
    id: str
    public_key: str
    sign_count: int
    name: str
    created: str

    @property
    def token(self) -> str:
        """Le jeton `If-Match` : il change si la passkey change, pas à chaque connexion."""
        return hashlib.sha256(f"{self.id}|{self.name}|{self.created}".encode()).hexdigest()[:12]


class Keyring:
    def __init__(self, folder: str) -> None:
        self._path = Path(folder) / FILE

    def all(self) -> list[Key]:
        if not self._path.exists():
            return []
        return [Key(**item) for item in json.loads(self._path.read_text(encoding="utf-8"))]

    def save(self, keys: list[Key]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps([asdict(key) for key in keys], ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        os.replace(temporary, self._path)
