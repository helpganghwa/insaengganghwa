import sharp from 'sharp';
const base = 'public/sprites-test/anim-obj';
const sets: [string, string[]][] = [
  ['7_frost', ['kingdom_frost_sword', 'kingdom_frost_armor', 'kingdom_frost_crown']],
  ['8_venom', ['marsh_venom_glaive', 'marsh_venom_armor', 'marsh_venom_vial']],
  ['9_obsidian', ['volcano_obsidian_greatsword', 'volcano_obsidian_armor', 'volcano_obsidian_core']],
  ['10_solar', ['temple_solar_halberd', 'temple_solar_armor', 'temple_solar_medal']],
  ['11_rose', ['angel_rose_rapier', 'angel_rose_armor', 'angel_rose_halo']],
  ['12_spore', ['orc_spore_club', 'orc_spore_armor', 'orc_spore_pouch']],
];
for (const [name, keys] of sets) {
  const comps = await Promise.all(keys.map(async (k, i) => ({ input: await sharp(`${base}/${k}/idle.png`).resize(192, 192, { fit: 'contain', background: { r: 30, g: 30, b: 38, alpha: 1 } }).png().toBuffer(), left: i * 192, top: 0 })));
  await sharp({ create: { width: 576, height: 192, channels: 4, background: { r: 30, g: 30, b: 38, alpha: 1 } } }).composite(comps).png().toFile(`/tmp/set_${name}.png`);
}
console.log('montage2 done');
