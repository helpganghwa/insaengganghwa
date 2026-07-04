import { config } from 'dotenv'; config({path:'.env.local'});
import { composeV3Description } from '@/lib/game/profile/compose-v3';
const d = await composeV3Description({
  gender:'female',
  appearance:{race:'human',hair:'silver long wavy',eyeColor:'sapphire-blue',expression:'calm and composed',pose:'standing tall and composed, the weapon held quietly at one side'},
  weaponKey:'kingdom_court_twin_sabers', armorKey:'paladin_holy_armor', accessoryKey:'frost_kite_shield',
});
console.log(d);
console.log('\n--- 방패 배치 문장 ---');
const m=d.toLowerCase().match(/[^.]*\bshield\b[^.]*\./g);
if(m) m.forEach(s=>console.log('•',s.trim()));
