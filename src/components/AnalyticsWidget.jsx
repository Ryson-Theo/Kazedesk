import { useEffect, useMemo, useState } from "react";
import { BarChart3, Minimize2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { storageManager } from "../utils/localStorage";
import "../styles/AnalyticsWidget.css";

const pad = (value) => String(value).padStart(2, "0");
const toDateInputValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toMonthInputValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const formatHour = (hour) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

const METRICS = {
  focus: { label: "Focus time", event: "focus_completed", color: "#62d5b1", unit: "min" },
  focusSessions: { label: "Focus sessions", event: "focus_completed", color: "#a7c7e7", unit: "focus session" },
  breaks: { label: "Break time", event: "break_completed", color: "#ffb86b", unit: "min" },
  tasks: { label: "Tasks completed", event: "task_completed", color: "#75b8ff", unit: "task" },
  notes: { label: "Notes created", event: "note_created", color: "#e8a4d8", unit: "note" },
};

const PERIODS = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function createBuckets(period, dayValue, monthValue, yearValue) {
  if (period === "day") {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: hour,
      label: hour % 3 === 0 ? formatHour(hour) : "",
      focus: 0,
      focusSessions: 0,
      breaks: 0,
      tasks: 0,
      notes: 0,
    }));
  }

  if (period === "month") {
    const [year, month] = monthValue.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, day) => ({
      key: day,
      label: day === 0 || day === daysInMonth - 1 || (day + 1) % 5 === 1 ? String(day + 1) : "",
      focus: 0,
      focusSessions: 0,
      breaks: 0,
      tasks: 0,
      notes: 0,
    }));
  }

  return Array.from({ length: 12 }, (_, month) => ({
    key: month,
    label: new Date(Number(yearValue), month, 1).toLocaleString(undefined, { month: "short" }),
    focus: 0,
    focusSessions: 0,
    breaks: 0,
    tasks: 0,
    notes: 0,
  }));
}

function dateBucket(date, period, dayValue, monthValue, yearValue) {
  if (Number.isNaN(date.getTime())) return -1;

  if (period === "day") {
    return toDateInputValue(date) === dayValue ? date.getHours() : -1;
  }

  if (period === "month") {
    const [year, month] = monthValue.split("-").map(Number);
    return date.getFullYear() === year && date.getMonth() === month - 1 ? date.getDate() - 1 : -1;
  }

  return date.getFullYear() === Number(yearValue) ? date.getMonth() : -1;
}

function eventBucket(event, period, dayValue, monthValue, yearValue) {
  return dateBucket(new Date(event.timestamp), period, dayValue, monthValue, yearValue);
}

