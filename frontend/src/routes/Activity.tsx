/**
 * Écran Activité — les séances tabata, la course, et ce qu'on a fait.
 *
 * **Ce qu'on fait passe devant ce qu'on lit.** L'écran était un tableau de bord auquel on
 * avait ajouté un formulaire : trois sections de statistiques, puis le journal, puis la
 * saisie. Le journal est passé en tête, puis les statistiques ont quitté la page — et la
 * phase 5 de `docs/refonte-activite.md` a emporté le journal lui-même avec la musculation
 * saisie série par série.
 *
 * **Ce qui reste tient en trois gestes** : déclarer une séance faite, enregistrer une
 * course, relire les deux. Le catalogue et les statistiques ont disparu avec le fichier
 * qui les nourrissait ; les charges et les circuits ont leur adresse.
 *
 * Les sections vivent dans `routes/activity/`, comme `routes/settings/` l'a fait pour
 * Réglages. Ce fichier n'assemble plus que les états de l'écran et la feuille en cours.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, Card, CardHead, LinkButton, PageHead, Rule } from '@/components/ui';
import { activityApi, type ActivityItem, type SwimDetail } from '@/features/activity/api';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { keys } from '@/lib/query';
import { useToast } from '@/lib/toast';

import styles from './Activity.module.css';
import { ActivitySheet, type SheetTarget } from './activity/ActivitySheet';
import { NewActivitySheet } from './activity/NewActivitySheet';
import { SwimEntrySheet } from './activity/SwimEntrySheet';
import { OtherSheet } from './activity/OtherSheet';
import { SwimSheet } from './planning/SwimSheet';
import { CircuitsSection } from './activity/Circuits.section';
import { History } from './activity/History';
import { useInvalidateActivity } from './activity/shared';

export function Activity() {
  const invalidate = useInvalidateActivity();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  /**
   * L'assistant de saisie, distinct de la feuille de correction.
   *
   * Corriger une course n'est pas un parcours : on vient changer un champ, pas dérouler
   * deux étapes. Les deux surfaces se ressemblent et font des choses différentes — les
   * confondre obligerait l'une des deux à porter les compromis de l'autre.
   */
  const [creating, setCreating] = useState(false);
  /** La saisie d'une natation — vierge, ou rouverte sur une natation saisie à corriger. */
  const [swimEntry, setSwimEntry] = useState<{ editing: SwimDetail | null } | null>(null);
  /** La natation ouverte dans sa feuille, par son identifiant stable. */
  const [swimOpened, setSwimOpened] = useState<string | null>(null);
  /** Une sortie vélo ou marche ouverte pour noter son effort (`docs/charge-multisport.md`). */
  const [otherOpened, setOtherOpened] = useState<ActivityItem | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: keys.activity.overview(),
    queryFn: activityApi.overview,
  });

  /**
   * Supprimer, des deux côtés de l'historique fusionné.
   *
   * Une séance tabata part par `deleteSession`, qui emporte ses séries : c'est ce qui
   * autorise « je l'ai fait » à ne rien demander avant d'écrire. Sans cette porte, un
   * tabata déclaré deux fois — ce que **D6** rend possible — comptait pour toujours.
   */
  const remove = useMutation({
    mutationFn: (item: ActivityItem) =>
      item.kind === 'run'
        ? activityApi.deleteRun(item.id, item.token)
        : item.kind === 'swim'
          ? activityApi.deleteSwim(item.id, item.token)
          : item.kind === 'other'
            ? activityApi.deleteOther(item.id, item.token)
            : activityApi.deleteSession(item.id, item.token),
    onSuccess: () => {
      invalidate();
      notify('Activité supprimée.', 'signal');
    },
    onError: (caught: unknown) => {
      notify(caught instanceof ApiError ? caught.message : 'Suppression impossible.', 'recover');
      invalidate();
    },
  });

  const today = data?.today;

  return (
    <div className={cx('wrap', styles.screen)}>
      {/* Les portes vers ce qui a quitté cet écran. Des liens et non des boutons : ce sont
          des navigations, elles s'ouvrent dans un onglet et s'annoncent comme telles à la
          synthèse vocale. */}
      <PageHead
        eyebrow="Domaine Activité"
        title={<>Courses &amp; séances</>}
        actions={
          <>
            <LinkButton to="/activite/courses">Courses</LinkButton>
            <LinkButton to="/activite/natations">Natation</LinkButton>
            {/* Pas de lien vers `/activite/seances` ici : la section juste en dessous en
                porte un, au pied de ses cartes, et deux portes vers la même page dans le
                même écran font hésiter au lieu d'aider. */}
            <LinkButton to="/activite/charges">Poids des exercices</LinkButton>
          </>
        }
      />

      {/* **En tête.** Une séance Cadence est le geste le plus direct de l'écran — un appui
          et elle démarre. C'est le même arbitrage qui avait fait passer le journal devant
          les statistiques : ce qu'on fait passe devant ce qu'on lit. */}
      <CircuitsSection />

      {/* **Le seul geste manuel qui reste.** Une séance se déclare depuis sa carte, en un
          appui ; une course, elle, porte des chiffres que personne d'autre ne connaît —
          temps, allure, distance — et il faut bien un formulaire pour les recueillir. */}
      <Rule>Course et natation</Rule>
      <Card>
        <CardHead>
          <div>
            <h3>Sortie</h3>
            <p className={styles.note}>
              Le fichier ou la capture d’une montre, ou les chiffres à la main. Une natation s’écrit
              dans la notation — 400 CR EF.
            </p>
          </div>
          {/* Deux boutons et non un choix à l'ouverture : une course n'a pas à payer un
              appui de plus parce que la natation est arrivée. */}
          <div className={styles.headActions}>
            <Button
              variant="primary"
              disabled={today === undefined}
              onClick={() => {
                setCreating(true);
              }}
            >
              Enregistrer une course
            </Button>
            <Button
              disabled={today === undefined}
              onClick={() => {
                setSwimEntry({ editing: null });
              }}
            >
              Enregistrer une natation
            </Button>
          </div>
        </CardHead>
      </Card>

      <Rule>Historique</Rule>
      <History
        data={data}
        isPending={isPending}
        error={error}
        removing={remove.isPending}
        onOpen={(row) => {
          // Une natation s'ouvre dans sa feuille ; le détail d'une course est une page,
          // avec ses paliers et sa dérive. Une séance n'en a pas : elle dit ce que Cadence
          // a joué, et l'historique le dit déjà en entier.
          if (row.kind === 'swim') {
            setSwimOpened(row.swim_id);
            return;
          }
          if (row.kind === 'other') {
            setOtherOpened(row);
            return;
          }
          void navigate(`/activite/course/${String(row.id)}`);
        }}
        onEdit={(row) => {
          setSheet({ kind: 'run', editing: { kind: 'run', id: row.id, date: row.date } });
        }}
        onRemove={(row) => {
          remove.mutate(row);
        }}
      />

      {/* La carte « Import d'une capture » est partie (M-14) : elle faisait, par un autre
          parcours, ce que fait l'étape 1 de « Enregistrer une course » — qui envoie
          désormais tout ce qu'elle envoyait. */}

      {today !== undefined && (
        <OtherSheet
          item={otherOpened}
          today={today}
          onClose={() => {
            setOtherOpened(null);
          }}
        />
      )}

      <SwimSheet
        swimId={swimOpened}
        onClose={() => {
          setSwimOpened(null);
        }}
        onEdit={(swim) => {
          setSwimOpened(null);
          setSwimEntry({ editing: swim });
        }}
      />

      {/* Remontée à chaque ouverture, comme l'assistant de course : ses champs repartent
          de la natation visée, ou de rien. */}
      {swimEntry !== null && today !== undefined && (
        <SwimEntrySheet
          open
          today={today}
          editing={swimEntry.editing}
          onClose={() => {
            setSwimEntry(null);
          }}
        />
      )}

      {/* L'assistant est remonté à chaque ouverture : ses étapes repartent du début,
          sans effet de bord d'une ouverture sur la suivante. */}
      {today !== undefined && (
        <NewActivitySheet
          key={creating ? 'open' : 'closed'}
          open={creating}
          today={today}
          onClose={() => {
            setCreating(false);
          }}
          onSwimImported={(swim) => {
            setSwimOpened(swim.swim_id);
          }}
        />
      )}

      {/* La feuille de **correction**, remontée à chaque ouverture : ses champs repartent
          de la ligne visée, sans effet de bord d'une ouverture sur la suivante. */}
      {sheet !== null && today !== undefined && (
        <ActivitySheet
          key={`run-${sheet.editing?.id ?? 'new'}`}
          target={sheet}
          today={today}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}
