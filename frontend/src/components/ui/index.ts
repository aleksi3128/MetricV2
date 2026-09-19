/**
 * Bibliothèque de composants de Metric.
 *
 * Tout écran importe d'ici, jamais d'un module de composant en particulier : c'est ce
 * qui permet de déplacer ou de découper un composant sans toucher aux écrans.
 */

export { Chart } from './Chart';
export type { BandSeries, ChartProps, Series } from './Chart';

export { Scatter } from './Scatter';
export type { ScatterPoint, ScatterProps } from './Scatter';

export { Heatmap, HeatSwatch } from './Heatmap';
export type {
  DayReason,
  DayState,
  HeatDay,
  HeatWeek,
  HeatmapProps,
  SwatchTone,
  WeekStatus,
} from './Heatmap';

export { Track } from './Track';
export type { TrackProps } from './Track';

export { DistanceProfile } from './DistanceProfile';
export type { DistanceProfileProps, ProfileLine } from './DistanceProfile';

export { Toaster } from './Toaster';

export { Sheet, SheetGroup, SheetRow } from './Sheet';

export { Combobox } from './Combobox';
export type { Suggestion } from './Combobox';

export { Markdown } from './Markdown';

export {
  AiBlock,
  Badge,
  Button,
  Card,
  CardHead,
  Chip,
  ChipStrip,
  Empty,
  ExternalLinkButton,
  Eyebrow,
  Field,
  LinkButton,
  PageHead,
  Rule,
  Segmented,
  Skeleton,
  Stepper,
  Steps,
  SwipeRow,
} from './primitives';
export type { ButtonVariant, SegmentedOption, Tone } from './primitives';

export {
  Bars,
  Check,
  CheckGroup,
  Deviation,
  DotRow,
  Progress,
  Ring,
  Sparkline,
  Stat,
  Table,
} from './data';
export type { BarRow, Column, DeviationRow, Dot } from './data';
