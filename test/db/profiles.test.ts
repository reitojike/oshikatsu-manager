import { expect, test } from "vitest";
import { createTestUser } from "./helpers";

test("本人は自分のprofilesを読める", async () => {
  const user = await createTestUser();
  const { data, error } = await user.client.from("profiles").select().eq("id", user.userId);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});

test("他人のprofilesはテーブル直参照では読めない", async () => {
  const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  const { data, error } = await userA.client.from("profiles").select().eq("id", userB.userId);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
});

test("profiles_publicビュー経由なら他人のid/display_nameを読める", async () => {
  const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);
  const { data, error } = await userA.client
    .from("profiles_public")
    .select()
    .eq("id", userB.userId)
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBe(userB.userId);
});

test("profiles_publicはemail/is_adminを含まない", async () => {
  const user = await createTestUser();
  const { data, error } = await user.client
    .from("profiles_public")
    .select()
    .eq("id", user.userId)
    .single();
  expect(error).toBeNull();
  expect(data).not.toHaveProperty("email");
  expect(data).not.toHaveProperty("is_admin");
});

test("本人でもis_adminをtrueに書き換えられない", async () => {
  const user = await createTestUser();
  const { error } = await user.client
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", user.userId);
  expect(error).not.toBeNull();

  const { data } = await user.client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.userId)
    .single();
  expect(data?.is_admin).toBe(false);
});

test("本人でもprofilesを削除できない", async () => {
  const user = await createTestUser();
  // DELETEポリシーが1つも無いため、RLSは「対象行が見えない」扱いになり
  // エラーではなく0件影響という形で静かに弾かれる。
  const { data: deleted, error } = await user.client
    .from("profiles")
    .delete()
    .eq("id", user.userId)
    .select();
  expect(error).toBeNull();
  expect(deleted).toHaveLength(0);

  const { data: stillThere } = await user.client.from("profiles").select().eq("id", user.userId);
  expect(stillThere).toHaveLength(1);
});
