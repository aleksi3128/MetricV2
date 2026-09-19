/**
 * La courbe au fil des kilomètres, et le tracé qui lui répond (`docs/analyse-course.md`).
 *
 * Ce qui se teste ici est ce que l'œil ne vérifie pas en regardant une capture : **quel**
 * point le doigt désigne, et combien de traits une suite de couleurs produit. Le reste —
 * que la courbe soit lisible — se regarde.
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DistanceProfile } from './DistanceProfile';
import { Track } from './Track';

const DISTANCES = [0, 1, 2, 3, 4];

function profile(onActive = vi.fn(), active: number | null = null) {
  return render(
    <DistanceProfile
      distances={DISTANCES}
      distanceTicks={[0, 2, 4]}
      formatDistance={(km) => `${String(km)} km`}
      primary={{
        label: 'Allure',
        values: [5, 5.5, null, 5.2, 5],
        domain: [6, 4.5],
        ticks: [5, 5.5],
        format: String,
        tones: ['effort', 'effort', null, null, 'load'],
      }}
      active={active}
      onActive={onActive}
      label="Allure au fil de la course"
    />,
  );
}

describe('DistanceProfile', () => {
  it('ne dessine rien sous deux points', () => {
    const { container } = render(
      <DistanceProfile
        distances={[0]}
        distanceTicks={[0]}
        formatDistance={String}
        primary={{ label: 'Allure', values: [5], domain: [6, 4], ticks: [], format: String }}
        active={null}
        onActive={vi.fn()}
        label="vide"
      />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('coupe le trait sur une valeur absente plutôt que de la tracer à zéro', () => {
    const { container } = profile();
    // [0→1] effort, [1→2] coupé, [2→3] coupé, [3→4] neutre : deux traits, pas un.
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('désigne le point le plus proche du doigt', () => {
    const onActive = vi.fn();
    const { container } = profile(onActive);
    const svg = container.querySelector('svg') as SVGSVGElement;
    // Un cadre de 720 px de large, comme le `viewBox` : 1 px vaut une unité.
    svg.getBoundingClientRect = () => ({ left: 0, width: 720, top: 0, height: 340 }) as DOMRect;

    // 3,4 km sur 4 → abscisse 6 + 0,85 × 700.
    fireEvent.pointerMove(svg, { clientX: 6 + 0.85 * 700, pointerType: 'touch' });
    expect(onActive).toHaveBeenLastCalledWith(3);
  });

  it('garde la lecture quand le doigt se lève, l’efface quand la souris sort', () => {
    const onActive = vi.fn();
    const { container } = profile(onActive, 2);
    const svg = container.querySelector('svg') as SVGSVGElement;

    fireEvent.pointerLeave(svg, { pointerType: 'touch' });
    expect(onActive).not.toHaveBeenCalled();
    fireEvent.pointerLeave(svg, { pointerType: 'mouse' });
    expect(onActive).toHaveBeenCalledWith(null);
  });
});

describe('Track', () => {
  const POINTS = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 0.5],
    [1, 1],
  ] as const;

  it('un trait par suite de tronçons de même couleur', () => {
    const { container } = render(
      <Track
        points={POINTS}
        width={1}
        height={1}
        label="Parcours"
        tones={['effort', 'effort', null, 'load']}
      />,
    );
    expect(container.querySelectorAll('polyline')).toHaveLength(3);
  });

  it('marque où l’on était, au même index que la courbe', () => {
    const { container } = render(
      <Track points={POINTS} width={1} height={1} label="Parcours" active={3} />,
    );
    const circles = container.querySelectorAll('circle');
    // Départ, arrivée, et le point actif.
    expect(circles).toHaveLength(3);
    expect(circles[2]).toHaveAttribute('cx', '1');
    expect(circles[2]).toHaveAttribute('cy', '0.5');
  });
});
