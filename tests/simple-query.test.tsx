import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("simple material query flow", () => {
  it("keeps the compact header links and removes the obsolete data strip", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "舰队官网" })).toHaveAttribute("href", "https://www.gvyvoyagers.vip");
    expect(screen.getByRole("link", { name: "蓝图站" })).toHaveAttribute("href", "https://lantu.gvyvoyagers.vip");
    expect(screen.queryByText("数据说明")).not.toBeInTheDocument();
  });

  it("shows exact requirements and opens a material acquisition dialog without inventory states", () => {
    render(<App />);

    for (const removedLabel of ["我的库存", "编辑库存", "标记为已完成", "可完成", "部分满足", "缺少"]) {
      expect(screen.queryByText(removedLabel)).not.toBeInTheDocument();
    }

    const firstCard = screen.getAllByRole("article")[0];
    const materialLinks = within(firstCard).getAllByRole("button", { name: /查看获取方式/ });
    expect(materialLinks.length).toBeGreaterThan(0);
    expect(within(materialLinks[0]).getByText(/\d/)).toBeInTheDocument();

    fireEvent.click(materialLinks[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("怎么获得")).toBeInTheDocument();
    expect(within(dialog).queryByText("我的库存")).not.toBeInTheDocument();
    expect(within(dialog).getByText("可用于哪些交易")).toBeInTheDocument();
    expect(within(dialog).getByText("以下交易会消耗这个物品")).toBeInTheDocument();
    expect(within(dialog).queryByText("作为上交物")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("<EM4>");
    expect(within(dialog).getAllByText(/\d+ 笔交易/).length).toBeGreaterThan(0);
  });

  it("keeps the GVY filing footer and opens a complete trade detail", () => {
    render(<App />);

    expect(screen.getByText("陕ICP备2026017597号-1")).toBeInTheDocument();
    expect(screen.getByText("陕公网安备61019702000690号")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /查看交易/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "交易详情" });
    expect(within(dialog).getByText("需要上交")).toBeInTheDocument();
    expect(within(dialog).getByText("全部奖励")).toBeInTheDocument();
  });

  it("shows every requirement directly on long trade cards", () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("搜索合同、物品、奖励、飞船或地点"), {
      target: { value: "Asgard Fight Mod" },
    });

    const card = screen.getByRole("article");
    expect(within(card).getAllByRole("button", { name: /查看获取方式/ })).toHaveLength(11);
    expect(within(card).queryByText(/还有\s+\d+\s+项/)).not.toBeInTheDocument();
  });

  it("explains a crafted material as a short unlock, materials, and usage flow", () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("搜索合同、物品、奖励、飞船或地点"), {
      target: { value: "Metamaterial Test #146" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /超材料测试 #146.*查看获取方式/ })[0]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("先解锁制作蓝图")).toBeInTheDocument();
    expect(within(dialog).getByText(/完成交易：格外特别的狼/)).toBeInTheDocument();
    expect(within(dialog).getByText("准备材料并开始制作")).toBeInTheDocument();
    expect(within(dialog).getByText("钛")).toBeInTheDocument();
    expect(within(dialog).getByText("Titanium")).toBeInTheDocument();
    expect(within(dialog).getByText("愈金")).toBeInTheDocument();
    expect(within(dialog).getByText("约曼迪之眼")).toBeInTheDocument();
    expect(within(dialog).getByText("预计制作耗时：70 秒")).toBeInTheDocument();
    expect(within(dialog).getByText("可用于哪些交易")).toBeInTheDocument();
    expect(within(dialog).getAllByText("需要 1 个")).toHaveLength(2);
  });

  it("shows the complete official AAA pearl name, real image, and acquisition route", () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("搜索合同、物品、奖励、飞船或地点"), {
      target: { value: "Irradiated Valakkar Pearl (Grade AAA)" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /受辐射的瓦拉卡珍珠（AAA 级）.*查看获取方式/ })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "受辐射的瓦拉卡珍珠（AAA 级）" })).toBeInTheDocument();
    expect(within(dialog).getByText("Irradiated Valakkar Pearl (Grade AAA)")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "受辐射的瓦拉卡珍珠（AAA 级）" })).toHaveAttribute("src", expect.stringContaining("irradiated-valakkar-pearl-grade-aaa"));
    expect(within(dialog).getByText(/AAA 是稀有等级，不能把 AA 当作 AAA 上交/)).toBeInTheDocument();
  });

  it("uses official RCMBNT codes and explains Hyperion synthesis without upstream labels", () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("搜索合同、物品、奖励、飞船或地点"), {
      target: { value: "RCMBNT-XTL-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /RCMBNT-XTL-1.*查看获取方式/ })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "RCMBNT-XTL-1" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("ASD Extract Module");
    expect(within(dialog).getByText(/任务：约里特卷宗：海伯利安项目/)).toBeInTheDocument();
    expect(within(dialog).getByText(/材料：反应物-01代码 \+ 催化剂-XTL代码/)).toBeInTheDocument();
    expect(within(dialog).getByText(/产出：RCMBNT-XTL-1/)).toBeInTheDocument();
  });
});
