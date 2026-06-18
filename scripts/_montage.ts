import sharp from 'sharp';
const base = 'public/sprites-test/anim-obj';
const sets: [string, string[]][] = [
  ['1_lionheart', ['kingdom_lionheart_lance', 'kingdom_lionheart_cuirass', 'kingdom_lionheart_locket']],
  ['2_fenlantern', ['marsh_fen_scythe', 'marsh_fen_cloak', 'marsh_fen_lantern']],
  ['3_phoenix', ['volcano_phoenix_bow', 'volcano_phoenix_cuirass', 'volcano_phoenix_pendant']],
  ['4_astral', ['temple_astral_staff', 'temple_astral_robe', 'temple_astral_diadem']],
  ['5_seraph', ['angel_seraph_sword', 'angel_seraph_armor', 'angel_seraph_halo']],
  ['6_thunder', ['orc_thunder_axe', 'orc_thunder_chest', 'orc_thunder_charm']],
];
for (const [name, keys] of sets) {
  const comps = await Promise.all(keys.map(async (k, i) => ({ input: await sharp(`${base}/${k}/idle.png`).resize(192, 192, { fit: 'contain', background: { r: 30, g: 30, b: 38, alpha: 1 } }).png().toBuffer(), left: i * 192, top: 0 })));
  await sharp({ create: { width: 576, height: 192, channels: 4, background: { r: 30, g: 30, b: 38, alpha: 1 } } }).composite(comps).png().toFile(`/tmp/set_${name}.png`);
}
console.log('montage done');
