import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Badge, Button, Card, Empty, LinkButton, Skeleton } from '@/components/ui';
import { planningApi, type PlanFormValues, type PlannedSession } from '@/features/planning/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { percent } from '@/lib/format';
import { keys } from '@/lib/query';

import { CoachCard } from './coach/CoachCard';
import styles from './Planning.module.css';
import { AgendaCard } from './planning/AgendaCard';
import { Changes } from './planning/Changes';
import { DayPanel } from './planning/DayPanel';
import { MonthGrid } from './planning/MonthGrid';
import { PlanSheet } from './planning/PlanSheet';
import { EMPTY_FORM, formOf, monthLabel, shiftMonth } from './planning/shared';
import { SubscriptionCard } from './planning/Subscription';
import { SwimSheet } from './planning/SwimSheet';

/**
 * Écran Planning (`L13-07`), refait pour la natation (`docs/planning-natation.md` §4).
 *
 * L'écran **assemble** : la grille du mois, le panneau du jour, la carte du coach, et deux
 * feuilles — planifier, et relire une natation tour par tour. Chacune vit dans
 * `routes/planning/` ; ce fichier ne décide d'aucune valeur.
 *
 * ## Ce que l'écran ne fait pas
 *
 * Il ne compose pas son calendrier : le mois arrive **découpé en semaines complètes**, avec
 * le jour courant tel que le serveur le voit. Il ne calcule pas le taux de respect. Et il
 * ne lit **aucune notation de nage** : un programme arrive lu — lignes réécrites, total en
 * mètres —, une natation faite arrive réécrite dans la même langue, l'écart au prévu
 * arrive calculé.
 *
 * ## L'ordre de la page
 *
 * Le mois d'abord, parce que c'est la question qu'on pose en ouvrant l'écran ; le jour
 * ensuite ; puis **ce que le coach a changé**, quand il a changé quelque chose — c'est ici
 * que la séance a bougé, donc ici qu'on veut dire « non, remets »
 * (`docs/pages/modifications.md`, M-03). La carte est absente sans changement : une carte
 * vide sous le jour pousserait le reste plus bas pour ne rien dire.
 *
 * Vient ensuite **le** coach — la séance proposée par le coach de course. Le fil
 * « Demander au planning » vivait dessous, sa saisie et ses six derniers tours compris :
 * c'était un second coach sur la page, et une seconde façon de parler à l'assistant. Il
 * n'en reste qu'une entrée, qui ouvre l'assistant sur ce fil (M-20) ; le fil y est listé
 * avec les autres, et ses propositions y gardent leur portée.
 *
 * L'**agenda** et l'**abonnement** ferment la page, côte à côte : l'un entre (les créneaux
 * pris d'iCloud, qui font placer et déplacer *toutes* les séances), l'autre sort (le
 * planning vers le calendrier du téléphone). Ils vivaient sur deux écrans ; l'agenda était
 * sur `/plan`, où rien ne dit qu'il sert aussi aux séances posées à la main.
 */
