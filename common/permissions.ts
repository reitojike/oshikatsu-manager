// docs/permissions.md の権限マトリクスを、アプリ層(Web UIとMCPの両方)から使う判定として
// 実装したもの。RLS(supabase/migrations/)と同じマトリクスを二重に持ち、両方をテストする
// (docs/permissions.md「前提」)。
//
// マトリクス全体のpure関数化はフェーズ2の作業(docs/roadmap.md フェーズ2)。
// ここには issue #34 で確定した「招待できる条件」と、issue #54 で確定した
// 「削除済みイベントには参加登録も招待もできない」だけを置き、残りはフェーズ2で追加する。
// 追加するときは、必ずRLS側と test/db/ にも同じ行を足すこと。

/** 参加登録・招待の両方に共通してかかる、イベント側の前提条件。 */
export type EventParticipationContext = {
  /** 対象イベントが論理削除済み(`events.deleted_at is not null`)か */
  eventIsDeleted: boolean;
};

export type InviteContext = EventParticipationContext & {
  /** 実行者がそのイベントに参加登録しているか */
  actorIsParticipant: boolean;
};

/**
 * 自分でそのイベントに参加登録できるか。
 *
 * 削除済みのイベントには参加登録できない(issue #54)。削除済みイベントはオーナー本人と、
 * そのイベントに `expenses` を持つユーザーには引き続き見えるため(`docs/data-model.md`
 * 「RLSポリシー方針」※1)、この経路は実在する。オーナーであっても例外はない。
 *
 * 判定するのは**新規の参加登録だけ**である。既存の参加行のステータス変更・公開設定の変更・
 * 参加の取りやめは削除後も可能(`docs/permissions.md` ※1)。
 *
 * RLS側の対応: `event_participants_insert_self_or_invite` の自己登録経路。
 */
export const canJoinEvent = ({ eventIsDeleted }: EventParticipationContext): boolean =>
  !eventIsDeleted;

/**
 * 他ユーザーをイベントに招待できるか。
 *
 * 招待できるのは、そのイベントに参加登録しているユーザーのみ。オーナー(`events.owner_id`)
 * であっても、自分自身が参加登録していなければ招待できない(issue #34)。`owner_id` は
 * 「情報の管理者」であって、イベントの主催や招待の権限を意味しない
 * (docs/data-model.md 2章 / docs/permissions.md「招待できる条件」)。
 *
 * さらに、削除済みのイベントには招待できない(issue #54)。参加登録と同じ前提条件なので
 * `canJoinEvent` を経由して判定し、条件を二重に書かない。
 *
 * RLS側の対応: `event_participants_insert_self_or_invite` の招待経路。
 */
export const canInviteToEvent = ({ actorIsParticipant, eventIsDeleted }: InviteContext): boolean =>
  canJoinEvent({ eventIsDeleted }) && actorIsParticipant;
