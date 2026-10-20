"""L'exploitation du serveur, en quatre commandes (`docs/exploitation-securite.md`, D6–D8).

    make status    l'API répond-elle, la dernière synchro, la dernière sauvegarde, l'usage IA
    make doctor    la configuration, les secrets, WebDAV, Garmin, les notifications, le disque
    make sync      une passe Garmin, tout de suite
    make backup    une copie datée de toutes les données, sur Nextcloud

`doctor` et `sync` touchent les **vrais** services : ce sont des commandes qu'on lance
soi-même. Chaque ligne en échec dit quoi faire — un diagnostic qui constate sans dire la
suite renvoie à la documentation au pire moment.
"""

from __future__ import annotations

import asyncio
import importlib.util
import os
import shutil
import sys
from collections.abc import Awaitable, Callable, Coroutine
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx2

from app.config import DEV_JWT_SECRET, Settings, get_settings
from app.core.crypto import Sealer
from app.core.dates import now_local, today_local
from app.core.exceptions import MedicalNotConfiguredError
from app.storage.files import FileStore
from app.storage.provider import StorageProvider

OK = "\033[32m✓\033[0m"
KO = "\033[31m✗\033[0m"
INFO = "\033[2m·\033[0m"
DIM = "\033[2m"
RESET = "\033[0m"

#: Sous ce seuil, le disque du serveur est jugé trop plein.
DISK_MIN_BYTES = 1 << 30


@dataclass(frozen=True, slots=True)
class Check:
    label: str
    #: `True` : bon. `False` : à corriger. `None` : facultatif, et pas en place.
    ok: bool | None
    detail: str = ""


def config_checks(settings: Settings, *, free_bytes: int, garmin_installed: bool) -> list[Check]:
    """Les contrôles qui ne parlent à aucun service — purs, donc testables."""
    checks: list[Check] = []

    secret_ok = settings.jwt_secret != DEV_JWT_SECRET and len(settings.jwt_secret) >= 32
    checks.append(
        Check(
            "Secret des jetons",
            secret_ok,
            "" if secret_ok else "JWT_SECRET : 32 caractères au moins, pas la valeur de dév.",
        )
    )
    checks.append(
        Check(
            "Mot de passe",
            bool(settings.auth_password_hash),
            "" if settings.auth_password_hash else "AUTH_PASSWORD_HASH vide : make hash-password",
        )
    )
    checks.append(
        Check(
            "Stockage Nextcloud",
            settings.storage_configured,
            "" if settings.storage_configured else "NEXTCLOUD_URL et NEXTCLOUD_USERNAME",
        )
    )

    if settings.medical_key:
        try:
            Sealer(settings.medical_key)
            checks.append(Check("Clé du dossier médical", True, "recopiée sur papier ?"))
        except MedicalNotConfiguredError:
            checks.append(
                Check("Clé du dossier médical", False, "MEDICAL_KEY illisible : make medical-key")
            )
    else:
        checks.append(Check("Dossier médical", None, "fermé sans MEDICAL_KEY : make medical-key"))

    checks.append(
        Check("Assistance IA", True, f"plafond {settings.ai_monthly_budget_usd:g} $ par mois")
        if settings.ai_enabled
        else Check("Assistance IA", None, "coupée sans OPENROUTER_API_KEY")
    )
    checks.append(
        Check("Notifications", True)
        if settings.push_enabled
        else Check("Notifications", None, "coupées sans paire VAPID : make vapid-keys")
    )

    has_credentials = bool(settings.garmin_email and settings.garmin_password)
    if not has_credentials:
        checks.append(
            Check("Garmin", None, "GARMIN_EMAIL et GARMIN_PASSWORD vides : le .fit reste")
        )
    elif not garmin_installed:
        checks.append(
            Check("Garmin", False, "bibliothèque absente : .venv/bin/pip install garminconnect")
        )
    else:
        checks.append(Check("Garmin", True, "identifiants et bibliothèque présents"))

    checks.append(
        Check(
            "Sauvegarde de nuit",
            True if settings.backup_daily else None,
            "chaque nuit"
            if settings.backup_daily
            else "coupée : BACKUP_DAILY=true, ou make backup",
        )
    )

    gib = free_bytes / (1 << 30)
    checks.append(
        Check(
            "Espace disque",
            free_bytes >= DISK_MIN_BYTES,
            f"{gib:.1f} Gio libres".replace(".", ","),
        )
    )
    return checks


