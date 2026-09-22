/**
 * La page d'une sortie — `/activite/course` et `/activite/course/:id` (`docs/analyse-course.md`).
 *
 * **Une question : comment j'ai géré ma course ?** Elle se lisait en huit tuiles de
 * régularité, deux dérives aux signes opposés et une note sous chaque graphique pour dire
 * comment le lire. Depuis l'import `.fit`, le serveur tient un point par seconde, et la
 * page répond dans l'ordre où l'on se pose la question :
 *
 * 1. les chiffres de la sortie ;
 * 2. **ce qu'il faut retenir**, rédigé par le serveur ;
 * 3. l'allure au fil des mètres **et** le parcours, liés sous le doigt ;
 * 4. l'intensité, puis les meilleurs efforts ;
 * 5. les kilomètres, et le rang parmi les autres sorties.
 *
 * **Deux adresses pour un seul écran.** `/activite/course` ouvre la dernière course, et
 * `/activite/course/:id` en ouvre une précise depuis l'historique.
 *
 * **Aucun calcul métier ici**, ni dans les sections : constats, couleurs, zones, bornes et
 * graduations arrivent calculés. Une sortie saisie au clavier garde ses tuiles, ses paliers
 * s'il y en a et son rang — ce qu'un fichier n'a pas apporté ne s'invente pas.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';

import { Button, Card, Empty, LinkButton, PageHead, Rule, Skeleton, Stat } from '@/components/ui';
import { IconShare } from '@/components/ui/icons';
import { activityApi, type Run as RunRow } from '@/features/activity/api';
import { useFitDownload } from '@/features/activity/useFitDownload';
import { useRunAnalysis } from '@/features/activity/useRunAnalysis';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { duration, integer, longDate, num, pace } from '@/lib/format';
import { keys } from '@/lib/query';

import { Analysis } from './run/Analysis';
import { Conditions } from './run/Conditions';
import { Context, Splits } from './run/Splits';
import { StorySheet } from './run/StorySheet';

import styles from './run/Run.module.css';

/**
 * Les chiffres de la sortie. Les détails « en mouvement » et « pause » viennent de
 * l'analyse, **quand elle est là** : la tuile s'affiche d'abord sans, plutôt que d'attendre
 * la lecture du fichier pour montrer une distance que la ligne connaît déjà.
 */
function Summary({ run }: { run: RunRow }) {
  const { data: analysis } = useRunAnalysis(run);
  const paused = analysis !== undefined && analysis.paused_s > 0 ? analysis.paused_s : null;
  const moving = analysis?.moving_pace_min_km ?? null;

  return (
    <div className="grid tiles">
      <Card>
        <Stat compact label="Distance" value={num(run.distance_km, 2)} unit="km" />
      </Card>
      <Card>
        <Stat
          compact
          label="Temps"
          value={duration(run.duration_min)}
          detail={paused === null ? undefined : `+ ${duration(paused / 60)} de pause`}
        />
      </Card>
      <Card>
        <Stat
          compact
          label="Allure"
          value={run.pace_min_km == null ? '—' : pace(run.pace_min_km)}
          unit={run.pace_min_km == null ? undefined : '/km'}
          detail={moving === null ? undefined : `${pace(moving)} en mouvement`}
        />
      </Card>
      <Card>
        {/* Les pas par minute, **toujours** : c'est la seule mesure de foulée qu'un export
            Strava de téléphone porte, en total de séance. Sans elle, la tuile dit qu'elle
            manque plutôt que de disparaître. */}
        <Stat
          compact
          label="Cadence"
          value={run.cadence_spm == null ? '—' : integer(run.cadence_spm)}
          unit={run.cadence_spm == null ? undefined : 'spm'}
          detail={run.cadence_spm == null ? 'non relevée' : undefined}
        />
      </Card>
      {run.avg_hr != null && (
        <Card>
          <Stat
            compact
            label="Cardio moyen"
            value={integer(run.avg_hr)}
            unit="bpm"
            detail={run.max_hr == null ? undefined : `${integer(run.max_hr)} au plus haut`}
          />
        </Card>
      )}
      {run.elevation_m != null && (
        <Card>
          <Stat compact label="Dénivelé" value={`+${integer(run.elevation_m)}`} unit="m" />
        </Card>
      )}
      {analysis?.average_power_w != null && (
        <Card>
          <Stat
            compact
            label="Puissance"
            value={integer(analysis.average_power_w)}
            unit="W"
            detail={
              analysis.normalized_power_w == null
                ? undefined
                : `${integer(analysis.normalized_power_w)} normalisée`
            }
          />
        </Card>
      )}
    </div>
  );
}

