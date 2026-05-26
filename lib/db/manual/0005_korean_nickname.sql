-- ───────────────────────────────────────────────────────────────────────────
-- 0005 한글 닉네임 자동 생성 — 동사 + 색상 + 명사 조합
--
-- 배경: 0001에서 도입한 '용사' || UUID앞12자 패턴은 가독성/정체성 모두 약함
--   (의미 없는 hex 14자). '춤추는파란다람쥐' 같은 한글 조합으로 교체.
--   풀 사이즈 약 57만(동사 109 × 색상 25 × 명사 211) — 충돌 시 루프 재시도 +
--   최종 fallback(8자 컷 + 4자리 숫자 접미사) 보장.
--
-- 자수 보장: max(동사 4) + max(색상 3) + max(명사 4) = 11자 ≤ NICKNAME_MAX_LEN 12.
--
-- 적용: Supabase SQL Editor에서 프로덕션 DB에 1회 실행. 멱등 — 함수 교체 +
--   기존 '용사*' 패턴 닉네임만 한글로 백필. 이미 한글이거나 사용자가 변경한
--   닉네임은 건드리지 않음. 백필된 유저의 nickname_changed_count는 0 유지
--   (첫 변경 무료 권리 보존).
-- ───────────────────────────────────────────────────────────────────────────

-- 1) 한글 닉네임 생성 함수 ----------------------------------------------------
create or replace function public.generate_korean_nickname()
returns text
language plpgsql
as $$
declare
  verbs text[] := array[
    '춤추는','노래하는','달리는','뛰는','웃는','자는','꿈꾸는','노는','쉬는','걷는',
    '헤엄치는','날아가는','뛰어가는','구르는','흔들리는','살랑이는','반짝이는','빛나는','흩날리는','떠다니는',
    '깡총뛰는','두근대는','설레는','흐르는','솟아나는','피어나는','자라는','익어가는','깨어나는','떠나는',
    '돌아오는','만나는','부르는','듣는','보는','그리는','쓰는','읽는','외우는','기억하는',
    '찾는','숨는','도망친','쫓아가는','머무는','떠도는','헤매는','손짓하는','인사하는','끄덕이는',
    '일어선','앉은','누운','기댄','안기는','토닥이는','쓰다듬는','두드리는','칠하는','만드는',
    '자르는','붙이는','엮는','짜는','박는','굽는','빚는','굴리는','던지는','잡는',
    '줍는','잠든','깨어난','신난','들뜬','노니는','뒹구는','산책하는','박수치는','재잘대는',
    '속삭이는','외치는','흥얼대는','휘날리는','너울대는','일렁이는','부푸는','솟구치는','가라앉는','떨어지는',
    '떠오르는','살랑대는','일어나는','기다리는','머뭇대는','망설이는','달려가는','뛰노는','살피는','응시하는',
    '바라보는','매혹된','홀린','콩닥대는','따르는','이끄는','인도하는','보살피는','지키는'
  ];
  colors text[] := array[
    '빨간','파란','노란','검은','하얀','푸른','붉은','보라','분홍','초록',
    '갈색','회색','황금','은빛','주황','청록','남색','연두','살구','보라색',
    '분홍색','무지개','연보라','황금색','진보라'
  ];
  nouns text[] := array[
    -- 동물 (75)
    '다람쥐','토끼','사슴','여우','늑대','호랑이','사자','곰','판다','코끼리',
    '기린','얼룩말','원숭이','고양이','강아지','햄스터','고슴도치','너구리','두더지','박쥐',
    '부엉이','올빼미','까치','비둘기','참새','제비','갈매기','펭귄','거위','오리',
    '백조','두루미','독수리','까마귀','앵무새','잉어','금붕어','고래','돌고래','상어',
    '거북이','자라','도마뱀','카멜레온','개구리','두꺼비','도롱뇽','메뚜기','사마귀','잠자리',
    '나비','나방','개미','무당벌레','풍뎅이','매미','귀뚜라미','반딧불','거미','새우',
    '가재','문어','오징어','해파리','불가사리','소라','조개','달팽이','망아지','송아지',
    '병아리','새끼곰','햇병아리','노루','멧돼지',
    -- 식물 (37)
    '장미','백합','튤립','해바라기','코스모스','라벤더','민들레','진달래','개나리','벚꽃',
    '동백','매화','국화','수국','안개꽃','작약','모란','연꽃','갈대','억새',
    '단풍','은행잎','솔잎','도토리','호두','사과','포도','복숭아','자두','살구나무',
    '앵두','산딸기','머루','다래','산수유','무궁화','새싹',
    -- 자연 (37)
    '구름','바람','하늘','노을','안개','이슬','서리','눈송이','물방울','빗방울',
    '파도','바다','호수','시냇물','폭포','들판','동굴','모래','자갈','바위',
    '화산','빙하','사막','초원','평원','언덕','절벽','우물','등대','다리',
    '골목','새벽','아침','한낮','저녁','밤하늘','별바다',
    -- 사물·기물 (38)
    '별빛','달빛','햇살','등불','촛불','모닥불','메아리','종소리','노래','추억',
    '그림자','발자국','편지','일기장','모자','우산','부채','거울','화분','시계',
    '풍선','팽이','구슬','인형','호각','호루라기','피리','가야금','거문고','장구',
    '꽹과리','풍경','풍차','등롱','비파','부싯돌','돛단배','종이배',
    -- 신비·인물 (24)
    '요정','마법사','마녀','도깨비','천사','정령','유령','인어','영웅','기사',
    '무사','현자','검객','음유시인','부적','환영','꼬마','친구','길손','나그네',
    '방랑자','모험가','탐험가','도령'
  ];
