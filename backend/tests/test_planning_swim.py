"""La notation d'une séance de natation (`docs/planning-natation.md` §2).

Module pur : chaque cas est une chaîne fixe. Trois familles — ce qui se lit, ce qui se
tolère (la typographie du pouce), et ce qui se refuse, avec la ligne et le jeton fautifs.
"""

from __future__ import annotations

import pytest

from app.domains.planning.swim import (
    Glossary,
    SwimCode,
    code_problem,
    describe_errors,
    normalise_code,
    parse,
    uses,
)

EXAMPLE = """Échauffement :
400 CR EF
4×50 CR EA ÉD R15
Corps :
8×100 CR EA PB R20
2×(4×25 CR SP R30) R1'
Retour au calme :
200 DOS RC
"""


# ── Ce qui se lit ─────────────────────────────────────


def test_the_example_of_the_plan_totals_2200_m() -> None:
    program = parse(EXAMPLE)

    assert program.valid
    assert program.total_m == 400 + 200 + 800 + 200 + 200
    assert [(share.code, share.distance_m) for share in program.by_stroke] == [
        ("CR", 1600),
        ("DOS", 200),
    ]
    # 4×15 + 8×20 + 2×(4×30 + 60)
    assert program.rest_s == 60 + 160 + 360


def test_sections_and_blocks_keep_their_line_number() -> None:
    program = parse(EXAMPLE)

    assert [(line.number, line.kind) for line in program.lines[:3]] == [
        (1, "section"),
        (2, "block"),
        (3, "block"),
    ]
    assert program.lines[0].text == "Échauffement :"
    assert program.lines[2].distance_m == 200


def test_pace_breakdown_only_counts_blocks_that_have_one() -> None:
    program = parse("400 CR EF\n200 BR\n4×50 CR SP")

    assert program.total_m == 800
    assert [(share.code, share.distance_m) for share in program.by_pace] == [
        ("EF", 400),
        ("SP", 200),
    ]


def test_a_departure_gives_no_rest() -> None:
    """`D1'30` dit quand repartir, pas combien de temps on souffle : sans l'allure nagée,
    l'en déduire serait inventer."""
    program = parse("8×100 CR EA D1'45")

    assert program.valid
    assert program.lines[0].text == "8×100 CR EA D1'45"
    assert program.rest_s is None


def test_recoveries_read_as_seconds_or_minutes() -> None:
    assert parse("100 CR R15").rest_s == 15
    assert parse("100 CR R1'").rest_s == 60
    assert parse("100 CR R1'30").rest_s == 90


def test_an_empty_program_has_no_total() -> None:
    """Une séance « piscine libre » n'a pas un total de 0 m : elle n'en a pas."""
    program = parse("")

    assert program.valid
    assert program.total_m is None
    assert program.lines == []


# ── Ce qui se tolère ──────────────────────────────────


@pytest.mark.parametrize("typed", ["8x50 CR", "8X50 CR", "8 x 50 CR", "8*50 CR", "8×50 CR"])
def test_any_times_sign_from_a_phone_keyboard(typed: str) -> None:
    program = parse(typed)

    assert program.valid, program.errors
    assert program.lines[0].text == "8×50 CR"


@pytest.mark.parametrize("typed", ["100 CR R1\u201930", "100 CR R1\u203230", "100 CR R1\u00b430"])
def test_curly_apostrophes_from_ios_are_minutes(typed: str) -> None:
    program = parse(typed)

    assert program.rest_s == 90
    assert program.lines[0].text == "100 CR R1'30"


def test_case_and_accents_are_not_another_code() -> None:
    program = parse("4×50 cr ed r15")

    assert program.valid, program.errors
    assert program.lines[0].text == "4×50 CR ÉD R15"


def test_a_group_can_be_typed_with_spaces_and_an_x() -> None:
    program = parse("2 x (4x25 cr sp r30 ; 100 dos rc) r1'")

    assert program.valid, program.errors
    assert program.lines[0].text == "2×(4×25 CR SP R30 ; 100 DOS RC) R1'"
    assert program.total_m == 400


