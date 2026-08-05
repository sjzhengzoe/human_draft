-- Add afternoon tea as an optional meal period and ready-to-eat as a cooking
-- type. Existing rows remain valid, so no data backfill or deletion is needed.

do $$
begin
  if exists (
    select 1
    from public.dishes as dish
    where not dish.meal_periods <@ array[
      'breakfast', 'lunch', 'afternoon_tea', 'dinner'
    ]::text[]
  ) then
    raise exception '存在非标准适用餐次，请先人工确认后再迁移';
  end if;

  if exists (
    select 1
    from public.dishes as dish
    where not public.is_standard_menu_codes(
      dish.cooking_methods,
      array[
        'cooking_01', 'cooking_02', 'cooking_03', 'cooking_04', 'cooking_05'
      ]::text[]
    )
  ) then
    raise exception '存在非标准烹饪类型编码，请先人工确认后再迁移';
  end if;
end;
$$;

alter table public.dishes
  drop constraint if exists dishes_meal_periods_check,
  drop constraint if exists dishes_cooking_methods_check;

alter table public.dishes
  add constraint dishes_meal_periods_check check (
    cardinality(meal_periods) between 1 and 4
    and meal_periods <@ array[
      'breakfast', 'lunch', 'afternoon_tea', 'dinner'
    ]::text[]
  ),
  add constraint dishes_cooking_methods_check check (
    public.is_standard_menu_codes(
      cooking_methods,
      array[
        'cooking_01', 'cooking_02', 'cooking_03', 'cooking_04', 'cooking_05'
      ]::text[]
    )
  );

-- Preserve the current RPC bodies and only widen their enum validation. This
-- keeps the migration compatible with later fixes to the same functions.
do $$
declare
  function_signature regprocedure;
  function_definition text;
begin
  foreach function_signature in array array[
    to_regprocedure(
      'public.create_dish_at_end(uuid,uuid,text,text,uuid,uuid,text,text,text[],text[],text[],text,text[],text[],text[])'
    ),
    to_regprocedure(
      'public.create_menu_dish(uuid,uuid,uuid,text,uuid,text,text,text[],text[],text,text[],text[],text[])'
    )
  ]
  loop
    if function_signature is null then
      raise exception '菜品创建函数不存在，请先应用历史迁移';
    end if;

    select pg_get_functiondef(function_signature)
    into function_definition;

    function_definition := replace(
      function_definition,
      'cardinality(p_meal_periods) not between 1 and 3',
      'cardinality(p_meal_periods) not between 1 and 4'
    );
    function_definition := replace(
      function_definition,
      'array[''breakfast'', ''lunch'', ''dinner'']::text[]',
      'array[''breakfast'', ''lunch'', ''afternoon_tea'', ''dinner'']::text[]'
    );
    function_definition := replace(
      function_definition,
      'array[''cooking_01'', ''cooking_02'', ''cooking_03'', ''cooking_04'']::text[]',
      'array[''cooking_01'', ''cooking_02'', ''cooking_03'', ''cooking_04'', ''cooking_05'']::text[]'
    );

    if position('afternoon_tea' in function_definition) = 0
      or position('cooking_05' in function_definition) = 0
      or position('cardinality(p_meal_periods) not between 1 and 3' in function_definition) > 0
    then
      raise exception '菜品创建函数校验更新失败';
    end if;

    execute function_definition;
  end loop;
end;
$$;
