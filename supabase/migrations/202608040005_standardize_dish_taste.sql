-- 口味特点只保存精确的标准标签，不在运行时代码中猜测复合词含义。
-- 这里仅统一分隔符、空格和标签顺序；无法精确匹配的历史值会中止迁移，等待人工确认。

update public.dishes
set taste = regexp_replace(
  regexp_replace(btrim(taste), '[[:space:]]*[,，、][[:space:]]*', '、', 'g'),
  '、+',
  '、',
  'g'
)
where taste <> '';

do $$
begin
  if exists (
    select 1
    from public.dishes as dish
    cross join lateral unnest(string_to_array(dish.taste, '、')) as tag(value)
    where dish.taste <> ''
      and tag.value <> all(array['清淡', '咸', '鲜', '香', '酸', '甜', '辣']::text[])
  ) then
    raise exception '存在无法精确匹配的历史口味，请先人工确认后再迁移';
  end if;
end;
$$;

with standardized as (
  select
    dish.id,
    string_agg(option.value, '、' order by option.position) as taste
  from public.dishes as dish
  cross join lateral unnest(
    array['清淡', '咸', '鲜', '香', '酸', '甜', '辣']::text[]
  ) with ordinality as option(value, position)
  where option.value = any(string_to_array(dish.taste, '、'))
  group by dish.id
)
update public.dishes as dish
set taste = standardized.taste
from standardized
where dish.id = standardized.id
  and dish.taste is distinct from standardized.taste;

create or replace function public.is_standard_dish_taste(value text)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select value = '' or (
    string_to_array(value, '、') <@ array['清淡', '咸', '鲜', '香', '酸', '甜', '辣']::text[]
    and cardinality(string_to_array(value, '、')) = (
      select count(distinct tag)
      from unnest(string_to_array(value, '、')) as tag
    )
    and string_to_array(value, '、') = array(
      select option
      from unnest(array['清淡', '咸', '鲜', '香', '酸', '甜', '辣']::text[])
        with ordinality as allowed(option, position)
      where option = any(string_to_array(value, '、'))
      order by position
    )
  );
$$;

alter table public.dishes
  drop constraint if exists dishes_taste_check;

alter table public.dishes
  add constraint dishes_taste_check
    check (public.is_standard_dish_taste(taste));