def show(check: Check) -> None:
    mark = OK if check.ok else KO if check.ok is False else INFO
    suffix = f" {DIM}{check.detail}{RESET}" if check.detail else ""
    print(f"  {mark} {check.label}{suffix}")


async def _with_store(work: Callable[[FileStore], Awaitable[int]]) -> int:
    settings = get_settings()
    if not settings.storage_configured:
        show(Check("Stockage Nextcloud", False, "non configuré"))
        return 1
    provider = StorageProvider(settings)
    await provider.start()
    try:
        return await work(provider.store)
    finally:
        await provider.stop()


# ── Les commandes ─────────────────────────────────────


async def doctor() -> int:
    settings = get_settings()
    print("\nDiagnostic de Metric\n")
    checks = config_checks(
        settings,
        free_bytes=shutil.disk_usage(Path.cwd()).free,
        garmin_installed=importlib.util.find_spec("garminconnect") is not None,
    )
    for check in checks:
        show(check)
    failed = any(check.ok is False for check in checks)

    if settings.storage_configured:
        from app.scripts import check_storage

        failed = (await check_storage.run()) != 0 or failed
    print()
    return 1 if failed else 0


async def status() -> int:
    from app.domains.ai.usage import UsageService
    from app.domains.backup.service import BackupService
    from app.domains.sync.service import read_state

    settings = get_settings()
    print("\nÉtat de Metric\n")
    url = os.environ.get("METRIC_API_URL", "http://127.0.0.1:8000")
    try:
        async with httpx2.AsyncClient(timeout=5) as client:
            response = await client.get(f"{url}/api/health")
        show(Check("API", response.status_code == 200, f"{url} → {response.status_code}"))
    except httpx2.HTTPError as error:
        show(Check("API", False, f"{url} injoignable : {error}"))

    async def work(store: FileStore) -> int:
        state = await read_state(store)
        last = state.get("last_success")
        error = state.get("last_error")
        show(
            Check(
                "Synchro Garmin",
                not error if last or error else None,
                error or (f"dernière le {last[:16].replace('T', ' à ')}" if last else "jamais"),
            )
        )
        backup = await BackupService(store).last()
        show(Check("Sauvegarde", True if backup else None, backup or "aucune"))
        usage = await UsageService(store).view(today_local(), settings.ai_monthly_budget_usd)
        show(Check("Usage IA", True, usage.text))
        return 0

    code = await _with_store(work)
    print()
    return code


async def sync() -> int:
    from app.domains.sync import connector as remote
    from app.domains.sync.service import SyncService

    settings = get_settings()
    try:
        connector = remote.factory(settings)
    except remote.ConnectorError as error:
        show(Check("Synchro Garmin", False, str(error)))
        return 1

    async def work(store: FileStore) -> int:
        result = await SyncService(store, connector).run(now_local())
        if result.error:
            show(Check("Synchro Garmin", False, result.error))
            return 1
        received = ", ".join(item.label for item in result.received) or "rien de nouveau"
        show(Check("Synchro Garmin", True, f"{received} ; {result.health_days} jour(s) de santé"))
        return 0

    return await _with_store(work)


async def backup() -> int:
    from app.domains.backup.service import BackupService

    async def work(store: FileStore) -> int:
        outcome = await BackupService(store).run(today_local())
        detail = f"{outcome.copied} fichiers dans _backups/{outcome.day.isoformat()}"
        if outcome.removed:
            detail += f" ; retirées : {', '.join(outcome.removed)}"
        show(Check("Sauvegarde", True, detail))
        return 0

    return await _with_store(work)


COMMANDS: dict[str, Callable[[], Coroutine[Any, Any, int]]] = {
    "status": status,
    "doctor": doctor,
    "sync": sync,
    "backup": backup,
}


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    if name not in COMMANDS:
        print(f"usage : python -m app.scripts.ops {{{'|'.join(COMMANDS)}}}")
        raise SystemExit(2)
    raise SystemExit(asyncio.run(COMMANDS[name]()))


if __name__ == "__main__":
    main()
