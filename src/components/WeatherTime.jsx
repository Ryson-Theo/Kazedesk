import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Cloud,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  MapPin,
  Droplets
} from "lucide-react";
import { reserveWeatherRequest } from "../utils/weatherRequestLimiter";
import {
  getNightArcGeometry,
  getNightArcPosition,
  clampSkyPosition,
  getSkyPosition,
  getWeatherPosition
} from "../utils/weatherAnimation";

import "../styles/WeatherTime.css";

const DEFAULT_SETTINGS = {
  city: "Tokyo",
  timezone: "Asia/Tokyo",
  hour12: true
};

const WEATHER_CACHE_PREFIX = "kazedesk-weather-cache-v1:";
const GEOCODE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const FORECAST_CACHE_TTL = 4 * 60 * 60 * 1000;

function getWeatherCondition(code) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Cloudy";
}

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

export default function WeatherTime({ animationEnabled = true }) {
  const [weather, setWeather] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nightArc, setNightArc] = useState(null);
  const [markersPositioned, setMarkersPositioned] = useState(false);
  const markersInitializedRef = useRef(false);
  const skySceneRef = useRef(null);
  const celestialMarkerRef = useRef(null);
  const weatherMarkerRef = useRef(null);
  const conditionRef = useRef(null);
  const temperatureRef = useRef(null);
  const feelsLikeRef = useRef(null);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("weather-widget");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    localStorage.setItem("weather-widget", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    const updateInterval = 15_000;
    const firstUpdateDelay = updateInterval - (Date.now() % updateInterval);
    let interval;
    const initialTimeout = setTimeout(() => {
      updateTime();
      interval = setInterval(updateTime, updateInterval);
    }, firstUpdateDelay);
    const handleVisibilityChange = () => {
      if (!document.hidden) updateTime();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
      if (
        !cachedForecast ||
        typeof cachedForecast.temp !== "number" ||
        typeof cachedForecast.feelsLike !== "number" ||
        typeof cachedForecast.sunrise !== "string" ||
        typeof cachedForecast.sunset !== "string"
      ) cachedForecast = null;
      if (cachedForecast) {
        setLocationError(null);
        setWeather(cachedForecast);
        return;
      }

      const request = reserveWeatherRequest("forecast");
      if (!request.allowed) {
        const savedForecast = readWeatherCache(forecastKey, Number.MAX_SAFE_INTEGER);
        if (savedForecast && typeof savedForecast.temp === "number") {
          setWeather(savedForecast);
          setLocationError(null);
        } else {
          setLocationError(
            request.reason === "daily-limit"
              ? "Daily weather refresh limit reached. Try again tomorrow"
              : "Weather refresh is temporarily limited"
          );
        }
        return;
      }

      const weatherReq = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=sunrise,sunset&forecast_days=2&timezone=${encodeURIComponent(settings.timezone || "auto")}`,
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
        feelsLike: typeof current.apparent_temperature === "number" ? current.apparent_temperature : null,
        humidity: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
        code: typeof current.weather_code === "number" ? current.weather_code : null,
        sunrise: weatherData?.daily?.sunrise?.[0] || null,
        sunset: weatherData?.daily?.sunset?.[0] || null,
        nextSunrise: weatherData?.daily?.sunrise?.[1] || null
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
  }, [settings.city, settings.timezone]);

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

  function getIcon(code, size = 26, className = "apple-icon") {
    if (code === 0) return <Sun className={`${className} sunny`} size={size} />;
    if ([2, 3].includes(code)) return <Cloud className={`${className} cloudy`} size={size} />;
    if ([45, 48].includes(code)) return <CloudFog className={`${className} fog`} size={size} />;
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code))
      return <CloudRain className={`${className} rain`} size={size} />;
    if ([71, 73, 75, 77, 85, 86].includes(code))
      return <CloudSnow className={`${className} snow`} size={size} />;
    return <CloudLightning className={`${className} storm`} size={size} />;
  }

  const formattedTimeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: settings.hour12
  }).formatToParts(currentTime);
  const timeHour = formattedTimeParts.find((part) => part.type === "hour")?.value;
  const timeMinute = formattedTimeParts.find((part) => part.type === "minute")?.value;
  const dayPeriod = formattedTimeParts.find((part) => part.type === "dayPeriod")?.value;
  const digitalTime = `${timeHour}:${timeMinute}`;

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(currentTime);
  const skyPosition = getSkyPosition(currentTime, settings.timezone, weather);
  const weatherCode = weather?.code;
  const condition = weatherCode === null || weatherCode === undefined
    ? "Cloudy"
    : getWeatherCondition(weatherCode);
  const weatherPosition = getWeatherPosition(currentTime, settings.timezone);
  const celestialPosition = nightArc
    ? getNightArcPosition(skyPosition.progress, nightArc)
    : skyPosition;
  const weatherMarkerPosition = nightArc
    ? getNightArcPosition(weatherPosition.progress, nightArc)
    : weatherPosition;

  const markerPositionsRef = useRef(null);
  markerPositionsRef.current = {
    celestial: celestialPosition,
    weather: weatherMarkerPosition
  };

  useLayoutEffect(() => {
    if (!animationEnabled) {
      setNightArc(null);
      markersInitializedRef.current = false;
      setMarkersPositioned(false);
      return undefined;
    }

    let previousSceneSize = null;
    let resizeFrame = null;
    let positioningFrame = null;
    const updateMarkerPositions = () => {
      const scene = skySceneRef.current;
      const sceneRect = scene?.getBoundingClientRect();
      if (!sceneRect?.width || !sceneRect.height || !markerPositionsRef.current) return;
      const textTop = [conditionRef.current, feelsLikeRef.current]
        .filter(Boolean)
        .reduce((top, element) => Math.min(top, element.getBoundingClientRect().top), Infinity);
      const safeTextTop = Number.isFinite(textTop)
        ? Math.max(0, textTop - sceneRect.top - 8)
        : sceneRect.height;

      const sceneResized = previousSceneSize &&
        (Math.abs(previousSceneSize.width - sceneRect.width) > 0.5 ||
          Math.abs(previousSceneSize.height - sceneRect.height) > 0.5);
      previousSceneSize = { width: sceneRect.width, height: sceneRect.height };

      if (sceneResized) {
        [celestialMarkerRef.current, weatherMarkerRef.current].filter(Boolean).forEach((marker) => {
          marker.classList.add("is-resizing");
        });
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          [celestialMarkerRef.current, weatherMarkerRef.current].filter(Boolean).forEach((marker) => {
            marker.classList.remove("is-resizing");
          });
        });
      }

      [
        [celestialMarkerRef.current, markerPositionsRef.current.celestial],
        [
          weatherMarkerRef.current,
          {
            ...markerPositionsRef.current.weather,
            y: markerPositionsRef.current.weather.y + (32 / sceneRect.height) * 100
          }
        ]
      ].forEach(([marker, position]) => {
        if (!marker) return;
        const markerRect = marker.getBoundingClientRect();
        const clamped = clampSkyPosition(
          position,
          sceneRect.width,
          sceneRect.height,
          markerRect.width,
          markerRect.height,
          safeTextTop
        );
        marker.style.left = `${clamped.x}px`;
        marker.style.top = `${clamped.y}px`;
      });

      if (!markersInitializedRef.current && positioningFrame === null) {
        positioningFrame = requestAnimationFrame(() => {
          positioningFrame = requestAnimationFrame(() => {
            markersInitializedRef.current = true;
            setMarkersPositioned(true);
          });
        });
      }
    };

    const updateArc = () => {
      updateMarkerPositions();
      const scene = skySceneRef.current?.getBoundingClientRect();
      const start = conditionRef.current?.getBoundingClientRect();
      const end = feelsLikeRef.current?.getBoundingClientRect();
      if (!scene?.width || !scene.height || !start || !end) return;

      const nextArc = getNightArcGeometry(scene, start, end);
      setNightArc((current) => {
        if (
          current &&
          Math.abs(current.startX - nextArc.startX) < 0.01 &&
          Math.abs(current.endX - nextArc.endX) < 0.01 &&
          Math.abs(current.baselineY - nextArc.baselineY) < 0.01 &&
          Math.abs(current.radiusY - nextArc.radiusY) < 0.01
        ) return current;
        return nextArc;
      });
    };

    updateArc();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateArc);
    [
      skySceneRef.current,
      celestialMarkerRef.current,
      weatherMarkerRef.current,
      conditionRef.current,
      feelsLikeRef.current
    ]
      .filter(Boolean)
      .forEach((element) => observer?.observe(element));
    window.addEventListener("resize", updateArc);

    return () => {
      observer?.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (positioningFrame !== null) cancelAnimationFrame(positioningFrame);
      window.removeEventListener("resize", updateArc);
    };
  }, [
    animationEnabled,
    celestialPosition.x,
    celestialPosition.y,
    weatherMarkerPosition.x,
    weatherMarkerPosition.y,
    weather?.feelsLike,
    weather?.temp
  ]);

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
        {animationEnabled && (
          <div
            ref={skySceneRef}
            className="apple-sky-scene"
            data-testid="weather-sky-scene"
            data-phase={skyPosition.phase}
            aria-hidden="true"
          >
            <svg className="apple-sky-path" viewBox="0 0 100 100" preserveAspectRatio="none">
              {nightArc && <path d={nightArc.path} />}
            </svg>
            {skyPosition.phase === "sunrise" ? (
              <Sunrise
                ref={celestialMarkerRef}
                className={`apple-sky-marker apple-sky-celestial apple-sky-sunrise${markersPositioned ? " is-positioned" : ""}`}
                size={30}
              />
            ) : skyPosition.phase === "sunset" ? (
              <Sunset
                ref={celestialMarkerRef}
                className={`apple-sky-marker apple-sky-celestial apple-sky-sunset${markersPositioned ? " is-positioned" : ""}`}
                size={30}
              />
            ) : skyPosition.phase === "night" ? (
              <Moon
                ref={celestialMarkerRef}
                className={`apple-sky-marker apple-sky-celestial apple-sky-moon${markersPositioned ? " is-positioned" : ""}`}
                size={28}
              />
            ) : (
              <Sun
                ref={celestialMarkerRef}
                className={`apple-sky-marker apple-sky-celestial apple-sky-sun${markersPositioned ? " is-positioned" : ""}`}
                size={30}
              />
            )}
            <div
              ref={weatherMarkerRef}
              className={`apple-sky-marker apple-sky-weather${markersPositioned ? " is-positioned" : ""}`}
            >
              {weatherCode !== null && weatherCode !== undefined && weatherCode > 1 &&
                getIcon(weatherCode, 30, "apple-sky-weather-icon")}
              <span ref={temperatureRef} className="apple-sky-temperature">
                {weather && weather.temp !== null ? `${Math.round(weather.temp)}°` : "--°"}
              </span>
            </div>
          </div>
        )}
        <div className="apple-time-section">
          <div className="apple-time-readout">
            <div className="apple-clock-wrap">
              <div className="apple-clock" aria-label={`${digitalTime}${dayPeriod ? ` ${dayPeriod}` : ""}`}>
                {digitalTime}
              </div>
            </div>
            <div className="apple-time-meta">
              {dayPeriod && <span className="apple-day-period">{dayPeriod}</span>}
              <span className="apple-humidity">
                <Droplets size={14} strokeWidth={2.5} />
                {weather && weather.humidity !== null ? `${weather.humidity}%` : "--"}
              </span>
            </div>
          </div>
        </div>

        <div className="apple-weather-section">
          {!animationEnabled && (
            <div className="apple-weather-static" data-testid="weather-static-condition">
              {weatherCode === null || weatherCode === undefined
                ? <Cloud className="apple-icon cloudy" size={26} />
                : getIcon(weatherCode, 26)}
              <span className="apple-temp">
                {weather && weather.temp !== null ? `${Math.round(weather.temp)}°` : "--°"}
              </span>
            </div>
          )}
          <div className="apple-weather-meta">
            <span ref={conditionRef} className="apple-condition">
              {locationError || (weather ? condition : "Loading")}
            </span>
            <div className="apple-weather-meta-details">
              {weather && typeof weather.feelsLike === "number" && (
                <span ref={feelsLikeRef} className="apple-feels-like" data-testid="weather-feels-like">
                  Feels like {Math.round(weather.feelsLike)}°
                </span>
              )}
            </div>
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