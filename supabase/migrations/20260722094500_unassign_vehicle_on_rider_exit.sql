-- Ensure any rider moved to exited releases their assigned vehicle.
-- This protects direct admin status edits, bulk operations, scripts, and future APIs.

create or replace function public.prepare_rider_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'exited' and old.status is distinct from 'exited' then
    new.driver_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_rider_exit on public.riders;

create trigger trg_prepare_rider_exit
before update of status on public.riders
for each row
when (new.status = 'exited' and old.status is distinct from 'exited')
execute function public.prepare_rider_exit();

create or replace function public.unassign_vehicle_on_rider_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vehicles
     set assigned_rider_id = null,
         assigned_at = null
   where assigned_rider_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_unassign_vehicle_on_rider_exit on public.riders;

create trigger trg_unassign_vehicle_on_rider_exit
after update of status on public.riders
for each row
when (new.status = 'exited' and old.status is distinct from 'exited')
execute function public.unassign_vehicle_on_rider_exit();
