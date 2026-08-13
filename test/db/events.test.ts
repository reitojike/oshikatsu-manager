import { expect, test } from "vitest";
import { createEvent, createTestUser } from "./helpers";

test("未削除のイベントは無関係のユーザーも閲覧できる", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await stranger.client.from("events").select().eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});

test("無関係のユーザーは他人のイベントを編集できない", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await stranger.client
    .from("events")
    .update({ title: "hijacked" })
    .eq("id", event.id)
    .select();
  expect(error).toBeNull();
  expect(data).toHaveLength(0);

  const { data: unchanged } = await owner.client
    .from("events")
    .select("title")
    .eq("id", event.id)
    .single();
  expect(unchanged?.title).toBe("test event");
});

test("オーナー以外がイベントを削除しようとして失敗する", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);

  const { data, error } = await stranger.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id)
    .select();
  expect(error).toBeNull();
  expect(data).toHaveLength(0);

  const { data: unchanged } = await owner.client
    .from("events")
    .select("deleted_at")
    .eq("id", event.id)
    .single();
  expect(unchanged?.deleted_at).toBeNull();
});

test("参加登録済みの他ユーザーもイベントを編集・削除できない", async () => {
  const [owner, participant] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const setupResult = await participant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: participant.userId,
    status: "considering",
  });
  expect(setupResult.error).toBeNull();

  const { data: updated, error: updateError } = await participant.client
    .from("events")
    .update({ title: "hijacked" })
    .eq("id", event.id)
    .select();
  expect(updateError).toBeNull();
  expect(updated).toHaveLength(0);

  const { data: unchanged } = await owner.client
    .from("events")
    .select("title")
    .eq("id", event.id)
    .single();
  expect(unchanged?.title).toBe("test event");

  const { data: deleted, error: deleteError } = await participant.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id)
    .select();
  expect(deleteError).toBeNull();
  expect(deleted).toHaveLength(0);

  const { data: stillNotDeleted } = await owner.client
    .from("events")
    .select("deleted_at")
    .eq("id", event.id)
    .single();
  expect(stillNotDeleted?.deleted_at).toBeNull();
});

test("他人になりすましてイベントを登録できない", async () => {
  const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  const { error } = await userA.client.from("events").insert({
    owner_id: userB.userId,
    genre: "idol",
    title: "spoofed",
    starts_at: new Date().toISOString(),
  });
  expect(error).not.toBeNull();
});

test("参加者(公開)がいるイベントはオーナーでも削除できない", async () => {
  const [owner, participant] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const setupResult = await participant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: participant.userId,
    status: "considering",
    visibility: "public",
  });
  expect(setupResult.error).toBeNull();

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).not.toBeNull();
});

test("参加者(非公開)がいるイベントはオーナーでも削除できない", async () => {
  const [owner, participant] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  // visibilityを指定しないとdefaultのprivateになる
  const setupResult = await participant.client.from("event_participants").insert({
    event_id: event.id,
    user_id: participant.userId,
    status: "considering",
  });
  expect(setupResult.error).toBeNull();

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).not.toBeNull();
});

test("参加者がオーナー以外にいなければ削除できる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(error).toBeNull();
});

test("オーナー本人でも削除済みイベントを復活できない", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  const deleteResult = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(deleteResult.error).toBeNull();

  const { error } = await owner.client
    .from("events")
    .update({ deleted_at: null })
    .eq("id", event.id);
  expect(error).not.toBeNull();

  const { data: stillDeleted, error: selectError } = await owner.client
    .from("events")
    .select("deleted_at")
    .eq("id", event.id)
    .single();
  expect(selectError).toBeNull();
  expect(stillDeleted?.deleted_at).not.toBeNull();
});

test("削除後もオーナー自身は引き続き閲覧できる", async () => {
  const owner = await createTestUser();
  const event = await createEvent(owner);
  const deleteResult = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(deleteResult.error).toBeNull();

  const { data, error } = await owner.client.from("events").select().eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});

test("削除後は無関係のユーザーから見えなくなる", async () => {
  const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);

  const { data, error } = await stranger.client.from("events").select().eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("削除後も自分の支出が紐づくユーザーは引き続き閲覧できる", async () => {
  const [owner, spender] = await Promise.all([createTestUser(), createTestUser()]);
  const event = await createEvent(owner);
  const expenseResult = await spender.client.from("expenses").insert({
    user_id: spender.userId,
    event_id: event.id,
    category: "ticket",
  });
  expect(expenseResult.error).toBeNull();
  const deleteResult = await owner.client
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", event.id);
  expect(deleteResult.error).toBeNull();

  const { data, error } = await spender.client.from("events").select().eq("id", event.id);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});
