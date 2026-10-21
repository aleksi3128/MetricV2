import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  AmountEntry,
  Badge,
  Button,
  Card,
  Check,
  CheckGroup,
  Empty,
  Field,
  PageHead,
  Progress,
  Ring,
  Rule,
  Skeleton,
  Sparkline,
  Stat,
  SwipeRow,
  CadencePicker,
  CADENCE_KINDS,
  cadenceDraft,
  serializeCadence,
  type CadenceDraft,
} from '@/components/ui';
import {
  routineApi,
  type ChecklistItem,
  type ChecklistView,
  type Supplement,
} from '@/features/routine/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { integer, longDate, num, plural, time, volume } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Routine.module.css';

/** Découpage de la journée, repris de la charte (section 08). */
const MOMENTS = [
  { label: 'Matin', until: '11:59' },
  { label: 'Journée', until: '17:59' },
  { label: 'Soir', until: '23:59' },
] as const;

function momentOf(clock: string): string {
  return MOMENTS.find((moment) => clock <= moment.until)?.label ?? 'Soir';
}

function useInvalidateRoutine() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.hydration.all() });
    void client.invalidateQueries({ queryKey: keys.supplements.all() });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  };
}

// ── Hydratation ───────────────────────────────────────

function Hydration() {
  const client = useQueryClient();
  const invalidate = useInvalidateRoutine();
  const { notify } = useToast();

  const { data, error } = useQuery({
    queryKey: keys.hydration.all(),
    queryFn: () => routineApi.hydration(),
  });

  const drink = useMutation({
    mutationFn: (millilitres: number) => routineApi.drink(millilitres),
    onSuccess: () => {
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const undrink = useMutation({
    mutationFn: ({ id, token }: { id: number; token: string }) => routineApi.undrink(id, token),
    onSuccess: () => {
      invalidate();
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      void client.invalidateQueries({ queryKey: keys.hydration.all() });
    },
  });

  const stats = data?.stats;

  return (
    <Card>
      <div className="spread">
        <div>
          <h3>Hydratation</h3>
          <p className={styles.note}>
            Un volume, un geste. La prise est horodatée à l'instant du clic.
          </p>
        </div>
        {stats && (
          <Badge tone={stats.today_ml >= stats.target_ml ? 'effort' : 'signal'} mono>
            {volume(stats.today_ml)} / {volume(stats.target_ml)}
          </Badge>
        )}
      </div>

      {/* En panne, la carte le dit au lieu d'offrir des volumes qui n'iraient nulle part
          et un anneau vide qui passerait pour une journée sans eau (audit, fiche 06). */}
      {error !== null && (
        <Empty title="Hydratation indisponible">
          {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      )}

      {/* **Les volumes en tête, sur une seule ligne.** Ils vivaient à côté de l'anneau,
          où ils recevaient la moitié d'une carte de 336 px : quatre boutons de 84 px s'y
          repliaient en un bloc de deux sur deux, calé à gauche, avec le vide à droite.
          C'est pourtant le seul geste de la carte — l'anneau, lui, se lit.

          Une rangée pleine largeur les met au premier plan, leur donne des cibles de
          78 px, et rend à l'anneau la ligne entière où poser son détail. `auto-fit` plutôt
          que quatre colonnes en dur : le serveur sert la liste des volumes, et rien ne
          promet qu'ils soient quatre. */}
      <div className={styles.presets}>
        {(data?.presets_ml ?? []).map((millilitres) => (
          <button
            key={millilitres}
            type="button"
            className={styles.preset}
            disabled={drink.isPending}
            onClick={() => {
              drink.mutate(millilitres);
            }}
          >
            + {integer(millilitres)} ml
          </button>
        ))}
      </div>

      {/* Un volume hors raccourcis, sans aller régler les raccourcis (fiche 18). */}
      {data !== undefined && (
        <AmountEntry
          label="Autre volume"
          unit="ml"
          action="Ajouter"
          busy={drink.isPending}
          error={drink.error instanceof ApiError ? drink.error.message : undefined}
          onSubmit={(millilitres) => {
            drink.mutate(millilitres);
          }}
        />
      )}

      {stats && (
        <div className={styles.hydration}>
          <Ring
            // Journée pas encore commencée : l'anneau reste vide plutôt que d'écrire
            // « 0 % ». C'est la même règle que sur `/nutrition` et que le tiret du
            // tableau de bord — un jour qui débute n'est pas un objectif manqué, et la
            // charte tient déjà ce discours sur la grille d'assiduité.
            ratio={stats.today_ml > 0 ? stats.ratio : null}
            label="Objectif du jour"
            detail={
              stats.average_7d_ml !== null
                ? `moyenne 7 j : ${volume(stats.average_7d_ml)}`
                : undefined
            }
            tone={stats.today_ml >= stats.target_ml ? 'effort' : 'signal'}
          />
        </div>
      )}

      {/* Deux appuis pour retirer une prise (fiche 12) : le ✕ de 44 px au bord de la ligne
          supprimait au premier, et le projet n'a aucune annulation. */}
      {data && data.today.length > 0 && (
        <div className={styles.intakes}>
          {data.today.map((intake) => (
            <SwipeRow
              key={intake.id}
              actionLabel={`Supprimer la prise de ${time(intake.datetime)}`}
              busy={undrink.isPending}
              onAction={() => {
                undrink.mutate({ id: intake.id, token: intake.token });
              }}
            >
              <span className={styles.intake}>
                {time(intake.datetime)} · {integer(intake.volume_ml)} ml
              </span>
            </SwipeRow>
          ))}
        </div>
      )}

      {data && data.series.length > 1 && (
        <Sparkline
          values={data.series.map((day) => day.volume_ml)}
          tone="signal"
          label="Volume bu sur 30 jours"
        />
      )}
    </Card>
  );
}

// ── Checklist des suppléments ─────────────────────────

function Checklist() {
  const client = useQueryClient();
  const invalidate = useInvalidateRoutine();
  const { notify } = useToast();

  const { data, isPending, error } = useQuery({
    queryKey: keys.supplements.today(),
    queryFn: routineApi.checklist,
  });

  /**
   * Bascule optimiste (`SUP-04`).
   *
   * L'état est appliqué localement avant la réponse du serveur, et **restauré** en cas
   * d'échec. C'est ce qui rend la checklist utilisable : attendre un aller-retour vers
   * Nextcloud pour voir une case se cocher condamnerait la saisie en un geste.
   */
  const toggle = useMutation({
    mutationFn: (item: ChecklistItem) =>
      item.taken ? routineApi.untake(item.schedule_id) : routineApi.take(item.schedule_id),

    onMutate: async (item: ChecklistItem) => {
      const key = keys.supplements.today();
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ChecklistView>(key);

      client.setQueryData<ChecklistView>(key, (current) => {
        if (!current) return current;
        const items = current.items.map((entry) =>
          entry.schedule_id === item.schedule_id ? { ...entry, taken: !entry.taken } : entry,
        );
        // Le temps de l'aller-retour seulement : la réponse du serveur remplace ce
        // compte. Il suit sa règle — ce qui est dû, plus ce qui est pris.
        const counted = items.filter((entry) => entry.due || entry.taken);
        const taken = counted.filter((entry) => entry.taken).length;
        return {
          ...current,
          items,
          ratio: {
            taken,
            planned: counted.length,
            ratio: counted.length > 0 ? taken / counted.length : 0,
            complete: items.length > 0 && taken === counted.length,
          },
        };
      });

      return { previous };
    },

    onError: (caught: unknown, _item, context) => {
      // Restauration : l'écran ne doit jamais rester sur un état que le serveur a refusé.
      if (context?.previous) client.setQueryData(keys.supplements.today(), context.previous);
      notify(caught instanceof ApiError ? caught.message : 'Bascule impossible.', 'recover');
    },

    onSuccess: (view) => {
      // Le serveur renvoie la checklist complète : séries et ratio arrivent recalculés.
      client.setQueryData(keys.supplements.today(), view);
      invalidate();
    },
  });

  const items = data?.items ?? [];
  const grouped = MOMENTS.map((moment) => ({
    label: moment.label,
    items: items.filter((item) => momentOf(item.time) === moment.label),
  })).filter((group) => group.items.length > 0);

  return (
    <Card>
      <div className="spread">
        <div>
          {/* Le jour vient du serveur, dans le fuseau local — `ChecklistView.date`, le
              même que celui qui a décidé quels suppléments sont dus. `longDate(new Date())`
              lisait l'horloge du téléphone : à minuit passé, le titre annonçait un jour
              dont la checklist en dessous n'était pas celle-là. */}
          <h3>{data !== undefined ? longDate(data.date) : '—'}</h3>
          <p className={cx('eyebrow', styles.tightEyebrow)}>
            {data?.ratio.complete === true ? 'journée complète' : 'checklist du jour'}
          </p>
        </div>
        {data && (
          <Badge tone={data.ratio.complete ? 'effort' : 'signal'}>
            {data.ratio.taken}/{data.ratio.planned}
          </Badge>
        )}
      </div>

      {/* L'erreur avant le vide : en panne, « Aucun supplément au planning » invitait à
          ajouter ce qui y était déjà (audit du 17 octobre, fiche 06). */}
      {isPending ? (
        <Skeleton className={styles.emptyInset} />
      ) : error ? (
        <Empty title="Checklist indisponible">
          {error instanceof Error ? error.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      ) : items.length === 0 ? (
        <Empty title="Aucun supplément au planning">
          Ajoute ce que tu prends, et la checklist se remplit toute seule chaque matin.
        </Empty>
      ) : (
        <>
          {grouped.map((group) => (
            <CheckGroup title={group.label} key={group.label}>
              {group.items.map((item) => (
                <Check
                  key={item.schedule_id}
                  label={item.name}
                  // « pas dû aujourd'hui » : la whey d'un jour sur deux, prise hier. Elle
                  // reste cochable, mais n'est pas un manque (audit, fiche 04).
                  dose={`${num(item.dose, 1)} ${item.unit} · ${item.time}${
                    item.due || item.taken ? '' : ' · pas dû aujourd’hui'
                  }`}
                  streak={item.streak > 0 ? `${item.streak} j` : undefined}
                  checked={item.taken}
                  onToggle={() => {
                    toggle.mutate(item);
                  }}
                />
              ))}
            </CheckGroup>
          ))}
          <Progress done={data?.ratio.taken ?? 0} total={data?.ratio.planned ?? 0} />
        </>
      )}
    </Card>
  );
}

// ── Planning ──────────────────────────────────────────

/**
 * Les formes de cadence d'un complément. « Les jours d'entraînement » n'en est pas : la
 * checklist ne sait pas l'évaluer, et le proposer promettrait un rappel qui ne vient pas.
 */
const SUPPLEMENT_CADENCES = CADENCE_KINDS.filter((kind) => kind.value !== 'conditional');

const EMPTY_FIELDS = { name: '', dose: '', unit: 'g', time: '08:00' };
const DAILY: CadenceDraft = { kind: 'daily', count: '1', windowDays: '2' };

function Schedule() {
  const invalidate = useInvalidateRoutine();
  const { notify } = useToast();

  const { data: units } = useQuery({
    queryKey: keys.supplements.units(),
    queryFn: routineApi.units,
  });
  const { data: schedule, error: unreadable } = useQuery({
    queryKey: keys.supplements.schedule(),
    queryFn: routineApi.schedule,
  });

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [cadence, setCadence] = useState<CadenceDraft>(DAILY);
  /**
   * La ligne en cours de correction (audit du 17 octobre, fiche 08). La route `PATCH`
   * existait sans qu'aucun écran l'appelle : changer une cadence obligeait à retirer puis
   * recréer, ce qui changeait le `schedule_id` et détachait l'historique des prises.
   */
  const [editing, setEditing] = useState<Supplement | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  function reset(): void {
    setFields(EMPTY_FIELDS);
    setCadence(DAILY);
    setEditing(null);
    setError(null);
  }

  function edit(item: Supplement): void {
    setEditing(item);
    setFields({ name: item.name, dose: String(item.dose), unit: item.unit, time: item.time });
    setCadence(cadenceDraft(item.cadence_type, item.cadence_params));
    setError(null);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: fields.name,
        dose: Number.parseFloat(fields.dose.replace(',', '.')),
        unit: fields.unit,
        time: fields.time,
        frequency: serializeCadence(cadence),
      };
      return editing
        ? routineApi.updateSupplement(editing.id, editing.token, payload)
        : routineApi.addSupplement(payload);
    },
    onSuccess: () => {
      invalidate();
      notify(editing ? 'Planning corrigé.' : 'Supplément ajouté au planning.', 'effort');
      reset();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught : null);
    },
  });

  const remove = useMutation({
    mutationFn: (item: Supplement) => routineApi.removeSupplement(item.id, item.token),
    onSuccess: () => {
      invalidate();
      notify("Retiré du planning. L'historique des prises est conservé.", 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Retrait impossible.', 'recover');
    },
  });

  const set = (name: keyof typeof fields) => (event: { target: { value: string } }) => {
    setFields((current) => ({ ...current, [name]: event.target.value }));
  };

  return (
    <Card>
      <h3>Planning</h3>
      <p className={styles.note}>
        La cadence vit ici et nulle part ailleurs : la grille d'assiduité la lira au même endroit,
        elles ne pourront pas diverger.
      </p>

      {unreadable !== null && (
        <Empty title="Planning indisponible">
          {unreadable instanceof Error ? unreadable.message : 'Le serveur n’a pas répondu.'}
        </Empty>
      )}

      {/* Deux appuis pour retirer (fiche 12) : le ✕ supprimait au premier, sans annulation
          possible. Retirer garde l'historique, mais pas la ligne — ni sa cadence. */}
      {(schedule ?? []).map((item) => (
        <SwipeRow
          key={item.schedule_id}
          actionLabel={`Retirer ${item.name} du planning`}
          busy={remove.isPending}
          onAction={() => {
            remove.mutate(item);
          }}
        >
          <div className={styles.scheduleRow}>
            <span>
              {item.name}
              <span className={styles.moment}>
                {num(item.dose, 1)} {item.unit} · {item.time}
              </span>
              <br />
              <span className={styles.cadence}>{item.cadence_label}</span>
            </span>
            <Button
              variant="quiet"
              aria-label={`Modifier ${item.name}`}
              onClick={() => {
                edit(item);
              }}
            >
              Modifier
            </Button>
          </div>
        </SwipeRow>
      ))}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        noValidate
      >
        {editing !== null && <p className={styles.note}>Correction de « {editing.name} »</p>}

        {error !== null && error.fields.length === 0 && (
          <p className={styles.error} role="alert">
            {error.message}
          </p>
        )}

        <Field
          label="Nom"
          placeholder="Créatine"
          value={fields.name}
          error={error?.messageFor('name')}
          onChange={set('name')}
        />

        <div className={styles.pair}>
          <Field
            label="Dose"
            inputMode="decimal"
            placeholder="5"
            value={fields.dose}
            error={error?.messageFor('dose')}
            onChange={set('dose')}
          />
          <div className="field">
            <label htmlFor="supplement-unit" className="sr-only">
              Unité
            </label>
            <Field
              label="Unité"
              list="supplement-units"
              value={fields.unit}
              onChange={set('unit')}
            />
            <datalist id="supplement-units">
              {(units ?? []).map((unit) => (
                <option value={unit} key={unit} />
              ))}
            </datalist>
          </div>
        </div>

        <Field label="Moment" type="time" value={fields.time} onChange={set('time')} />

        {/* Le sélecteur des pistes, et non plus un texte libre : « 1 jour sur 2 » était
            refusé sans un mot sous le champ (fiche 09). */}
        <CadencePicker
          value={cadence}
          kinds={SUPPLEMENT_CADENCES}
          error={error?.messageFor('frequency')}
          onChange={setCadence}
        />

        <div className="row">
          <Button
            type="submit"
            variant="ghost"
            busy={save.isPending}
            disabled={fields.name.trim() === '' || fields.dose === ''}
          >
            {editing ? 'Enregistrer la correction' : 'Ajouter au planning'}
          </Button>
          {editing !== null && (
            <Button variant="quiet" onClick={reset}>
              Annuler
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

// ── Écran ─────────────────────────────────────────────

export function Routine() {
  const { data: hydration } = useQuery({
    queryKey: keys.hydration.all(),
    queryFn: () => routineApi.hydration(),
  });

  const stats = hydration?.stats;

  return (
    <div className={cx('wrap', styles.screen)}>
      <PageHead eyebrow="Routine du jour" title={<>Hydratation &amp; suppléments</>} />

      <Rule>Aujourd'hui</Rule>
      <div className={styles.split}>
        <div className="stack">
          <Hydration />
          <Checklist />
        </div>

        <div className="stack">
          <Card>
            <Stat
              label="Moyenne · 7 jours"
              value={stats?.average_7d_ml != null ? volume(stats.average_7d_ml) : '—'}
              // Aucun jour révolu depuis le premier relevé : rien à compter, et « 0 jour sur
              // 0 » n'apprendrait rien. Le premier jour, c'est ce que dit le tiret.
              detail={
                stats && stats.days_counted > 0
                  ? `objectif atteint ${stats.days_reached} ${plural(stats.days_reached, 'jour')} sur ${stats.days_counted}`
                  : stats
                    ? 'moyenne dès le deuxième jour complet'
                    : undefined
              }
            />
          </Card>

          <Schedule />
        </div>
      </div>
    </div>
  );
}
