import { describe, expect, it } from "vitest";
import { reserveWeatherRequest } from "./weatherRequestLimiter";

describe("weather request budget", () => {
  it("caps geocoding requests per UTC day", () => {
    const start = Date.UTC(2026, 0, 1, 12);

    expect(reserveWeatherRequest("geocode", start)).toEqual({ allowed: true });
    expect(reserveWeatherRequest("geocode", start + 3_001)).toEqual({ allowed: true });
    expect(reserveWeatherRequest("geocode", start + 6_002)).toEqual({ allowed: true });
    expect(reserveWeatherRequest("geocode", start + 9_003)).toEqual({
      allowed: false,
      reason: "daily-limit",
    });
  });

  it("applies a cooldown to repeated requests of the same type", () => {
    const now = Date.UTC(2026, 0, 1, 12);

    expect(reserveWeatherRequest("forecast", now)).toEqual({ allowed: true });
    expect(reserveWeatherRequest("forecast", now + 1_000)).toEqual({
      allowed: false,
      reason: "cooldown",
      retryAfterMs: 2_000,
    });
  });

  it("resets the request budget at UTC midnight", () => {
    const beforeMidnight = Date.UTC(2026, 0, 1, 23, 59, 58);

    expect(reserveWeatherRequest("geocode", beforeMidnight)).toEqual({ allowed: true });
    expect(reserveWeatherRequest("geocode", Date.UTC(2026, 0, 2, 0, 0, 1))).toEqual({ allowed: true });
  });
});
