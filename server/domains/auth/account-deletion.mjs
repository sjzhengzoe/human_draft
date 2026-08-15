import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { assertCondition } from "../../lib/errors.mjs";
import { deleteCosObjects, listCosObjects } from "../../lib/cos-storage.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { verifyWechatIdentity } from "./service.mjs";

const ACCOUNT_BUCKETS = [
  config.dishBucket,
  config.activityBucket,
  config.mediaCoverBucket,
  config.wardrobeBucket,
  config.keyMomentBucket,
  config.avatarBucket,
];

async function ledgerObjectKeys(supabase, uid) {
  const keys = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("image_assets")
      .select("object_key")
      .eq("uid", uid)
      .range(from, from + 999);
    throwSupabaseError(error, "读取账号图片清单失败。");
    const rows = data || [];
    keys.push(...rows.map((row) => row.object_key).filter(Boolean));
    if (rows.length < 1000) break;
  }
  return keys;
}

async function accountObjectKeys(supabase, uid, listObjects) {
  const ledgerKeys = await ledgerObjectKeys(supabase, uid);
  const prefixLists = await Promise.all(
    ACCOUNT_BUCKETS.map((bucket) => listObjects(`${bucket}/users/${uid}/`)),
  );
  return [...new Set([
    ...ledgerKeys,
    ...prefixLists.flat().map((item) => item.Key || item.key).filter(Boolean),
  ])];
}

function cleanupErrorCode(failedKeys) {
  return failedKeys.length ? "COS_DELETE_INCOMPLETE" : null;
}

export function createAccountDeletionService(options) {
  const getSupabaseAdmin = options.getSupabaseAdmin;
  const verifyIdentity = options.verifyIdentity ?? verifyWechatIdentity;
  const listObjects = options.listObjects ?? listCosObjects;
  const deleteObjects = options.deleteObjects ?? deleteCosObjects;
  const logger = options.logger ?? console;

  const processJob = async (job) => {
    const supabase = getSupabaseAdmin();
    const keys = Array.isArray(job.object_keys) ? job.object_keys : [];
    let failedKeys = keys;
    try {
      ({ failedKeys = [] } = await deleteObjects(keys));
    } catch (_error) {
      failedKeys = keys;
    }
    if (!failedKeys.length) {
      const { error } = await supabase.from("account_deletion_jobs").delete().eq("id", job.id);
      throwSupabaseError(error, "完成账号图片清理失败。");
      return false;
    }
    const { error } = await supabase
      .from("account_deletion_jobs")
      .update({
        object_keys: failedKeys,
        status: "retrying",
        attempt_count: Number(job.attempt_count || 0) + 1,
        last_error_code: cleanupErrorCode(failedKeys),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throwSupabaseError(error, "保存账号图片清理进度失败。");
    return true;
  };

  return {
    async deleteAccount({ uid, openId, code }) {
      await verifyIdentity(code, openId);
      const supabase = getSupabaseAdmin();
      const objectKeys = await accountObjectKeys(supabase, uid, listObjects);
      assertCondition(
        objectKeys.length <= 20_000,
        409,
        "ACCOUNT_IMAGE_INVENTORY_TOO_LARGE",
        "账号图片数量异常，请联系客服处理注销。",
      );
      const jobId = randomUUID();
      const { data, error } = await supabase.rpc("delete_app_account", {
        p_uid: uid,
        p_job_id: jobId,
        p_object_keys: objectKeys,
      });
      throwSupabaseError(error, "注销账号失败。", {
        P0002: { statusCode: 404, code: "ACCOUNT_NOT_FOUND", message: "账号不存在。" },
      });
      let cleanupPending = objectKeys.length > 0;
      try {
        cleanupPending = await processJob({
          id: jobId,
          object_keys: objectKeys,
          attempt_count: 0,
        });
      } catch (cleanupError) {
        logger.error?.({ error: cleanupError, jobId }, "account image cleanup failed");
      }
      return { deleted: Boolean(data?.[0]?.deleted ?? true), cleanup_pending: cleanupPending };
    },

    async processPendingJobs() {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("account_deletion_jobs")
        .select("id, object_keys, attempt_count")
        .order("updated_at", { ascending: true })
        .limit(20);
      throwSupabaseError(error, "读取账号图片清理任务失败。");
      for (const job of data || []) {
        try {
          await processJob(job);
        } catch (error) {
          logger.error?.({ error, jobId: job.id }, "account image cleanup retry failed");
        }
      }
    },
  };
}
