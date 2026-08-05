# 生活清单

生活清单与小红书模板、抖音模板、菜单同级，包括：

- 影视：电影、电视剧、动漫、动画、广播剧、小说；状态为想看、正在看、已阅；平台/来源必填并支持多选，不确定时可选择“待定”；支持分类内自定义排序。作品列表按 20 条分页加载，并支持按作品名进行服务端模糊搜索，例如“默”可以匹配“默读”。
- 分季内容：电视剧、动漫、动画、动画片、广播剧支持“作品 → 季/篇章 → 单集”层级；所有影视分类都可标记值得重温/重听。每个季/篇章显示自己的图片、集数和喜欢数，并可将该季图片设为作品封面，默认使用第一季图片。单集包含固定的整集概括，以及多条时间点记录；时间点可标记为普通剧情、关键剧情或语录，语录支持按说话人记录多人对话。喜欢标记在作品详情的单集列表中操作，并可按作品分类搜索喜欢的单集及其剧情记录。
- 活动：室内、户外、居家，仅记录文字项目。
- 行李：左侧为自定义场景，每个场景自动创建不可删除的“必备物品”层级，并可继续新增其他携带层级和物品。
- 吃什么：在“饮食记录”中统一记录居家菜品和外食店铺；外食店铺可补充推荐菜品。

菜单、观影、活动和行李数据均按微信账号隔离。登录账号只能读取、创建、编辑、排序和删除自己的数据。

原“外出吃饭”店铺已合并到“饮食记录”。菜单记录通过“在家 / 外食”区分：

- 在家记录保留菜品分类、图片和适用餐次。
- 外食记录以店铺为主标题，保留图片、适用餐次和推荐菜品。

菜单餐次和在家/外食合并需要依次执行：

`supabase/migrations/202607300001_dish_meal_periods.sql`

`supabase/migrations/202607300002_unified_menu_records.sql`

`supabase/migrations/202607300003_outside_menu_categories.sql`

上线前在 Supabase SQL Editor 执行：

`supabase/migrations/202607110003_life_lists.sql`

分季与单集功能还需要继续执行：

`supabase/migrations/202607120005_media_seasons_and_episodes.sql`

季封面功能还需要继续执行：

`supabase/migrations/202607120006_media_season_covers.sql`

平台/来源必填及单集时间点记录还需要继续执行：

`supabase/migrations/202607130001_required_media_platforms.sql`

`supabase/migrations/202607130002_media_episode_timeline_notes.sql`

时间点类型、多人语录及语录关键词搜索还需要继续执行：

`supabase/migrations/202607140001_media_timeline_note_types.sql`
