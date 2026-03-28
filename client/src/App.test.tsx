/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { useGameStore } from "./store";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn()
  }))
}));

describe("App", () => {
  beforeEach(() => {
    useGameStore.getState().logout();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, rows: [] })
      }))
    );
  });

  it("renders hero and login when logged out", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /push rummy/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
  });

  it("shows user dock when logged in", async () => {
    useGameStore.setState({
      user: { id: "u1", username: "tester" },
      token: "tok-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      profile: {
        ratings: { global_rating: 1500 },
        records: { wins: 1, losses: 2 }
      }
    });
    render(<App />);
    expect(screen.getByText("tester")).toBeInTheDocument();
    expect(screen.getByText(/1W/)).toBeInTheDocument();
  });

  it("clicking Log out clears user", async () => {
    useGameStore.setState({
      user: { id: "u1", username: "tester" },
      token: "tok-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(useGameStore.getState().user).toBeNull();
  });
});
