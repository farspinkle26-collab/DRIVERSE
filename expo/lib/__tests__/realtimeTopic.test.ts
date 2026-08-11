/**
 * Topic naming for Supabase Realtime channels.
 *
 * The property that matters: two mounted instances of the same component must
 * never produce the same topic, because `supabase.channel()` hands back the
 * existing channel for a topic it already knows and the second `.on()` then
 * lands on an already-joined channel.
 */
import { instanceTopic, sanitizeTopicPart } from "@/lib/realtimeTopic";

describe("sanitizeTopicPart", () => {
  it("passes through the characters a topic may contain", () => {
    expect(sanitizeTopicPart("friends-2_ABC")).toBe("friends-2_ABC");
    expect(sanitizeTopicPart("a75bca12-66b1-4c16-b1ef-d10b09435ecb")).toBe(
      "a75bca12-66b1-4c16-b1ef-d10b09435ecb"
    );
  });

  it("strips React's useId punctuation, in both its shapes", () => {
    expect(sanitizeTopicPart(":r1:")).toBe("r1");   // React 18
    expect(sanitizeTopicPart("«r1»")).toBe("r1");   // React 19
  });

  it("is empty for nothing usable, rather than returning punctuation", () => {
    expect(sanitizeTopicPart("::")).toBe("");
    expect(sanitizeTopicPart("")).toBe("");
    expect(sanitizeTopicPart(null)).toBe("");
    expect(sanitizeTopicPart(undefined)).toBe("");
  });
});

describe("instanceTopic", () => {
  it("joins the base and its parts with underscores", () => {
    expect(instanceTopic("friends", "uid-1", "«r7»")).toBe("friends_uid-1_r7");
  });

  it("gives two instances different topics — the whole point", () => {
    const a = instanceTopic("friends", "uid-1", "«r1»");
    const b = instanceTopic("friends", "uid-1", "«r2»");
    expect(a).not.toBe(b);
  });

  it("still separates instances whose *other* parts differ", () => {
    expect(instanceTopic("dm", "me", "them", "«r1»")).toBe("dm_me_them_r1");
    expect(instanceTopic("dm", "me", "other", "«r1»")).toBe("dm_me_other_r1");
  });

  it("drops parts that sanitise to nothing instead of leaving '__' runs", () => {
    expect(instanceTopic("friends", "", "r1")).toBe("friends_r1");
    expect(instanceTopic("friends", null, undefined)).toBe("friends");
    expect(instanceTopic("friends", "::", "r1")).toBe("friends_r1");
  });

  it("never emits a character that is unsafe in a topic", () => {
    const topic = instanceTopic("dm", "user:1", "«r12»", "a/b");
    expect(topic).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