function bucketKey(date, period) {
  if (period === "day") return `${toDateInputValue(date)}-${pad(date.getHours())}`;
  if (period === "month") return `${toMonthInputValue(date)}-${pad(date.getDate())}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function nextBucketBoundary(timestamp, period) {
  if (period === "day") {
    let boundary = new Date(Math.floor(timestamp / 60000) * 60000 + 60000);
    while (boundary.getMinutes() !== 0) {
      boundary = new Date(boundary.getTime() + 60000);
    }
    return boundary.getTime();
  }

  const boundary = new Date(timestamp);
  boundary.setHours(0, 0, 0, 0);
  if (period === "month") {
    boundary.setDate(boundary.getDate() + 1);
  } else {
    boundary.setDate(1);
    boundary.setMonth(boundary.getMonth() + 1);
  }
  return boundary.getTime();
}

function eventMinuteBuckets(event, period, dayValue, monthValue, yearValue) {
  const segments = Array.isArray(event.segments)
    ? event.segments.map((segment) => ({ start: Date.parse(segment.start), end: Date.parse(segment.end) }))
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    : [];

  if (!segments.length) {
    const index = eventBucket(event, period, dayValue, monthValue, yearValue);
    return index < 0 ? [] : [[index, Number(event.minutes) || 0]];
  }

  const totalActiveTime = segments.reduce((total, segment) => total + segment.end - segment.start, 0);
  const allocations = new Map();
  segments.forEach(({ start, end }) => {
    let cursor = start;
    while (cursor < end) {
      const date = new Date(cursor);
      const key = bucketKey(date, period);
      const index = dateBucket(date, period, dayValue, monthValue, yearValue);
      const sliceEnd = Math.min(end, nextBucketBoundary(cursor, period));
      if (sliceEnd <= cursor) break;
      const allocation = allocations.get(key) || { index, milliseconds: 0 };
      allocation.milliseconds += sliceEnd - cursor;
      allocations.set(key, allocation);
      cursor = sliceEnd;
    }
  });

  const weightedBuckets = [...allocations.values()].map(({ index, milliseconds }) => {
    const rawMinutes = (Number(event.minutes) || 0) * milliseconds / totalActiveTime;
    const minutes = Math.floor(rawMinutes);
    return { index, minutes, remainder: rawMinutes - minutes };
  });
  const roundedTotal = Math.round(Number(event.minutes) || 0);
  const wholeMinutesAllocated = weightedBuckets.reduce((total, bucket) => total + bucket.minutes, 0);
  const remainingMinutes = roundedTotal - wholeMinutesAllocated;
  weightedBuckets.sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remainingMinutes && index < weightedBuckets.length; index += 1) {
    weightedBuckets[index].minutes += 1;
  }

  return weightedBuckets
    .filter((bucket) => bucket.index >= 0)
    .map((bucket) => [bucket.index, bucket.minutes]);
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours ? `${hours} h ${remainingMinutes} m` : `${remainingMinutes} m`;
}

function AnalyticsChartTooltip({ active, payload, period, dayValue, monthValue, yearValue, metric }) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;

  const value = Math.round(Number(payload[0]?.value ?? bucket[metric]) || 0);
  const metricConfig = METRICS[metric];
  let bucketLabel = "";

  if (period === "day") {
    bucketLabel = `${dayValue} · ${formatHour(bucket.key)}`;
  } else if (period === "month") {
    bucketLabel = `${monthValue}-${pad(bucket.key + 1)}`;
  } else {
    bucketLabel = `${bucket.label} ${yearValue}`;
  }

  let formattedValue;
  if (metric === "focus" || metric === "breaks") {
    formattedValue = value >= 60 ? `${value} min (${formatMinutes(value)})` : `${value} min`;
  } else {
    const unit = metricConfig.unit;
    formattedValue = `${value} ${unit}${value === 1 ? "" : "s"}`;
  }

  return (
    <div className="analytics-tooltip">
      <span>{bucketLabel}</span>
      <strong>{metricConfig.label}</strong>
      <b>{formattedValue}</b>
    </div>
  );
}

export default function AnalyticsWidget({ minimized = false, onToggleMinimize }) {
  const now = new Date();
  const [period, setPeriod] = useState("month");
  const [dayValue, setDayValue] = useState(toDateInputValue(now));
  const [monthValue, setMonthValue] = useState(toMonthInputValue(now));
  const [yearValue, setYearValue] = useState(String(now.getFullYear()));
  const [metric, setMetric] = useState("focus");
  const [events, setEvents] = useState(() => storageManager.getAnalyticsEvents());

  useEffect(() => {
    const refreshEvents = () => setEvents(storageManager.getAnalyticsEvents());
    const refreshFromStorage = (event) => {
      if (event.key === "kazedesk_analytics_events") refreshEvents();
    };

    window.addEventListener("kazedesk-analytics-updated", refreshEvents);
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener("kazedesk-analytics-updated", refreshEvents);
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  const chartData = useMemo(() => {
    const buckets = createBuckets(period, dayValue, monthValue, yearValue);
    events.forEach((event) => {
      if (event.type === METRICS.focus.event) {
        eventMinuteBuckets(event, period, dayValue, monthValue, yearValue).forEach(([index, minutes]) => {
          if (buckets[index]) buckets[index].focus += minutes;
        });
        const sessionStart = new Date(event.startedAt || event.segments?.[0]?.start || event.timestamp);
        const sessionBucket = dateBucket(sessionStart, period, dayValue, monthValue, yearValue);
        if (sessionBucket >= 0 && buckets[sessionBucket]) buckets[sessionBucket].focusSessions += 1;
        return;
      }

      const index = eventBucket(event, period, dayValue, monthValue, yearValue);
      if (index < 0 || !buckets[index]) return;
      if (event.type === METRICS.breaks.event) {
        eventMinuteBuckets(event, period, dayValue, monthValue, yearValue).forEach(([bucketIndex, minutes]) => {
          if (buckets[bucketIndex]) buckets[bucketIndex].breaks += minutes;
        });
      }
      if (event.type === METRICS.tasks.event) buckets[index].tasks += 1;
      if (event.type === METRICS.notes.event) buckets[index].notes += 1;
    });
    return buckets;
  }, [events, period, dayValue, monthValue, yearValue]);

  const totals = useMemo(() => chartData.reduce((result, bucket) => ({
    focus: result.focus + bucket.focus,
    focusSessions: result.focusSessions + bucket.focusSessions,
    breaks: result.breaks + bucket.breaks,
    tasks: result.tasks + bucket.tasks,
    notes: result.notes + bucket.notes,
  }), { focus: 0, focusSessions: 0, breaks: 0, tasks: 0, notes: 0 }), [chartData]);

  const activeMetric = METRICS[metric];
  const hasActivity = chartData.some((bucket) => bucket[metric] > 0);
  const periodValue = period === "day" ? dayValue : period === "month" ? monthValue : yearValue;

  if (minimized) {
    return (
      <button
        type="button"
        className="analytics-minimized-button"
        onMouseDown={undefined}
        onClick={onToggleMinimize}
        aria-label="Restore analytics"
        title="Restore analytics"
      >
        <BarChart3 size={24} />
      </button>
    );
  }

  return (
    <section className="analytics-card">
      <header className="analytics-header">
        <div className="analytics-title">
          <BarChart3 size={17} />
          <h2>Analytics</h2>
        </div>
        <button
          type="button"
          className="analytics-minimize-button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onToggleMinimize}
          aria-label="Minimize analytics"
          title="Minimize analytics"
        >
          <Minimize2 size={15} />
        </button>
      </header>

      <div className="analytics-toolbar">
        <div className="analytics-period-switch" role="group" aria-label="Analytics period">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={period === option.id ? "active" : ""}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="analytics-date-control">
          <span className="sr-only">Selected {period}</span>
          {period === "day" ? (
            <input type="date" value={dayValue} onChange={(event) => setDayValue(event.target.value)} />
          ) : period === "month" ? (
            <input type="month" value={monthValue} onChange={(event) => setMonthValue(event.target.value)} />
          ) : (
            <input
              type="number"
              min="2000"
              max="2100"
              value={yearValue}
              onChange={(event) => setYearValue(event.target.value || String(now.getFullYear()))}
              aria-label="Selected year"
            />
          )}
        </label>
      </div>

      <div className="analytics-stat-grid">
        <div className="analytics-stat focus">
          <span>Focus</span>
          <strong>{formatMinutes(totals.focus)}</strong>
        </div>
        <div className="analytics-stat sessions">
          <span>Sessions</span>
          <strong>{totals.focusSessions}</strong>
        </div>
        <div className="analytics-stat break">
          <span>Break</span>
          <strong>{formatMinutes(totals.breaks)}</strong>
        </div>
        <div className="analytics-stat tasks">
          <span>Tasks</span>
          <strong>{totals.tasks}</strong>
        </div>
        <div className="analytics-stat notes">
          <span>Notes</span>
          <strong>{totals.notes}</strong>
        </div>
      </div>

      <div className="analytics-chart-heading">
        <span>{activeMetric.label}</span>
        <select value={metric} onChange={(event) => setMetric(event.target.value)} aria-label="Chart metric">
          {Object.entries(METRICS).map(([key, item]) => (
            <option key={key} value={key}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="analytics-chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
            <XAxis
              dataKey="key"
              tickFormatter={(key) => chartData[Number(key)]?.label || ""}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#7f8b9c", fontSize: 10 }}
            />
            <YAxis allowDecimals={metric === "focus" || metric === "breaks"} axisLine={false} tickLine={false} tick={{ fill: "#7f8b9c", fontSize: 10 }} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.045)" }}
              content={(
                <AnalyticsChartTooltip
                  period={period}
                  dayValue={dayValue}
                  monthValue={monthValue}
                  yearValue={yearValue}
                  metric={metric}
                />
              )}
            />
            <Bar dataKey={metric} fill={activeMetric.color} radius={[4, 4, 0, 0]} maxBarSize={period === "day" ? 12 : 22} />
          </BarChart>
        </ResponsiveContainer>
        {!hasActivity && <div className="analytics-empty-state">No recorded activity in this period yet</div>}
      </div>
      <span className="analytics-period-caption">{periodValue}</span>
    </section>
  );
}
