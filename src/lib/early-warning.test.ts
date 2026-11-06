import { describe, expect, it } from "vitest";
import { levelChannels, levelFor, thresholdWord } from "./early-warning";

describe("early warning rules", () => {
  it("Watch uses the portal only", () => expect(levelChannels("watch")).toEqual(["portal"]));
  it("Warning uses portal and email", () => expect(levelChannels("warning")).toEqual(["portal", "email"]));
  it("Urgent uses portal, email and Telegram", () => expect(levelChannels("urgent")).toEqual(["portal", "email", "telegram"]));
  it("no alert fires when no threshold is set", () => expect(levelFor(999, {})).toBeNull());
  it("picks the highest level reached", () => expect(levelFor(7, { watch: 2, warning: 5, urgent: 9 })).toBe("warning"));
  it("shows unset thresholds as Threshold not set", () => expect(thresholdWord(null)).toBe("Threshold not set"));
});
