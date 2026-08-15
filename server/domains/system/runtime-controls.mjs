import { config } from "../../config.mjs";
import { assertCondition } from "../../lib/errors.mjs";

export const RUNTIME_CONTROL_KEYS = Object.freeze({
  registration: "registration_enabled",
  write: "write_enabled",
});

const DEFAULT_CONTROLS = Object.freeze({
  registration_enabled: Object.freeze({
    key: "registration_enabled",
    enabled: true,
    message: "当前暂时停止新用户注册，请稍后再试。",
    updated_by_uid: null,
    updated_at: "",
    forced_by_environment: false,
  }),
  write_enabled: Object.freeze({
    key: "write_enabled",
    enabled: true,
    message: "系统正在维护，当前暂时只能查看已有内容。",
    updated_by_uid: null,
    updated_at: "",
    forced_by_environment: false,
  }),
});

const cloneControl = (control) => ({ ...control });

function normalizeSnapshot(rows = []) {
  const controls = Object.fromEntries(
    Object.entries(DEFAULT_CONTROLS).map(([key, value]) => [key, cloneControl(value)]),
  );
  for (const row of rows) {
    if (!controls[row.key]) continue;
    controls[row.key] = {
      key: row.key,
      enabled: row.enabled === true,
      message: String(row.message || controls[row.key].message),
      updated_by_uid: row.updated_by_uid || null,
      updated_at: row.updated_at || "",
      forced_by_environment: false,
    };
  }

  if (config.registrationEnabledOverride !== undefined) {
    controls.registration_enabled.enabled = config.registrationEnabledOverride;
    controls.registration_enabled.forced_by_environment = true;
  }
  if (config.emergencyReadOnly) {
    controls.write_enabled.enabled = false;
    controls.write_enabled.forced_by_environment = true;
  }

  return controls;
}

export function createRuntimeControlService(getSupabaseAdmin, options = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? 5_000;
  let cached = null;
  let cachedAt = 0;
  let pending = null;

  async function loadSnapshot() {
    const { data, error } = await getSupabaseAdmin()
      .from("runtime_controls")
      .select("key, enabled, message, updated_by_uid, updated_at")
      .order("key", { ascending: true });
    if (error) throw error;
    return normalizeSnapshot(data || []);
  }

  async function getSnapshot({ force = false } = {}) {
    if (!force && cached && Date.now() - cachedAt < cacheTtlMs) return cached;
    if (!force && pending) return pending;
    pending = loadSnapshot()
      .then((snapshot) => {
        cached = snapshot;
        cachedAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  async function updateControl({ key, enabled, reason, uid }) {
    assertCondition(
      Object.values(RUNTIME_CONTROL_KEYS).includes(key),
      400,
      "RUNTIME_CONTROL_INVALID",
      "运营开关不存在。",
    );
    assertCondition(
      typeof enabled === "boolean",
      400,
      "RUNTIME_CONTROL_STATE_INVALID",
      "请选择要设置的开关状态。",
    );
    const normalizedReason = String(reason || "").trim();
    assertCondition(
      normalizedReason.length >= 2 && normalizedReason.length <= 200,
      400,
      "RUNTIME_CONTROL_REASON_INVALID",
      "请填写 2～200 个字的操作原因。",
    );
    const current = await getSnapshot({ force: true });
    assertCondition(
      !current[key]?.forced_by_environment,
      409,
      "RUNTIME_CONTROL_FORCED",
      "该开关当前由服务器紧急配置接管，请先取消环境配置。",
    );
    assertCondition(
      current[key]?.enabled !== enabled,
      409,
      "RUNTIME_CONTROL_UNCHANGED",
      "开关已经是目标状态。",
    );

    const { error } = await getSupabaseAdmin().rpc("update_runtime_control", {
      p_key: key,
      p_enabled: enabled,
      p_reason: normalizedReason,
      p_uid: uid,
    });
    if (error) throw error;
    cached = null;
    cachedAt = 0;
    return getSnapshot({ force: true });
  }

  async function getAdminState() {
    const [controls, auditResult] = await Promise.all([
      getSnapshot({ force: true }),
      getSupabaseAdmin()
        .from("runtime_control_audits")
        .select("id, control_key, previous_enabled, next_enabled, reason, operator_uid, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (auditResult.error) throw auditResult.error;
    return { controls, audits: auditResult.data || [] };
  }

  return { getAdminState, getSnapshot, updateControl };
}

export function createStaticRuntimeControlService(overrides = {}) {
  let snapshot = normalizeSnapshot([]);
  for (const [key, value] of Object.entries(overrides)) {
    if (snapshot[key]) snapshot[key] = { ...snapshot[key], ...value };
  }
  return {
    async getSnapshot() {
      return snapshot;
    },
    async getAdminState() {
      return { controls: snapshot, audits: [] };
    },
    async updateControl({ key, enabled, reason, uid }) {
      snapshot = {
        ...snapshot,
        [key]: {
          ...snapshot[key],
          enabled,
          updated_by_uid: uid,
          updated_at: new Date().toISOString(),
        },
      };
      return snapshot;
    },
  };
}
