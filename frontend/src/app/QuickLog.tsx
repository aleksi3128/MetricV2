/**
 * Saisie rapide — la feuille du bouton central.
 *
 * « Un relevé en un geste » est le principe du projet. Il a d'abord vécu dans un bouton
 * posé sur l'écran du domaine — ce qui demandait d'aller d'abord sur le bon écran, et en
 * faisait trois. Cette feuille s'ouvre depuis n'importe où et ramène un relevé à **deux
 * appuis** ; le bouton, lui, n'a plus servi et a été retiré.
 *
 * **Trois écritures seulement**, et c'est délibéré. Un verre d'eau, un supplément et une
 * pesée sont des gestes à un chiffre — ou à zéro. Un repas et une séance demandent un
 * vrai formulaire : les proposer ici en version réduite donnerait deux façons de saisir
 * la même chose, dont une amputée. Ils sont donc des **liens**, pas des raccourcis.
 *
 * Ce que la feuille ne fait pas :
 *
 * * **Elle ne calcule rien.** Totaux, objectifs et séries viennent du serveur, comme
 *   partout ailleurs.
 * * **Elle ne devine pas la date.** Le jour vient de `checklist().date` — le serveur, dans
 *   le fuseau local. Jamais `new Date()`.
 * * **Elle ne charge rien tant qu'elle est fermée** : les trois requêtes sont conditionnées
 *   à son ouverture, pour qu'un bouton de barre ne coûte pas trois appels à chaque écran.
 *
 * ## Une quatrième écriture : l'aliment scanné (`NUT-28`)
 *
 * Un aliment emballé, c'est un code-barres et un poids — un geste à un chiffre, une fois
 * le code lu. Il coûtait six appuis et deux écrans par la feuille complète. Il en coûte
 * trois ici : **« Scanner »**, en tête de la feuille, puis le code, puis la quantité.
 *
 * * **Des étapes, pas des feuilles.** Le scan est `ScanStep`, réemployé tel quel, et la
 *   quantité `ScannedFood` : ils prennent la feuille et la rendent. Deux `Sheet` empilées
 *   partageraient l'écouteur `Échap`, le verrou de défilement et le retour du focus — le
 *   raisonnement est en tête de `ScanStep`.
 * * **Le champ des chiffres reste la seconde porte**, sous le viseur : caméra refusée,
 *   `make dev-lan` en clair, banc sans tête.
 * * **Un code que personne ne connaît mène à la feuille complète**, qui s'ouvre sur une
 *   ligne à décrire et garde le code : décrit une fois, l'aliment est reconnu au scan
 *   suivant. Décrire un produit — nom, poids, cinq valeurs — n'est pas un geste à un
 *   chiffre, et n'a pas de version réduite ici.
 * * **La feuille se ferme** sur l'enregistrement, et la notification le dit — comme la
 *   pesée. Chaque aliment est un repas à part, qui porte le nom du produit.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import {
  AmountEntry,
  Button,
  Chip,
  ChipStrip,
  Sheet,
  SheetGroup,
  SheetRow,
  Skeleton,
  Stepper,
} from '@/components/ui';
import { IconActivity, IconNutrition, IconScan } from '@/components/ui/icons';
import { bodyApi } from '@/features/body/api';
import { nutritionApi, type Meal, type Product } from '@/features/nutrition/api';
import { routineApi } from '@/features/routine/api';
import { ApiError } from '@/lib/api';
import { integer, kg, volume } from '@/lib/format';
import { CROSS_CUTTING, keys } from '@/lib/query';
import { useToast } from '@/lib/toast';
import { ScanStep } from '@/routes/nutrition/ScanStep';

import styles from './QuickLog.module.css';
import { QuickLogContext, type QuickLogControl } from './quickLogContext';
import { ScannedFood } from './ScannedFood';

/**
 * Ce que la feuille montre : ses écritures, ou l'une des deux étapes du scan (`NUT-28`).
 * Un seul état et non deux booléens : être à la fois au viseur et à la quantité n'a pas
 * de sens, et un jour cela se serait vu.
 */
