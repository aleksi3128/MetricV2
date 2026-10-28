/**
 * « Où je vais » — la section qui manquait.
 *
 * Le reproche d'où part ce lot tient en une phrase : « **on ne sait pas où on va** ».
 * C'était exact au pied de la lettre — l'objectif du projet, celui de `goals.csv`, avec
 * son ratio, son libellé chiffré et sa fenêtre d'observation, n'apparaissait sur **aucun**
 * écran d'accueil. Le seul « objectif » qu'on y lisait était l'écart à la cible de poids,
 * tout en bas de la page et sous condition.
 *
 * ## Quels blocs dessiner — et le choix n'est pas un calcul
 *
 * La prochaine course A d'abord, l'objectif en cours dessous (M-19) : les deux ensemble
 * quand les deux existent. À défaut des deux, la cible de poids si elle est réglée ; à
 * défaut l'état vide, qui dit ce que coûte le prochain geste. Choisir lesquels des blocs
 * **déjà servis** dessiner est de la présentation, pas une dérivation : aucun chiffre
 * n'est produit ici, et tous arrivent calculés du serveur — le « J-n » et la phase du plan
 * posé compris.
 *
 * ## Le plan se repose sur `/plan`, pas ici
 *
 * Quand le plan posé ne suit plus la course, le bloc le dit et mène à `/plan`. Reposer
 * remplace des séances : c'est un geste armé, en deux appuis, et il n'a qu'une adresse.
 *
 * ## Ce qui n'est pas dessiné
 *
 * **Pas d'anneau quand l'avancement est indéterminé.** `progress.ratio` vaut `null` quand
 * rien n'avait été relevé à l'adoption, et un anneau dessine un pourcentage — c'est ce
 * qu'il sait faire. C'est précisément par là que l'invariant s'est cassé au L14 : quatre
 * décisions correctes, et « 0 % » au centre d'une donnée absente. `Ring` porte le cas dans
 * son type depuis ; on ne le lui reprend pas.
 */

import { Card, Empty, LinkButton, Ring, Rule, Stat } from '@/components/ui';
import type { DashboardView } from '@/features/aggregates/api';
import type { ActiveGoal } from '@/features/goals/api';
import type { RaceAim } from '@/features/races/api';
import { cx } from '@/lib/cx';
import { kg, num, plural, shortDate } from '@/lib/format';

import styles from '../Dashboard.module.css';

/** Jours restants, en clair. Le serveur donne le nombre ; le français est ici. */
function deadlineLine(days: number, deadline: string): string {
  const when = shortDate(`${deadline}T12:00:00`);
  if (days < 0)
    return `échéance dépassée depuis ${String(-days)} ${plural(-days, 'jour')} — ${when}`;
  if (days === 0) return `dernier jour — ${when}`;
  return `${String(days)} ${plural(days, 'jour')} ${plural(days, 'restant')} — ${when}`;
}

function CurrentGoal({ active }: { active: ActiveGoal }) {
  const { goal, progress } = active;

  return (
    <Card>
      <div className="spread">
        <div>
          <p className="eyebrow">Objectif en cours</p>
          <h3>{goal.title}</h3>
        </div>
        {/* Deux « Détail » dans la même section, l'un vers `/objectif`, l'autre vers `/plan` :
            un lecteur d'écran les annonçait pareils. Le nom accessible commence par le mot
            visible, et dit lequel. */}
        <LinkButton
          variant="ghost"
          to="/objectif"
          aria-label={`Détail de l’objectif : ${goal.title}`}
        >
          Détail
        </LinkButton>
      </div>

      <div className={styles.aim}>
        {progress.ratio !== null && (
          <Ring
            ratio={progress.ratio}
            label={progress.label}
            tone={progress.ratio >= 1 ? 'effort' : 'signal'}
          />
        )}

        <div className={styles.aimFigures}>
          {/* Tous ces textes arrivent **rédigés** par le serveur : le libellé chiffré et
              la fenêtre d'observation. Les reformuler ici en donnerait deux versions. */}
          <span className={styles.aimSummary}>{progress.summary}</span>
          <span className={styles.aimNote}>{progress.basis}</span>
          <span className={styles.aimNote}>{deadlineLine(active.days_left, goal.deadline)}</span>
        </div>
      </div>
    </Card>
  );
}

