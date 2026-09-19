/**
 * Les kilomètres d'une sortie, et ce qu'elle vaut parmi les autres.
 *
 * **Une carte par question, plus de tuiles de régularité.** L'écart-type, l'amplitude, la
 * dérive en chiffres signés et la foulée par palier racontaient ce que les constats du
 * serveur disent maintenant en une phrase — « Seconde moitié plus lente : 6:05 puis 6:10 ».
 * Il en reste la barre d'écart, qui montre **quel** kilomètre, et le tableau du rang.
 */

import { Card, Deviation, Empty, Rule, Stat } from '@/components/ui';
import type { RunContext, RunSplits } from '@/features/activity/api';
import { integer, num, pace } from '@/lib/format';

import styles from './Run.module.css';

export function Splits({ detail, fitted }: { detail: RunSplits; fitted: boolean }) {
  if (detail.splits.length === 0) {
    // Une sortie `.fit` sans paliers est un enregistrement troué : sa courbe le montre
    // déjà, et une carte vide de plus n'y ajouterait rien.
    if (fitted) return null;
    return (
      <Card>
        <Empty title="Pas de paliers pour cette course">
          Elle a été saisie au clavier. Les paliers viennent d’un fichier .fit ou d’une capture «
          Splits ».
        </Empty>
      </Card>
    );
  }

  const cadenced = detail.splits.filter((split) => split.cadence_spm != null);

  return (
    <>
      <Rule>Kilomètre par kilomètre</Rule>
      <Card>
        {detail.average_pace_min_km != null && (
          <p className={styles.note}>
            Écart à ta moyenne des kilomètres pleins, {pace(detail.average_pace_min_km)} /km.
          </p>
        )}
        <Deviation
          rows={detail.splits.map((split) => ({
            label: split.partial ? 'reliquat' : `km ${String(split.index)}`,
            // Signe et longueur viennent du serveur.
            ratio: split.deviation_ratio,
            value: split.pace_min_km == null ? '—' : pace(split.pace_min_km),
            // Vert à gauche pour les kilomètres gagnés, ambre à droite pour ceux qui ont
            // coûté : les tons du tracé, pour que la même couleur dise la même chose.
            tones: ['effort', 'load'] as const,
            muted: split.partial,
          }))}
        />
      </Card>

      {cadenced.length > 0 && (
        <Card>
          <h3>Cadence par kilomètre</h3>
          {detail.cadence_avg_spm != null && (
            <p className={styles.note}>
              Écart à ta cadence moyenne, {integer(detail.cadence_avg_spm)} pas par minute.
            </p>
          )}
          <Deviation
            rows={cadenced.map((split) => ({
              label: split.partial ? 'reliquat' : `km ${String(split.index)}`,
              ratio: split.cadence_deviation_ratio,
              value: `${integer(split.cadence_spm ?? 0)} spm`,
              // Une cadence haute est la foulée fréquente : la bonne nouvelle est ici du
              // côté positif, à l'inverse de l'allure.
              tones: ['load', 'effort'] as const,
            }))}
          />
        </Card>
      )}
    </>
  );
}

/**
 * La sortie parmi les autres. **Sous deux courses, la section n'existe pas** : un « 1ᵉʳ sur
 * 1 » se lirait comme un record, la pire valeur inventée — celle qui est littéralement
 * exacte. Le rang ne s'affiche jamais sans le nombre de courses comparées.
 */
export function Context({ context }: { context: RunContext }) {
  if (context.runs_compared < 2) return null;
  return (
    <>
      <Rule>Parmi tes {context.runs_compared} courses</Rule>
      <div className="grid tiles">
        {context.pace_rank != null && (
          <Card>
            <Stat
              compact
              label="Rang d’allure"
              value={context.pace_rank}
              unit={`sur ${String(context.runs_compared)}`}
              detail={
                context.pace_delta_s_per_km == null
                  ? undefined
                  : context.pace_delta_s_per_km < 0
                    ? `${num(Math.abs(context.pace_delta_s_per_km), 0)} s/km plus vite que ta moyenne`
                    : `${num(context.pace_delta_s_per_km, 0)} s/km plus lent que ta moyenne`
              }
              direction={
                context.pace_delta_s_per_km == null
                  ? undefined
                  : context.pace_delta_s_per_km < 0
                    ? 'up'
                    : 'down'
              }
            />
          </Card>
        )}
        {context.distance_rank != null && (
          <Card>
            <Stat
              compact
              label="Rang de distance"
              value={context.distance_rank}
              unit={`sur ${String(context.runs_compared)}`}
              detail={
                context.distance_delta_km == null
                  ? undefined
                  : `${context.distance_delta_km > 0 ? '+' : ''}${num(context.distance_delta_km, 1)} km sur ta moyenne`
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}
