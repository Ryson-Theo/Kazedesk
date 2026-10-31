import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WeatherTime from "./WeatherTime";
import {
  getNightArcGeometry,
  getNightArcPosition,
  clampSkyPosition,
  getSkyPosition,
  getWeatherPosition
} from "../utils/weatherAnimation";

function jsonResponse(data) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe("WeatherTime", () => {
  it("moves the sun and moon from east to west along the sky arc", () => {
    const sunrise = getSkyPosition(new Date("2024-01-01T06:00:00Z"), "UTC");
    const noon = getSkyPosition(new Date("2024-01-01T12:00:00Z"), "UTC");
    const dayEnd = getSkyPosition(new Date("2024-01-01T17:59:00Z"), "UTC");
    const sunset = getSkyPosition(new Date("2024-01-01T18:00:00Z"), "UTC");
    const moonrise = getSkyPosition(new Date("2024-01-01T18:00:00Z"), "UTC");
    const midnight = getSkyPosition(new Date("2024-01-02T00:00:00Z"), "UTC");
    const moonset = getSkyPosition(new Date("2024-01-02T05:59:00Z"), "UTC");

    expect(sunrise).toMatchObject({ phase: "sunrise", x: 2, y: 44 });
    expect(noon).toMatchObject({ phase: "day", x: 50, y: 12 });
    expect(dayEnd.x).toBeCloseTo(98, 0);
    expect(dayEnd.y).toBeCloseTo(44, 0);
    expect(sunrise.x).toBeLessThan(noon.x);
    expect(sunset).toMatchObject({ phase: "night", progress: 0 });
    expect(moonrise).toMatchObject({ phase: "night", progress: 0 });
    expect(midnight.progress).toBe(0.5);
    expect(moonset.phase).toBe("night");
    expect(moonset.progress).toBeCloseTo(1);
    expect(moonrise.progress).toBeLessThan(midnight.progress);
    expect(midnight.progress).toBeLessThan(moonset.progress);
  });

  it("calculates fractional local time so sky positions can move smoothly", () => {
    const start = getSkyPosition(new Date("2024-01-01T06:00:00Z"), "UTC");
    const later = getSkyPosition(new Date("2024-01-01T06:00:15Z"), "UTC");
    const weatherStart = getWeatherPosition(new Date("2024-01-01T06:00:00Z"), "UTC");
    const weatherLater = getWeatherPosition(new Date("2024-01-01T06:00:15Z"), "UTC");

    expect(later.x).toBeGreaterThan(start.x);
    expect(weatherLater.x).toBeGreaterThan(weatherStart.x);
  });

  it("uses the location's sunrise and sunset times for the sky phase", () => {
    const solarTimes = {
      sunrise: "2024-01-01T07:15",
      sunset: "2024-01-01T16:45",
      nextSunrise: "2024-01-02T07:16"
    };
    const sunrise = getSkyPosition(new Date("2024-01-01T07:15:00Z"), "UTC", solarTimes);
    const day = getSkyPosition(new Date("2024-01-01T12:00:00Z"), "UTC", solarTimes);
    const sunset = getSkyPosition(new Date("2024-01-01T16:30:00Z"), "UTC", solarTimes);
    const night = getSkyPosition(new Date("2024-01-01T22:00:00Z"), "UTC", solarTimes);

    expect(sunrise.phase).toBe("sunrise");
    expect(sunrise.progress).toBe(0);
    expect(day.phase).toBe("day");
    expect(sunset.phase).toBe("sunset");
    expect(sunset.progress).toBeCloseTo(555 / 570);
    expect(night.phase).toBe("night");
    expect(night.progress).toBeGreaterThan(0);
  });

  it("keeps sky markers inside the resized scene bounds", () => {
    expect(clampSkyPosition({ x: 2, y: 98 }, 200, 100, 40, 20)).toEqual({ x: 20, y: 90 });
    expect(clampSkyPosition({ x: 50, y: 50 }, 200, 100, 40, 20)).toEqual({ x: 100, y: 50 });
    expect(clampSkyPosition({ x: 50, y: 98 }, 200, 100, 40, 20, 70)).toEqual({ x: 100, y: 60 });
    expect(clampSkyPosition({ x: 50, y: 98 }, 200, 100, 40, 20, 10)).toEqual({ x: 100, y: 10 });
  });

  it("draws a true semicircle between the condition and temperature labels", () => {
    const arc = getNightArcGeometry(
      { left: 100, top: 200, width: 440, height: 160 },
      { left: 380 },
      { right: 540, top: 272 }
    );
    const start = getNightArcPosition(0, arc);
    const midpoint = getNightArcPosition(0.5, arc);
    const end = getNightArcPosition(1, arc);

    expect(arc.path).toBe("M 63.636 42.5 A 18.182 50 0 0 1 100 42.5");
    expect(start.x).toBeCloseTo(arc.startX);
    expect(end.x).toBeCloseTo(arc.endX);
    expect(start.y).toBeCloseTo(arc.baselineY);
    expect(end.y).toBeCloseTo(arc.baselineY);
    expect(midpoint.x).toBe((arc.startX + arc.endX) / 2);
    expect(midpoint.y).toBeCloseTo(arc.baselineY - arc.radiusY);
    expect(getNightArcPosition(0.25, arc).x).toBeCloseTo(
      (arc.startX + arc.endX) / 2 - arc.radiusX * Math.cos(Math.PI / 4)
    );
    expect(getNightArcPosition(0.25, arc).y).toBeCloseTo(
      arc.baselineY - arc.radiusY * Math.sin(Math.PI / 4)
    );
  });

  it("moves the current weather from east to west over the local day", () => {
    const morning = getWeatherPosition(new Date("2024-01-01T06:00:00Z"), "UTC");
    const noon = getWeatherPosition(new Date("2024-01-01T12:00:00Z"), "UTC");
    const evening = getWeatherPosition(new Date("2024-01-01T18:00:00Z"), "UTC");

    expect(morning.progress).toBeCloseTo(0.25);
    expect(noon.progress).toBeCloseTo(0.5);
    expect(evening.progress).toBeCloseTo(0.75);
    expect(morning).toMatchObject({ x: 34, y: 44.25 });
    expect(noon).toMatchObject({ x: 50, y: 48 });
    expect(morning.x).toBeLessThan(noon.x);
    expect(noon.x).toBeLessThan(evening.x);
    expect(morning.y + evening.y).toBeCloseTo(96);
    expect(noon.y).toBeCloseTo(48);
  });

  it("omits the animated sky when disabled", () => {
    const { queryByTestId, unmount } = render(<WeatherTime animationEnabled={false} />);

    expect(queryByTestId("weather-sky-scene")).not.toBeInTheDocument();
    expect(queryByTestId("weather-static-condition")).toBeInTheDocument();
    unmount();
  });

  it("shows temperature without a weather icon for clear conditions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ name: "Tokyo", latitude: 35.6762, longitude: 139.6503 }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        current: {
          temperature_2m: 18,
          apparent_temperature: 17,
          relative_humidity_2m: 62,
          weather_code: 0
        },
        daily: {
          sunrise: ["2024-01-01T06:00", "2024-01-02T06:01"],
          sunset: ["2024-01-01T18:00", "2024-01-02T18:00"]
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherTime />);

    expect(await screen.findByText("18°")).toBeInTheDocument();
    expect(document.querySelector(".apple-sky-weather-icon")).not.toBeInTheDocument();
  });

  it("does not show a sun icon for mainly clear weather", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ name: "Tokyo", latitude: 35.6762, longitude: 139.6503 }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        current: {
          temperature_2m: 18,
          apparent_temperature: 17,
          relative_humidity_2m: 62,
          weather_code: 1
        },
        daily: {
          sunrise: ["2024-01-01T06:00", "2024-01-02T06:01"],
          sunset: ["2024-01-01T18:00", "2024-01-02T18:00"]
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherTime />);

    expect(await screen.findByText("18°")).toBeInTheDocument();
    expect(document.querySelector(".apple-sky-weather-icon")).not.toBeInTheDocument();
  });

  it("loads weather, displays attribution, and reuses cached results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        results: [{ name: "Tokyo", latitude: 35.6762, longitude: 139.6503 }]
      }))
      .mockResolvedValueOnce(jsonResponse({
        current: {
          temperature_2m: 18.5,
          apparent_temperature: 17.4,
          relative_humidity_2m: 62,
          weather_code: 0
        },
        daily: {
          sunrise: ["2024-01-01T06:00", "2024-01-02T06:01"],
          sunset: ["2024-01-01T18:00", "2024-01-02T18:00"]
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(<WeatherTime />);
    expect(await screen.findByText("19°")).toBeInTheDocument();
    expect(await screen.findByTestId("weather-feels-like")).toHaveTextContent("Feels like 17°");
    expect(screen.getByRole("link", { name: "Weather data by Open-Meteo.com" })).toHaveAttribute(
      "href",
      "https://open-meteo.com/"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("geocoding-api.open-meteo.com");
    expect(fetchMock.mock.calls[1][0]).toContain("apparent_temperature");
    expect(fetchMock.mock.calls[1][0]).toContain("daily=sunrise,sunset");

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
