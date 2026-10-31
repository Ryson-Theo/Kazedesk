export function getNightArcGeometry(scene, start, end) {
  const round = (value) => Math.round(value * 1000) / 1000;
  const startX = round(((start.left - scene.left) / scene.width) * 100);
  const endX = round(((end.right - scene.left) / scene.width) * 100);
  const baselineY = round(((end.top - scene.top - 4) / scene.height) * 100);
  const radiusX = round((endX - startX) / 2);
  const radiusY = round(radiusX * (scene.width / scene.height));

  return {
    startX,
    endX,
    baselineY,
    radiusX,
    radiusY,
    path: `M ${startX} ${baselineY} A ${radiusX} ${radiusY} 0 0 1 ${endX} ${baselineY}`
  };
}

export function getNightArcPosition(progress, arc) {
  const angle = Math.PI * progress;
  const centerX = (arc.startX + arc.endX) / 2;

  return {
    x: centerX - arc.radiusX * Math.cos(angle),
    y: arc.baselineY - arc.radiusY * Math.sin(angle)
  };
}

function getLocalMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  return hour * 60 + minute + second / 60;
}

function getSolarMinutes(value, fallback) {
  const match = typeof value === "string" && value.match(/(?:T)?(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : fallback;
}

export function getSkyPosition(date, timezone, solarTimes = {}) {
  solarTimes = solarTimes || {};
  const localMinutes = getLocalMinutes(date, timezone);
  const sunrise = getSolarMinutes(solarTimes.sunrise, 6 * 60);
  const sunset = getSolarMinutes(solarTimes.sunset, 18 * 60);
  const nextSunrise = getSolarMinutes(solarTimes.nextSunrise, sunrise) + 24 * 60;
  const dayDuration = sunset > sunrise ? sunset - sunrise : 12 * 60;
  const isDay = localMinutes >= sunrise && localMinutes < sunset;

  if (isDay) {
    const progress = Math.min(1, (localMinutes - sunrise) / dayDuration);
    return {
      phase: localMinutes - sunrise < 30
        ? "sunrise"
        : sunset - localMinutes <= 30
          ? "sunset"
          : "day",
      progress,
      x: 50 - (48 * Math.cos(Math.PI * progress)),
      y: 44 - (32 * Math.sin(Math.PI * progress))
    };
  }

  const previousSunset = sunset - 24 * 60;
  const nightStart = localMinutes < sunrise ? previousSunset : sunset;
  const nightEnd = localMinutes < sunrise ? sunrise : Math.max(nextSunrise, sunset + 1);
  const progress = Math.max(0, Math.min(1, (localMinutes - nightStart) / (nightEnd - nightStart)));

  return {
    phase: "night",
    progress,
    x: 50 - (48 * Math.cos(Math.PI * progress)),
    y: 44 - (32 * Math.sin(Math.PI * progress))
  };
}

export function getWeatherPosition(date, timezone) {
  const progress = getLocalMinutes(date, timezone) / (24 * 60);

  return {
    progress,
    x: 18 + progress * 64,
    y: 48 - 40 * progress * (1 - progress) * (1 - 2 * progress)
  };
}

export function clampSkyPosition(
  position,
  sceneWidth,
  sceneHeight,
  markerWidth,
  markerHeight,
  reservedBottom = sceneHeight
) {
  const clamp = (value, minimum, maximum) =>
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  const maximumCenterY = Math.min(sceneHeight, reservedBottom) - markerHeight / 2;

  return {
    x: clamp(
      (position.x / 100) * sceneWidth,
      markerWidth / 2,
      sceneWidth - markerWidth / 2
    ),
    y: clamp(
      (position.y / 100) * sceneHeight,
      markerHeight / 2,
      maximumCenterY
    )
  };
}