# ── Ce qui se refuse ──────────────────────────────────


def test_a_synonym_is_refused_not_translated() -> None:
    program = parse("400 CR EF\n\n8×50 NL R15")

    assert not program.valid
    assert program.total_m is None  # aucun total sur un programme fautif
    [error] = program.errors
    assert error.line == 3  # la ligne vide compte : c'est celle qu'on voit
    assert error.token == "NL"
    assert "glossaire" in error.message


@pytest.mark.parametrize(
    ("typed", "token"),
    [
        ("30 CR", "30"),  # pas un multiple de 25
        ("2500 CR", "2500"),
        ("51×50 CR", "51×50"),
        ("CR 400", "CR"),  # la distance d'abord
        ("400 EF CR", "EF"),  # la nage d'abord
        ("400 CR PB EA", "EA"),  # l'allure avant les options
        ("400 CR DOS", "DOS"),  # une seule nage
        ("400 CR EF SP", "SP"),  # une seule allure
        ("400 CR PB PB", "PB"),
        ("400 CR R15 PB", "PB"),  # la récupération en dernier
        ("400 CR R15 D1'", "D1'"),
        ("100 CR R1'75", "R1'75"),
        ("100 CR R11'", "R11'"),
        ("50 R15", "R15"),  # « 50 R15 » : il manque la nage
    ],
)
def test_strict_order_and_bounds(typed: str, token: str) -> None:
    program = parse(typed)

    assert not program.valid
    assert program.errors[0].token == token, program.errors


def test_a_line_without_a_stroke_is_refused() -> None:
    [error] = parse("400").errors
    assert "nage" in error.message


def test_free_prose_is_not_a_block() -> None:
    """La prose est ce que la notation existe pour empêcher."""
    assert not parse("nager tranquille 20 minutes").valid


def test_nested_groups_are_refused() -> None:
    assert not parse("2×(2×(4×25 CR SP)) R1'").valid


def test_only_a_recovery_after_a_group() -> None:
    assert not parse("2×(4×25 CR SP) PB").valid


def test_every_faulty_line_is_reported() -> None:
    program = parse("400 NL\n200 CR\n100 XX")

    assert [error.line for error in program.errors] == [1, 3]
    assert describe_errors(program.errors) == (
        "ligne 1 : « NL » n'est pas dans le glossaire. ; "
        "ligne 3 : « XX » n'est pas dans le glossaire."
    )


def test_bounds_of_a_whole_program() -> None:
    assert not parse("\n".join(["50 CR"] * 41)).valid
    assert parse("\n".join(["50 CR"] * 40)).valid


# ── Le glossaire ──────────────────────────────────────


def test_an_added_code_is_read() -> None:
    glossary = Glossary([*Glossary.base().codes, SwimCode("CT", "crawl tête", "stroke", False)])

    assert parse("4×50 CT", glossary).valid
    assert not parse("4×50 CT").valid


def test_normalise_code() -> None:
    assert normalise_code(" éd ") == "ED"


@pytest.mark.parametrize("raw", ["", "TROPLONG", "C-R", "R15", "D1", "100", "  "])
def test_code_shape_is_checked(raw: str) -> None:
    assert code_problem(raw) is not None


@pytest.mark.parametrize("raw", ["CT", "4N", "RAT", "DO", "R"])
def test_good_codes_pass(raw: str) -> None:
    assert code_problem(raw) is None


def test_uses_reads_tokens_not_substrings() -> None:
    assert uses("4×50 CR PLA", "PLA")
    assert not uses("4×50 CR PLA", "PL")
    assert uses("2×(4×25 CR SP R30) R1'", "SP")
    assert uses("400 cr éd", "ÉD")
    assert not uses("Pull :\n400 CR", "PULL")  # un titre n'emploie rien


def test_describe_lists_every_category() -> None:
    lines = Glossary.base().describe()

    assert lines[0].startswith("nage : CR (crawl)")
    assert lines[1].startswith("allure : EF (endurance fondamentale)")
    assert lines[2].startswith("option : PB (pull-buoy)")
