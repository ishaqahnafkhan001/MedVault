import { describe, expect, it } from "vitest";
import { createPrivateQueryClient } from "./query-client";

describe("private query cache", () => {
  it("does not share cached medical data between authenticated layouts", () => {
    const userA = createPrivateQueryClient();
    const userB = createPrivateQueryClient();
    userA.setQueryData(["profile"], { profile: { fullName: "Patient A" } });

    expect(userB.getQueryData(["profile"])).toBeUndefined();
  });
});
