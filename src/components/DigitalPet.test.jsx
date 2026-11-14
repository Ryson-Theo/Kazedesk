import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DigitalPet from "./DigitalPet";

const layout = {
  timer: { x: 80, y: 120, w: 240 },
  tasks: { x: 360, y: 120, w: 300 },
};

function renderPet() {
  return render(<DigitalPet layout={layout} minimizedWidgets={{}} />);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace Pip animations", () => {
  it("uses the task-complete GIF only when a task is completed", () => {
    vi.useFakeTimers();
    const { container } = renderPet();

    act(() => {
      window.dispatchEvent(new CustomEvent("task-completed", {
        detail: { title: "Plan the day" },
      }));
    });

    expect(container.querySelector(".piper-bird").getAttribute("src"))
      .toContain("Chibi%20Bird%20Task%20Celebration");
    expect(container.querySelector(".digital-pet-message").textContent)
      .toContain("Plan the day");
  });

  it("uses the stretch GIF when a focus session enters its break", () => {
    vi.useFakeTimers();
    const { container } = renderPet();

    act(() => {
      window.dispatchEvent(new CustomEvent("pomodoro-phase-changed", {
        detail: { mode: "break" },
      }));
    });

    expect(container.querySelector(".piper-bird").getAttribute("src"))
      .toContain("Kawaii%20Bird%20Stretch%20Reminder");

    act(() => {
      window.dispatchEvent(new CustomEvent("pomodoro-phase-changed", {
        detail: { mode: "focus" },
      }));
    });

    expect(container.querySelector(".piper-bird").getAttribute("src"))
      .toContain("Cute%20Bird%20Water%20Reminder");
  });

  it("uses the water GIF when the focus timer starts", () => {
    vi.useFakeTimers();
    const { container } = renderPet();

    act(() => {
      window.dispatchEvent(new CustomEvent("pomodoro-started", {
        detail: { mode: "focus" },
      }));
    });

    expect(container.querySelector(".piper-bird").getAttribute("src"))
      .toContain("Cute%20Bird%20Water%20Reminder");

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(container.querySelector(".digital-pet-message").textContent)
      .toBe("Focus time. Keep water nearby.");
  });

  it("uses the water GIF for water reminders and ignores unrelated reminders", () => {
    vi.useFakeTimers();
    const { container } = renderPet();

    act(() => {
      window.dispatchEvent(new CustomEvent("pomodoro-phase-changed", {
        detail: { mode: "paused" },
      }));
      window.dispatchEvent(new CustomEvent("task-reminder-due", {
        detail: { tasks: [{ title: "Plan the day" }] },
      }));
    });
    expect(container.querySelector(".digital-pet-anchor")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(container.querySelector(".piper-bird").getAttribute("src"))
      .toContain("Cute%20Bird%20Water%20Reminder");
  });
});