/** Les deux chiffres de calories d'une capture Apple, **nommés** — jamais « calories » seul. */
function Energy({ run }: { run: RunRow }) {
  if (run.total_calories == null && run.active_calories == null) return null;
  return (
    <div className="grid tiles">
      {run.active_calories != null && (
        <Card>
          <Stat
            compact
            label="Calories actives"
            value={integer(run.active_calories)}
            unit="kcal"
            detail="la dépense de la course"
          />
        </Card>
      )}
      {run.total_calories != null && (
        <Card>
          <Stat
            compact
            label="Calories totales"
            value={integer(run.total_calories)}
            unit="kcal"
            detail="métabolisme de base compris"
          />
        </Card>
      )}
    </div>
  );
}

/**
 * Le bouton de story, et sa feuille (`docs/story-course.md`).
 *
 * **Sous les tuiles, avant l'analyse.** C'est l'endroit où l'on vient de lire les chiffres
 * qu'on voudrait montrer ; plus bas, après les zones et les meilleurs efforts, il n'aurait
 * été trouvé que par qui le cherchait.
 */
function Share({ run }: { run: RunRow }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className={styles.storyButton}
        onClick={() => {
          setOpen(true);
        }}
      >
        <IconShare size={20} />
        Faire une story
      </Button>
      {/* Montée **à l'ouverture**, pas avant. La feuille tient un canvas de 1080 × 1920,
          une lecture du `.fit` et le chargement de trois graisses de police : rien de tout
          ça n'a de raison d'exister tant qu'on n'a pas demandé une image. */}
      {open && (
        <StorySheet
          run={run}
          open
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function FitFile({ run }: { run: RunRow }) {
  const fit = useFitDownload();
  return (
    <Button
      // `ghost` et non `quiet` : seule action de la section, elle doit se lire comme un
      // bouton. Un `quiet` isolé sous un tableau passe pour une légende.
      variant="ghost"
      className={styles.fileButton}
      busy={fit.busy}
      onClick={() => {
        void fit.download(run.id, run.date);
      }}
    >
      {fit.failed ? 'Fichier indisponible — réessayer' : 'Récupérer le fichier .fit'}
    </Button>
  );
}

export function Run() {
  // `id` absent = « la dernière ». Le seul calcul de l'écran est de choisir quelle page
  // demander, ce que l'invariant de date autorise explicitement.
  const { id } = useParams<{ id: string }>();
  const chosen = id === undefined ? null : Number(id);

  const { data, isPending, error } = useQuery({
    queryKey: chosen === null ? keys.activity.latestRun() : keys.activity.runSplits(chosen),
    queryFn: () => (chosen === null ? activityApi.latestRun() : activityApi.runSplits(chosen)),
  });

  const run = data?.run ?? null;
  const fitted = run !== null && run.fit_path !== '';

  return (
    <div className={cx('wrap', styles.screen)}>
      {/* L'en-tête est là **avant** la donnée : un écran qui n'affiche qu'un
          « chargement… » ne dit pas où l'on vient d'arriver. */}
      <PageHead
        eyebrow="Domaine Activité"
        title="Course"
        actions={
          <LinkButton variant="quiet" to="/activite/courses">
            Toutes tes courses
          </LinkButton>
        }
      >
        {run
          ? `${longDate(run.date)}${run.start_time ? ` · ${run.start_time.slice(0, 5)}` : ''}`
          : 'Comment ta sortie s’est passée, du départ à l’arrivée.'}
      </PageHead>

      {error !== null ? (
        <Card>
          <Empty title="Course indisponible">
            {error instanceof ApiError ? error.message : 'Le serveur n’a pas répondu.'}
          </Empty>
        </Card>
      ) : isPending ? (
        <Card>
          <Skeleton lines={4} />
        </Card>
      ) : run === null ? (
        <Card>
          {/* Aucune valeur inventée : un tiret et ce que coûte le prochain geste. */}
          <Empty title="Aucune course enregistrée">
            Importe le fichier .fit de ta montre depuis l’activité, ou une capture Apple, ou saisis
            la course à la main.
          </Empty>
        </Card>
      ) : (
        <>
          <Summary run={run} />
          <Conditions run={run} />
          <Share run={run} />

          {fitted ? (
            <Analysis run={run} />
          ) : (
            <Card>
              <Empty title="Sortie sans fichier .fit">
                Ni courbe, ni parcours, ni zones : ils se lisent dans le fichier de la montre.
                Importe le .fit de ta prochaine sortie depuis l’activité.
              </Empty>
            </Card>
          )}

          <Splits detail={data.splits} fitted={fitted} />
          <Context context={data.context} />
          <Energy run={run} />

          {fitted && (
            <>
              <Rule>Fichier</Rule>
              <FitFile run={run} />
            </>
          )}
        </>
      )}
    </div>
  );
}
