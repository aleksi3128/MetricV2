"""Parcourir l'arborescence de Metric sur Nextcloud — l'export et la sauvegarde
(`docs/exploitation-securite.md`, D4 et D6).

Un nom **avec** une extension est un fichier, un nom **sans** est un dossier : `PROPFIND`
ne dit pas la différence sans demander ses propriétés, et tous les fichiers du dépôt en
portent une (`.csv`, `.fit`, `.jpg`). Le dossier des sauvegardes n'est jamais parcouru :
sauvegarder les sauvegardes doublerait la place à chaque nuit.
"""

from __future__ import annotations

from urllib.parse import unquote

from app.storage.webdav import WebDavClient

BACKUPS = "_backups"


async def files(client: WebDavClient, path: str = "") -> list[str]:
    """Les chemins de tous les fichiers sous `path`, triés, hors `_backups`."""
    found: list[str] = []
    for raw in await client.list_collection(path):
        name = unquote(raw)
        if not name or (path == "" and name == BACKUPS):
            continue
        child = f"{path}/{name}" if path else name
        if "." in name:
            found.append(child)
        else:
            found += await files(client, child)
    return sorted(found)
