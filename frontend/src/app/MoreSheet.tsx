/**
 * La feuille « Plus » — tout ce qui n'a pas sa place dans une barre de navigation.
 *
 * Sortie de `TabBar` pour servir aussi l'en-tête sur ordinateur : la barre du haut alignait
 * onze entrées pour 669 px, « Planning » coupé et les trois dernières hors champ derrière
 * un dégradé (audit du 17 octobre, fiche 27). Une seule feuille pour les deux barres : deux
 * listes du « reste » finiraient par ne plus contenir la même chose.
 */

import { useNavigate } from 'react-router';

import { Sheet, SheetGroup, SheetRow } from '@/components/ui';
import {
  IconActivity,
  IconBook,
  IconCalendar,
  IconDroplet,
  IconExit,
  IconFlag,
  IconGrid,
  IconNutrition,
  IconScale,
  IconSliders,
  IconTarget,
} from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';

/**
 * Ce que la feuille « Plus » contient, groupé par **moment de la journée** (M-12).
 *
 * Les groupes d'avant — Mesurer, Décider, Regarder en arrière — rangeaient par nature de
 * geste, et la nature ne suit pas l'usage : la nutrition était sous « Décider » quand on y
 * va à chaque repas, l'eau sous « Mesurer » à côté du dossier médical qu'on ouvre deux fois
 * par an. Ceux-ci suivent la journée : ce qu'on touche chaque jour, ce qu'on prévoit, ce
 * qu'on relit, et ce qu'on consulte rarement. La barre du haut, sur ordinateur, suit le
 * même ordre (`Shell.tsx`).
 */
const MORE = [
  {
    title: 'Chaque jour',
    entries: [
      { to: '/nutrition', label: 'Nutrition', icon: IconNutrition },
      { to: '/routine', label: 'Hydratation & suppléments', icon: IconDroplet },
      { to: '/corps', label: 'Poids & mensurations', icon: IconScale },
    ],
  },
  {
    title: 'Prévoir',
    entries: [
      { to: '/planning', label: 'Planning', icon: IconCalendar },
      { to: '/plan', label: 'Plan de course', icon: IconFlag },
      { to: '/objectif', label: 'Objectif', icon: IconTarget },
    ],
  },
  {
    title: 'Relire',
    entries: [
      { to: '/charge', label: 'Charge & forme', icon: IconActivity },
      { to: '/assiduite', label: 'Assiduité', icon: IconGrid },
    ],
  },
] as const;

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, logout } = useAuth();
  const navigate = useNavigate();

  function go(path: string): void {
    onClose();
    void navigate(path);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tout le reste"
      lede={state.status === 'authenticated' ? `Connecté comme ${state.username}.` : undefined}
    >
      {MORE.map((group) => (
        <SheetGroup key={group.title} title={group.title}>
          {group.entries.map((entry) => (
            <SheetRow
              key={entry.to}
              icon={<entry.icon size={20} />}
              label={entry.label}
              onClick={() => {
                go(entry.to);
              }}
            />
          ))}
        </SheetGroup>
      ))}

      {/* « Référence » : ce qu'on consulte rarement, et la sortie. Le dossier médical
          y rejoint les réglages — une référence chiffrée qu'on ouvre deux fois par an. */}
      <SheetGroup title="Référence">
        <SheetRow
          icon={<IconBook size={20} />}
          label="Dossier médical"
          onClick={() => {
            go('/dossier');
          }}
        />
        <SheetRow
          icon={<IconSliders size={20} />}
          label="Réglages"
          onClick={() => {
            go('/reglages');
          }}
        />
        <SheetRow
          icon={<IconExit size={20} />}
          label="Déconnexion"
          tone="recover"
          onClick={() => {
            onClose();
            void logout();
          }}
        />
      </SheetGroup>
    </Sheet>
  );
}
