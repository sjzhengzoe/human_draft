# 生活清单

> 项目状态：当前未上线、尚未正式发布。开发阶段不保留历史功能或数据格式的兼容层，完成有效业务数据迁移后直接删除旧表、旧字段和无入口代码。

生活清单与小红书模板、抖音模板、菜单同级，包括：

- 影视：电影、电视剧、动漫、动画、广播剧、小说；状态为想看、正在看、已阅；平台/来源支持多选；支持分类内自定义排序。正在看的分集作品可记录整部作品唯一的观看位置，列表与详情均可点击进度打开选集器；选集器默认按集数倒序并可切换正序，浏览其他季不会改变已记录位置，只有选中具体单集才会更新。作品列表分页加载，并支持按作品名进行服务端模糊搜索，例如“默”可以匹配“默读”。
- 分季内容：电视剧、动漫、动画、动画片、广播剧支持“作品 → 季/篇章 → 单集”层级；所有影视分类都可标记值得重温/重听。每个季/篇章显示自己的图片、集数和喜欢数，并可将该季图片设为作品封面，默认使用第一季图片。单集包含固定的整集概括，以及多条时间点记录；时间点可标记为普通剧情、关键剧情或语录，语录支持按说话人记录多人对话。喜欢标记在作品详情的单集列表中操作，并可按作品分类搜索喜欢的单集及其剧情记录。
- 活动：室内、户外、居家；顶部切换场景后以单卡左右滑动翻阅，记录名称，并可选填 4:3 封面和一句简介。页面首次加载一次取回三个场景并分类缓存，切换场景不重复请求；新增、编辑、删除和排序后在本地即时更新，并静默同步服务端数据。
- 行李：左侧为自定义场景，每个场景自动创建不可删除的“必备物品”层级，并可继续新增其他携带层级和物品。
- 吃什么：在“饮食记录”中统一记录居家菜品和外食店铺；外食店铺可补充推荐菜品。

菜单、观影、活动和行李数据均按微信账号隔离。登录账号只能读取、创建、编辑、排序和删除自己的数据。

原“外出吃饭”店铺已合并到“饮食记录”。菜单记录通过“在家 / 外食”区分：

- 在家记录保留菜品分类、图片和适用餐次。
- 外食记录以 `menu_places` 店铺为主，店内菜品统一通过 `dishes.place_id` 归属店铺；不再用一条同名菜品镜像店铺，也不再保留旧推荐菜品数组。

旧 `dining_places` 的 15 条记录已全部迁移到 `dishes` / `menu_places`，缺失数为 0。
`dining_places` 及 `dishes.source_dining_place_id` 已从开发数据库删除；
`dining_scenes` 仍作为外食分类的当前数据表，不属于兼容结构。对应的可重复执行清理迁移为：

`supabase/migrations/20260814105240_drop_legacy_dining_places.sql`

2026-08-14 的未上线清理已应用到开发数据库：

- 22 条与 `menu_places` 完全一致、且无日程或收藏引用的旧店铺镜像菜品已删除，菜品从 126 条归一为 104 条，34 个店铺及全部店内菜品关系不变。
- 删除 `menu_places.source_dish_id`、`dishes.recommended_items`、五张业务表的 `thumbnail_path`、`media_entries.is_revisitable`，五星评分 `personal_rating` 是唯一评分来源。
- 删除旧店铺同步触发器、3 个兼容同步函数和 19 个无用户参数的旧 RPC 重载；店铺改为直接写入 `menu_places`。
- 图片统一使用腾讯云私有 COS；Supabase Storage 的 6 个旧桶、1,374 个冗余对象和两个库存 RPC 已删除。`image_assets` 按对象记录归属、模块、字节和 MIME，图片空间接口只聚合当前用户台账，不再扫描 COS 或 Supabase Storage。
- 7 张仅存在于 Supabase 的有效衣橱图片已逐字节校验后补入 COS；177 个旧格式影视对象路径已归一到用户／条目目录。内容相同且归属同一影视条目的对象被合并，最终 471 个有效 COS 对象与数据库台账一一对应，缺失、孤儿和归属错误均为 0。
- 29 张现存表均有数据且启用 RLS；复核未发现孤儿记录、重复业务名称组、空表或重复索引。`anon` / `authenticated` 对 `public` schema 的表、序列和函数权限已撤销，业务数据库访问只由服务端 `service_role` 执行。

对应迁移为：

- `supabase/migrations/20260814105241_cleanup_prelaunch_redundancy.sql`
- `supabase/migrations/20260814110840_harden_public_schema_grants.sql`
- `supabase/migrations/20260814111657_scope_private_image_inventory.sql`
- `supabase/migrations/20260814111845_fix_set_updated_at_search_path.sql`
- `supabase/migrations/20260814120830_cos_image_assets.sql`

“本周菜单”复用已有菜品和店铺，可以按日、周、月、年安排早餐、午餐、下午茶和晚餐。菜品或店铺存在时，菜单实时读取其最新名称和图片；删除被菜单引用的菜品或店铺时，系统会复制独立的历史图片并保留名称快照，再断开原记录引用。每餐默认三个可增减档位；日视图支持保留锁定项后随机菜单。菜单选择复用“我的菜单”速览结构，并提供全菜单搜索、常吃清单和菜篮子。排行榜按周、月、年统计截至当天的记录：在家菜品按菜品统计，外食店内菜品统一归入所属店铺，同一餐同一家店只计一次。

本周菜单、排行榜和常吃清单需要执行：

`supabase/migrations/202608100001_menu_schedule.sql`

本周菜单实时引用与删除归档还需要继续执行：

`supabase/migrations/202608120001_menu_schedule_live_references.sql`

菜单餐次和在家/外食合并需要依次执行：

`supabase/migrations/202607300001_dish_meal_periods.sql`

`supabase/migrations/202607300002_unified_menu_records.sql`

`supabase/migrations/202607300003_outside_menu_categories.sql`

上线前在 Supabase SQL Editor 执行：

`supabase/migrations/202607110003_life_lists.sql`

活动卡片封面与一句简介还需要继续执行：

`supabase/migrations/202608090002_activity_cards.sql`

为现有活动补齐首批一句简介还需要继续执行：

`supabase/migrations/202608090003_activity_introductions.sql`

分季与单集功能还需要继续执行：

`supabase/migrations/202607120005_media_seasons_and_episodes.sql`

季封面功能还需要继续执行：

`supabase/migrations/202607120006_media_season_covers.sql`

平台/来源必填及单集时间点记录还需要继续执行：

`supabase/migrations/202607130001_required_media_platforms.sql`

`supabase/migrations/202607130002_media_episode_timeline_notes.sql`

时间点类型、多人语录及语录关键词搜索还需要继续执行：

`supabase/migrations/202607140001_media_timeline_note_types.sql`
