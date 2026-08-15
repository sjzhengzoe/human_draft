-- Cover every foreign key in its declared column order. These tables are small
-- today, but the indexes also keep future cascade checks and joins bounded.

create index if not exists dishes_category_uid_fk_idx
  on public.dishes(category_id, uid);

create index if not exists dishes_outside_category_uid_fk_idx
  on public.dishes(outside_category_id, uid);

create index if not exists dishes_place_uid_fk_idx
  on public.dishes(place_id, uid);

create index if not exists luggage_groups_scene_uid_fk_idx
  on public.luggage_groups(scene_id, uid);

create index if not exists luggage_items_group_uid_fk_idx
  on public.luggage_items(group_id, uid);

create index if not exists media_episodes_season_uid_fk_idx
  on public.media_episodes(season_id, uid);

create index if not exists media_seasons_entry_uid_fk_idx
  on public.media_seasons(media_entry_id, uid);

create index if not exists media_seasons_uid_fk_idx
  on public.media_seasons(uid);

create index if not exists menu_places_outside_category_uid_fk_idx
  on public.menu_places(outside_category_id, uid);

create index if not exists menu_schedule_items_meal_uid_fk_idx
  on public.menu_schedule_items(meal_id, uid);

create index if not exists user_chat_topics_official_topic_fk_idx
  on public.user_chat_topics(official_topic_id);

create index if not exists user_hidden_official_topics_topic_fk_idx
  on public.user_hidden_official_chat_topics(official_topic_id);

create index if not exists wardrobe_items_category_uid_fk_idx
  on public.wardrobe_items(category_id, uid);
