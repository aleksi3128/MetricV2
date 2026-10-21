/**
 * Construire une course au doigt (`docs/planifier-une-seance.md`, D4).
 *
 * **Il n'a pas sa propre logique** : il assemble le texte de la notation, que le serveur
 * lit ensuite comme s'il avait été tapé. Rien n'est additionné ni calculé ici — la durée,
 * la distance et les plages viennent de l'aperçu.
 *
 * Un groupe est ce qui se répète : « 5 × (1 km à 6'00 + 80 m LD à 3'30) » est un groupe de
 * deux blocs, répété cinq fois, avec sa récupération. Un groupe d'une fois et d'un bloc est
 * un bloc seul.
 */

import { useState } from 'react';

import { Button, Chip, ChipStrip, Field, Stepper } from '@/components/ui';

import styles from './RunProgram.module.css';

type Unit = 'km' | 'm' | 'min';

interface Block {
  quantity: string;
  unit: Unit;
  code: string | null;
  pace: string;
}

interface Group {
  count: string;
  blocks: Block[];
  recovery: string;
}

const UNITS: Unit[] = ['min', 'km', 'm'];
const CODES = ['EF', 'SL', 'T', 'VMA', 'AS10', 'LD', 'RC'];

function blank(): Block {
  return { quantity: '', unit: 'min', code: null, pace: '' };
}

function blockText(block: Block): string {
  const quantity = block.quantity.trim();
  const head = block.unit === 'min' ? `${quantity}'` : `${quantity} ${block.unit}`;
  return [head, block.code ?? '', block.pace.trim()].filter((part) => part !== '').join(' ');
}

/** Le texte de la notation — assemblé, jamais lu : c'est le serveur qui le lira. */
function notationOf(groups: Group[]): string {
  return groups
    .map((group) => {
      const blocks = group.blocks.filter((block) => block.quantity.trim() !== '');
      if (blocks.length === 0) return '';
      const inner = blocks.map(blockText).join(' + ');
      const count = Number(group.count) || 1;
      if (count <= 1) return inner;
      const body =
        blocks.length > 1 ? `${String(count)} × (${inner})` : `${String(count)} × ${inner}`;
      const recovery = group.recovery.trim();
      return recovery === '' ? body : `${body} r${recovery}`;
    })
    .filter((part) => part !== '')
    .join(' + ');
}

export function RunBuilder({ onWrite }: { onWrite: (notation: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([{ count: '1', blocks: [blank()], recovery: '' }]);

  function update(index: number, change: (group: Group) => Group): void {
    setGroups((current) => current.map((group, at) => (at === index ? change(group) : group)));
  }

  function updateBlock(index: number, at: number, change: Partial<Block>): void {
    update(index, (group) => ({
      ...group,
      blocks: group.blocks.map((block, position) =>
        position === at ? { ...block, ...change } : block,
      ),
    }));
  }

  const written = notationOf(groups);

  return (
    <div className={styles.builder}>
      {groups.map((group, index) => (
        <fieldset key={index} className={styles.groupBox}>
          <legend className={styles.label}>Groupe {index + 1}</legend>
          <Stepper
            label="Répétitions"
            value={group.count}
            step={1}
            min={1}
            max={50}
            onChange={(value) => {
              update(index, (current) => ({ ...current, count: value }));
            }}
          />
          {group.blocks.map((block, at) => (
            <div key={at} className={styles.block}>
              <div className={styles.goals}>
                <Field
                  label={`Bloc ${String(at + 1)} — quantité`}
                  inputMode="decimal"
                  value={block.quantity}
                  placeholder={block.unit === 'min' ? '15' : block.unit === 'km' ? '1' : '80'}
                  onChange={(event) => {
                    updateBlock(index, at, { quantity: event.target.value });
                  }}
                />
                <Field
                  label="Allure (/km)"
                  value={block.pace}
                  placeholder="6'00"
                  onChange={(event) => {
                    updateBlock(index, at, { pace: event.target.value });
                  }}
                />
              </div>
              <ChipStrip label={`Unité du bloc ${String(at + 1)}`}>
                {UNITS.map((unit) => (
                  <Chip
                    key={unit}
                    selected={block.unit === unit}
                    onClick={() => {
                      updateBlock(index, at, { unit });
                    }}
                  >
                    {unit}
                  </Chip>
                ))}
              </ChipStrip>
              <ChipStrip label={`Sigle du bloc ${String(at + 1)}`}>
                {CODES.map((code) => (
                  <Chip
                    key={code}
                    selected={block.code === code}
                    onClick={() => {
                      updateBlock(index, at, { code: block.code === code ? null : code });
                    }}
                  >
                    {code}
                  </Chip>
                ))}
              </ChipStrip>
            </div>
          ))}
          <div className={styles.actions}>
            <Button
              variant="quiet"
              onClick={() => {
                update(index, (current) => ({ ...current, blocks: [...current.blocks, blank()] }));
              }}
            >
              Ajouter un bloc au groupe
            </Button>
          </div>
          {Number(group.count) > 1 && (
            <Field
              label="Récupération après chaque répétition"
              value={group.recovery}
              placeholder="1'30 ou 200m"
              onChange={(event) => {
                update(index, (current) => ({ ...current, recovery: event.target.value }));
              }}
            />
          )}
        </fieldset>
      ))}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          onClick={() => {
            setGroups((current) => [...current, { count: '1', blocks: [blank()], recovery: '' }]);
          }}
        >
          Ajouter un groupe
        </Button>
        <Button
          variant="primary"
          disabled={written === ''}
          onClick={() => {
            onWrite(written);
          }}
        >
          Écrire la séance
        </Button>
      </div>
      {written !== '' && <p className={styles.summary}>{written}</p>}
    </div>
  );
}
