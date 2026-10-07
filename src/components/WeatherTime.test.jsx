import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WeatherTime from "./WeatherTime";

function jsonResponse(data) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe("WeatherTime", () => {
  it("loads weather, displays attribution, and reuses cached results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ name: "Tokyo", latitude: 35.6762, longitude: 139.6503 }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        current: { temperature_2m: 18.5, relative_humidity_2m: 62, weather_code: 0 }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(<WeatherTime />);
    expect(await screen.findByText("19°")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Weather data by Open-Meteo.com" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("geocoding-api.open-meteo.com");

    firstRender.unmount();
    render(<WeatherTime />);

    await waitFor(() => expect(screen.getByText("19°")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not call the geocoding API after the daily browser limit is reached", async () => {
    localStorage.setItem("kazedesk-weather-request-budget-v1", JSON.stringify({
      day: new Date().toISOString().slice(0, 10),
      counts: { geocode: 3 },
      lastRequests: {},
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherTime />);

    expect(await screen.findByText("Daily city lookup limit reached. Try again tomorrow")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
