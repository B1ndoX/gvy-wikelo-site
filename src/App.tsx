import {
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import itemsData from "./data/generated/items.json";
import tradesData from "./data/generated/trades.json";
import { CustomSelect, type SelectOption } from "./components/CustomSelect";
import { ItemImage } from "./components/ItemImage";
import { formatAmount, formatVersion, primaryName, reputationLabel, secondaryName } from "./lib/display";
import type { ItemRecord, Trade, TradeEntry } from "./types";

const trades = tradesData.trades as Trade[];
const items = itemsData.items as ItemRecord[];
const itemById = new Map(items.map((item) => [item.id, item]));
const tradeById = new Map(trades.map((trade) => [trade.id, trade]));

const repOptions: SelectOption[] = [
  { value: "all", label: "全部声望" },
  { value: "none", label: "无要求" },
  ...Array.from(new Set(trades.map((trade) => trade.minReputation).filter((value): value is string => value !== null)))
    .sort((a, b) => reputationRank(a) - reputationRank(b))
    .map((value) => ({ value, label: reputationLabel(value) })),
];

const versionOptions: SelectOption[] = [
  { value: "all", label: "全部版本" },
  ...Array.from(new Set(trades.map((trade) => trade.gameVersion))).map((version) => ({ value: version, label: formatVersion(version) })),
];

const sortOptions: SelectOption[] = [
  { value: "recommended", label: "推荐排序" },
  { value: "name", label: "名称" },
  { value: "reputation", label: "声望" },
  { value: "quantity", label: "需求数量" },
  { value: "version", label: "版本" },
];

function categoryLabel(value: string) {
  const map: Record<string, string> = {
    ship: "飞船",
    vehicle: "地面载具",
    ground_vehicle: "地面载具",
    weapon: "武器",
    armor: "护甲",
    gear: "装备",
    favor: "维科洛人情",
    introduction: "引导合同",
    food: "食品",
    other: "其他",
    item: "物品",
    misc: "物品",
    component: "组件",
    blueprint: "蓝图",
    "fps weapon": "武器",
    "weapon gun": "武器",
    "weapon attachment": "武器配件",
    "helmet (armor)": "头盔",
    "arms (armor)": "臂甲",
    "torso (armor)": "胸甲",
    "legs (armor)": "腿甲",
    "backpack (armor)": "背包",
    "undersuit (armor)": "飞行服",
    cargo: "货物",
    "removable chip": "数据芯片",
    "inventory container": "任务物品",
    drink: "饮品",
    currency: "货币",
    "noitem vehicle": "载具",
    transporter: "运输器",
  };
  return map[value.toLowerCase()] ?? value;
}

const categoryOrder = ["ship", "ground_vehicle", "armor", "weapon", "gear", "favor", "introduction", "food"];
const categoryTabs = [
  { value: "all", label: "全部", count: trades.length },
  ...categoryOrder.map((category) => ({
    value: category,
    label: categoryLabel(category),
    count: trades.filter((trade) => trade.category === category).length,
  })),
];

function normalizedSearch(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function cleanGameMarkup(value: string) {
  return value.replace(/<\/?[A-Z][A-Z0-9_]*>/gi, "").trim();
}

function imageKindLabel(kind: ItemRecord["imageKind"], compact = false) {
  if (kind === "base_model") return compact ? "参考图" : "参考图";
  return null;
}

function reputationRank(value: string | null) {
  const order = [null, "New Customer", "Very Good Customer", "Very Best Customer"];
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function entrySearchText(entry: TradeEntry) {
  return `${entry.name.zh ?? ""} ${entry.name.en} ${entry.id} ${entry.category}`.toLocaleLowerCase("zh-CN");
}

function readableUnit(unit: string) {
  return unit === "x" ? "个" : unit;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [rewardCategory, setRewardCategory] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [selectedTradeId, setSelectedTradeId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tradeDetailOpen, setTradeDetailOpen] = useState(false);

  const requirementOptions = useMemo<SelectOption[]>(() => {
    const required = new Map<string, TradeEntry>();
    trades.forEach((trade) => trade.requirements.forEach((entry) => required.set(entry.id, entry)));
    return [
      { value: "all", label: "全部需求物品" },
      ...Array.from(required.values())
        .sort((a, b) => primaryName(a.name).localeCompare(primaryName(b.name), "zh-CN"))
        .map((entry) => ({ value: entry.id, label: primaryName(entry.name) })),
    ];
  }, []);

  const filteredTrades = useMemo(() => {
    const needle = normalizedSearch(query);
    const result = trades.filter((trade) => {
      const matchesSearch =
        !needle ||
        `${trade.name.zh ?? ""} ${trade.name.en} ${trade.debugName} ${trade.station.zh ?? ""} ${trade.station.en ?? ""}`
          .toLocaleLowerCase("zh-CN")
          .includes(needle) ||
        trade.requirements.some((entry) => entrySearchText(entry).includes(needle)) ||
        trade.rewards.some((entry) => entrySearchText(entry).includes(needle));
      const matchesRep =
        repFilter === "all" ||
        (repFilter === "none" ? trade.minReputation === null : trade.minReputation === repFilter);
      return (
        matchesSearch &&
        (rewardCategory === "all" || trade.category === rewardCategory) &&
        matchesRep &&
        (requirementFilter === "all" || trade.requirements.some((entry) => entry.id === requirementFilter)) &&
        (versionFilter === "all" || trade.gameVersion === versionFilter)
      );
    });

    return result.sort((a, b) => {
      if (sort === "name") return primaryName(a.name).localeCompare(primaryName(b.name), "zh-CN");
      if (sort === "reputation") return reputationRank(a.minReputation) - reputationRank(b.minReputation);
      if (sort === "quantity") {
        return (
          a.requirements.reduce((sum, entry) => sum + entry.quantity, 0) -
          b.requirements.reduce((sum, entry) => sum + entry.quantity, 0)
        );
      }
      if (sort === "version") return b.gameVersion.localeCompare(a.gameVersion, undefined, { numeric: true });
      const validationRank = { verified: 0, single_source: 1, conflict: 2, pending: 3 };
      return validationRank[a.validationStatus] - validationRank[b.validationStatus];
    });
  }, [query, repFilter, requirementFilter, rewardCategory, sort, versionFilter]);

  const selectedTrade = trades.find((trade) => trade.id === selectedTradeId) ?? filteredTrades[0] ?? null;
  const selectedItem = selectedItemId ? itemById.get(selectedItemId) ?? null : null;

  useEffect(() => {
    if (!filteredTrades.length) return;
    if (!filteredTrades.some((trade) => trade.id === selectedTradeId)) setSelectedTradeId(filteredTrades[0].id);
  }, [filteredTrades, selectedTradeId]);

  useEffect(() => {
    const anyOverlay = Boolean(selectedItem || tradeDetailOpen);
    document.body.classList.toggle("overlay-open", anyOverlay);
    return () => document.body.classList.remove("overlay-open");
  }, [selectedItem, tradeDetailOpen]);

  function selectTrade(id: string) {
    setSelectedTradeId(id);
    setSelectedItemId(null);
    setTradeDetailOpen(true);
  }

  function resetFilters() {
    setQuery("");
    setRewardCategory("all");
    setRepFilter("all");
    setRequirementFilter("all");
    setVersionFilter("all");
    setSort("recommended");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="wikelo-avatar" src="/images/wikelo.webp" alt="维科洛" />
          <div>
            <p className="eyebrow">GVY 维科洛交易查询站</p>
            <h1>维科洛交易查询</h1>
          </div>
        </div>
        <label className="global-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">搜索合同、物品、奖励或地点</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索合同、物品、奖励、飞船或地点" />
          {query && (
            <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="top-actions">
          <nav aria-label="相关站点">
            <a href="https://www.gvyvoyagers.vip" target="_blank" rel="noreferrer">舰队官网</a>
            <a href="https://lantu.gvyvoyagers.vip" target="_blank" rel="noreferrer">蓝图站</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="category-tabs" aria-label="交易类别">
          {categoryTabs.map((category) => (
            <button
              type="button"
              key={category.value}
              className={rewardCategory === category.value ? "is-active" : ""}
              aria-pressed={rewardCategory === category.value}
              onClick={() => setRewardCategory(category.value)}
            >
              <span>{category.label}</span><small>{category.count}</small>
            </button>
          ))}
        </section>

        <section className="filterbar" aria-label="交易筛选">
          <div className="filter-title"><SlidersHorizontal size={15} /><span>筛选</span></div>
          <CustomSelect label="最低声望" value={repFilter} options={repOptions} onChange={setRepFilter} />
          <CustomSelect label="所需物品" value={requirementFilter} options={requirementOptions} onChange={setRequirementFilter} />
          <CustomSelect label="交易站" value="unbound" options={[{ value: "unbound", label: "逐条地点暂无" }]} onChange={() => undefined} />
          <CustomSelect label="游戏版本" value={versionFilter} options={versionOptions} onChange={setVersionFilter} />
          <CustomSelect label="排序" value={sort} options={sortOptions} onChange={setSort} />
        </section>

        <section className="results-section">
          <div className="panel-heading">
            <div>共显示 <strong>{filteredTrades.length}</strong> 笔交易</div>
            <div className="panel-hint">材料可直接点击查看获取方式</div>
          </div>
          {filteredTrades.length ? (
            <div className="trade-grid">
              {filteredTrades.map((trade) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  onOpen={() => selectTrade(trade.id)}
                  onItemClick={setSelectedItemId}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search aria-hidden="true" />
              <h2>没有符合条件的交易</h2>
              <p>可以换个关键词或重置筛选。</p>
              <button type="button" onClick={resetFilters}><RotateCcw size={15} />重置筛选</button>
            </div>
          )}
        </section>

        <SiteFooter />
      </main>

      {tradeDetailOpen && selectedTrade && (
        <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTradeDetailOpen(false)}>
          <section className="modal trade-modal" role="dialog" aria-modal="true" aria-label="交易详情">
            <button className="modal-close" type="button" aria-label="关闭详情" onClick={() => setTradeDetailOpen(false)}><X /></button>
            <TradeDetail
              trade={selectedTrade}
              onItemClick={setSelectedItemId}
            />
          </section>
        </div>
      )}

      {selectedItem && (
        <ItemDialog
          item={selectedItem}
          onClose={() => setSelectedItemId(null)}
          onTradeClick={selectTrade}
        />
      )}
    </div>
  );
}

function TradeCard({ trade, onOpen, onItemClick }: {
  trade: Trade;
  onOpen: () => void;
  onItemClick: (id: string) => void;
}) {
  const primaryReward = trade.rewards[0];
  const rewardItem = primaryReward ? itemById.get(primaryReward.id) : null;
  const imageLabel = rewardItem ? imageKindLabel(rewardItem.imageKind, true) : null;
  return (
    <article className="trade-card">
      <button className="trade-card-summary" type="button" onClick={onOpen} aria-label={`查看交易 ${primaryName(trade.name)}`}>
        <span className="trade-card-image-wrap">
          <ItemImage className="trade-card-image" src={rewardItem?.imagePath} alt={primaryReward ? primaryName(primaryReward.name) : primaryName(trade.name)} />
          {imageLabel && <small className={`reference-badge ${rewardItem?.imageKind}`}>{imageLabel}</small>}
        </span>
        <span className="trade-card-heading">
          <span className="trade-card-topline"><span className="category-chip">{categoryLabel(trade.category)}</span><small>{formatVersion(trade.gameVersion)}</small></span>
          <strong>{primaryName(trade.name)}</strong>
          {secondaryName(trade.name) && <small className="trade-card-en">{secondaryName(trade.name)}</small>}
          {primaryReward && <span className="trade-card-reward">奖励：{primaryName(primaryReward.name)}{trade.rewards.length > 1 ? ` 等 ${trade.rewards.length} 项` : ""}</span>}
        </span>
      </button>

      <section className="trade-card-requirements" aria-label={`${primaryName(trade.name)}所需材料`}>
        <div className="trade-card-section-title"><strong>需要上交</strong><span>{trade.requirements.length} 项</span></div>
        <div className="material-chips">
          {trade.requirements.length ? trade.requirements.map((entry) => (
            <button type="button" key={entry.id} onClick={() => onItemClick(entry.id)} aria-label={`${primaryName(entry.name)}，${formatAmount(entry.quantity)} ${entry.unit}，查看获取方式`}>
              <strong>{formatAmount(entry.quantity)} {entry.unit}</strong><span>{primaryName(entry.name)}</span>
            </button>
          )) : <span className="no-requirements">无需上交物品</span>}
        </div>
      </section>

      <footer className="trade-card-footer">
        <span>{trade.reputationGain === null ? "声望增量暂无" : `+${formatAmount(trade.reputationGain)} 声望`}</span>
        <span>最低声望：{reputationLabel(trade.minReputation)}</span>
        <button type="button" onClick={onOpen}>查看详情 <ChevronRight size={15} /></button>
      </footer>
    </article>
  );
}

function TradeDetail({ trade, onItemClick }: {
  trade: Trade;
  onItemClick: (id: string) => void;
}) {
  const primaryReward = trade.rewards[0];
  const rewardItem = primaryReward ? itemById.get(primaryReward.id) : null;
  const rewardImage = rewardItem?.imagePath ?? null;
  const imageLabel = rewardItem ? imageKindLabel(rewardItem.imageKind) : null;
  return (
    <div className="detail-content">
      <div className="detail-hero">
        <div className="detail-hero-visual">
          <ItemImage className="reward-hero" src={rewardImage} alt={primaryReward ? primaryName(primaryReward.name) : primaryName(trade.name)} />
          {imageLabel && <small className={`reference-badge ${rewardItem?.imageKind}`}>{imageLabel}</small>}
        </div>
        <div className="detail-heading">
          <h2>{primaryName(trade.name)}</h2>
          {secondaryName(trade.name) && <p>{secondaryName(trade.name)}</p>}
          <span className="category-chip">{categoryLabel(trade.category)}</span>
        </div>
      </div>

      <section className="detail-section">
        <div className="section-heading"><h3>需要上交</h3><span>{trade.requirements.length} 项</span></div>
        <div className="entry-list">
          {trade.requirements.length ? trade.requirements.map((entry) => (
            <EntryRow key={entry.id} entry={entry} isRequirement onClick={() => onItemClick(entry.id)} />
          )) : <p className="field-empty">暂无</p>}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>全部奖励</h3><span>{trade.rewards.length} 项</span></div>
        <div className="entry-list reward-list">
          {trade.rewards.length ? trade.rewards.map((entry) => (
            <EntryRow key={entry.id} entry={entry} isRequirement={false} onClick={() => onItemClick(entry.id)} />
          )) : <p className="field-empty">暂无</p>}
        </div>
      </section>

      <dl className="facts-grid">
        <div><dt>交易地点</dt><dd>{trade.station.zh || trade.station.en || "暂无"}</dd></div>
        <div><dt>最低声望</dt><dd>{reputationLabel(trade.minReputation)}</dd></div>
        <div><dt>声望增量</dt><dd>{trade.reputationGain === null ? "暂无" : `+${formatAmount(trade.reputationGain)}`}</dd></div>
        <div><dt>适用版本</dt><dd>{formatVersion(trade.gameVersion)}</dd></div>
      </dl>
    </div>
  );
}

function EntryRow({ entry, isRequirement, onClick }: {
  entry: TradeEntry;
  isRequirement: boolean;
  onClick: () => void;
}) {
  const item = itemById.get(entry.id);
  return (
    <button className="entry-row" type="button" onClick={onClick} aria-label={`${primaryName(entry.name)}，${formatAmount(entry.quantity)} ${entry.unit}，查看获取方式`}>
      <ItemImage className="entry-image" src={item?.imagePath} alt={primaryName(entry.name)} />
      <span className="entry-name"><strong>{primaryName(entry.name)}</strong>{secondaryName(entry.name) && <small>{secondaryName(entry.name)}</small>}</span>
      {isRequirement ? (
        <span className="entry-amount required">
          <strong>{formatAmount(entry.quantity)} {entry.unit}</strong>
          <small>上交数量</small>
        </span>
      ) : <span className="entry-amount reward"><strong>{formatAmount(entry.quantity)} {entry.unit}</strong><small>{entry.isBlueprint ? "蓝图奖励" : entry.isGameBound ? "游戏绑定" : "奖励"}</small></span>}
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

function ItemDialog({ item, onClose, onTradeClick }: {
  item: ItemRecord;
  onClose: () => void;
  onTradeClick: (id: string) => void;
}) {
  useEscape(onClose);
  const imageLabel = imageKindLabel(item.imageKind);
  const otherAcquisition = item.crafting ? item.acquisition.filter((method) => method.type !== "craft") : item.acquisition;
  const craftingUnlocks = (item.crafting?.unlocks ?? []).map((unlock) => {
    const tradeId = unlock.sourceUrl?.match(/\/missions\/([^/?#]+)/)?.[1] ?? "";
    return { ...unlock, trade: tradeById.get(tradeId) };
  }).filter((unlock) => unlock.trade);
  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal item-modal" role="dialog" aria-modal="true" aria-labelledby="item-title">
        <button className="modal-close" type="button" aria-label="关闭物品详情" onClick={onClose}><X /></button>
        <div className="item-modal-head">
          <div className="item-modal-visual">
            <ItemImage className="item-modal-image" src={item.imagePath} alt={primaryName(item.name)} />
            {imageLabel && <span className={`image-kind-badge ${item.imageKind}`}>{imageLabel}</span>}
          </div>
          <div>
            <span className="category-chip">{categoryLabel(item.category)}</span>
            <h2 id="item-title">{primaryName(item.name)}</h2>
            {secondaryName(item.name) && <p>{secondaryName(item.name)}</p>}
          </div>
        </div>

        <div className="item-modal-body">
          {item.descriptionZh && <p className="item-description">{cleanGameMarkup(item.descriptionZh.split("\n\n").slice(-1)[0])}</p>}
          {!item.crafting && <section>
            <h3>怎么获得</h3>
            {otherAcquisition.length ? (
              <div className="acquisition-list">
                {otherAcquisition.map((method, index) => (
                  <div className="acquisition" key={`${method.type}-${index}`}>
                    <span><CheckCircle2 size={16} />{method.label}</span>
                    <strong>{method.location || (method.price !== null ? `${formatAmount(method.price)} ${method.currency ?? ""}` : "具体地点暂无")}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="field-empty">暂无可靠的公开获取方式</p>}
          </section>}

          {item.crafting && (
            <section>
              <div className="section-heading"><h3>怎么获得</h3><span>按 2 步制作</span></div>
              <div className="crafting-card">
                <div className="crafting-step">
                  <span className="step-number">1</span>
                  <div className="crafting-step-content">
                    <strong>先解锁制作蓝图</strong>
                    {craftingUnlocks.length > 0 ? craftingUnlocks.map((unlock) => {
                      const unlockTrade = unlock.trade;
                      return unlockTrade ? (
                        <button className="crafting-unlock-trade" type="button" key={unlock.sourceUrl || unlock.title} onClick={() => onTradeClick(unlockTrade.id)}>
                          <span>完成交易：{primaryName(unlockTrade.name)}</span>
                          {secondaryName(unlockTrade.name) && <small>{secondaryName(unlockTrade.name)}</small>}
                          <ChevronRight size={15} />
                        </button>
                      ) : null;
                    }) : (
                      <small>完成游戏内对应的蓝图解锁任务</small>
                    )}
                  </div>
                </div>
                <div className="crafting-step crafting-step-materials">
                  <span className="step-number">2</span>
                  <div className="crafting-step-content">
                    <strong>准备材料并开始制作</strong>
                    <small>共 {item.crafting.ingredients.length} 种材料</small>
                  </div>
                </div>
                <div className="crafting-ingredients">
                  {item.crafting.ingredients.map((ingredient, index) => (
                    <div key={`${ingredient.id || ingredient.name.en}-${index}`}>
                      <span>{primaryName(ingredient.name)}{secondaryName(ingredient.name) && <small>{secondaryName(ingredient.name)}</small>}</span>
                      <strong>{formatAmount(ingredient.quantity)} {readableUnit(ingredient.unit)}</strong>
                    </div>
                  ))}
                </div>
                <div className="crafting-meta">
                  <span>{item.crafting.craftTimeSeconds ? `预计制作耗时：${item.crafting.craftTimeSeconds} 秒` : "制作时间暂无"}</span>
                </div>
              </div>
            </section>
          )}

          {item.crafting && otherAcquisition.length > 0 && (
            <section>
              <h3>其他获取方式</h3>
              <div className="acquisition-list">
                {otherAcquisition.map((method, index) => (
                  <div className="acquisition" key={`${method.type}-${index}`}>
                    <span><CheckCircle2 size={16} />{method.label}</span>
                    <strong>{method.location || (method.price !== null ? `${formatAmount(method.price)} ${method.currency ?? ""}` : "具体地点暂无")}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {item.requiredBy.length > 0 && (
            <section>
              <div className="section-heading"><div><h3>可用于哪些交易</h3><p>以下交易会消耗这个物品</p></div><span>{item.requiredBy.length} 笔交易</span></div>
              <div className="relation-list">
                {item.requiredBy.map((relation) => (
                  <button type="button" key={relation.tradeId} onClick={() => onTradeClick(relation.tradeId)}>
                    <span>{primaryName(relation.tradeName)}{secondaryName(relation.tradeName) && <small>{secondaryName(relation.tradeName)}</small>}</span>
                    <strong>需要 {formatAmount(relation.quantity)} {readableUnit(relation.unit)}</strong><ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.rewardedBy.length > 0 && (
            <section>
              <div className="section-heading"><div><h3>可以从哪些交易获得</h3><p>完成以下交易会获得这个物品</p></div><span>{item.rewardedBy.length} 笔交易</span></div>
              <div className="relation-list">
                {item.rewardedBy.map((relation) => (
                  <button type="button" key={relation.tradeId} onClick={() => onTradeClick(relation.tradeId)}>
                    <span>{primaryName(relation.tradeName)}{secondaryName(relation.tradeName) && <small>{secondaryName(relation.tradeName)}</small>}</span>
                    <strong>获得 {formatAmount(relation.quantity)} {readableUnit(relation.unit)}</strong><ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

      </section>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img src="/assets/gvy-logo.png" alt="星际远航者 GVY" />
        <span><strong>星际远航者</strong><small>GALACTIC VOYAGERS / GVY</small></span>
      </div>
      <p>玩家自建非商业资料站，数据仅供参考；非 Star Citizen 官方网站，相关名称、商标与素材归其权利方所有。</p>
      <div className="footer-filings">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">陕ICP备2026017597号-1</a>
        <i aria-hidden="true" />
        <a href="https://beian.mps.gov.cn/#/query/webSearch?code=61019702000690" target="_blank" rel="noreferrer">
          <img src="/assets/beian/beian.png" alt="" />
          陕公网安备61019702000690号
        </a>
      </div>
    </footer>
  );
}

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onEscape();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
