# 分析 SQL 模板

## 按 placement/variant 的付费转化率
```sql
with base as (
  select
    payload->>'placement_id' as placement_id,
    payload->>'variant_id' as variant_id,
    payload->>'session_id' as session_id,
    event_name,
    created_at::date as day
  from events
  where app_id = :app_id
    and created_at >= :from and created_at < :to
),
enter as (
  select day, placement_id, variant_id, count(distinct session_id) as enter_cnt
  from base
  where event_name = 'PAYWALL_ENTER'
  group by day, placement_id, variant_id
),
purchase as (
  select day, placement_id, variant_id, count(distinct session_id) as purchase_cnt
  from base
  where event_name = 'PURCHASE_SUCCESS'
  group by day, placement_id, variant_id
)
select e.day, e.placement_id, e.variant_id,
       e.enter_cnt,
       coalesce(p.purchase_cnt,0) as purchase_cnt,
       coalesce(p.purchase_cnt::float / nullif(e.enter_cnt,0),0) as conversion
from enter e
left join purchase p using(day, placement_id, variant_id)
order by e.day desc;
```

## SKU 转化率
```sql
select
  payload->>'product_id' as product_id,
  count(distinct payload->>'session_id') filter (where event_name='PURCHASE_SUCCESS') as purchases,
  count(distinct payload->>'session_id') filter (where event_name='PAYWALL_ENTER') as sessions,
  count(distinct payload->>'session_id') filter (where event_name='PURCHASE_SUCCESS')::float /
    nullif(count(distinct payload->>'session_id') filter (where event_name='PAYWALL_ENTER'),0) as conversion
from events
where app_id = :app_id
  and created_at >= :from and created_at < :to
group by product_id
order by conversion desc;
```

## 引导页完成率
```sql
with base as (
  select payload->>'session_id' as session_id, event_name
  from events
  where app_id = :app_id
    and created_at >= :from and created_at < :to
)
select
  count(distinct session_id) filter (where event_name='GUIDE_ENTER') as enter_cnt,
  count(distinct session_id) filter (where event_name='GUIDE_EXIT') as exit_cnt,
  count(distinct session_id) filter (where event_name='GUIDE_EXIT')::float /
    nullif(count(distinct session_id) filter (where event_name='GUIDE_ENTER'),0) as completion
from base;
```
