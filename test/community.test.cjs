const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("crypto");
test("group membership, private signals, admin logs, school exclusion and shared emoji access", async () => {
  const { db, ids, devices, room, user, rpc } =
    await require("./live-backend.cjs").create();
  try {
    const id = randomUUID(),
      action = (i, action, extra = {}) =>
        rpc(i, "live_call_action", {
          device_id: devices[i],
          call_id: id,
          action,
          ...extra,
        });
    await action(0, "start", { target_room: room });
    await assert.rejects(action(3, "join"));
    await action(1, "join");
    await action(2, "join");
    assert.equal(
      (
        await rpc(1, "poll_live_calls", { device_id: devices[1] })
      ).members.filter((m) => m.status === "joined").length,
      3,
    );
    await action(0, "signal", {
      peer_id: ids[1],
      description: { type: "offer", sdp: "v=0 test offer description" },
    });
    assert.equal(
      (await rpc(2, "poll_live_calls", { device_id: devices[2] })).signals
        .length,
      0,
    );
    assert.equal(
      (await rpc(1, "poll_live_calls", { device_id: devices[1] })).signals
        .length,
      1,
    );
    await action(1, "leave");
    assert.equal(
      (
        await rpc(0, "poll_live_calls", { device_id: devices[0] })
      ).members.filter((m) => m.status === "joined").length,
      2,
    );
    await user(1);
    await assert.rejects(db.query("select * from moderation_logs()"));
    await assert.rejects(db.query("select * from moderation_overview()"));
    await user(0);
    await db.query("select set_app_admin('bobby',true)");
    await user(1);
    assert.ok(
      (await db.query("select * from moderation_logs()")).rows.some(
        (r) => r.action === "Started a call",
      ),
    );
    await db.query("select * from moderation_overview()");
    await assert.rejects(db.query("select set_app_admin('carol',true)"));
    const emoji = randomUUID();
    await user(0);
    await db.query(
      "insert into chat_media(id,kind,name) values($1,'emoji','party')",
      [emoji],
    );
    await user(1);
    await assert.rejects(db.query("select save_custom_emoji($1)", [emoji]));
    await user(0);
    await db.query("insert into messages(room_id,body) values($1,$2)", [
      room,
      "Hello [[emoji:" + emoji + "]]",
    ]);
    await user(1);
    await db.query("select save_custom_emoji($1)", [emoji]);
    assert.equal(
      (await db.query("select id from my_custom_emojis()")).rows[0].id,
      emoji,
    );
    await db.query("insert into messages(room_id,body) values($1,$2)", [
      room,
      "Saved [[emoji:" + emoji + "]]",
    ]);
    await user(3);
    await assert.rejects(db.query("select save_custom_emoji($1)", [emoji]));
    await db.exec("reset role");
    const fp = "a".repeat(64);
    await db.query(
      "insert into moderation_ip_events(user_id,ip_fingerprint) values($1,$2)",
      [ids[1], fp],
    );
    await db.query("select record_moderation_ip_event($1,'168.9.11.17',$2)", [
      ids[0],
      fp,
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*) n from moderation_ip_events where ip_fingerprint=$1",
          [fp],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("old relay deployment supports group calls, more than eight people can join and DMs close on hangup", async () => {
  const { db, ids, devices, room, rpc, user } =
    await require("./live-backend.cjs").create();
  try {
    const call = randomUUID();
    const join = (i, action, extra = {}) =>
      rpc(i, "live_call_action", {
        device_id: devices[i],
        call_id: call,
        action,
        ...extra,
      });
    await join(0, "start", { target_room: room });
    await join(1, "join");
    await join(2, "join");
    await user(0);
    assert.equal(
      (
        await db.query("select authorize_call_relay($1,$2) ok", [
          call,
          devices[0],
        ])
      ).rows[0].ok,
      true,
    );
    for (let i = 4; i < 10; i++) {
      await db.exec("reset role");
      ids[i] = randomUUID();
      devices[i] = randomUUID();
      const name = "person" + i;
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
        [
          ids[i],
          name + "@users.example.com",
          JSON.stringify({ username: name }),
        ],
      );
      await db.query(
        "insert into room_members(room_id,user_id) values($1,$2)",
        [room, ids[i]],
      );
      await join(i, "join");
    }
    assert.equal(
      (
        await rpc(0, "poll_live_calls", { device_id: devices[0] })
      ).members.filter((m) => m.status === "joined").length,
      9,
    );
    await join(0, "leave");
    await join(1, "leave");
    await user(0);
    const dm = (await db.query("select start_dm('bobby') id")).rows[0].id,
      dmCall = randomUUID();
    await rpc(0, "live_call_action", {
      device_id: devices[0],
      call_id: dmCall,
      action: "start",
      target_room: dm,
      wants_video: false,
    });
    await rpc(1, "live_call_action", {
      device_id: devices[1],
      call_id: dmCall,
      action: "join",
    });
    await rpc(1, "live_call_action", {
      device_id: devices[1],
      call_id: dmCall,
      action: "leave",
    });
    assert.equal(
      await rpc(0, "poll_live_calls", { device_id: devices[0] }),
      null,
    );
  } finally {
    await db.close();
  }
});
