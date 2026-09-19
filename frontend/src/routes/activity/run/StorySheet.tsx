/**
 * La feuille qui fabrique l'image de story (`docs/story-course.md`).
 *
 * Trois réglages, un aperçu, un bouton. L'aperçu **est** l'image : c'est le même canvas de
 * 1080 × 1920 qui se peint, se montre réduit et s'exporte — il n'y a donc aucun écart
 * possible entre ce qu'on regarde et ce qu'on partage.
 *
 * Le damier derrière l'aperçu est le fond du `<canvas>` en CSS, et non une couche peinte :
 * il montre la transparence sans jamais entrer dans le PNG.
 *
 * ## Aucun calcul métier ici
 *
 * Tout ce qui devient un chiffre sur l'image vient de `storyCard`, qui ne fait que choisir
 * parmi des valeurs servies et les formater. Ce fichier lit trois jetons de couleur, place
 * un canvas et appelle la feuille de partage du système.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Chip, ChipStrip, Empty, Segmented, Sheet, Skeleton } from '@/components/ui';
import { type Run } from '@/features/activity/api';
import { useRunAnalysis } from '@/features/activity/useRunAnalysis';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';

import {
  ACCENTS,
  canTrim,
  paintStory,
  storyCard,
  STORY_HEIGHT,
  STORY_WIDTH,
  TRIM_KM,
  type StoryAccent,
  type StoryInk,
  type StoryPalette,
} from './story';

import styles from './Story.module.css';

/**
 * Les couleurs de l'image, lues sur les jetons.
 *
 * Une seule lecture de `getComputedStyle`, ici et pas au fond du dessin : `paintStory`
 * reçoit sa palette en argument, ce qui le rend appelable dans un test sans feuille de
 * style — et ce qui garde « aucune couleur en dur » vérifiable d'un coup d'œil.
 */
function readPalette(ink: StoryInk, accent: StoryAccent): StoryPalette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();

  const chosen = ACCENTS.find((item) => item.value === accent) ?? ACCENTS[0];
  const inkToken =
    ink === 'light' ? '--story-light' : ink === 'dark' ? '--story-dark' : chosen.token;

  // L'ombre est l'encre **opposée**, à demi : c'est elle qui fait tenir du blanc sur un
  // ciel blanc. Une encre de couleur se pose sur une photo quelconque, donc ombre sombre.
  return {
    ink: token(inkToken),
    shadow: `rgb(${token(ink === 'dark' ? '--story-light-rgb' : '--story-dark-rgb')} / 0.55)`,
    faster: token('--effort'),
    slower: token('--load'),
  };
}

/**
 * Les polices, **chargées avant de peindre**.
 *
 * Un canvas ne déclenche pas le chargement d'une police : sans cette attente, la première
 * ouverture de la feuille dessine en police système, et il faut rouvrir pour voir la
 * vraie. Trois graisses, celles que `paintStory` emploie.
 */
async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.all([
    document.fonts.load('700 210px "Space Grotesk"'),
    document.fonts.load('500 24px "Space Grotesk"'),
    document.fonts.load('600 62px "JetBrains Mono"'),
  ]);
}

const INK_OPTIONS = [
  { value: 'light' as const, label: 'Blanc' },
  { value: 'dark' as const, label: 'Sombre' },
  { value: 'accent' as const, label: 'Couleur' },
];

