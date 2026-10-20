"""Génération de la clé du dossier médical (`docs/dossier-medical.md`, D2).

    make medical-key

La clé est affichée, à coller dans `.env` sous `MEDICAL_KEY` — rien n'est écrit sur le
disque. **Recopie-la sur papier** : perdue, elle rend le dossier illisible, et le projet n'a
aucune annulation. **Ne la change pas** une fois des entrées écrites : elles ne
s'ouvriraient plus.
"""

from __future__ import annotations

from app.core.crypto import new_key


def main() -> None:
    print("MEDICAL_KEY=" + new_key())
    print()
    print("Recopie-la sur papier : perdue, elle rend le dossier médical illisible.")
    print("Ne la change pas une fois des entrées écrites : elles ne s'ouvriraient plus.")


if __name__ == "__main__":
    main()
