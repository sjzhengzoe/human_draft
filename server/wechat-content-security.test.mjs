import assert from "node:assert/strict";
import test from "node:test";
import { createWechatContentSecurity } from "./lib/wechat-content-security.mjs";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("text safety check scans every chunk with the authenticated openid", async () => {
  const calls = [];
  const security = createWechatContentSecurity({
    appId: "test-app-id",
    appSecret: "test-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/cgi-bin/token")) {
        return jsonResponse({ access_token: "test-access-token", expires_in: 7200 });
      }
      return jsonResponse({
        errcode: 0,
        errmsg: "ok",
        result: { suggest: "pass", label: 100 },
      });
    },
  });

  await security.checkText("test-openid", "安".repeat(4_500));

  const checkCalls = calls.filter((call) => call.url.includes("/wxa/msg_sec_check"));
  assert.equal(calls.filter((call) => call.url.includes("/cgi-bin/token")).length, 1);
  assert.equal(checkCalls.length, 3);
  checkCalls.forEach((call) => {
    const body = JSON.parse(call.options.body);
    assert.equal(body.openid, "test-openid");
    assert.equal(body.version, 2);
    assert.equal(body.scene, 4);
    assert.ok(Array.from(body.content).length <= 2_000);
  });
});

test("risky text exposes only the generic violation message", async () => {
  const security = createWechatContentSecurity({
    appId: "test-app-id",
    appSecret: "test-secret",
    fetchImpl: async (url) =>
      String(url).includes("/cgi-bin/token")
        ? jsonResponse({ access_token: "test-access-token", expires_in: 7200 })
        : jsonResponse({
            errcode: 0,
            errmsg: "ok",
            result: { suggest: "risky", label: 20001 },
            detail: [{ strategy: "politics", keyword: "不应展示" }],
          }),
  });

  await assert.rejects(
    security.checkText("test-openid", "测试内容"),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "CONTENT_UNSAFE");
      assert.equal(error.message, "内容含违规信息，请修改后重试。");
      assert.equal(JSON.stringify(error).includes("politics"), false);
      return true;
    },
  );
});

test("image safety check blocks unsafe uploads before storage", async () => {
  const calls = [];
  const security = createWechatContentSecurity({
    appId: "test-app-id",
    appSecret: "test-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return String(url).includes("/cgi-bin/token")
        ? jsonResponse({ access_token: "test-access-token", expires_in: 7200 })
        : jsonResponse({ errcode: 87014, errmsg: "risky content" });
    },
  });

  await assert.rejects(
    security.checkImage({
      buffer: Buffer.from("test-image"),
      mimetype: "image/png",
      filename: "test.png",
    }),
    (error) => error.code === "CONTENT_UNSAFE",
  );

  const imageCall = calls.find((call) => call.url.includes("/wxa/img_sec_check"));
  assert.ok(imageCall);
  assert.equal(imageCall.options.method, "POST");
  assert.ok(imageCall.options.body instanceof FormData);
});
