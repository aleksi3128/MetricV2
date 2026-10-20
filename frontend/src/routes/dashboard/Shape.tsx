/**
 * « Forme » sur l'accueil (`docs/accueil-et-charge.md`, D2 — DSH-02).
 *
 * Trois lectures que trois lots avaient rangées sans les montrer : les **alertes
 * ouvertes** (R3), la **fraîcheur** et le rapport de charge (R2), la **nuit** (R7). Chacune
 * a sa requête et ses états : la carte peint ce qui arrive, et une lecture en panne ne
 * prend pas les deux autres avec elle.
 *
 * Les alertes passent d'abord : ce sont elles qui changent la journée.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { Badge, Card, LinkButton, Rule, Skeleton } from '@/components/ui';
import { notificationsApi, type Alert } from '@/features/notifications/api';
import { trainingApi } from '@/features/training/api';
import { ApiError } from '@/lib/api';
import { dayMonth } from '@/lib/format';
import { keys } from '@/lib/query';

import styles from './Shape.module.css';

// Les tons de la charte RunFurther : `recover` est le rouge de l'alerte, `load` l'ambre de
// ce qui est à surveiller, `effort` le vert du calme.
const PRIORITY: Record<Alert['priority'], { tone: 'recover' | 'load' | 'effort'; label: string }> =
  {
    critical: { tone: 'recover', label: 'critique' },
    normal: { tone: 'load', label: 'à voir' },
    info: { tone: 'effort', label: 'pour info' },
  };

function failure(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function Alerts() {
  const { data, error } = useQuery({
    queryKey: keys.aggregates.alerts(),
    queryFn: notificationsApi.alerts,
  });
  if (error) return <p className={styles.text}>{failure(error, 'Alertes illisibles.')}</p>;
  if (data === undefined || data.length === 0) return null;
  return (
    <ul className={styles.alerts} aria-label="Alertes ouvertes">
      {data.map((alert) => (
        <li key={alert.key}>
          <Link className={styles.alert} to={alert.url}>
            <span className={styles.alertHead}>
              <Badge tone={PRIORITY[alert.priority].tone}>{PRIORITY[alert.priority].label}</Badge>
              {alert.title}
            </span>
            <span className={styles.text}>{alert.body}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Load() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.aggregates.training(),
    queryFn: trainingApi.view,
  });
  if (isPending) return <Skeleton lines={2} />;
  if (error) return <p className={styles.text}>{failure(error, 'Charge illisible.')}</p>;
  return (
    <>
      <p className={styles.text}>{data.form_text}</p>
      <p className={styles.text}>{data.ratio_text}</p>
    </>
  );
}

function Night() {
  const { data, isPending, error } = useQuery({
    queryKey: keys.aggregates.night(),
    queryFn: trainingApi.health,
  });
  if (isPending) return <Skeleton lines={1} />;
  if (error) return <p className={styles.text}>{failure(error, 'Nuit illisible.')}</p>;
  // Sans accès au compte Garmin (`docs/planifier-une-seance.md`, D13), aucune nuit
  // n'arrive d'elle-même : la ligne ne s'affiche que s'il y en a une, sans promettre une
  // synchro qui ne viendra pas.
  const last = data.days[0];
  if (last === undefined) return null;
  return (
    <p className={styles.text}>
      <span className={styles.key}>Relevé du {dayMonth(last.date)}</span>
      {last.text}
    </p>
  );
}

export function Shape() {
  return (
    <>
      <Rule>Forme</Rule>
      <Card>
        <Alerts />
        <Load />
        <Night />
        <LinkButton className={styles.more} variant="ghost" to="/charge">
          Voir la charge
        </LinkButton>
      </Card>
    </>
  );
}
