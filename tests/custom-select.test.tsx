import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomSelect } from "../src/components/CustomSelect";

const options = Array.from({ length: 40 }, (_, index) => ({ value: String(index), label: `物品 ${index}` }));

describe("select keyboard navigation", () => {
  it("scrolls the active option inside the menu and exposes its accessible identity", () => {
    const onChange = vi.fn();
    render(<CustomSelect label="所需物品" value="0" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "所需物品 物品 0" });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = screen.getByRole("listbox");
    Object.defineProperty(menu, "clientHeight", { value: 80 });
    screen.getAllByRole("option").forEach((option, index) => {
      Object.defineProperty(option, "offsetTop", { value: index * 40 });
      Object.defineProperty(option, "offsetHeight", { value: 40 });
    });
    for (let index = 0; index < 5; index++) fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(menu.scrollTop).toBe(165);
    expect(trigger).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "物品 5" }).id);
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("5");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Tab and returns focus to the trigger after a pointer selection", () => {
    render(<CustomSelect label="所需物品" value="0" options={options} onChange={vi.fn()} />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "物品 2" });
    option.focus();
    fireEvent.click(option);
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute("aria-activedescendant");
  });

  it("keeps internal scrolling open but closes when the page moves away from its trigger", () => {
    render(<CustomSelect label="所需物品" value="0" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.scroll(document);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
