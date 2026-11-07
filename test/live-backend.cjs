const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs");
const { randomUUID } = require("crypto");
exports.create = async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create schema realtime;create table realtime.messages(topic text,extension text,payload jsonb);alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$select current_setting('request.jwt.claim.topic',true)$$;
  grant usage on schema auth,realtime to authenticated,anon;grant execute on function auth.uid(),realtime.topic() to authenticated,anon;grant select,insert on realtime.messages to authenticated;create publication supabase_realtime;`);
  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  const sql = (file) =>
    fs.readFileSync(require.resolve("../supabase/" + file), "utf8");
  for (const file of [
    "setup.sql",
    "upgrade-1.1.sql",
    "upgrade-to-1.2.sql",
    "upgrade-1.3.sql",
    "upgrade-1.3.1.sql",
    "upgrade-1.4.0.sql",
    "upgrade-1.6.13.sql",
  ])
    await db.exec(sql(file));
  const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
  const devices = ids.map(() => randomUUID());
  for (const [i, name] of ["alice", "bobby", "carol", "outsider"].entries())
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [ids[i], name + "@users.example.com", JSON.stringify({ username: name })],
    );
  await db.query("insert into private.app_owner(user_id) values($1)", [ids[0]]);
  async function user(i) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      ids[i],
    ]);
    await db.exec("set role authenticated");
  }
  await user(0);
  const room = (
    await db.query("select create_group('Call test',array['bobby','carol']) id")
  ).rows[0].id;
  async function rpc(i, name, args) {
    await user(i);
    const keys = Object.keys(args);
    if (
      ![
        "poll_live_calls",
        "live_call_action",
        "authorize_live_call_relay",
      ].includes(name) ||
      keys.some((k) => !/^\w+$/.test(k))
    )
      throw Error("Invalid fixture RPC");
    return (
      await db.query(
        "select public." +
          name +
          "(" +
          keys.map((k, j) => k + "=> $" + (j + 1)).join(",") +
          ") result",
        Object.values(args),
      )
    ).rows[0].result;
  }
  return { db, ids, devices, room, user, rpc };
};