type Step = { kind: 'home' } | { kind: 'scan' } | { kind: 'weigh'; product: Product };

const HOME: Step = { kind: 'home' };

/** Ce que l'en-tête dit d'un produit lu : d'où viennent ses chiffres, et le premier d'entre eux. */
function provenance(product: Product): string {
  const origin =
    product.source === 'catalog'
      ? 'valeurs de ton catalogue'
      : `${product.brand !== null ? `${product.brand} · ` : ''}valeurs Open Food Facts`;
  return product.calories_100g === null
    ? origin
    : `${origin} · ${integer(product.calories_100g)} kcal/100 g`;
}

export function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [weight, setWeight] = useState('');
  const [weightError, setWeightError] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<Step>(HOME);

  /**
   * Fermer, c'est aussi revenir aux écritures : rouvrir « Noter » ne doit pas rallumer une
   * caméra que personne n'a redemandée, ni rendre la quantité d'un produit d'il y a une
   * heure. Les quatre portes de sortie de `Sheet` passent toutes par ici.
   */
  function close(): void {
    setStep(HOME);
    onClose();
  }

  const hydration = useQuery({
    queryKey: keys.hydration.all(),
    queryFn: () => routineApi.hydration(),
    enabled: open,
  });

  const checklist = useQuery({
    queryKey: keys.supplements.today(),
    queryFn: routineApi.checklist,
    enabled: open,
  });

  const lastWeight = useQuery({
    queryKey: keys.body.weight(),
    queryFn: () => bodyApi.weight(1),
    enabled: open,
  });

  // Les types de repas et celui de l'heure, servis avec la journée — la requête et la clé
  // de l'écran Nutrition. **À l'ouverture du scan**, pas de la feuille : on ne la paie que
  // si l'on scanne, et elle arrive pendant qu'on vise (`NUT-28`).
  const nutrition = useQuery({
    queryKey: keys.nutrition.all(),
    queryFn: () => nutritionApi.day(),
    enabled: open && step.kind !== 'home',
  });

  /** Toute écriture rafraîchit son domaine **et** les vues transverses (`HEAT-33`, `AGG-01`). */
  function refresh(domain: readonly unknown[]): void {
    void client.invalidateQueries({ queryKey: domain });
    for (const key of CROSS_CUTTING) void client.invalidateQueries({ queryKey: key });
  }

  const drink = useMutation({
    mutationFn: (milliliters: number) => routineApi.drink(milliliters),
    onSuccess: (_result, milliliters) => {
      refresh(keys.hydration.all());
      notify(`${volume(milliliters)} de plus aujourd’hui.`, 'signal');
    },
    onError: (error: unknown) => {
      notify(error instanceof ApiError ? error.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const take = useMutation({
    mutationFn: (scheduleId: string) => routineApi.take(scheduleId),
    onSuccess: () => {
      refresh(keys.supplements.all());
    },
    onError: (error: unknown) => {
      notify(error instanceof ApiError ? error.message : 'Enregistrement impossible.', 'recover');
    },
  });

  const logWeight = useMutation({
    mutationFn: (payload: { date: string; weight_kg: number }) => bodyApi.createWeight(payload),
    onSuccess: () => {
      refresh(keys.body.all());
      notify('Pesée enregistrée.', 'effort');
      setWeight('');
      setWeightError(undefined);
      close();
    },
    onError: (error: unknown) => {
      // Le texte vient du serveur, en français, et s'affiche tel quel (`API-06`).
      setWeightError(error instanceof ApiError ? error.message : 'Enregistrement impossible.');
    },
  });

  // Le jour vient du serveur — le seul endroit où cette feuille peut le lire.
  const today = checklist.data?.date ?? null;
  // Ce qui est **dû** et pas pris : une whey « un jour sur deux » prise hier n'est pas à
  // prendre aujourd'hui — oubli de la fiche 04, vu dans cette feuille.
  const pending = checklist.data?.items.filter((item) => item.due && !item.taken) ?? [];
  const presets = hydration.data?.presets_ml ?? [];
  const latestKg = lastWeight.data?.stats.latest_kg ?? null;

  function submitWeight(): void {
    if (today === null) return;
    const parsed = Number(weight.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeightError('Un poids en kilogrammes, par exemple 82,4.');
      return;
    }
    logWeight.mutate({ date: today, weight_kg: parsed });
  }

  function go(path: string): void {
    close();
    void navigate(path);
  }

  /**
   * L'aliment est enregistré : la feuille se ferme, et la notification le dit — le motif
   * de la pesée, ici même. Les calories sont celles que le serveur a rendues ; sans
   * valeurs connues, la phrase le dit au lieu d'un chiffre.
   *
   * Tout ce que l'écriture touche est rafraîchi : la nutrition (journal, historique,
   * catalogue — un même préfixe), le parcours du matin qui compte les repas, et les vues
   * transverses, dont l'accueil.
   */
  function scanned(meal: Meal, quantity: string): void {
    refresh(keys.nutrition.all());
    void client.invalidateQueries({ queryKey: keys.morning.flow() });
    const name = meal.comment ?? 'Repas';
    notify(
      meal.calories === null
        ? `« ${name} », ${quantity} g, noté en ${meal.meal_type} — sans valeurs connues.`
        : `« ${name} », ${quantity} g, noté en ${meal.meal_type} — ${integer(meal.calories)} kcal.`,
      'effort',
    );
    close();
  }

  if (step.kind === 'scan') {
    return (
      <Sheet
        open={open}
        onClose={close}
        title="Scanner un aliment"
        lede="Le code-barres suffit. Rien n’est enregistré avant ta validation."
      >
        <ScanStep
          onFound={(product) => {
            setStep({ kind: 'weigh', product });
          }}
          onBack={() => {
            setStep(HOME);
          }}
          // Un code que ni le catalogue ni Open Food Facts ne connaissent : la feuille
          // complète, sur une ligne à décrire qui garde le code (`NUT-28`).
          onManual={(barcode) => {
            go(`/nutrition?ajout=repas&code=${barcode}`);
          }}
        />
      </Sheet>
    );
  }

  if (step.kind === 'weigh') {
    return (
      <Sheet open={open} onClose={close} title={step.product.name} lede={provenance(step.product)}>
        <ScannedFood
          // Un autre produit repart d'une saisie propre : le poids d'un pot de Nutella n'est
          // pas celui d'un skyr.
          key={step.product.barcode}
          product={step.product}
          types={nutrition.data?.types}
          suggested={nutrition.data?.suggested_type}
          typesError={
            nutrition.error === null
              ? null
              : nutrition.error instanceof ApiError
                ? nutrition.error.message
                : 'Les types de repas n’ont pas pu être lus.'
          }
          onSaved={scanned}
          onRescan={() => {
            setStep({ kind: 'scan' });
          }}
          onBack={() => {
            setStep(HOME);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Noter"
      lede="Ce qui tient en un chiffre s’enregistre ici, sans changer d’écran."
      // « Tout en haut » : l'en-tête, et non une première rangée du corps, qui défile et
      // commence par l'hydratation (`NUT-28`). Le mot avec le pictogramme : un dessin de
      // code-barres seul ne dit pas ce qu'il fait.
      action={{
        text: 'Scanner',
        label: 'Scanner un aliment',
        icon: <IconScan size={20} />,
        onClick: () => {
          setStep({ kind: 'scan' });
        },
      }}
    >
      <SheetGroup title="Hydratation">
        {hydration.isPending ? (
          <Skeleton />
        ) : presets.length === 0 ? (
          <p className={styles.wait}>Aucun format enregistré.</p>
        ) : (
          <>
            <ChipStrip label="Volumes d’un verre">
              {presets.map((milliliters) => (
                <Chip
                  key={milliliters}
                  disabled={drink.isPending}
                  onClick={() => {
                    drink.mutate(milliliters);
                  }}
                >
                  + {volume(milliliters)}
                </Chip>
              ))}
            </ChipStrip>
            {/* Un volume hors raccourcis — 0,9 L se notait en allant régler les raccourcis
                (audit du 17 octobre, fiche 18). */}
            <AmountEntry
              label="Autre volume"
              unit="ml"
              action="Ajouter"
              busy={drink.isPending}
              onSubmit={(milliliters) => {
                drink.mutate(milliliters);
              }}
            />
            {hydration.data !== undefined && (
              <p className={styles.tally}>
                <b className="num">{volume(hydration.data.stats.today_ml)}</b> aujourd’hui, cible{' '}
                <b className="num">{volume(hydration.data.stats.target_ml)}</b>
              </p>
            )}
          </>
        )}
      </SheetGroup>

      {pending.length > 0 && (
        <SheetGroup title="Suppléments à prendre">
          {pending.map((item) => (
            <SheetRow
              key={item.schedule_id}
              label={item.name}
              hint={`${String(item.dose)} ${item.unit} · ${item.time}`}
              onClick={() => {
                take.mutate(item.schedule_id);
              }}
            />
          ))}
        </SheetGroup>
      )}

      <SheetGroup title="Pesée">
        <Stepper
          label="Poids du matin"
          value={weight}
          onChange={(next) => {
            setWeight(next);
            setWeightError(undefined);
          }}
          step={0.1}
          min={20}
          max={400}
          placeholder={latestKg !== null ? kg(latestKg) : '—'}
          {...(weightError !== undefined ? { error: weightError } : {})}
          hint={
            latestKg !== null
              ? `dernière pesée ${kg(latestKg)}`
              : 'Un chiffre, et la courbe commence.'
          }
        />
        <div className={styles.confirm}>
          <Button
            variant="primary"
            className={styles.save}
            busy={logWeight.isPending}
            disabled={weight.trim() === '' || today === null}
            onClick={submitWeight}
          >
            Enregistrer la pesée
          </Button>
        </div>
      </SheetGroup>

      <SheetGroup title="Ce qui demande un formulaire">
        <SheetRow
          icon={<IconNutrition size={20} />}
          label="Ajouter un repas"
          hint="→"
          onClick={() => {
            // La feuille d'ajout elle-même, et non le haut de /nutrition, où il fallait
            // encore trouver le bouton (M-23) — comme « Noter une séance » ci-dessous.
            go('/nutrition?ajout=repas');
          }}
        />
        <SheetRow
          icon={<IconActivity size={20} />}
          label="Noter une séance"
          hint="→"
          onClick={() => {
            // Les séances, chacune avec « Je l'ai faite » — et non le haut de /activite,
            // où il n'y avait rien à noter (fiche 25).
            go('/activite/seances');
          }}
        />
      </SheetGroup>
    </Sheet>
  );
}

/**
 * La feuille, et la seule façon de l'ouvrir (M-11).
 *
 * Posée dans la coquille, au-dessus de l'écran et de la barre d'onglets : le bouton central
 * et l'état vide de l'accueil ouvrent **la même** feuille, par `useQuickLog`. Elle était
 * montée par `TabBar`, qui l'ouvrait seul.
 */
export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const control = useMemo<QuickLogControl>(
    () => ({
      open,
      show: () => {
        setOpen(true);
      },
    }),
    [open],
  );

  return (
    <QuickLogContext.Provider value={control}>
      {children}
      <QuickLog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </QuickLogContext.Provider>
  );
}
