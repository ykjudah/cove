begin;
create table if not exists public.golf_games(
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.rooms(id) on delete cascade,
 player1 uuid not null references public.profiles(id) on delete cascade,player2 uuid references public.profiles(id) on delete cascade,
 state jsonb,shot jsonb,revision integer not null default 0,updated_at timestamptz not null default now(),check(player1<>player2)
);
alter table public.golf_games add column if not exists hole_count integer not null default 9 check(hole_count in(3,5,9));
create index if not exists golf_room_updated on public.golf_games(room_id,updated_at desc);
alter table public.golf_games enable row level security;
revoke all on public.golf_games from public,anon,authenticated;
grant select on public.golf_games to authenticated;
drop policy if exists golf_read on public.golf_games;
create policy golf_read on public.golf_games for select to authenticated using(private.is_member(room_id));
drop function if exists public.create_golf_game(uuid);
create or replace function public.create_golf_game(target_room uuid,holes integer default 3) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;
begin
 if auth.uid() is null or not private.is_member(target_room) then raise exception 'Chat unavailable';end if;
 if holes not in(3,5) or holes is null then raise exception 'Choose 3 or 5 holes';end if;
 insert into public.golf_games(room_id,player1,hole_count) values(target_room,auth.uid(),holes) returning * into g;
 insert into public.messages(room_id,sender_id,body) values(target_room,auth.uid(),'[[sahur-golf:v1]]'||g.id::text);return g;
end $$;
create or replace function public.accept_golf_game(game_id uuid) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;seed bigint;course_order jsonb;tee jsonb;tees jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or auth.uid()=g.player1 or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or private.people_blocked(auth.uid(),g.player1) then raise exception 'Game unavailable';end if;
 if g.player2 is not null then if g.player2=auth.uid() then return g;end if;raise exception 'Someone already accepted';end if;
 select jsonb_agg(n) into course_order from (select n from generate_series(1,28) n order by random() limit g.hole_count) choices;tee:=tees->(course_order->>0)::integer;
 seed:=('x'||substr(replace(g.id::text,'-',''),1,8))::bit(32)::bigint;
 update public.golf_games set player2=auth.uid(),state=jsonb_build_object('version',1,'courseSet',case when g.hole_count=9 then 1 else 3 end,'players',jsonb_build_array(auth.uid(),g.player1),'turn',auth.uid(),'hole',0,'obstacleTick',0,'seed',seed,'balls','[{"x":141,"y":395,"sunk":false},{"x":159,"y":395,"sunk":false}]'::jsonb,'scores','[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]]'::jsonb,'shotNumber',0,'finished',false,'winner',null,'lastHole',null)||case when g.hole_count=9 then '{}'::jsonb else jsonb_build_object('holeCount',g.hole_count,'courseOrder',course_order,'balls',jsonb_build_array(jsonb_build_object('x',(tee->>0)::integer-9,'y',(tee->>1)::integer,'sunk',false),jsonb_build_object('x',(tee->>0)::integer+9,'y',(tee->>1)::integer,'sunk',false))) end,updated_at=now() where id=g.id returning * into g;return g;
