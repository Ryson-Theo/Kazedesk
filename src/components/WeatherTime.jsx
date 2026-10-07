import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  MapPin,
  Droplets
} from "lucide-react";
import { reserveWeatherRequest } from "../utils/weatherRequestLimiter";

import "../styles/WeatherTime.css";

const DEFAULT_SETTINGS = {
  city: "Tokyo",
  timezone: "Asia/Tokyo",
  hour12: true
};

const WEATHER_CACHE_PREFIX = "kazedesk-weather-cache-v1:";
const GEOCODE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const FORECAST_CACHE_TTL = 4 * 60 * 60 * 1000;

function readWeatherCache(key, ttl) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${WEATHER_CACHE_PREFIX}${key}`) || "null");
    if (
      cached &&
      Number.isFinite(cached.savedAt) &&
      Date.now() - cached.savedAt >= 0 &&
      Date.now() - cached.savedAt < ttl
    ) return cached.data;
  } catch (error) {
    console.warn("Unable to read cached weather data:", error);
  }
  return null;
}

function writeWeatherCache(key, data) {
  try {
    localStorage.setItem(`${WEATHER_CACHE_PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), data }));
  } catch (error) {
    console.warn("Unable to cache weather data:", error);
  }
}

export default function WeatherTime() {
  const [weather, setWeather] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("weather-widget");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    localStorage.setItem("weather-widget", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      const saved = localStorage.getItem("weather-widget");
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    };

    window.addEventListener("weather-settings-updated", handleSettingsUpdate);
    return () => window.removeEventListener("weather-settings-updated", handleSettingsUpdate);
  }, []);

  const loadWeather = useCallback(async (signal) => {
    if (signal?.aborted) return;
    try {
      const cityLabel = settings.city?.trim() || "";
      if (!cityLabel) {
        setLocationError("Enter a valid city name");
        setWeather(null);
        return;
      }

      const cityKey = cityLabel.toLocaleLowerCase();
      let location = readWeatherCache(`geocode:${encodeURIComponent(cityKey)}`, GEOCODE_CACHE_TTL);
      if (
        !location ||
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number" ||
        typeof location.city !== "string"
      ) location = null;
      if (!location) {
        const request = reserveWeatherRequest("geocode");
        if (!request.allowed) {
          if (request.reason === "cooldown") {
            setLocationError("Please wait a moment before looking up another city");
            setTimeout(() => {
              if (!signal?.aborted) loadWeather(signal);
            }, request.retryAfterMs);
          } else {
            setLocationError("Daily city lookup limit reached. Try again tomorrow");
          }
          setWeather({ city: cityLabel, temp: null, humidity: null, code: null });
          return;
        }
        const geo = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityLabel)}&count=1&language=en&format=json`,
          { signal }
        );
        if (!geo.ok) throw new Error(`City lookup failed with status ${geo.status}`);
        const geoData = await geo.json();
        const result = geoData?.results?.[0];
        if (!result || typeof result.latitude !== "number" || typeof result.longitude !== "number") {
          setLocationError("Location not found");
          setWeather({ city: cityLabel, temp: null, humidity: null, code: null });
          return;
        }
        location = {
          city: result.name || cityLabel,
          latitude: result.latitude,
          longitude: result.longitude
        };
        writeWeatherCache(`geocode:${encodeURIComponent(cityKey)}`, location);
      }

      const forecastKey = `forecast:${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
      let cachedForecast = readWeatherCache(forecastKey, FORECAST_CACHE_TTL);
      if (!cachedForecast || typeof cachedForecast.temp !== "number") cachedForecast = null;
      if (cachedForecast) {
        setLocationError(null);
        setWeather(cachedForecast);
        return;
      }

      const request = reserveWeatherRequest("forecast");
      if (!request.allowed) {
        const savedForecast = readWeatherCache(forecastKey, Number.MAX_SAFE_INTEGER);
        if (savedForecast && typeof savedForecast.temp === "number") setWeather(savedForecast);
        setLocationError(
          request.reason === "daily-limit"
            ? "Daily weather refresh limit reached. Try again tomorrow"
            : "Weather refresh is temporarily limited"
        );
        return;
      }

      const weatherReq = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,weather_code`,
        { signal }
      );
      if (!weatherReq.ok) throw new Error(`Weather request failed with status ${weatherReq.status}`);
      const weatherData = await weatherReq.json();
      const current = weatherData?.current;

      if (typeof current?.temperature_2m !== "number") {
        setLocationError("Weather data is temporarily unavailable");
        setWeather({ city: location.city, temp: null, humidity: null, code: null });
        return;
      }

      const forecast = {
        city: location.city,
        temp: current.temperature_2m,
        humidity: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
        code: typeof current.weather_code === "number" ? current.weather_code : null
      };
      writeWeatherCache(forecastKey, forecast);
      setLocationError(null);
      setWeather(forecast);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch weather data:", err);
      setLocationError("Unable to fetch weather data");
      setWeather({ city: settings.city, temp: null, humidity: null, code: null });
    }
  }, [settings.city]);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = setTimeout(() => loadWeather(controller.signal), 0);
    const interval = setInterval(() => loadWeather(controller.signal), FORECAST_CACHE_TTL);
    return () => {
      clearTimeout(initialLoad);
      controller.abort();
      clearInterval(interval);
    };
  }, [loadWeather]);

  function getIcon(code) {
    if (code === 0) return <Sun className="apple-icon sunny" size={26} />;
    if ([1, 2, 3].includes(code)) return <Cloud className="apple-icon cloudy" size={26} />;
    if ([45, 48].includes(code)) return <CloudFog className="apple-icon fog" size={26} />;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code))
      return <CloudRain className="apple-icon rain" size={26} />;
    if ([71, 73, 75, 77, 85, 86].includes(code))
      return <CloudSnow className="apple-icon snow" size={26} />;
    return <CloudLightning className="apple-icon storm" size={26} />;
  }

  const digitalTime = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: settings.hour12
  }).format(currentTime);

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(currentTime);

  return (
    <div className="apple-widget">
      <div className="apple-widget-header">
        <div className="apple-location">
          <MapPin size={12} strokeWidth={2.5} />
          <span>{settings.city || "Unknown"}</span>
        </div>
        <div className="apple-date">{formattedDate}</div>
      </div>

      <div className="apple-widget-body">
        <div className="apple-time-section">
          <div className="apple-clock">{digitalTime}</div>
        </div>

        <div className="apple-weather-section">
          <div className="apple-weather-primary">
            {weather && weather.code !== null ? getIcon(weather.code) : <Cloud className="apple-icon cloudy" size={26} />}
            <span className="apple-temp">
              {weather && weather.temp !== null ? Math.round(weather.temp) : "--"}°
            </span>
          </div>

          <div className="apple-weather-meta">
            <span className="apple-condition">
              {locationError || (weather ? (weather.code === 0 ? "Clear" : "Cloudy") : "Loading")}
            </span>
            {weather && weather.humidity !== null && (
              <span className="apple-humidity">
                <Droplets size={11} strokeWidth={2.5} />
                {weather.humidity}%
              </span>
            )}
          </div>
        </div>
      </div>
      {weather && weather.temp !== null && (
        <a
          className="apple-weather-attribution"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
        >
          Weather data by Open-Meteo.com
        </a>
      )}
    </div>
  );
}