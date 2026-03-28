/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastStack } from "./ToastStack";
import { useGameStore } from "./store";

describe("ToastStack", () => {
  beforeEach(() => {
    useGameStore.setState({ toasts: [] });
  });

  it("renders nothing when no toasts", () => {
    const { container } = render(<ToastStack />);
    expect(container.querySelector(".toastStack")).toBeNull();
  });

  it("renders toasts and dismisses", async () => {
    useGameStore.setState({
      toasts: [{ id: "t1", message: "Hello", variant: "info" }]
    });
    render(<ToastStack />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Dismiss"));
    expect(useGameStore.getState().toasts).toHaveLength(0);
  });
});