end $$;
create or replace function public.submit_golf_shot(game_id uuid,expected_revision integer,shot_data jsonb,end_state jsonb) returns public.golf_games language plpgsql security definer set search_path='' as $$
declare g public.golf_games;s jsonb;h integer;nh integer;i integer;j integer;p integer;k integer;total0 integer:=0;total1 integer:=0;b jsonb;expected_turn text;expected_winner text;starts jsonb:='[[150,395],[95,500],[90,495],[200,565],[100,545],[95,620],[90,675],[90,585],[85,760],[100,720],[100,665],[230,700],[110,690],[220,700],[230,700],[95,740],[95,690],[105,680],[95,750],[95,715],[95,675],[230,685],[95,750],[90,695],[95,575],[230,725],[90,705],[90,735],[95,755]]';
begin
 select * into g from public.golf_games where id=game_id for update;
 if not found or auth.uid() is null or g.player2 is null or auth.uid() not in(g.player1,g.player2) or not private.is_member(g.room_id) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player1) or not exists(select 1 from public.room_members where room_id=g.room_id and user_id=g.player2) or private.people_blocked(g.player1,g.player2) then raise exception 'Game unavailable';end if;
 if g.revision=expected_revision+1 and g.shot=shot_data and g.state=end_state then return g;end if;
 if shot_data ? 'assist' and (shot_data->'assist' is distinct from 'true'::jsonb or not public.is_app_owner()) then raise exception 'Owner access required';end if;
 s:=g.state;if s->>'courseSet'='2' then starts:='[[95,500],[100,545],[90,675],[90,585],[85,760]]'::jsonb;end if;if g.revision<>expected_revision or s->>'turn'<>auth.uid()::text or s->>'finished'<>'false' then raise exception 'Turn changed. Reopen the game';end if;
 if jsonb_typeof(shot_data) is distinct from 'object' or jsonb_typeof(end_state) is distinct from 'object' or octet_length(end_state::text)>8000 or octet_length(shot_data::text)>200 or (select count(*) from jsonb_object_keys(shot_data))<>(case when shot_data ? 'assist' then 3 else 2 end) or jsonb_typeof(shot_data->'angle') is distinct from 'number' or jsonb_typeof(shot_data->'power') is distinct from 'number' or abs((shot_data->>'angle')::numeric)>6.284 or (shot_data->>'power')::numeric not between .08 and 1 then raise exception 'Invalid shot';end if;
 if not(end_state ?& array['version','courseSet','players','turn','hole','obstacleTick','seed','balls','scores','shotNumber','finished','winner','lastHole']) or end_state->'version' is distinct from '1'::jsonb or end_state->'courseSet' is distinct from s->'courseSet' or end_state->'holeCount' is distinct from s->'holeCount' or end_state->'courseOrder' is distinct from s->'courseOrder' or end_state->'players' is distinct from s->'players' or end_state->>'turn' not in(g.player1::text,g.player2::text) or jsonb_typeof(end_state->'finished') is distinct from 'boolean' or jsonb_typeof(end_state->'balls') is distinct from 'array' or jsonb_array_length(end_state->'balls')<>2 or jsonb_typeof(end_state->'scores') is distinct from 'array' or jsonb_array_length(end_state->'scores')<>2 then raise exception 'Invalid game state';end if;
 foreach b in array array[end_state->'hole',end_state->'obstacleTick',end_state->'seed',end_state->'shotNumber'] loop if jsonb_typeof(b) is distinct from 'number' or b::text::numeric<>trunc(b::text::numeric) then raise exception 'Invalid game clock';end if;end loop;
 h:=(s->>'hole')::integer;nh:=(end_state->>'hole')::integer;i:=case when s->'players'->>0=auth.uid()::text then 0 else 1 end;j:=1-i;
 if nh not between h and least(h+1,g.hole_count-1) or (end_state->>'shotNumber')::integer<>g.revision+1 or (end_state->>'obstacleTick')::bigint not between (s->>'obstacleTick')::bigint+1 and (s->>'obstacleTick')::bigint+1200 or (end_state->>'seed')::numeric not between 0 and 4294967295 then raise exception 'Invalid progression';end if;
 for p in 0..1 loop
 if jsonb_typeof(end_state->'scores'->p) is distinct from 'array' or jsonb_array_length(end_state->'scores'->p)<>9 then raise exception 'Invalid scores';end if;
 for k in 0..8 loop
 if jsonb_typeof(end_state->'scores'->p->k) is distinct from 'number' or (end_state->'scores'->p->>k)::numeric<>((s->'scores'->p->>k)::numeric+case when p=i and k=h then 1 else 0 end) or (end_state->'scores'->p->>k)::numeric not between 0 and 10 then raise exception 'Invalid score';end if;
 end loop;
 b:=end_state->'balls'->p;
 if jsonb_typeof(b->'x') is distinct from 'number' or jsonb_typeof(b->'y') is distinct from 'number' or jsonb_typeof(b->'sunk') is distinct from 'boolean' or (b->>'x')::numeric not between 0 and 460 or (b->>'y')::numeric not between 0 and 850 then raise exception 'Invalid ball';end if;
 end loop;
 if nh=h then
 if end_state->'balls'->j is distinct from s->'balls'->j then raise exception 'Opponent ball changed';end if;
 if (end_state->'scores'->i->>h)::integer=10 and end_state->'balls'->i->>'sunk'<>'true' then raise exception 'Stroke limit reached';end if;
 if end_state->>'finished'='true' then
  if h<>g.hole_count-1 or end_state->'balls'->0->>'sunk'<>'true' or end_state->'balls'->1->>'sunk'<>'true' or end_state->'lastHole' is distinct from to_jsonb(h) then raise exception 'Game not finished';end if;
  for k in 0..8 loop total0:=total0+(end_state->'scores'->0->>k)::integer;total1:=total1+(end_state->'scores'->1->>k)::integer;end loop;
  expected_winner:=case when total0=total1 then null when total0<total1 then s->'players'->>0 else s->'players'->>1 end;
  if end_state->>'winner' is distinct from expected_winner or end_state->>'turn' is distinct from auth.uid()::text then raise exception 'Invalid result';end if;
 else
  if end_state->'balls'->0->>'sunk'='true' and end_state->'balls'->1->>'sunk'='true' then raise exception 'Advance to the next hole';end if;
  expected_turn:=s->'players'->>(case when end_state->'balls'->i->>'sunk'='true' then j else i end);
  if end_state->>'turn' is distinct from expected_turn or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from 'null'::jsonb then raise exception 'Invalid turn';end if;
 end if;
 else
  if s->'balls'->j->>'sunk'<>'true' or end_state->>'finished'<>'false' or end_state->'winner' is distinct from 'null'::jsonb or end_state->'lastHole' is distinct from to_jsonb(h) or end_state->>'turn' is distinct from s->'players'->>(nh%2) then raise exception 'Hole not finished';end if;
  if s->>'courseSet'='3' then starts:=jsonb_set(starts,array[nh::text],starts->(s->'courseOrder'->>nh)::integer);end if;
  for p in 0..1 loop b:=end_state->'balls'->p;if b->>'sunk'<>'false' or (b->>'x')::numeric<>((starts->nh->>0)::numeric+case when p=0 then -9 else 9 end) or (b->>'y')::numeric<>(starts->nh->>1)::numeric then raise exception 'Invalid next tee';end if;end loop;
 end if;
 update public.golf_games set state=end_state,shot=shot_data,revision=revision+1,updated_at=now() where id=g.id returning * into g;return g;
end $$;
revoke all on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.create_golf_game(uuid,integer),public.accept_golf_game(uuid),public.submit_golf_shot(uuid,integer,jsonb,jsonb) to authenticated;
create or replace function public.can_access_golf_live(topic text,sending boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare game_uuid uuid; actor uuid; g public.golf_games;
begin
 if topic !~ '^sahur-golf:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 game_uuid:=split_part(topic,':',2)::uuid;actor:=split_part(topic,':',3)::uuid;
 select * into g from public.golf_games where id=game_uuid;
 return coalesce(auth.uid() is not null and private.is_member(g.room_id) and g.player2 is not null
 and actor in(g.player1,g.player2) and (not sending or auth.uid()=actor)
 and not private.people_blocked(g.player1,g.player2),false);
end $$;
revoke all on function public.can_access_golf_live(text,boolean) from public,anon;
grant execute on function public.can_access_golf_live(text,boolean) to authenticated;
drop policy if exists tungchat_golf_live_read on realtime.messages;
drop policy if exists tungchat_golf_live_send on realtime.messages;
create policy tungchat_golf_live_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),false));
create policy tungchat_golf_live_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_access_golf_live((select realtime.topic()),true));


commit;
