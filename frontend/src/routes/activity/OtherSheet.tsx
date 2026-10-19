/**
 * Une sortie à vélo, à pied ou en randonnée (`docs/charge-multisport.md`, D8).
 *
 * Ces sorties sont **comptées**, pas analysées : la feuille dit ce qu'elles sont et demande
 * l'effort perçu, sans lequel elles n'entrent pas dans la charge globale. Elle se ferme sur
 * la note — la ligne a changé de jeton, et la garder ouverte sur l'ancien ferait échouer la
 * note suivante en conflit.
 */

import { Sheet } from '@/components/ui';
import { activityApi, type ActivityItem } from '@/features/activity/api';
import { dayMonth, hoursMinutes, km } from '@/lib/format';
import { useToast } from '@/lib/toast';

import { RateEffort } from './run/Rate';

export function OtherSheet({ item, onClose }: { item: ActivityItem | null; onClose: () => void }) {
  const { notify } = useToast();
  const lede =
    item === null
      ? undefined
      : [hoursMinutes(item.duration_min), item.distance_km === null ? null : km(item.distance_km)]
          .filter(Boolean)
          .join(' · ');

  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      // Les mots et les formats de la feuille d'une natation, pour qu'un vélo s'y lise pareil.
      title={item === null ? 'Sortie' : `${item.label} du ${dayMonth(`${item.date}T12:00:00`)}`}
      lede={lede}
    >
      {item !== null && (
        <RateEffort
          current={item.rpe}
          rate={(rpe) => activityApi.setOtherRpe(item.id, item.token, rpe)}
          onRated={(saved) => {
            notify(`Effort perçu noté : ${String(saved.rpe)}/10.`, 'effort');
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}
