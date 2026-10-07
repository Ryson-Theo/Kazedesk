const STORAGE_KEY = "kazedesk-weather-request-budget-v1";
const DAILY_LIMITS = { geocode: 3, forecast: 6 };
const REQUEST_COOLDOWN_MS = 3_000;

export function reserveWeatherRequest(type, now = Date.now()) {
  if (!Object.hasOwn(DAILY_LIMITS, type)) {
    return { allowed: false, reason: "invalid-request-type" };
  }

  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Unable to read weather request budget:", error);
    return { allowed: false, reason: "storage-unavailable" };
  }

  const today = new Date(now).toISOString().slice(0, 10);
  if (
    !state ||
    state.day !== today ||
    !state.counts ||
    typeof state.counts !== "object" ||
    Array.isArray(state.counts)
  ) {
    state = { day: today, counts: {}, lastRequests: {} };
  }

  const count = Number.isInteger(state.counts[type]) ? state.counts[type] : 0;
  if (count >= DAILY_LIMITS[type]) {
    return { allowed: false, reason: "daily-limit" };
  }

  const lastRequest = Number.isFinite(state.lastRequests?.[type]) ? state.lastRequests[type] : 0;
  const retryAfterMs = REQUEST_COOLDOWN_MS - (now - lastRequest);
  if (lastRequest > 0 && retryAfterMs > 0) {
    return { allowed: false, reason: "cooldown", retryAfterMs };
  }

  state.counts[type] = count + 1;
  state.lastRequests = { ...state.lastRequests, [type]: now };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save weather request budget:", error);
    return { allowed: false, reason: "storage-unavailable" };
  }

  return { allowed: true };
}
