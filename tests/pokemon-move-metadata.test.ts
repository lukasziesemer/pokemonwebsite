import { describe, expect, it } from 'vitest';
import { resolveMoveMetadata, type PokeApiMoveMetadata } from '@/lib/pokemon-move-metadata';

const resource = (name: string) => ({ name, url: '' });
const move = (overrides: Partial<PokeApiMoveMetadata> = {}): PokeApiMoveMetadata => ({
  name: 'tackle', type: resource('normal'), damage_class: resource('physical'),
  power: 40, accuracy: 100, pp: 35, ...overrides,
});
const change = (group: string, fields: Partial<NonNullable<PokeApiMoveMetadata['past_values']>[number]>) => ({
  version_group: resource(group), type: null, power: null, accuracy: null, pp: null, ...fields,
});
const orders = { 'red-blue': 3, 'gold-silver': 5, 'ruby-sapphire': 7, 'diamond-pearl': 12, 'black-white': 15, 'black-2-white-2': 16, 'x-y': 17, 'sun-moon': 19 };

describe('edition-specific move metadata', () => {
  it('shows Charm as Normal in Black 2 and Fairy from the XY change boundary', () => {
    const charm = move({ name: 'charm', type: resource('fairy'), damage_class: resource('status'), power: null, pp: 20, past_values: [change('x-y', { type: resource('normal') })] });
    expect(resolveMoveMetadata(charm, { versionGroupSlug: 'black-2-white-2', generation: 5 }, orders)).toMatchObject({ type: 'normal', damageClass: 'status', power: null, accuracy: 100, pp: 20 });
    expect(resolveMoveMetadata(charm, { versionGroupSlug: 'x-y', generation: 6 }, orders).type).toBe('fairy');
  });

  it('rolls changed fields back independently from newest to oldest, ignoring unchanged nulls', () => {
    const tackle = move({ past_values: [
      change('black-white', { power: 35, accuracy: 95 }),
      change('sun-moon', { power: 50 }),
    ] });
    expect(resolveMoveMetadata(tackle, { versionGroupSlug: 'ruby-sapphire', generation: 3 }, orders)).toMatchObject({ power: 35, accuracy: 95, pp: 35 });
    expect(resolveMoveMetadata(tackle, { versionGroupSlug: 'black-white', generation: 5 }, orders)).toMatchObject({ power: 50, accuracy: 100 });
    expect(resolveMoveMetadata(tackle, { versionGroupSlug: 'sun-moon', generation: 7 }, orders).power).toBe(40);
  });

  it('restores PP and numeric zero without replacing unchanged fields', () => {
    const changed = move({ past_values: [change('x-y', { power: 0, pp: 10, accuracy: 80 })] });
    expect(resolveMoveMetadata(changed, { versionGroupSlug: 'black-white', generation: 5 }, orders)).toMatchObject({ power: 0, pp: 10, accuracy: 80 });
  });

  it('uses the historical type split before Gen4 and move classes from Gen4', () => {
    const thunderPunch = move({ name: 'thunder-punch', type: resource('electric'), power: 75 });
    expect(resolveMoveMetadata(thunderPunch, { versionGroupSlug: 'ruby-sapphire', generation: 3 }, {}).damageClass).toBe('special');
    expect(resolveMoveMetadata(thunderPunch, { versionGroupSlug: 'diamond-pearl', generation: 4 }, {}).damageClass).toBe('physical');
  });

  it('resolves Bite to Normal physical in Gen1 and Dark special in Gen2', () => {
    const bite = move({ name: 'bite', type: resource('dark'), power: 60, past_values: [change('gold-silver', { type: resource('normal') })] });
    expect(resolveMoveMetadata(bite, { versionGroupSlug: 'red-blue', generation: 1 }, orders)).toMatchObject({ type: 'normal', damageClass: 'physical' });
    expect(resolveMoveMetadata(bite, { versionGroupSlug: 'gold-silver', generation: 2 }, orders)).toMatchObject({ type: 'dark', damageClass: 'special' });
  });

  it('does not infer Hidden Power’s class without the individual type before Gen4', () => {
    const hiddenPower = move({ name: 'hidden-power', damage_class: resource('special') });
    expect(resolveMoveMetadata(hiddenPower, { versionGroupSlug: 'ruby-sapphire', generation: 3 }, {}).damageClass).toBe('variable');
    expect(resolveMoveMetadata(hiddenPower, { versionGroupSlug: 'diamond-pearl', generation: 4 }, {}).damageClass).toBe('special');
  });

  it('rejects unresolved historical boundaries instead of silently returning current data', () => {
    const changed = move({ past_values: [change('unknown-group', { power: 35 })] });
    expect(() => resolveMoveMetadata(changed, { versionGroupSlug: 'black-white', generation: 5 }, orders)).toThrow('Historische Editionsreihenfolge');
  });
});