export function StorySheet({
  run,
  open,
  onClose,
}: {
  run: Run;
  open: boolean;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const { data: analysis, isPending, error } = useRunAnalysis(run);

  const [ink, setInk] = useState<StoryInk>('light');
  const [accent, setAccent] = useState<StoryAccent>('signal');
  const [colored, setColored] = useState(true);
  const [trimmed, setTrimmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const trimmable = canTrim(run);

  // Mémoïsée pour ce qu'elle déclenche, pas pour ce qu'elle coûte : l'effet de peinture en
  // dépend, et une carte reconstruite à chaque rendu redessinerait 1080 × 1920 à chaque
  // frappe ailleurs dans l'écran.
  const card = useMemo(
    () => storyCard(run, analysis ?? null, { ink, accent, colored, trimmed }),
    [run, analysis, ink, accent, colored, trimmed],
  );

  useEffect(() => {
    let cancelled = false;

    void loadFonts().then(() => {
      const element = canvas.current;
      // Rendu concurrent, feuille refermée, ou jsdom sans canvas : on ne peint pas.
      if (cancelled || element === null) return;
      const context = element.getContext('2d');
      if (context === null) return;
      paintStory(context, card, readPalette(ink, accent));
    });

    return () => {
      cancelled = true;
    };
  }, [card, ink, accent]);

  const share = useCallback(async () => {
    const element = canvas.current;
    if (element === null) return;

    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        element.toBlob(resolve, 'image/png');
      });
      if (blob === null) {
        notify('Le navigateur n’a pas rendu l’image.', 'recover');
        return;
      }

      const file = new File([blob], `metric-course-${run.date}.png`, { type: 'image/png' });

      // La voie du téléphone, et la seule qui mène à Instagram en un geste.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (caught) {
          // Feuille de partage refermée : ce n'est pas un échec, et surtout pas une
          // raison de déclencher un téléchargement qu'on vient de décliner.
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
        }
      }

      // Le repli du bureau. Il ne disparaît pas : un repli qui n'existe pas est un écran
      // mort le jour où l'API n'est pas là.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      // Révoquer dans la foulée coupe le téléchargement sur Safari : l'adresse est lue
      // après la boucle d'événements.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } finally {
      setBusy(false);
    }
  }, [notify, run.date]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Une story"
      lede="Fond transparent, à poser sur ta photo."
    >
      {error !== null ? (
        <Empty title="Parcours indisponible">
          {error instanceof ApiError ? error.message : 'Le fichier .fit n’a pas pu être relu.'}
        </Empty>
      ) : isPending && run.fit_path !== '' ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <div className={styles.stage}>
            <canvas
              ref={canvas}
              width={STORY_WIDTH}
              height={STORY_HEIGHT}
              className={styles.preview}
              role="img"
              aria-label={`Aperçu de l’image : ${card.hero} kilomètres, ${card.stats
                .map((stat) => `${stat.label.toLowerCase()} ${stat.value}`)
                .join(', ')}`}
            />
          </div>

          <div className={styles.controls}>
            <Segmented
              label="Couleur de l’encre"
              options={INK_OPTIONS}
              value={ink}
              onChange={setInk}
            />

            {/* Les cinq teintes n'apparaissent qu'une fois « Couleur » choisie : offertes en
                permanence, elles laissaient croire qu'elles pilotaient autre chose que
                l'encre — et ajoutaient cinq cibles à une feuille qui en porte déjà six.

                Une bande de pastilles et non un segmenté : cinq cases se coupent à 390 px,
                là où la bande se parcourt au pouce. Chacune porte son **nom** à côté de sa
                couleur — un choix qui ne se lirait qu'à la teinte serait illisible pour qui
                ne les distingue pas. */}
            {ink === 'accent' && (
              <ChipStrip label="Teinte de l’encre">
                {ACCENTS.map((item) => (
                  <Chip
                    key={item.value}
                    selected={accent === item.value}
                    onClick={() => {
                      setAccent(item.value);
                    }}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: `var(${item.token})` }}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Chip>
                ))}
              </ChipStrip>
            )}

            {card.track !== null && (
              <Segmented
                label="Couleur du tracé"
                options={[
                  { value: 'pace', label: 'Tracé par allure' },
                  { value: 'plain', label: 'Tracé uni' },
                ]}
                value={colored ? 'pace' : 'plain'}
                onChange={(value) => {
                  setColored(value === 'pace');
                }}
              />
            )}

            {card.track !== null &&
              (trimmable ? (
                <Segmented
                  label="Départ et arrivée du parcours"
                  options={[
                    { value: 'whole', label: 'Parcours entier' },
                    { value: 'trimmed', label: 'Bouts masqués' },
                  ]}
                  value={trimmed ? 'trimmed' : 'whole'}
                  onChange={(value) => {
                    setTrimmed(value === 'trimmed');
                  }}
                />
              ) : (
                // L'option ne s'offre pas, et dit pourquoi : une case qui ne ferait rien
                // en silence est pire que son absence.
                <p className={styles.note}>
                  Trop courte pour masquer les {Math.round(TRIM_KM * 1000)} premiers et derniers
                  mètres : le parcours s’affiche en entier.
                </p>
              ))}

            {card.track === null && (
              <p className={styles.note}>
                Sortie sans fichier .fit : pas de parcours à tracer, seulement les chiffres.
              </p>
            )}
          </div>

          <Button
            variant="primary"
            className={styles.share}
            busy={busy}
            onClick={() => {
              void share();
            }}
          >
            Partager l’image
          </Button>
        </>
      )}
    </Sheet>
  );
}
