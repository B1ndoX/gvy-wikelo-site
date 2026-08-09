# GVY 维科洛交易查询站

面向《星际公民》中文玩家的维科洛合同查询工具。第一屏就是可用的搜索、分类、筛选和交易卡片网格；合同直接展示真实奖励图、所需材料与精确数量，点击任一材料即可查看获取方式。数据随站点离线提供，不需要账号，也不会上传个人数据。

当前数据：`4.9.0 LIVE.12344265`，87 笔交易，268 个需求/奖励/蓝图条目。数据版本与数量以 `src/data/generated/metadata.json` 为准。

当前公开内容审计：87 / 87 个合同与 268 / 268 个物品均有可靠显示名；119 / 119 种上交材料均有带来源的获取说明；222 / 268 个条目已有可追踪本地实图，其中上交材料为 90 / 119。其余 29 种上交材料保持明确无图状态，禁止用错图或生成图补位。

## 项目边界与正式配置

- 唯一项目目录：`/Users/bindox/Documents/Codex/Projects/starcitizen-crawler/gvy-wikelo-site`
- GitHub 仓库：`B1ndoX/gvy-wikelo-site`
- 正式域名：`https://wikelo.gvyvoyagers.vip`
- EdgeOne 项目：`gvy-wikelo-site`
- 舰队官网：`https://www.gvyvoyagers.vip`
- 蓝图查询站：`https://lantu.gvyvoyagers.vip`

本项目不得修改 `gvy-lantu-site`、`gvy-official-site` 或旧 `blueprint-site`。蓝图站只可作为只读设计与部署参考。正式发布只走腾讯云 EdgeOne Pages / Makers，禁止启用 GitHub Pages，禁止修改其他项目 DNS。

未经用户明确说“可以部署”，只能本地预览；不得 commit、push 或部署。获批后，推送前必须先 `git fetch` 并整合远端自动刷新产生的数据，禁止用陈旧本地数据覆盖远端。

## 本地运行

需要 Node.js >= 22.12。EdgeOne 当前固定使用其受支持的 Node.js `22.21.1`（见 `edgeone.json`）。

```bash
npm install
npm run dev
```

默认本地地址：`http://localhost:4173/`。

常用命令：

```bash
npm test                 # 固定 fixture、汉化、查询交互与生成数据回归测试
npm run audit:data       # 全站公开文字、汉化、获取途径和图片路径审计
npm run lint:data        # Schema 和异常校验
npm run build            # TypeScript + Vite 生产构建
npm run refresh:data     # 手动刷新到稳定数据
npm run localization:derive # 官方 global.ini 变化后更新项目派生快照
npm run restore:data     # 只读列出备份；恢复时必须显式跟目录名
```

## 数据刷新安全链路

`npm run refresh:data` 依次执行：

1. 限速、带超时/重试/缓存地读取公开来源；
2. 从公开 JS 数据字面量安全解析 staging 数据，不执行远端代码；
3. 标准化合同、x/SCU 单位、多奖励和蓝图；
4. 解析官方简体中文 `global.ini` 并生成派生词典；
5. 严格 JSON Schema 校验每个独立 LIVE/PTU 版本快照；
6. 来源交叉校验，保留全部冲突原值；
7. 按本周实际抓取结果隔离合并 LIVE/PTU，并删除本周已不存在的 PTU；
8. 检测交易数骤降、版本倒退、关键奖励缺失和汉化覆盖率骤降；
9. 备份上一版稳定数据，再用 `.next` 原子替换；
10. 清理超过 14 天的备份。

任一步失败都不会覆盖稳定数据。输入数据、官方汉化哈希和来源版本均未改变时，脚本输出 `unchanged: true`，不改生成文件、不新增备份。发布前额外运行 `npm run refresh:data:publish-check`；来源为 `partial` / `failed` 或出现异常时会阻止发布。人工核验并注明日期的 Wiki 快照只作为背景与地点参考，不会伪装成实时结构化接口。

项目内已准备 `.github/workflows/refresh-data.yml`：每周一 01:00（Asia/Shanghai）在 GitHub Actions 中刷新，先 fetch/rebase 远端，再执行刷新、内容审计、测试、Schema 校验和构建，并保存 14 天稳定数据备份。该工作流不含 GitHub Pages，只服务 EdgeOne 的仓库连接。

稳定数据位于 `src/data/generated/`；备份位于未提交的 `data/backups/`；HTTP 缓存位于未提交的 `.cache/`。

## 官方简体中文

最高优先级只读源：

`/Users/bindox/Documents/data/localization/chinese_(simplified)/global.ini`

解析器处理 UTF-8 BOM、CRLF、注释、空行，并只在第一个 `=` 处分割键值。项目只提交实际需要的官方派生快照 `data/localization/official-global-derived.json`，远端 GitHub Runner 无法访问本机源文件时必须只读使用该快照；快照覆盖交易、上交物、奖励和制作配方材料。`src/data/generated/localization.json` 记录最终物品词典及源路径、SHA-256、源更新时间和生成时间。源哈希与词典内容不变时不会无意义重建。

中文优先级：官方 `global.ini` → 用户确认人工修订 → 已校准公民中文 → 英文原名。解析器会同时按内部标识、已核验键别名和官方英文原名精确匹配；合同标题只使用显式核验过的官方键，不做模糊猜测。当前 268 个物品中 259 个有官方中文，另 9 个 ASD 重组样本的官方名称本身就是 `RCMBNT-*` 代码；87 个合同标题全部命中官方条目。没有可靠中文时直接显示英文，禁止机器翻译和虚构名称。完整勋章家族、北极星点数、遗物碎片、ATLS 三款改装、蓝月菌、SCU 商品和官方配方标题均已按内部 ID 校准。

