/**
 * Une sortie à vélo, à pied ou en randonnée (`docs/charge-multisport.md`, D8).
 *
 * Ces sorties sont **comptées**, pas analysées : la feuille dit ce qu'elles sont et demande
 * l'effort perçu, sans lequel elles n'entrent pas dans la charge globale. Elle se ferme sur
 * la note — la ligne a changé de jeton, et la garder ouverte sur l'ancien ferait échouer la
 * note suivante en conflit.
 *
 * **Elles se corrigent aussi** (session 10 b) : « Corriger la sortie » remplace la feuille
 * par le formulaire de la saisie, pré-rempli, en place — le motif d'une pesée de `/corps`.
 * C'est le formulaire de la saisie à la main (M-16), qui a quitté l'écran le 29 octobre :
 * le garder pour corriger, c'est garder de quoi la rétablir. L'effort reste à un appui
 * au-dessus, puisque c'est le geste fréquent.
 */

import { useState } from 'react';

import { Button, Sheet } from '@/components/ui';
import { activityApi, type ActivityItem } from '@/features/activity/api';
import { dayMonth, hoursMinutes, km } from '@/lib/format';
import { useToast } from '@/lib/toast';

import styles from '../Activity.module.css';
import { OtherEntry } from './OtherEntry';
import { RateEffort } from './run/Rate';

export function OtherSheet({
  item,
  today,
  onClose,
}: {
  item: ActivityItem | null;
  today: string;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const lede =
    item === null
      ? undefined
      : [hoursMinutes(item.duration_min), item.distance_km === null ? null : km(item.distance_km)]
          .filter(Boolean)
          .join(' · ');

  function close(): void {
    setEditing(false);
    onClose();
  }

  return (
    <Sheet
      open={item !== null}
      onClose={close}
      // Les mots et les formats de la feuille d'une natation, pour qu'un vélo s'y lise pareil.
      title={item === null ? 'Sortie' : `${item.label} du ${dayMonth(`${item.date}T12:00:00`)}`}
      lede={editing ? 'Corriger la sortie' : lede}
    >
      {item !== null &&
        (editing ? (
          <OtherEntry
            today={today}
            editing={item.id}
            onBack={() => {
              setEditing(false);
            }}
            onDone={close}
          />
        ) : (
          <div className={styles.form}>
            <RateEffort
              current={item.rpe}
              rate={(rpe) => activityApi.setOtherRpe(item.id, item.token, rpe)}
              onRated={(saved) => {
                notify(`Effort perçu noté : ${String(saved.rpe)}/10.`, 'effort');
                close();
              }}
            />
            <Button
              onClick={() => {
                setEditing(true);
              }}
            >
              Corriger la sortie
            </Button>
          </div>
        ))}
    </Sheet>
  );
}
