import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PipIcon from "./PipIcon";

describe("PipIcon", () => {
  it("uses the settled Pip animation and preserves decorative and labeled image semantics", () => {
    const { container, rerender } = render(<PipIcon className="brand-pip" size={25} />);
    const decorativePip = container.querySelector("img");

    expect(decorativePip).toHaveAttribute("src", expect.stringContaining("Chibi%20Bird%20Sticker%20Animation%20Frames"));
    expect(decorativePip).toHaveAttribute("width", "25");
    expect(decorativePip).toHaveAttribute("height", "25");
    expect(decorativePip).toHaveAttribute("aria-hidden", "true");
    expect(decorativePip).toHaveAttribute("alt", "");

    rerender(<PipIcon label="Pip" />);
    expect(screen.getByRole("img", { name: "Pip" })).toBeInTheDocument();
  });
});
