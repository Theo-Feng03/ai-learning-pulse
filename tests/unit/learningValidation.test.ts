import { describe, expect, it } from "vitest";
import { validateForConfirm } from "@/lib/learning/service";

const validEntry = {
  userTakeaway: "这是一条超过十个字符的学习结论内容",
  topics: [{ topicId: "t1" }],
  article: { source: { name: "Fixture Blog" }, originalUrl: "https://example.com/post" },
};

describe("validateForConfirm（有效学习记录规则）", () => {
  it("满足全部条件时无 issue", () => {
    expect(validateForConfirm(validEntry)).toEqual([]);
  });

  it("userTakeaway 少于 10 字符（含纯空白）不通过", () => {
    expect(validateForConfirm({ ...validEntry, userTakeaway: "太短" })).toContainEqual(
      expect.objectContaining({ field: "userTakeaway" }),
    );
    expect(
      validateForConfirm({ ...validEntry, userTakeaway: "   短   内容   " }),
    ).toContainEqual(expect.objectContaining({ field: "userTakeaway" }));
  });

  it("未选择主题不通过", () => {
    expect(validateForConfirm({ ...validEntry, topics: [] })).toContainEqual(
      expect.objectContaining({ field: "topics" }),
    );
  });

  it("缺少来源信息不通过", () => {
    expect(validateForConfirm({ ...validEntry, article: null })).toContainEqual(
      expect.objectContaining({ field: "article" }),
    );
  });
});