## 页面与备案信息

- 桌面端按 4 / 3 / 2 列自适应展示交易卡片，手机端为单列；每张卡直接列出全部材料，不再用“还有 N 项”隐藏；材料正文使用 14px，数量和单位保持同一行；
- 页头在 2560、1920、1440、768、390 与 320 像素宽度下自然重排；舰队官网与蓝图站使用 GVY 金色重点按钮，手机端仍保持可见；
- 每个材料标签、详情材料行和奖励行都可以点击；弹窗用“怎么获得 → 解锁蓝图 → 准备材料 → 可用于哪些交易”的顺序说明用途，显示真实图片、官方中英文名称及精确数量；
- 普通页面不显示交叉校验、单一来源、内部任务占位、抓取状态、物品资料源版本等维护信息，也不提供图片/数据/配方来源外链；这些审计字段与 URL 只保留在离线数据和接手文档中；
- 页面外链仅保留舰队官网、蓝图站，以及页脚法定的 ICP/公安备案查询链接；
- 页面不再显示占据内容区的“数据说明”细条；版本与来源记录保留在项目数据和接手文档中，不向普通查询流程暴露内部刷新细节；
- 页脚沿用 GVY 统一品牌与免责声明，并保留 `陕ICP备2026017597号-1`、`陕公网安备61019702000690号` 及公安备案图标；
- 页脚备案链接分别指向工信部和公安部备案查询页。

## 图片政策

- 合同奖励图来自用户指定的 Star Citizen Wiki 公开页面，并记录原始 URL；
- 物品图与获取资料来自 Star Citizen Wiki 公共 API；
- SC Market 的公开游戏数据 API 用于版本和蓝图配方二次校验；玩家挂单价格不写入固定的维科洛兑换配方；
- UEX 的公开索引结果只作人工二次核对。其 robots.txt 明确禁止 GPTBot 且物品页受 Cloudflare 保护，因此刷新器不自动抓取、不绕过访问限制；
- Wiki 物品页没有图片时，可以使用 RSI Community Hub、公开论坛或玩家社区中能明确对应具体物品的实拍；此类图片必须标为“玩家社区实拍”，并保留帖子来源；
- 社区图片只用于补充展示，不参与合同字段、数量、版本或获取方式的事实判定；
- `public/images/wikelo.webp` 是 Wiki 页面中的游戏内维科洛实景截图；
- 公开媒体服务器拒绝脚本访问时，只能通过普通浏览器页面加载后导入已经公开呈现的资源，不得绕过 WAF；
- 没有可靠实图时显示统一占位图标，绝不使用 AI 图或其他物品图片冒充。

当前 222 / 268 个条目有可追踪的本地实图，119 种上交材料中有 90 种实图。六排勋章、政府制图局勋章、ASD 安全驱动器、维科洛货币、Yormandi 部位、Vanduul 材料、ATLS、Parallax、Quartz、Fresnel 及多种货运矿物等高频条目均已固定到公开资料页中的精确图片；ATLS 冷铁另使用 RSI Community Hub 中标题明确对应该特别版的玩家实拍。`Carinite (Pure)` 暂使用明确标为“基础型号参考图”的 Carinite 图片；刷新失败时不会被占位图覆盖。剩余 29 种上交材料没有找到可核验实图，内容审计会持续列出其 ID，更新时只接受能够确认具体型号的公开图片。

## PTU / LIVE 版本策略

版本筛选只展示本周从指定抓取站实际读取并完整保存的维科洛交易数据集，不会因为游戏客户端开放 PTU 就把 4.9 合同改标签冒充 4.10。LIVE 与 PTU/EPTU 使用相互隔离的交易和物品快照：PTU 只能修改 PTU，不能覆盖 LIVE；本周来源没有 PTU 兑换表就删除旧 PTU 选项；新的 LIVE 数据集只更新 LIVE。当前 Dumper's Repo 仍明确发布 `4.9.0 LIVE.12344265` 的 87 笔维科洛交易，没有 4.10 PTU 维科洛表，因此页面只显示 `4.9.0 LIVE`。

## 目录说明

```text
data/schema/                 严格交易 JSON Schema
data/source-snapshots/       人工核验的 Wiki 摘要与图片 URL 映射
scripts/                     抓取、规范化、校验、导入和恢复
src/data/generated/          可离线使用的稳定数据与派生汉化
public/images/               项目实际需要的维科洛/物品/奖励实图
tests/fixtures/              固定来源 fixture
tests/                       数据、本地化与查询交互回归测试
```

更完整的来源矩阵、字段含义、发布门禁和接手检查见 [维科洛站相关.md](./维科洛站相关.md)。

## 正式部署状态

- 正式站：<https://wikelo.gvyvoyagers.vip>
- GitHub：<https://github.com/B1ndoX/gvy-wikelo-site>
- EdgeOne Makers 项目：`gvy-wikelo-site`，生产分支 `main`，构建输出 `dist`
- DNS：仅新增 `wikelo` CNAME，指向 `wikelo.gvyvoyagers.vip.pages.dnsoe4.com`
- HTTPS：EdgeOne 免费证书已部署并自动续期；HTTP 使用 301 跳转 HTTPS
- 传输安全：HSTS 为 365 天，不包含子域名且未加入 preload；OCSP 装订已开启
- 首次正式部署提交：`807d33c`

正式域名已核验返回 87 笔交易与 `4.9.0 LIVE` 数据；桌面与 390×844 手机视口均无页面级横向溢出，已加载图片无损坏，材料检索与获取方式弹窗正常，浏览器控制台无 error 或 warning。GitHub Pages 未启用。
