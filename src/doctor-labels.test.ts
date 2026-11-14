import { describe, expect, it } from "vitest";
import { doctorCheckLabel } from "./doctor-labels.js";

describe("doctorCheckLabel", () => {
  it("maps technical ids to plain labels", () => {
    expect(doctorCheckLabel("lunch-money-api-key")).toBe("Lunch Money API key");
    expect(doctorCheckLabel("config-json")).toBe("Saved broker settings");
  });
});