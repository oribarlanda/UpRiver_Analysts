-- Optional seed data: an example week with sample preferences.
-- Adjust the week_start date to a real upcoming Sunday before running,
-- or leave as-is for a quick demo.

insert into weeks (week_start, status, premium_days)
values ('2026-08-02', 'open', '{5,6}')
on conflict (week_start) do nothing;

-- Sample preferences for the demo week above.
with w as (select id from weeks where week_start = '2026-08-02')
insert into preferences (week_id, employee, day_index, shift_type, preference)
select w.id, v.employee, v.day_index, v.shift_type, v.preference
from w, (values
  ('hila', 0, 'morning', 'want'),
  ('hila', 0, 'afternoon', 'can'),
  ('hila', 0, 'evening', 'prefer_not'),
  ('hila', 1, 'morning', 'can'),
  ('hila', 5, 'evening', 'cannot'),
  ('yaara', 0, 'morning', 'can'),
  ('yaara', 0, 'afternoon', 'want'),
  ('yaara', 0, 'evening', 'can'),
  ('yaara', 5, 'evening', 'want'),
  ('yaara', 6, 'morning', 'prefer_not'),
  ('omer', 0, 'morning', 'prefer_not'),
  ('omer', 0, 'afternoon', 'can'),
  ('omer', 0, 'evening', 'want'),
  ('omer', 5, 'evening', 'can'),
  ('omer', 6, 'morning', 'want')
) as v(employee, day_index, shift_type, preference)
on conflict (week_id, employee, day_index, shift_type) do nothing;