function NextRace({ aim }: { aim: RaceAim }) {
  const { race } = aim;

  return (
    <Card>
      <div className="spread">
        <div>
          <p className="eyebrow">Course visée · priorité A</p>
          <h3>{race.name}</h3>
        </div>
        {aim.plan === 'posed' && (
          <LinkButton variant="ghost" to="/plan" aria-label={`Détail du plan : ${race.name}`}>
            Détail
          </LinkButton>
        )}
      </div>

      <div className={styles.aim}>
        <span className={styles.aimCountdown}>{aim.countdown}</span>
        <div className={styles.aimFigures}>
          <span className={styles.aimNote}>
            {race.distance_label} — {shortDate(`${race.date}T12:00:00`)}
            {race.target !== null && ` — chrono visé ${race.target}`}
          </span>
          {/* La phase est celle du plan **posé**, lue par le serveur dans ses séances : le
              plan recalculé repartirait chaque jour de sa base. */}
          {aim.plan === 'posed' && (
            <span className={styles.aimPhase}>{aim.phase_text ?? 'Plan posé au planning'}</span>
          )}
        </div>
      </div>

      {aim.plan === 'absent' && (
        <div className={cx('stack', styles.aimFoot)}>
          {/* Sans plan, aucune phase : en afficher une serait l'inventer. */}
          <p className={styles.aimNote}>
            Aucun plan posé au planning. Le poser écrit les séances de chaque semaine jusqu’à la
            course.
          </p>
          <div className="row">
            <LinkButton variant="ghost" to="/plan">
              Poser le plan
            </LinkButton>
          </div>
        </div>
      )}

      {aim.plan === 'stale' && aim.stale_plan !== null && (
        <div className={cx('stack', styles.aimFoot)}>
          <p className={styles.aimWarning} role="status">
            {aim.stale_plan.text}
          </p>
          <div className="row">
            <LinkButton variant="ghost" to="/plan">
              Voir le plan
            </LinkButton>
          </div>
        </div>
      )}
    </Card>
  );
}

export function Aim({ data }: { data: DashboardView }) {
  const { goal, race, weight } = data;

  return (
    <>
      <Rule>Où je vais</Rule>

      {/* Une pile : la course et l'objectif peuvent s'y suivre, et deux cartes collées se
          lisaient comme une seule (vu sur le banc). */}
      <div className="stack">
        {race !== null && <NextRace aim={race} />}

        {goal !== null ? (
          <CurrentGoal active={goal} />
        ) : race !== null ? null : weight.to_target_kg !== null ? (
          <Card>
            <Stat
              label={`Cible de poids ${kg(weight.target_kg)}`}
              value={num(Math.abs(weight.to_target_kg), 1)}
              unit="kg"
              detail={
                weight.to_target_kg > 0 ? 'restants pour atteindre la cible' : 'sous la cible'
              }
              direction={weight.to_target_kg > 0 ? 'up' : 'down'}
            />
            {/* La cible de poids est un **réglage**, pas un objectif daté. Le dire évite de
              laisser croire que l'écran répond déjà à « où je vais ». */}
            <p className={styles.aimNote}>
              C’est un réglage, pas un objectif daté. Un objectif se fixe sur quatre à huit semaines
              et se juge sur une fenêtre.
            </p>
            <div className="row">
              <LinkButton variant="ghost" to="/objectif">
                Fixer un objectif
              </LinkButton>
            </div>
          </Card>
        ) : (
          <Empty
            title="Aucun objectif en cours"
            action={
              <div className={cx('row', styles.aimEmptyActions)}>
                <LinkButton to="/objectif">Fixer un objectif</LinkButton>
                <LinkButton variant="ghost" to="/plan">
                  Viser une course
                </LinkButton>
              </div>
            }
          >
            Un seul objectif, chiffré, daté de quatre à huit semaines — ou une course visée en
            priorité A. C’est ce qui donne un sens aux chiffres du dessus.
          </Empty>
        )}
      </div>
    </>
  );
}
