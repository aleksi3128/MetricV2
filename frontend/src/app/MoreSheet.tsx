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

/** Ce que la feuille « Plus » contient, groupé par ce à quoi ça sert. */
const MORE = [
  {
    title: 'Mesurer',
    entries: [
      { to: '/corps', label: 'Poids & mensurations', icon: IconScale },
      { to: '/routine', label: 'Hydratation & suppléments', icon: IconDroplet },
      { to: '/dossier', label: 'Dossier médical', icon: IconBook },
    ],
  },
  {
    title: 'Décider',
    entries: [
      { to: '/nutrition', label: 'Nutrition', icon: IconNutrition },
      { to: '/objectif', label: 'Objectif', icon: IconTarget },
      { to: '/planning', label: 'Planning', icon: IconCalendar },
      { to: '/plan', label: 'Plan de course', icon: IconFlag },
    ],
  },
  {
    title: 'Regarder en arrière',
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

      <SheetGroup title="Compte">
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
