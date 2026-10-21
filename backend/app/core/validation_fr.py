"""Messages de validation en français (audit du 17 octobre, fiche 11).

Pydantic écrit ses refus en anglais — « Input should be greater than or equal to 0 » — et
`handle_validation_error` les recopiait sous les champs, tels quels. Le client affiche le
message du serveur sans le retoucher (CLAUDE.md §2) : c'est donc ici, et seulement ici,
qu'il devient français.

La traduction se fait sur `type`, jamais sur le texte anglais : le texte change d'une
version de Pydantic à l'autre, le type est contractuel. La borne vient de `ctx`.

Un type absent de la table ne retombe **jamais** sur l'anglais : il prend un message
générique. Mieux vaut « valeur invalide » sous le bon champ qu'une phrase qu'on ne lit pas.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

#: Le préfixe que Pydantic colle devant le message d'un `ValueError` levé par nos propres
#: validateurs — qui sont déjà en français. On le retire, rien de plus.
_PREFIXES = ("Value error, ", "Assertion failed, ")

_NUMBER = "Un nombre est attendu."
_DATE = "Date invalide — attendue sous la forme AAAA-MM-JJ."
_DATETIME = "Date et heure invalides."
_TIME = "Heure invalide — attendue sous la forme HH:MM."

_PLAIN: dict[str, str] = {
    "missing": "Champ obligatoire.",
    "float_parsing": _NUMBER,
    "float_type": _NUMBER,
    "int_parsing": _NUMBER,
    "int_type": _NUMBER,
    "decimal_parsing": _NUMBER,
    "decimal_type": _NUMBER,
    "finite_number": _NUMBER,
    "int_from_float": "Un nombre entier est attendu.",
    "string_type": "Un texte est attendu.",
    "string_pattern_mismatch": "Format non reconnu.",
    "bool_parsing": "Oui ou non est attendu.",
    "bool_type": "Oui ou non est attendu.",
    "date_parsing": _DATE,
    "date_type": _DATE,
    "date_from_datetime_parsing": _DATE,
    "date_from_datetime_inexact": _DATE,
    "datetime_parsing": _DATETIME,
    "datetime_type": _DATETIME,
    "datetime_from_date_parsing": _DATETIME,
    "time_parsing": _TIME,
    "time_type": _TIME,
    "date_past": "La date ne peut pas être dans le futur.",
    "date_future": "La date doit être à venir.",
    "datetime_past": "Le moment ne peut pas être dans le futur.",
    "datetime_future": "Le moment doit être à venir.",
    "list_type": "Une liste est attendue.",
    "dict_type": "Un objet est attendu.",
    "model_type": "Un objet est attendu.",
    "model_attributes_type": "Un objet est attendu.",
    "extra_forbidden": "Champ inconnu.",
    "json_invalid": "Contenu illisible : le JSON est mal formé.",
    "url_parsing": "Adresse invalide.",
    "url_type": "Adresse invalide.",
    "url_scheme": "Adresse invalide.",
    "uuid_parsing": "Identifiant invalide.",
}


def _number(value: Any) -> str:
    """Une borne telle qu'elle se lit : « 10 000 », « 0,5 »."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return str(value)
    if float(value).is_integer():
        return f"{int(value):,}".replace(",", " ")
    return f"{value}".replace(".", ",")


def _choices(expected: Any) -> str:
    """`'run' or 'workout'` → `run, workout`."""
    text = str(expected).replace(" or ", ", ")
    return text.replace("'", "")


def translate(error: Mapping[str, Any]) -> str:
    kind = str(error.get("type", ""))
    ctx: Mapping[str, Any] = error.get("ctx") or {}

    if kind in ("value_error", "assertion_error"):
        message = str(error.get("msg", ""))
        for prefix in _PREFIXES:
            message = message.removeprefix(prefix)
        return message or "Valeur invalide."

    match kind:
        case "greater_than":
            return f"Doit être supérieur à {_number(ctx.get('gt'))}."
        case "greater_than_equal":
            return f"Doit valoir au moins {_number(ctx.get('ge'))}."
        case "less_than":
            return f"Doit être inférieur à {_number(ctx.get('lt'))}."
        case "less_than_equal":
            return f"Doit valoir au plus {_number(ctx.get('le'))}."
        case "string_too_short":
            count = int(ctx.get("min_length", 1))
            return "Ne peut pas être vide." if count == 1 else f"Au moins {count} caractères."
        case "string_too_long":
            return f"Au plus {_number(ctx.get('max_length'))} caractères."
        case "too_short":
            return f"Au moins {_number(ctx.get('min_length'))} élément(s)."
        case "too_long":
            return f"Au plus {_number(ctx.get('max_length'))} éléments."
        case "literal_error" | "enum":
            return f"Valeur non reconnue — attendu : {_choices(ctx.get('expected', ''))}."
        case "multiple_of":
            return f"Doit être un multiple de {_number(ctx.get('multiple_of'))}."
        case "decimal_max_places":
            return f"Au plus {_number(ctx.get('decimal_places'))} décimale(s)."

    return _PLAIN.get(kind, "Valeur invalide.")
