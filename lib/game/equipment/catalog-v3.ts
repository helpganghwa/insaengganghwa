// 3차 60종 카탈로그 — 인생강화 1차 운영(목표 120종)의 전반부. 단일 source.
// 컷오버 시 catalog.ts의 import를 CATALOG_NEXT → CATALOG_V3로 교체(스프라이트 배치 + DB 재시드 동반).
// 생성: scripts/build-catalog-v3.ts (수정은 anim3-lore.json / pool-data.json / 코드맵에서).
import type { CatalogItem } from './catalog';

export const CATALOG_V3: CatalogItem[] = [
  {
    "key": "kingdom_ribbon_rapier",
    "slot": "weapon",
    "nameKo": "창천검",
    "region": "왕국",
    "lore": "은빛 칼날은 바늘처럼 가늘고, 황금 가드 한가운데 푸른 보석이 박혀 있다. 거기서 흘러내린 긴 청색 리본이 칼끝까지 따라와, 찌를 때마다 허공에 푸른 호선을 그린다. 상대가 그 선을 눈으로 좇는 순간, 칼끝은 이미 다른 곳에 가 있다.",
    "art": "a slender royal rapier with a swept silver guard and a trailing blue ribbon",
    "wornDesc": "slender silver rapier, gold swept guard set with a blue gem, a long blue gold-edged ribbon trailing loosely down from the guard"
  },
  {
    "key": "kingdom_court_twin_sabers",
    "slot": "weapon",
    "nameKo": "청홍 쌍검",
    "region": "왕국",
    "lore": "넓은 은빛 칼날 둘이 X자로 맞물린다. 한 자루의 손잡이엔 푸른 보석, 다른 자루엔 붉은 보석—같은 장인이 같은 날 빚은 한 쌍이다. 둘을 함께 들면 푸름과 붉음이 손안에서 엇갈려 돈다. 한 손엔 새벽, 한 손엔 노을을 쥔 셈이다.",
    "art": "a pair of slim curved court sabers crossed in an X with golden tasseled hilts",
    "wornDesc": "a matched pair of straight silver sabers, gold scrollwork guards, one blue gem and one red gem"
  },
  {
    "key": "kingdom_winged_coronation_sword",
    "slot": "weapon",
    "nameKo": "창궁검",
    "region": "왕국",
    "lore": "왕명으로 고하노라. 황금 날개와 푸른 다이아를 인 이 검은, 나라가 벼랑에 선 날 외에는 결코 뽑지 말라. 이 검이 햇빛을 보는 날이 곧 마지막 날이니. 그날이 오지 않도록 다스리는 것이, 이 검을 물려받은 자의 첫 의무이니라.",
    "art": "a regal fantasy longsword with a golden winged crossguard and a sky-blue gem in the hilt",
    "wornDesc": "long silver longsword, gold spread-wing crossguard set with a sky-blue gem, gold crown pommel, blue-and-white striped grip"
  },
  {
    "key": "kingdom_falcon_cane_sword",
    "slot": "weapon",
    "nameKo": "매 머리 지팡이검",
    "region": "왕국",
    "lore": "이 지팡이를 보고 무기라 여긴 사람은 아직 없었네. 광 나는 자루에 황동 매 머리 손잡이 — 그저 멋 부린 산책 도구지. 매 머리를 살짝 비틀어 보게. 자루 속에서 가는 칼 한 줄이 미끄러져 나오니까. 회담장엔 칼을 못 들고 들지만, 지팡이를 짚지 말란 법은 없거든.",
    "art": "an elegant gentlemans cane-sword with a polished dark shaft and a brass falcon-head handle",
    "wornDesc": "slim dark-burgundy cane sword, gold falcon-head handle, gold vine scrollwork along the shaft, gold ferrule tip"
  },
  {
    "key": "temple_frost_odachi",
    "slot": "weapon",
    "nameKo": "눈꽃 대도",
    "region": "신전",
    "lore": "한겨울 강처럼 푸른 칼날, 코등이는 여섯 갈래 눈꽃 결정이다. 이 칼은 닿기도 전에 서리가 먼저 닿는다. 스친 자리마다 눈꽃이 사방으로 피어나고, 피어나는 만큼 그 자리가 굳어 움직이지 않는다.",
    "art": "a long slender frost odachi greatsword with a pale ice-blue blade and a silver-wrapped hilt",
    "wornDesc": "long curved pale ice-blue odachi with a jagged icy edge, white snowflake guard, white tassel at the pommel"
  },
  {
    "key": "volcano_emberveined_greatsword",
    "slot": "weapon",
    "nameKo": "용암을 가둔 대검",
    "region": "화산",
    "lore": "흑요석 칼몸 한가운데 식지 않는 용암 한 줄기가 흐른다. 이 검이 한 번 그어지면 강철 갑옷이 베이는 게 아니라, 끊긴 자리부터 주르륵 흘러내린다. 성문도 단번에 두 쪽으로 갈라지며 잘린 단면이 벌겋게 녹아 굳는다. 막을 방법은 하나뿐이다. 닿지 않는 것.",
    "art": "a massive obsidian greatsword veined with ember-orange lava and a gold-edged blade",
    "wornDesc": "massive dark greatsword with a glowing orange lava core and gold edges, gold winged crossguard, glowing orange orb pommel"
  },
  {
    "key": "swamp_lotus_trident",
    "slot": "weapon",
    "nameKo": "피어나는 삼지창",
    "region": "늪지대",
    "lore": "박하빛 줄기 세 가닥이 갈라져 창이 됐다. 물에 닿으면 갈래 사이로 수련이 피고 잎이 돋는다. 찌른 자리마다 작은 수련 한 송이가 남는다. 늪의 싸움터에선, 누가 어디서 쓰러졌는지 그 꽃자리만 보면 알 수 있었다.",
    "art": "an elegant fairy trident of living mint wood with three slender prongs and small water-lily blooms",
    "wornDesc": "slender mint-green trident, three pale prongs, white lotus blossoms and leafy vines wrapped below the head"
  },
  {
    "key": "angel_star_wand",
    "slot": "weapon",
    "nameKo": "유성의 지팡이",
    "region": "타락천사",
    "lore": "끝에 황금 별이 작은 날개를 펴고 앉았다. 가만두면 그 별이 자꾸 위로 떠오르려 해, 지팡이를 쥔 손이 늘 묵직하다. 떨어진 별이라도 돌아갈 하늘은 잊지 않은 모양이다. 흔들면 빛가루를 흩뿌리며 한참을 버둥대다, 결국 손안에 도로 내려앉는다.",
    "art": "a winged star wand",
    "wornDesc": "slim white-and-gold wand topped with a large gold star, small white wings at its base, a blue gem on the shaft"
  },
  {
    "key": "volcano_dragonjaw_halberd",
    "slot": "weapon",
    "nameKo": "포효하는 용턱",
    "region": "화산",
    "lore": "도끼날을 용의 머리 모양으로 벼려 냈다. 부릅뜬 눈, 뒤틀린 뿔, 쩍 벌린 아가리가 그대로 시퍼런 날이 된다. 자루를 당기면 그 아가리가 한 번 더 벌어지며 뜨거운 숨을 토한다. 진짜 용은 아니어도, 맞선 자들은 영락없이 용을 마주한 듯 움츠러들었다.",
    "art": "a halberd — the dragon-jaw poleaxe of a volcano forge-knight, fierce yet splendid",
    "wornDesc": "heavy dark-hafted halberd, its axe head shaped as a fiery orange dragon head, orange blade spikes above"
  },
  {
    "key": "pumpkin_witch_staff",
    "slot": "weapon",
    "nameKo": "마녀의 등불",
    "region": "일반",
    "lore": "비틀린 검은 가지 끝에 조각된 호박이 얹히고, 정수리에서 주황 불길이 너울거린다. 매달린 검은 고양이가 길잡이다. 마녀가 졸면 호박불도 따라 깜빡이며 제멋대로 그림자놀이를 한다. 깨우는 건 늘 고양이 쪽이다.",
    "art": "a gnarled black wooden witch's staff crowned with a small carved jack-o-lantern and curls of orange flame, a black cat charm dangling — a pumpkin-night witch's spooky-cute staff, black and pumpkin-orange",
    "wornDesc": "gnarled black staff topped with a carved jack-o-lantern spouting orange flame, a small black-cat charm dangling below"
  },
  {
    "key": "kingdom_banner_spear",
    "slot": "weapon",
    "nameKo": "왕기의 창",
    "region": "왕국",
    "lore": "왕기 수칙. 이 창의 본분은 찌르는 데 있지 않고 세우는 데 있다. 자줏빛 깃이 오른 자리가 곧 왕이 선 자리다. 기수는 어떤 경우에도 깃을 뉘지 말 것. 깃이 쓰러지면 군세의 다리가 함께 풀린다. 기수가 쓰러지거든, 옆 사람이 즉시 깃을 받아 세울 것.",
    "art": "a royal banner spear",
    "wornDesc": "tall spear with a silver leaf-shaped blade, a LONG purple banner streaming down half the shaft with a gold crown-and-lion emblem, forked tasseled ends"
  },
  {
    "key": "volcano_ember_scythe",
    "slot": "weapon",
    "nameKo": "잿불낫",
    "region": "화산",
    "lore": "검은 칼날 등을 따라 주황 불길이 일렁이고, 자루 곁 작은 등롱이 그 불을 머금는다. 한 번 호를 그으면 베인 자리가 불씨에 옮아붙어 꺼지지 않는다. 화산의 전사들은 이 낫으로 적을 베는 게 아니라, 적에게 불을 옮겨 심는다고 말했다.",
    "art": "a flaming scythe",
    "wornDesc": "long black scythe, curved blade inscribed with orange runes, flames along its back edge, an orange lantern hung at the head"
  },
  {
    "key": "vampire_blood_rapier",
    "slot": "weapon",
    "nameKo": "진홍의 가는 검",
    "region": "일반",
    "lore": "손잡이 끝 루비를 보게. 처음엔 그저 맑은 돌이었네. 주인과 함께 밤을 오래 지날수록 한 톤씩 깊어지는 돌이지. 바늘처럼 가는 날은 소리도 없이 밤공기를 가른다. 지금 저렇게 검붉은 건 — 글쎄, 내가 몇백 년을 살았다는 뜻이기도 하고.",
    "art": "a vampire noble's ornate rapier with a bat-wing guard and a blood-red ruby pommel, black and crimson with gold — elegant, gothic and deadly",
    "wornDesc": "slender black rapier, dark bat-wing guard with gold scrollwork, red-wrapped grip, large red gem pommel"
  },
  {
    "key": "reaper_soul_scythe",
    "slot": "weapon",
    "nameKo": "혼불낫",
    "region": "일반",
    "lore": "초승달처럼 휜 칠흑 칼날, 자루 끝엔 보랏빛 혼불이 소리 없이 탄다. 이 낫이 한 번 거둘 때마다 그 불이 손톱만큼 자란다. 불꽃의 크기가 곧 거둔 수다. 지금 저 불이 한 손바닥만 한 걸 보면, 세어 볼 엄두가 나지 않는다.",
    "art": "a grim reaper's great scythe — a long curved black blade with a bone-wrapped haft and a violet soul-flame curling at the heel — eerie and majestic",
    "wornDesc": "long black scythe, curved blade engraved with pale runes, bone-and-spine haft, violet flame burning at the butt end"
  },
  {
    "key": "necromancer_skull_staff",
    "slot": "weapon",
    "nameKo": "초혼의 해골장",
    "region": "일반",
    "lore": "긴 뼈 한 자루 끝에 뿔 달린 해골을 얹고 검은 천으로 묶었다. 빈 눈과 정수리에서 병든 초록 불이 끊임없이 새어 오른다. 자루를 땅에 두드리면 그 불이 잠깐 거세지며, 흙 아래 잠든 것들이 자세를 고쳐 눕는다. 깨우는 건 아니다. 다만 잊지 말라고, 한 번씩 두드릴 뿐이다.",
    "art": "a necromancer's bone staff topped with a horned skull and a sickly green soul-flame, wrapped with dark cloth — eerie and arcane",
    "wornDesc": "tall pale bone staff topped with a black-horned skull burning with green flame, dark cloth tied below it"
  },
  {
    "key": "assassin_twin_daggers",
    "slot": "weapon",
    "nameKo": "쌍익 단검",
    "region": "일반",
    "lore": "두 자루 모두 칼날이 검은 불꽃처럼 굽이치고, 금빛 날개 손잡이엔 푸른 보석이 한 알씩 박혔다. 칼날은 빛을 한 점도 머금지 않아, 어둠 속에선 푸른 보석 두 점만 둥실 떠 보인다. 그 두 점이 가까워지는 걸 알아챘다면, 이미 늦은 것이다.",
    "art": "a pair of ornate assassin's daggers with twisting black-and-gold blades — sleek and deadly",
    "wornDesc": "a matched pair of daggers, wavy black-steel blades intertwined with twisting gold bands, gold winged guards set with blue gems, blue inlay"
  },
  {
    "key": "ivory_flintlock_pistol",
    "slot": "weapon",
    "nameKo": "상아빛 한 발",
    "region": "왕국",
    "lore": "상아 손잡이에 금빛 덩굴을 새기고 강철 총열을 길게 뽑았다. 화약 한 줌, 탄환 한 발. 재장전은 없다. 결투의 예법은 이 한 발에 전부를 건다. 그래서 이 총을 든 자는 끝까지 손가락을 방아쇠에 걸어만 둔다. 그 한 발이 남아 있다는 것만으로 상대는 함부로 움직이지 못한다.",
    "art": "an ornate antique fantasy flintlock pistol with a carved ivory grip and gold scrollwork — refined and elegant, not a modern gun",
    "wornDesc": "compact flintlock pistol, carved ivory stock with gold scrollwork, blued steel barrel, dark flintlock hammer"
  },
  {
    "key": "celestial_dawn_greatsword",
    "slot": "weapon",
    "nameKo": "해오름검",
    "region": "타락천사",
    "lore": "날개 가드 한가운데 작은 해가 갇혀 빛난다. 칼몸을 타고 흐르는 금빛 줄기가 그 빛을 칼끝까지 실어 나른다. 새벽 전투를 앞둔 군세 앞에서 한 번 치켜올려지면, 다들 눈이 부셔 가늘게 뜨면서도 끝내 고개를 돌리지 못한다. 검이 가리키는 쪽으로 전열이 움직인다.",
    "art": "a radiant celestial greatsword with a winged guard and a sunburst gem, white and gold — splendid and heroic",
    "wornDesc": "large white-and-gold greatsword, broad blade with a glowing gold center, white feathered wings on the guard, round amber sun gem"
  },
  {
    "key": "volcano_forgeheart_warhammer",
    "slot": "weapon",
    "nameKo": "화심의 망치",
    "region": "화산",
    "lore": "망치 머리에 식지 않는 불덩이가 박혔다. 너무 무거워 들어 올리는 데만 두 손이 다 들지만, 한 번 내리치면 그 자리가 벌겋게 달아오른다. 내리친 게 아니라 작은 화산을 떨어뜨린 듯하다. 이 망치를 정면으로 받고 멀쩡히 선 방패는 아직 없었다.",
    "art": "a warhammer — the forge-heart maul of a volcano smith-warrior, molten and mighty",
    "wornDesc": "huge dark stone warhammer, head veined with glowing orange lava cracks, a round flame emblem at its center, banded gray haft"
  },
  {
    "key": "thunder_emperor_spear",
    "slot": "weapon",
    "nameKo": "벼락을 박은 창",
    "region": "일반",
    "lore": "창날이 굳은 벼락 한 줄기다. 던질 필요도 없다. 그저 창끝으로 한 곳을 겨누면, 하늘의 진짜 벼락이 그 자리로 내리꽂힌다. 옛 뇌신이 인간에게 남긴 단 하나의 무기라고도, 벼락 맞은 신목을 깎아 만들었다고도 한다. 둘 중 무엇이 맞든, 이 창은 던지는 무기가 아니라 겨누는 무기다.",
    "art": "a thunder emperor's ornate lightning spear — a gold-and-indigo polearm with a jagged lightning-bolt blade — dynamic and splendid, no surrounding effects, no aura",
    "wornDesc": "long gold-and-indigo spear, jagged blue crystal lightning-shaped head, gold rays flaring at its base, blue gem at the center"
  },
  {
    "key": "vault_key_greatsword",
    "slot": "weapon",
    "nameKo": "봉문검",
    "region": "일반",
    "lore": "손잡이 끝이 거대한 열쇠 고리로 휘말리고, 칼몸엔 금빛 무늬가 자물쇠 문양처럼 새겨졌다. 원래는 어느 큰 문을 잠그던 열쇠였는데, 누군가 그것을 두드려 검으로 폈다. 고리를 돌리면 칼날 홈이 딸깍, 아직도 열쇠처럼 돈다. 이 검이 베지 못하는 건 없다. 다만, 아직 열지 못한 문이 하나 남아 있다.",
    "art": "an oversized skeleton-key forged into a greatsword — a vault-warden's curious key-blade, ornate and grand",
    "wornDesc": "oversized silver greatsword shaped as a key, blue runes on the blade, gold key-teeth crossguard, looped key-bow pommel"
  },
  {
    "key": "angel_radiant_gown",
    "slot": "armor",
    "nameKo": "아침빛 예복",
    "region": "타락천사",
    "lore": "눈처럼 흰 비단에 금실 햇살이 옷자락 가득 번진다. 허리에서 풀린 금빛 띠가 바람을 받아 길게 나부끼면, 마치 아침 해를 통째로 두른 듯하다. 어두운 방에 들어서면 이 예복을 입은 사람만 따로 환해, 사람들은 자기도 모르게 그쪽으로 고개를 돌린다.",
    "art": "a flowing white-and-gold radiant gown with golden ray patterns and a feathered hem",
    "wornDesc": "floor-length white-and-gold gown, softly draped long sleeves, a gold sash over one shoulder, a tiered ruffled hem with delicate gold edging, radiant and graceful", "wornDescMale": "floor-length white-and-gold ceremonial robe-coat, long draped sleeves, a gold sash across one shoulder, a gold-edged layered hem over white trousers, radiant and stately"
  },
  {
    "key": "kingdom_azure_outfit",
    "slot": "armor",
    "nameKo": "쪽빛 기사복",
    "region": "왕국",
    "lore": "은빛 갑옷에 쪽빛 휘장, 가슴엔 흰 보석. 갓 임관한 기사의 옷이다. 노련한 갑주에 비하면 가볍고 수수하지만, 정작 전장에서 가장 망설임 없이 앞으로 내딛는 발은 늘 이 쪽빛 줄에서 나온다. 기사단의 맨 앞줄이 늘 가장 푸르게 빛나는 건, 그래서다.",
    "art": "a blue-and-white knight outfit",
    "wornDesc": "knee-length blue-and-white knightly coat with gold trim, a short blue shoulder cape, a white chest gem, and silver plate greaves, trim and elegant", "wornDescMale": "knee-length blue-and-white knight's surcoat with gold trim, a short blue shoulder cape, a white chest gem, and silver plate greaves, bold and gallant"
  },
  {
    "key": "angel_seraphguard_armor",
    "slot": "armor",
    "nameKo": "세라핌의 갑주",
    "region": "타락천사",
    "lore": "새하얀 판금 가슴에 금빛 별이 빛나고, 등 뒤로 흰 깃 날개가 활짝 펴진다. 신전 가장 깊은 자리, 마지막 문을 지키는 자만이 이 갑주를 입는다. 그 문이 열린 적은 없다. 갑주가 거기 서 있는 한, 앞으로도 없을 것이다.",
    "art": "holy light armor — the winged guard-plate of a celestial knight, slim and radiant",
    "wornDesc": "fitted white plate armor with gold trim reaching down to matching white greaves, a gold eight-pointed star on the chest, and white feathered wings at the shoulders, radiant and graceful", "wornDescMale": "full-body white plate armor with gold trim, a gold eight-pointed star on the broad chest, and towering white feathered wings at the shoulders, radiant and majestic"
  },
  {
    "key": "kingdom_goldknight_plate",
    "slot": "armor",
    "nameKo": "적금 갑주",
    "region": "왕국",
    "lore": "검붉은 강철에 금빛 덩굴, 허리 아래로 사람 키만 한 진홍 자락. 왕의 으뜸 친위가 입는다. 자락이 워낙 길어, 뒤로 물러서려다간 제 발에 밟혀 넘어진다. 물러설 수 없게 일부러 그리 지은 것이다. 이 갑주를 입은 자에게, 뒤로 물러설 길은 없다.",
    "art": "a gold-and-crimson knight plate",
    "wornDesc": "fitted dark steel plate armor with bronze engraved pauldrons and breastplate, a dark-red front tabard and hip drapes over dark plate greaves, polished and regal", "wornDescMale": "full-body dark steel plate armor with heavy bronze engraved pauldrons and breastplate, a dark-red front tabard and hip drapes, imposing and regal"
  },
  {
    "key": "temple_frostguard_garb",
    "slot": "armor",
    "nameKo": "설산 파수의 갑주",
    "region": "신전",
    "lore": "은빛 판금에 흰 털깃 망토, 가슴엔 눈꽃 문양. 설산 신전 길목을 지키는 갑주다. 추위에 갑옷 이음새마다 서리가 끼는데, 그 서리가 도리어 틈을 메워 빈틈없는 한 덩이가 된다. 추울수록 단단해지는 갑옷이라, 한겨울 이 길을 뚫으려 든 자는 아무도 없었다.",
    "art": "a guardian garb — the frost-guard outfit of a snow-temple sentinel, disciplined and noble",
    "wornDesc": "silver-blue plate armor with a soft white fur collar, snowflake emblems on the pauldrons, matching silver-blue plate greaves, and a flowing pale-blue frost-patterned cape, elegant and cool", "wornDescMale": "silver-blue full plate armor with a white fur collar, snowflake emblems on broad pauldrons, and a long pale-blue frost-patterned cape, stalwart and cold"
  },
  {
    "key": "temple_breathwoven_vestment",
    "slot": "armor",
    "nameKo": "설야 예복",
    "region": "신전",
    "lore": "설야 예복. 옅은 얼음빛 비단에 은실 서리 무늬, 어깨엔 흰 털. 신전에 단 한 벌뿐이다. 옛날 한 사제가 눈에 갇힌 신전에서 봄을 기다리며 한 올 한 올 짰다 한다. 그래서 이 옷은 아무리 추운 데 서 있어도 안쪽만은 봄날처럼 따뜻하다. 옷자락의 서리 무늬는, 바깥이 추울수록 도리어 또렷하고 푸르게 살아났다.",
    "art": "a sacred vestment — the rune-woven robe of a frost-temple priestess, serene and luminous",
    "wornDesc": "floor-length pale ice-blue robe with a white fur collar and shoulder trim, wide flowing sleeves, and delicate white frost patterns down the front, serene and lovely", "wornDescMale": "floor-length pale ice-blue robe with a white fur collar and shoulder trim, wide draped sleeves, and white frost patterns down the front over pale trousers, serene and dignified"
  },
  {
    "key": "pumpkin_witch_dress",
    "slot": "armor",
    "nameKo": "호박등 드레스",
    "region": "일반",
    "lore": "검은 치마 끝이 호박등 불꽃처럼 들쭉날쭉 갈라지고, 허리엔 커다란 주황 리본이 묶였다. 줄무늬 스타킹에 굽 높은 부츠까지. 무섭자고 만든 옷이 아니라, 누가 봐도 한껏 멋을 부린 차림이다. 빙글 돌면 치맛단이 활짝 펴져 정말 작은 호박처럼 부푼다.",
    "art": "a Halloween witch outfit — a black knee-length dress with pumpkin-orange ruffles and a tattered hem, an orange sash bow and black-and-orange striped stockings — a spooky-cute anime witch in black and pumpkin-orange, not a long gown",
    "wornDesc": "strapless black knee-length dress with a big orange waist bow, ragged orange ruffle skirt layers, orange-striped stockings and buckled black boots, playful and cute", "wornDescMale": "black witch's frock coat with a large orange sash knot at the waist, ragged orange-layered coattails, orange-striped leggings and buckled black boots, roguish and sharp"
  },
  {
    "key": "necromancer_raven_robe",
    "slot": "armor",
    "nameKo": "갈까마귀 로브",
    "region": "일반",
    "lore": "갈까마귀 부리를 본뜬 후드 아래로 짙은 녹색 자락이 너덜너덜 드리운다. 가슴엔 갈비뼈를 엮어 달고, 단을 따라 초록 글자가 희미하게 빛난다. 자락이 바람에 스치면 깃털 스치는 소리가 난다. 새도 사람도 아닌 그 그림자를 마주치면, 길을 비켜 주는 편이 낫다.",
    "art": "a necromancer costume — a hooded dark-green and black robe with bone ornaments, ragged layered hems and skeletal trim — eerie and arcane, a masculine figure, not a dress",
    "wornDesc": "hooded dark-green-and-black robe with ragged torn hems, a bone ribcage ornament across the chest and a small skull clasp, eerie and elegant", "wornDescMale": "hooded dark-green-and-black robe with ragged torn hems, a bone ribcage ornament across the broad chest and a skull clasp, eerie and grim"
  },
  {
    "key": "crimson_gothic_dress",
    "slot": "armor",
    "nameKo": "진홍 레이스 드레스",
    "region": "일반",
    "lore": "진홍 비단에 검정 레이스를 층층이 두르고, 잘록한 허리부터 치마가 종처럼 퍼진다. 리본만 스무 개가 넘어, 혼자 다 묶으려면 한나절이 걸린다. 그 한나절이 아까워, 한 번 차려입은 날엔 좀처럼 갈아입지 않는다.",
    "art": "a frilly gothic lolita dress in black and crimson with lace trim, ribbons and layered ruffles — elegant and cute",
    "wornDesc": "crimson bell-skirted dress with puffed shoulders, wide ruffled sleeve cuffs, black lace neckline trim and layered black ruffle skirt tiers, gorgeous and gothic", "wornDescMale": "crimson gothic tailcoat with structured shoulders, wide black-trimmed cuffs, a black lace jabot at the collar, and layered black-trimmed coattails over black trousers, dashing and gothic"
  },
  {
    "key": "royal_military_coat",
    "slot": "armor",
    "nameKo": "금장 군복",
    "region": "왕국",
    "lore": "군청색 천에 금빛 장식끈을 가슴 가득 가로질러 달고, 양어깨엔 금술 견장이 늘어진다. 단추 하나까지 빛나도록 닦은 정복이다. 처음 이 옷을 받은 사관은 거울 앞을 떠나지 못했다. 단추를 끝까지 채우는 순간, 어쩐지 등이 한 뼘 곧아졌다.",
    "art": "an ornate royal-blue military coat with gold braid, epaulettes and brass buttons — dashing and regal",
    "wornDesc": "knee-length royal-blue military coat with gold fringed epaulettes, twin rows of brass buttons joined by gold braid, and a gold waist sash over white trousers and polished black riding boots, crisp and elegant", "wornDescMale": "knee-length royal-blue military coat with gold fringed epaulettes, twin rows of brass buttons joined by gold braid, and a gold waist sash over white trousers and polished black riding boots, commanding and grand"
  },
  {
    "key": "volcano_embersilk_dress",
    "slot": "armor",
    "nameKo": "화문 예복",
    "region": "화산",
    "lore": "진홍 비단에 불길 무늬를 수놓고 깃을 굳힌 불꽃처럼 세운 옷이다. 신기하게도 불에 닿아도 타지 않는다. 자락이 불 속을 스쳐도 무늬만 잠깐 환해질 뿐 비단은 멀쩡하다. 그래서 화산 신전에선 불을 다루는 자에게 이 옷부터 입혔다. 옷이 먼저 불을 견뎌야, 사람이 그 곁에 설 수 있으니까.",
    "art": "an ember-silk dress — the flame-shrine gown of a volcano priestess, elegant and fierce",
    "wornDesc": "floor-length crimson gown with a stiff upright flame collar, pointed shoulder pieces, and orange sun-and-flame emblems down the front, striking and beautiful", "wornDescMale": "floor-length crimson ceremonial coat with a stiff upright flame collar, pointed shoulder guards, and orange sun-and-flame emblems down the front over black trousers, striking and majestic"
  },
  {
    "key": "valkyrie_battle_dress",
    "slot": "armor",
    "nameKo": "창공의 전투복",
    "region": "타락천사",
    "lore": "「발키리 옷이 왜 이렇게 가벼워?」 「업고 떠나야 하니까.」 「업어? 누굴.」 「전장에서 쓰러진 이들.」 금빛 날개 흉갑에 흰 주름치마, 허리엔 창공빛 푸른 띠. 그 띠가 데려갈 이를 둘러 업는 끈이라, 유난히 길고 부드럽다.",
    "art": "a valkyrie battle-dress in white and gold with light armor plating and a blue sash",
    "wornDesc": "white-and-gold armored dress with a gold winged-bird breastplate, a knee-length white pleated skirt with gold hip plates, silver greaves, and a blue waist sash, valiant and beautiful", "wornDescMale": "white-and-gold battle armor with a gold winged-bird breastplate, a knee-length white pleated war-kilt with gold hip plates and a blue waist sash over armored greaves, valiant and mighty"
  },
  {
    "key": "frostwarden_coat",
    "slot": "armor",
    "nameKo": "설원 파수꾼의 외투",
    "region": "신전",
    "lore": "강철빛 천에 흰 털을 깃과 소맷부리, 단까지 둘렀다. 은빛 잠금쇠가 가슴을 따라 줄지어 채워지고, 옷자락엔 서리 맺힌 나뭇가지 무늬가 은실로 수놓였다. 북쪽 끝, 사람 하나 없는 설원을 혼자 지키는 자의 옷이다. 눈보라가 외투를 휘감아도 안쪽만은 늘 잔잔히 따뜻하다.",
    "art": "a frost-warden's long fur-lined coat in steel-blue and silver with a high collar and silver clasps, floor-length flowing coat — stoic and masculine, no trousers, no legs",
    "wornDesc": "long steel-blue coat with a soft white fur collar, cuffs and hem, four silver buckled straps down the front, and delicate white frost-branch embroidery, elegant and cool", "wornDescMale": "long steel-blue coat with a white fur collar, cuffs and hem, four silver buckled straps down the front, and white frost-branch embroidery, rugged and cold"
  },
  {
    "key": "paladin_holy_armor",
    "slot": "armor",
    "nameKo": "성광 갑주",
    "region": "타락천사",
    "lore": "양어깨에서 금빛 날개가 활짝 솟은 새하얀 갑주다. 날개가 워낙 넓어, 이걸 입으면 좁은 골목이나 문틈으로는 빠져나갈 수가 없다. 늘 탁 트인 데로만 다녀야 한다. 숨을 곳이 없으니 도망칠 곳도 없다. 성기사가 정면으로만 싸우는 건, 어쩌면 이 날개 폭 때문인지도 모른다.",
    "art": "a paladin costume — ornate white-and-gold holy plate armor with a blue tabard, winged pauldrons and gold filigree — heroic and radiant",
    "wornDesc": "white-and-gold plate armor with large gold feathered wings at the shoulders and a blue tabard bearing a gold cross, over white-and-gold plate greaves, radiant and graceful", "wornDescMale": "white-and-gold plate armor with large gold feathered wings at the broad shoulders and a blue tabard bearing a gold cross, over white-and-gold plate greaves, radiant and majestic"
  },
  {
    "key": "dragonknight_scale_armor",
    "slot": "armor",
    "nameKo": "흑룡의 비늘갑",
    "region": "화산",
    "lore": "검푸른 용비늘을 한 장씩 겹쳐 두르고, 등 뒤엔 가죽 같은 용 날개가 펼쳐진다. 가슴 한가운데 금빛 용 머리가 붉은 눈을 부릅떴다. 용을 쓰러뜨리고 그 비늘을 얻은 자만이 이 갑주를 입는다. 죽은 용은 제 비늘로, 저를 쓰러뜨린 자의 등을 끝까지 지킨다.",
    "art": "a dragon knight costume — ornate obsidian dragon-scale plate armor edged in molten gold with a dragon-wing cape — powerful and fierce",
    "wornDesc": "dark blue-grey dragon-scale armor with gold trim covering the torso down to matching scale greaves, a gold dragon-head chest emblem with glaring red eyes, and large rust-brown leathery dragon wings with horn-tipped ribs rising behind the shoulders, fierce and regal", "wornDescMale": "dark blue-grey dragon-scale armor with gold trim covering the torso down to matching scale greaves, a gold dragon-head chest emblem with glaring red eyes, and large rust-brown leathery dragon wings with horn-tipped ribs rising behind the broad shoulders, fierce and imposing"
  },
  {
    "key": "phoenix_dancer_dress",
    "slot": "armor",
    "nameKo": "불새 깃 드레스",
    "region": "화산",
    "lore": "치마 전체가 진홍과 주황 깃털로 층층이 덮여, 한 걸음에 불꽃이 일렁이는 듯하다. 금빛 코르셋 위로 깃이 어깨까지 솟는다. 불사조가 마지막으로 타오른 자리에서 떨어진 깃만 모아 지었다. 그 깃은 한 해가 지나면 저절로 더 붉어진다. 죽은 새의 깃인데도, 어쩐지 아직 살아 있는 것처럼.",
    "art": "a phoenix dancer costume — a crimson-and-gold feathered dance dress with layered flame-petal skirts and a jeweled bodice — dazzling and graceful",
    "wornDesc": "floor-length red-orange feathered gown with a crimson corset bodice, gold bead chains, a red-jeweled gold collar, and layered feather skirts, dazzling and beautiful", "wornDescMale": "red-orange feathered long coat with a fitted crimson breastplate-vest, gold bead chains, a red-jeweled gold collar, and layered feather coattails, dazzling and fiery"
  },
  {
    "key": "astrologer_starmap_coat",
    "slot": "armor",
    "nameKo": "성좌의 망토",
    "region": "일반",
    "lore": "깊은 남색 천에 금실로 별자리를 빼곡히 수놓았다. 어두운 데서 펼치면 그 별들이 어렴풋이 떠 보인다. 묘한 건, 망토의 별자리가 계절 따라 조금씩 자리를 바꾼다는 거다. 점성가는 굳이 하늘을 올려다보지 않는다. 망토만 펼쳐 봐도 오늘 밤 별이 어디 있는지 알 수 있으니까.",
    "art": "an astrologer's outfit — a navy knee-length coat-dress with gold constellation embroidery, a flowing star-map half-cape and a belt — elegant and mystical, not a long gown",
    "wornDesc": "knee-length navy coat with a short shoulder capelet, gold constellation lines and stars, gold front buttons and a brown waist belt, over deep-navy leggings and brown boots, dreamy and elegant", "wornDescMale": "knee-length navy coat with a short shoulder cape, gold constellation lines and stars, gold front buttons and a brown waist belt, over deep-navy trousers and brown boots, mysterious and grand"
  },
  {
    "key": "desert_nomad_robes",
    "slot": "armor",
    "nameKo": "모래바람의 겹옷",
    "region": "일반",
    "lore": "모래빛 천을 몇 겹이고 둘러 입고, 어깨엔 두건을 깊이 늘어뜨렸다. 허리의 색실 띠는 유랑자마다 무늬가 다르다. 지나온 마을에서 한 가닥씩 얻어 덧대기 때문이다. 띠가 길고 무늬가 복잡한 자일수록, 더 먼 곳에서 왔다는 뜻이었다.",
    "art": "a desert nomad outfit — flowing sand-beige layered robes with a patterned sash and a hooded shawl — exotic and practical, not a dress",
    "wornDesc": "layered sand-beige robes with a softly wrapped cowl shawl and a striped red-brown woven waist sash with a hanging end, graceful and worn", "wornDescMale": "layered sand-beige robes with a wrapped cowl and a striped red-brown woven waist sash with a hanging end, rugged and stoic"
  },
  {
    "key": "academy_professor_robe",
    "slot": "armor",
    "nameKo": "학장복",
    "region": "왕국",
    "lore": "내가 학생일 적, 학장이 그 자주옷을 입고 들어서면 강의실이 절로 조용해졌네. 짙은 자주에 금빛 단, 무릎까지 늘어진 금술 끈. 같은 사람이 평상복을 입었을 땐 그저 잔소리 많은 노인이었는데, 그 옷만 걸치면 한마디 한마디가 무겁게 박혔지. 자주색이 사람을 바꾼 게 아니라, 그 색을 입을 자격을 평생 들여 얻은 거라는 걸, 나는 한참 뒤에야 알았다네.",
    "art": "a royal academy professor outfit — a long deep-burgundy scholar's robe-coat with gold trim, a high collar, a sash and a draped mantle — dignified and scholarly, fantasy academy, no legs",
    "wornDesc": "long deep-burgundy robe with gold trim, a draped red shoulder mantle, wide flowing sleeves with crest patches, and a sashed waist, refined and elegant", "wornDescMale": "long deep-burgundy robe with gold trim, a draped red shoulder mantle, wide sleeves with crest patches, and a sashed waist, learned and dignified"
  },
  {
    "key": "academy_student_uniform",
    "slot": "armor",
    "nameKo": "왕립 학원 교복",
    "region": "왕국",
    "lore": "「단추가 자꾸 어긋나.」 「손 떨려서 그래.」 「안 떨려.」 「…떨면서.」 남색 재킷에 금빛 단추 두 줄, 붉은 리본, 학원 문장. 입학 첫날 아침, 거울 앞 풍경은 해마다 똑같다. 옷이 작아서가 아니라, 마음이 커져서 단추가 어긋난다.",
    "art": "a royal academy student uniform — a tailored navy uniform coat with gold trim, a school crest, a ribbon tie and a pleated hem — smart and youthful, fantasy academy, no legs",
    "wornDesc": "navy double-breasted blazer with gold buttons, a red-striped ribbon bow at the white collar, gold chest crest, and a navy pleated skirt, neat and cute", "wornDescMale": "navy double-breasted blazer with gold buttons, a red-striped necktie at the white collar, gold chest crest, and matching navy tailored trousers, neat and sharp"
  },
  {
    "key": "forest_ranger_outfit",
    "slot": "armor",
    "nameKo": "숲지기의 한 벌",
    "region": "일반",
    "lore": "초록 두건 망토 아래로 갈색 가죽 갑옷을 받쳐 입고, 허리와 어깨엔 가죽끈과 주머니가 주렁주렁 달렸다. 화살 손질 도구부터 마른 풀씨까지, 숲에서 필요한 건 죄다 이 주머니 어딘가에 있다. 이 옷을 입으면 나뭇잎 사이에 서 있어도 좀처럼 눈에 띄지 않아, 새들도 곁에서 마음 놓고 지저귄다.",
    "art": "a forest ranger outfit — a green-and-brown hooded leather tunic-coat with a quiver strap, belt pouches and a half-cape — agile and natural, not a dress, no legs",
    "wornDesc": "green hooded half-cape over brown leather chest armor, a diagonal strap across the chest, belt pouches, and a green tunic with fitted brown trousers and leather boots, nimble and spirited", "wornDescMale": "green hooded half-cape over brown leather chest armor, a diagonal strap across the chest, belt pouches, and a green tunic with fitted brown trousers and leather boots, rugged and ready"
  },
  {
    "key": "temple_snowflake_crown",
    "slot": "accessory",
    "nameKo": "설화의 관",
    "region": "신전",
    "lore": "여섯 갈래 눈꽃 결정을 그대로 깎아 세운 은빛 관이다. 한가운데 가장 큰 결정이 솟고, 둘레 띠에도 작은 눈꽃이 줄지어 박혔다. 손이 닿아도 녹지 않는다. 이 관을 쓰면 숨결이 하얗게 서리고, 보는 이들은 한겨울 한복판에 선 듯 절로 옷깃을 여민다.",
    "art": "a radiant silver crown shaped from large six-sided snowflake crystals",
    "wornDesc": "large silver ice-blue crown, a big six-pointed snowflake at the front, pale blue gems along the band"
  },
  {
    "key": "temple_fur_stole",
    "slot": "accessory",
    "nameKo": "설백 목도리",
    "region": "신전",
    "lore": "설백 목도리. 새하얀 털, 양 끝엔 금실·푸른 보석 매듭. 두르면 목덜미부터 따뜻하다. 기능은 그게 전부다. 다만 한겨울 신전에선, 그 따뜻함 하나가 무엇보다 귀했다.",
    "art": "a fur stole — a winter temple's cozy white shoulder wrap, soft and luxurious",
    "wornDesc": "wide white fur shoulder stole, gold braided embroidery down each front panel, small blue gem dots"
  },
  {
    "key": "volcano_dragonscale_satchel",
    "slot": "accessory",
    "nameKo": "용비늘 가방",
    "region": "화산",
    "lore": "「그거 진짜 용비늘이야?」 「만져 봐. 십 년 멨는데 흠집 하나 없지.」 「무겁겠다.」 「무겁지. 근데 이 안에 든 건 절벽에서 굴러도 안 깨져.」 검은 비늘이 빛을 받으면 살아 있을 때처럼 어른거리는, 용 비늘로 지은 가방이다.",
    "art": "a large black dragon-scale leather satchel with molten-gold buckles worn across the body on a braided strap",
    "wornDesc": "small black dragon-scale satchel, gold trim and rivets, large orange-red gem on the flap, braided shoulder strap"
  },
  {
    "key": "volcano_dragonhorn_circlet",
    "slot": "accessory",
    "nameKo": "화룡의 뿔관",
    "region": "화산",
    "lore": "검붉은 띠 양옆에서 진짜 용의 뿔이 휘어 솟고, 한가운데 핏빛 루비가 박혔다. 화산 투기장에서 용을 끝까지 마주 본 자만이 이 관을 쓴다. 쓴 자의 그림자엔 늘 뿔 두 개가 같이 진다. 용을 잡아 그 뿔을 머리에 인 자에게, 용은 더 이상 올려다보는 상대가 아니다.",
    "art": "a circlet — the dragon-horn diadem of a volcano champion, bold and regal",
    "wornDesc": "slim gold circlet with a deep red band, oval red ruby at front, red-cracked black horns curving up each side"
  },
  {
    "key": "volcano_obsidian_warfan",
    "slot": "accessory",
    "nameKo": "흑요 봉황선",
    "region": "화산",
    "lore": "흑요 봉황선. 흑요석 살에 금빛 봉황, 활짝 펴면 더운 바람이 일고 접으면 단단한 몽둥이가 된다. 화산 여제가 분노를 가라앉힐 때 든다. 부채를 한 번 천천히 부치는 동안, 여제는 노여움을 어디에 내릴지 다시 헤아린다. 부채가 멈추면, 헤아림도 끝난 것이다.",
    "art": "a large black-and-gold war-fan with obsidian ribs and ember-orange edges",
    "wornDesc": "large black obsidian war-fan, a gold phoenix at the top center, gold lightning-crack veins down the blades, a gold handle"
  },
  {
    "key": "swamp_mushroom_hat",
    "slot": "accessory",
    "nameKo": "약초꾼의 버섯 모자",
    "region": "늪지대",
    "lore": "붉은 버섯 갓을 통째로 썼다. 챙엔 이끼며 초롱꽃, 마른 약초, 작은 병들이 대롱대롱 매달렸다. 비 오면 우산, 볕 나면 그늘. 약초꾼이 모자를 벗을 때마다 풀냄새가 한 줌 따라 났다.",
    "art": "a hat — the oversized mushroom-cap hat of a swamp herbalist, cute and cozy",
    "wornDesc": "oversized red mushroom-cap hat, cream spots, blue bellflower and moss band, tiny potion bottles dangling from the brim"
  },
  {
    "key": "swamp_lily_crown",
    "slot": "accessory",
    "nameKo": "수련 화관",
    "region": "늪지대",
    "lore": "수련 봉오리 엮어 만든 화관\n머리에 살짝 얹으면\n봉오리가 하나둘 벙긋\n쓴 사람 따라 활짝 핀다네.",
    "art": "a lush flower crown woven of large pink water-lilies and green leaves",
    "wornDesc": "full flower crown woven of pink water-lilies, green leaves and buds on a twisted vine"
  },
  {
    "key": "angel_glide_wings",
    "slot": "accessory",
    "nameKo": "하얀 깃 날개",
    "region": "타락천사",
    "lore": "등에 다는 새하얀 깃 한 쌍, 깃 끝마다 금실이 감겼다. 날 수 있을 듯하지만 들어 보면 그저 가벼운 장식이다. 신전 축일에 합창대가 이걸 달고 늘어서면, 바람 한 줄기에 수십 쌍의 깃이 동시에 일렁인다. 그 광경 하나를 보겠다고 사람들이 먼 길을 왔다.",
    "art": "a pair of small feathered angel wings — delicate white-and-gold wings worn at the back, light and radiant",
    "wornDesc": "small white feathered wings worn at the back, gold-edged feather tips, a smaller second pair below"
  },
  {
    "key": "kingdom_court_fan",
    "slot": "accessory",
    "nameKo": "진홍 봉황선",
    "region": "왕국",
    "lore": "진홍 비단에 금실로 봉황을 수놓은 부채다. 펴면 봉황이 부채 가득 날개를 편다. 정작 이 부채로 부채질을 한 사람은 없다. 너무 곱게 만들어, 바람을 일으키기엔 아깝다는 것이다. 그래서 왕실에서 가장 화려한 부채는, 한 번도 제 노릇을 해 본 적이 없다.",
    "art": "a crimson-and-gold phoenix court fan",
    "wornDesc": "small crimson silk folding fan, gold phoenix embroidery at center, gold lace edging, tassel at the handle"
  },
  {
    "key": "commander_feather_epaulets",
    "slot": "accessory",
    "nameKo": "푸른 깃 견장",
    "region": "왕국",
    "lore": "금빛 어깨갑에서 푸른 깃털이 부챗살처럼 펴지고, 아래로 은사슬과 푸른 보석이 늘어진다. 하늘 군단 지휘관의 표지다. 전장이 연기와 함성으로 뒤덮여도 병사들은 저 푸른 깃 한 쌍을 찾아 고개를 든다. 그래서 지휘관은 늘 가장 눈에 띄는 자리에 선다. 가장 먼저 노려지는 자리이기도 하다.",
    "art": "ornate feathered shoulder-epaulets with hanging gold chains and gems — a sky-commander's splendid regalia, worn at the shoulders",
    "wornDesc": "large gold shoulder epaulets, fanned blue-and-white feathers behind each plate, blue gems, gold chains with blue drops beneath"
  },
  {
    "key": "pumpkin_witch_hat",
    "slot": "accessory",
    "nameKo": "마녀의 뾰족 모자",
    "region": "일반",
    "lore": "끝이 살짝 꺾인 검은 뾰족 모자에 주황 띠를 두르고 금빛 버클을 채웠다. 띠엔 작은 잭오랜턴이 까딱인다. 챙이 워낙 넓어 비는 잘 막는데, 정작 쓴 사람은 발밑이 안 보여 자주 돌부리에 걸린다.",
    "art": "a black witch's wide pointed hat with an orange ribbon band, a gold buckle, a bent tip and a tiny pumpkin charm — a Halloween witch's spooky-cute hat, black and pumpkin-orange",
    "wornDesc": "wide black pointed witch hat, orange band with gold buckle, tiny pumpkin charm dangling at the side"
  },
  {
    "key": "phantom_half_mask",
    "slot": "accessory",
    "nameKo": "상아 반가면",
    "region": "왕국",
    "lore": "상아빛 반가면. 얼굴 위쪽을 가리고, 금빛 세공이 눈가를 따라 덩굴처럼 뻗는다. 한쪽엔 검은 술. 가면무도회에선 자정이 되면 다들 가면을 벗는다. 그런데 이 가면을 쓴 손님만은 끝까지 얼굴을 보인 적이 없다. 그러고는 다음 무도회 같은 자리에, 또 앉아 있었다.",
    "art": "a phantom's ornate half-mask of white porcelain and gold filigree — elegant, mysterious and iconic",
    "wornDesc": "small white porcelain half-mask, gold scroll filigree, a black tassel on a gold chain at one side"
  },
  {
    "key": "valkyrie_winged_circlet",
    "slot": "accessory",
    "nameKo": "발키리의 날개 서클릿",
    "region": "타락천사",
    "lore": "은빛 띠에 푸른 보석, 양옆엔 은백색 깃 날개. 이걸 두르면 멀리 쓰러진 이의 마지막 숨소리까지 들린다. 발키리는 그 소리만 좇아 전장을 가로지른다. 보석이 향하는 쪽엔 늘, 아직 데려가지 못한 누군가가 남아 있었다.",
    "art": "a valkyrie's winged circlet — a silver-and-gold crown with feathered side-wings and a blue gem — heroic and radiant",
    "wornDesc": "slim silver circlet, oval blue gem in gold filigree at the front, white feathered wings at each side"
  },
  {
    "key": "devil_horn_headband",
    "slot": "accessory",
    "nameKo": "작은 악마의 뿔",
    "region": "일반",
    "lore": "「이번 무도회 변장 뭐 할 거야?」 「악마. 이 뿔 봐, 무섭지?」 「…너 그거 쓰니까 더 귀여운데.」 「뭐?!」 붉은 뿔에 작은 박쥐 날개를 단 머리띠다. 무섭게 만들었다는데, 쓰면 쓸수록 귀여워지는 게 영 뜻대로 안 된다.",
    "art": "a cute devil horn headband with little bat wings, black and crimson",
    "wornDesc": "thin dark bronze headband, glossy crimson horns on top, small black bat wings at each side"
  },
  {
    "key": "dragonknight_horned_helm",
    "slot": "accessory",
    "nameKo": "용면 투구",
    "region": "화산",
    "lore": "검푸른 강철 투구 정면에 금빛 용의 얼굴이 으르렁대며 박혔다. 양옆으론 금빛 뿔과 날개가 사납게 뻗는다. 눈구멍 안쪽이 가끔 번뜩이고, 콧등 틈으로 옅은 불김이 샌다. 이걸 쓴 자의 목소리는 투구를 울려 한층 낮게 깔려, 듣는 이의 등을 절로 서늘하게 했다.",
    "art": "a dragon knight's horned great-helm in obsidian and molten-gold with dragon motifs — fierce and bold",
    "wornDesc": "large dark obsidian great-helm, golden dragon face on the front, flared gold fin-like horns on each side"
  },
  {
    "key": "paladin_winged_helm",
    "slot": "accessory",
    "nameKo": "백은 날개 투구",
    "region": "타락천사",
    "lore": "새하얀 은빛 투구 정면에 금빛 십자가 곧게 새겨지고, 양옆엔 작은 은 날개가 펴진다. 정수리엔 푸른 깃 장식이 꼿꼿이 섰다. 투구를 쓰면 시야가 좁아지는 대신, 오직 앞만 보게 된다. 성기사에게 필요한 건 딱 그것뿐이라 했다.",
    "art": "a paladin's winged great-helm in white silver and gold with a blue plume — holy and heroic",
    "wornDesc": "rounded white-silver great-helm, gold-edged black cross on the front, small white wings at the sides, blue plume"
  },
  {
    "key": "frost_kite_shield",
    "slot": "accessory",
    "nameKo": "빙정 방패",
    "region": "신전",
    "lore": "얼음 결정을 깎아 두른 연 모양 방패, 가운데 여섯 갈래 눈꽃. 화살이든 칼이든 이 방패에 닿기 직전 한 김 얼어 속도가 뚝 떨어진다. 막는다기보다 늦추는 방패다. 늦춰진 그 한순간이면, 방패 뒤에 선 자가 반격하기에 충분했다.",
    "art": "an ornate kite shield of frost-blue crystal and silver with a snowflake boss — a splendid winter guardian's shield, elegant and radiant",
    "wornDesc": "large ice-blue crystal kite shield, silver filigree edging, a big silver snowflake across the face, icicle tips below"
  },
  {
    "key": "round_gold_glasses",
    "slot": "accessory",
    "nameKo": "금테 둥근 안경",
    "region": "일반",
    "lore": "금테 둥근 안경. 알이 맑고 테가 가늘다. 도수 없음, 시력 교정 효과 없음. 다만 착용 시 인상이 약 30% 학자다워지는 것으로 보고됨. 콧잔등 자국 거의 남지 않음. 권장 상황: 어려운 말을 할 때, 또는 어려운 말을 하는 척할 때.",
    "art": "a finely detailed pair of round gold eyeglasses",
    "wornDesc": "small round thin gold-rimmed eyeglasses, pale gray tinted lenses with light glare, thin gold arms"
  }
];