begin
  return verbs[1 + floor(random() * array_length(verbs, 1))::int]
      || colors[1 + floor(random() * array_length(colors, 1))::int]
      || nouns[1 + floor(random() * array_length(nouns, 1))::int];
end;
$$;

-- 2) handle_new_user 교체 — 한글 닉네임 + UNIQUE 충돌 재시도 ------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_nickname text;
  attempts int := 0;
  max_attempts constant int := 10;
begin
  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.profiles (id, nickname, diamond, tutorial_step)
      values (new.id, new_nickname, 5, 1);
      exit;
    exception when unique_violation then
      -- id 충돌(트리거 재실행) → 종료. nickname 충돌 → 재시도.
      if exists (select 1 from public.profiles where id = new.id) then
        exit;
      end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        -- fallback: 앞 8자 컷 + 4자리 숫자 = 12자(NICKNAME_MAX_LEN 한도)
        new_nickname := substr(new_nickname, 1, 8)
                     || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
        insert into public.profiles (id, nickname, diamond, tutorial_step)
        values (new.id, new_nickname, 5, 1)
        on conflict (id) do nothing;
        exit;
      end if;
    end;
  end loop;

  insert into public.user_supply_boxes (user_id, slot, count)
  values
    (new.id, 'weapon',    2),
    (new.id, 'armor',     2),
    (new.id, 'accessory', 2)
  on conflict (user_id, slot) do nothing;

  return new;
end;
$$;

-- 3) 트리거는 0001에서 이미 등록됨(on_auth_user_created on auth.users).
--    함수 교체만으로 신규 가입자에 즉시 반영됨.

-- 4) 기존 '용사*' 닉네임 백필 (멱등) ------------------------------------------
--    이미 한글이거나 사용자가 직접 변경한 닉네임은 건드리지 않음.
do $$
declare
  rec record;
  new_nickname text;
  attempts int;
  max_attempts constant int := 10;
begin
  for rec in
    select id from public.profiles where nickname like '용사%'
  loop
    attempts := 0;
    loop
      new_nickname := public.generate_korean_nickname();
      begin
        update public.profiles
        set nickname = new_nickname
        where id = rec.id;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts >= max_attempts then
          new_nickname := substr(new_nickname, 1, 8)
                       || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
          update public.profiles
          set nickname = new_nickname
          where id = rec.id;
          exit;
        end if;
      end;
    end loop;
  end loop;
end $$;
