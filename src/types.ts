export type LocalizedName = {
  zh: string | null;
  en: string;
  localizationSource: string;
};

export type TradeEntry = {
  id: string;
  name: LocalizedName;
  quantity: number;
  unit: string;
  category: string;
  isBlueprint: boolean;
  isGameBound: boolean;
};

export type Trade = {
  id: string;
  debugName: string;
  name: LocalizedName;
  category: string;
  gameVersion: string;
  status: string;
  minReputation: string | null;
  reputationGain: number | null;
  station: { zh: string | null; en: string | null; status: string };
  requirements: TradeEntry[];
  rewards: TradeEntry[];
  hasBlueprint: boolean;
  sourceUrls: string[];
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  validationStatus: "verified" | "single_source" | "conflict" | "pending";
  conflicts: Array<{
    field: string;
    values: unknown[];
    sources: string[];
    note: string;
  }>;
};

export type TradeRelation = {
  tradeId: string;
  tradeName: LocalizedName;
  quantity: number;
  unit: string;
};

export type Acquisition = {
  type: string;
  label: string;
  location: string | null;
  price: number | null;
  currency: string | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
};

export type Crafting = {
  sourceUrl: string | null;
  gameVersion: string | null;
  craftTimeSeconds: number | null;
  ingredients: Array<{
    id: string | null;
    name: LocalizedName;
    quantity: number;
    unit: string;
    sourceUrl: string | null;
  }>;
  unlocks: Array<{
    title: string;
    sourceUrl: string | null;
  }>;
};

export type ItemRecord = {
  id: string;
  name: LocalizedName;
  category: string;
  descriptionZh: string | null;
  imagePath: string | null;
  imageSourceUrl: string | null;
  imageKind: "exact" | "base_model" | "community" | "none";
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  sourceGameVersion: string | null;
  isLootable: boolean | null;
  isCraftable: boolean | null;
  acquisition: Acquisition[];
  crafting: Crafting | null;
  requiredBy: TradeRelation[];
  rewardedBy: TradeRelation[];
};

export type Metadata = {
  gameVersion: string;
  generatedAt: string;
  totalTrades: number;
  totalItems: number;
  imageCoverage: number;
  localizationCoverage: number;
  validation: Record<string, number>;
  sources: Array<{
    url: string;
    status: string;
    updatedAt: string | null;
    checkedAt: string;
    note: string | null;
  }>;
  anomalies: string[];
  publishEligible: boolean;
  usageMode: string;
  sourceFingerprint?: string;
};
