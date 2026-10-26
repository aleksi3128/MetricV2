import { cadenceDraft, serializeCadence, type CadenceDraft } from '@/components/ui';
import type { Track, TrackPayload } from '@/features/heatmap/api';

/** Le brouillon d'une piste, sous forme de chaînes — et ce qu'il envoie. */

export interface Draft {
  label: string;
  source: string;
  filter: string;
  threshold: string;
  /** Le seuil suit un réglage ailleurs : il se lit ici, il ne s'y règle pas. */
  thresholdFollows: string | null;
  levels: string;
  binary: boolean;
  accent: string;
  active: boolean;
  cadence: CadenceDraft;
}

export function toDraft(track: Track): Draft {
  return {
    label: track.label,
    source: track.source,
    filter: track.filter,
    threshold: String(track.validation_threshold),
    thresholdFollows: track.threshold_follows,
    levels: track.levels.join(', '),
    binary: track.binary,
    accent: track.accent,
    active: track.active,
    cadence: cadenceDraft(track.cadence.type, track.cadence.params),
  };
}

export function emptyDraft(source: string): Draft {
  return {
    label: '',
    source,
    filter: '',
    threshold: '1',
    thresholdFollows: null,
    levels: '',
    binary: false,
    accent: 'signal',
    active: true,
    cadence: { kind: 'daily', count: '2', windowDays: '2' },
  };
}

export function toPayload(draft: Draft): TrackPayload {
  return {
    label: draft.label.trim(),
    source: draft.source,
    filter: draft.filter.trim(),
    // Le serveur porte les bornes de vraisemblance (`API-06`) : on transmet et on
    // affiche son refus, on n'en redéclare aucune.
    validation_threshold: Number.parseFloat(draft.threshold.replace(',', '.')) || 0,
    levels: draft.binary
      ? []
      : draft.levels
          .split(',')
          .map((chunk) => Number.parseFloat(chunk.trim().replace(',', '.')))
          .filter((value) => Number.isFinite(value)),
    binary: draft.binary,
    accent: draft.accent,
    cadence: serializeCadence(draft.cadence),
    active: draft.active,
  };
}