export function Planning() {
  const [params] = useSearchParams();
  /** `?jour=AAAA-MM-JJ` ouvre ce jour-là — l'import d'une natation y mène. */
  const asked = params.get('jour');
  const [month, setMonth] = useState<string>(() => {
    if (asked !== null && /^\d{4}-\d{2}-\d{2}$/u.test(asked)) return asked.slice(0, 7);
    // Amorçage seulement : dès la première réponse, c'est le serveur qui dit quel jour on
    // est. Ce mois-ci peut être faux d'un jour à la frontière d'un fuseau, jamais d'un mois.
    const now = new Date();
    return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selected, setSelected] = useState<string | null>(asked);
  const [form, setForm] = useState<PlanFormValues | null>(null);
  const [editing, setEditing] = useState<PlannedSession | null>(null);
  const [swimId, setSwimId] = useState<string | null>(null);

  const {
    data: view,
    isPending,
    error,
  } = useQuery({
    queryKey: keys.planning.month(month),
    queryFn: () => planningApi.month(month),
  });

  const { data: adherence } = useQuery({
    queryKey: keys.planning.adherence(),
    queryFn: () => planningApi.adherence(),
  });

  /** Lu à part : une panne de cette lecture ne doit pas emporter le calendrier. */
  const { data: changes } = useQuery({
    queryKey: keys.planning.changes(),
    queryFn: planningApi.changes,
  });

  const day = useMemo(() => {
    if (!view) return undefined;
    const wanted = selected ?? view.today;
    return (
      view.days.find((cell) => cell.date === wanted) ?? view.days.find((cell) => cell.in_month)
    );
  }, [view, selected]);

  function openForm(values: Partial<PlanFormValues>, session: PlannedSession | null): void {
    setEditing(session);
    setForm({ ...EMPTY_FORM, date: day?.date ?? '', ...values });
  }

  return (
    <div className={cx('wrap', styles.screen)}>
      <header className={styles.head}>
        <div>
          <p className="eyebrow">Planning</p>
          <h2>{monthLabel(month)}</h2>
        </div>

        <div className={styles.nav}>
          <Button
            aria-label="Mois précédent"
            onClick={() => {
              setMonth((current) => shiftMonth(current, -1));
            }}
          >
            ←
          </Button>
          <Button
            onClick={() => {
              if (view) {
                setMonth(view.today.slice(0, 7));
                setSelected(view.today);
              }
            }}
          >
            Aujourd&apos;hui
          </Button>
          <Button
            aria-label="Mois suivant"
            onClick={() => {
              setMonth((current) => shiftMonth(current, 1));
            }}
          >
            →
          </Button>
        </div>
      </header>

      {isPending && (
        <Card>
          <Skeleton lines={6} />
        </Card>
      )}

      {error !== null && (
        <Card>
          <Empty title="Planning indisponible">
            {error instanceof ApiError ? error.message : 'Le serveur est injoignable.'}
          </Empty>
        </Card>
      )}

      {view && (
        <>
          <Card>
            {/* Le respect du planning tient sur une ligne au-dessus du mois : trois tuiles
                repoussaient le calendrier — le sujet de l'écran — sous le pli. */}
            {adherence && (
              <div className={styles.adherence}>
                <span className={styles.adherenceText}>
                  Respect du planning
                  {adherence.planned > 0 && (
                    <>
                      {' '}
                      · {adherence.honoured}/{adherence.planned} sur {adherence.weeks.length} sem.
                    </>
                  )}
                </span>
                <Badge tone={(adherence.rate ?? 0) >= 0.7 ? 'effort' : 'signal'} mono>
                  {/* Rien de prévu n'est pas 0 % : c'est l'absence de taux. */}
                  {adherence.rate === null ? '—' : percent(adherence.rate)}
                </Badge>
              </div>
            )}

            <MonthGrid
              view={view}
              selected={selected ?? view.today}
              onSelect={(picked) => {
                setSelected(picked);
              }}
            />
          </Card>

          <DayPanel
            cell={day}
            onPlan={() => {
              openForm({ date: day?.date ?? view.today }, null);
            }}
            onEdit={(session) => {
              openForm(formOf(session), session);
            }}
            onOpenSwim={setSwimId}
          />

          {changes !== undefined && changes.length > 0 && (
            <Card>
              <div className="stack">
                <h3>Ce que le coach a changé</h3>
                <Changes changes={changes} />
              </div>
            </Card>
          )}

          {/* La proposition du coach de course, **à valider** : hors de `plan.csv` tant
              qu'elle n'est pas acceptée. */}
          <CoachCard rule="Séance proposée par le coach" />

          {/* Le fil du planning vit dans l'assistant (M-20). L'entrée n'interroge rien :
              c'est l'assistant qui demande au serveur s'il existe déjà. */}
          <Card>
            <div className="stack">
              <h3>Demander au planning</h3>
              <p className={styles.note}>
                L’assistant propose des séances, chaque natation dans la notation, et rien n’entre
                au planning avant que tu adoptes.
              </p>
              <LinkButton variant="ghost" to="/assistant?portee=planning">
                Ouvrir le fil du planning
              </LinkButton>
            </div>
          </Card>

          <AgendaCard />
          <SubscriptionCard />
        </>
      )}

      {/* Le glossaire de nage a sa sous-page (M-04). Un lien de pied, hors des états du
          mois : il se règle même quand le calendrier ne répond pas. */}
      <LinkButton variant="quiet" to="/planning/sigles">
        Les sigles de nage
      </LinkButton>

      <PlanSheet
        values={form}
        editing={editing}
        onChange={setForm}
        onDone={() => {
          setForm(null);
          setEditing(null);
        }}
      />

      <SwimSheet
        swimId={swimId}
        onClose={() => {
          setSwimId(null);
        }}
      />
    </div>
  );
}
