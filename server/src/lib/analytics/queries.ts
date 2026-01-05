export const CONVERSION_QUERY = `
with base as (
  select
    placement_id,
    variant_id,
    session_id,
    event_name,
    event_date as day
  from fact_events
  where app_id = ?
    and event_date >= ? and event_date <= ?
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
       coalesce(p.purchase_cnt, 0) as purchase_cnt,
       coalesce(cast(p.purchase_cnt as real) / nullif(e.enter_cnt, 0), 0) as conversion
from enter e
left join purchase p using(day, placement_id, variant_id)
order by e.day desc;
`;

export const SKU_CONVERSION_QUERY = `
select
  product_id,
  count(distinct case when event_name = 'PURCHASE_SUCCESS' then session_id end) as purchases,
  count(distinct case when event_name = 'PAYWALL_ENTER' then session_id end) as sessions,
  coalesce(
    cast(count(distinct case when event_name = 'PURCHASE_SUCCESS' then session_id end) as real) /
      nullif(count(distinct case when event_name = 'PAYWALL_ENTER' then session_id end), 0),
    0
  ) as conversion
from fact_events
where app_id = ?
  and event_date >= ? and event_date <= ?
group by product_id
order by conversion desc;
`;

export const GUIDE_COMPLETION_QUERY = `
with base as (
  select session_id, event_name
  from fact_events
  where app_id = ?
    and event_date >= ? and event_date <= ?
)
select
  count(distinct case when event_name = 'GUIDE_ENTER' then session_id end) as enter_cnt,
  count(distinct case when event_name = 'GUIDE_EXIT' then session_id end) as exit_cnt,
  coalesce(
    cast(count(distinct case when event_name = 'GUIDE_EXIT' then session_id end) as real) /
      nullif(count(distinct case when event_name = 'GUIDE_ENTER' then session_id end), 0),
    0
  ) as completion
from base;
`;
