import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the technical foundation without Firebase", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Vivero Maestro" })).toBeInTheDocument();
    expect(screen.getByText("Fundación técnica instalada")).toBeInTheDocument();
    expect(screen.getByText("Sin Firebase configurado")).toBeInTheDocument();
  });
});
