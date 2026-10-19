-- Étape 13 (partie E, correctifs) : rappels de la veille.
-- 1. Message au patient : un rendez-vous discret dit « (Consultation) », exactement comme
--    une vraie consultation ; l'absence de parenthèses le trahissait.
-- 2. appointments_to_remind renvoie le sexe du patient : « Téléphone de la patiente » ou
--    « du patient » selon le sexe.

-- 1. Libellé montré au patient ------------------------------------------------------------

create or replace function public.appointment_patient_label(p_appointment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.type = 'clinique' then 'votre rendez-vous à la clinique'
              else 'votre rendez-vous au poste de santé' end
         || ' (' || case when t.is_discreet then 'Consultation' else t.label end || ')'
    from public.appointments a
    join public.appointment_types t on t.id = a.appointment_type_id
    join public.organizations o on o.id = a.org_id
   where a.id = p_appointment_id;
$$;


-- 2. Rappels : sexe du patient ------------------------------------------------------------

drop function public.appointments_to_remind(uuid, date);

-- Rendez-vous à rappeler (demain par défaut). Un rendez-vous discret n'y figure que sur
-- le téléphone de la patiente elle-même (appointment_reminder_allowed). patient_label :
-- message destiné au patient, jamais le nom d'un type discret.
create function public.appointments_to_remind(p_org_id uuid, p_date date default null)
returns table (
  appointment_id        uuid,
  patient_id            uuid,
  patient_last_name     text,
  patient_first_name    text,
  patient_sex           text,
  file_number           text,
  phone                 text,
  phone_owner           text,
  whatsapp_consent      boolean,
  preferred_language    text,
  starts_at             timestamptz,
  status                text,
  type_label            text,
  is_discreet           boolean,
  patient_label         text,
  practitioner_name     text,
  reminder_sent_at      timestamptz,
  reminder_done_at      timestamptz,
  reminder_done_by_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_discret boolean := public.appointments_can_see_discreet(p_org_id);
begin
  if not public.appointments_can_read(p_org_id) then
    raise exception 'Votre rôle ne permet pas de consulter l''agenda.' using errcode = '42501';
  end if;
  return query
    select a.id, a.patient_id, p.last_name, p.first_name, p.sex::text, p.file_number, p.phone,
           p.phone_owner, p.whatsapp_consent, p.preferred_language, a.starts_at, a.status,
           public.appointment_type_label_for_viewer(a.appointment_type_id),
           t.is_discreet and v_discret, public.appointment_patient_label(a.id),
           case when a.practitioner_membership_id is not null
                then public.membership_display_name(a.practitioner_membership_id) end,
           a.reminder_sent_at, a.reminder_done_at,
           case when a.reminder_done_by is not null
                then coalesce((select nullif(btrim(pr.full_name), '') from public.profiles pr
                                where pr.id = a.reminder_done_by), 'Membre sans nom') end
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      join public.appointment_types t on t.id = a.appointment_type_id
     where a.org_id = p_org_id and a.deleted_at is null
       and a.status in ('scheduled', 'confirmed')
       and a.local_date = coalesce(p_date, public.org_local_date(p_org_id) + 1)
       and public.appointment_reminder_allowed(a.id)
     order by a.starts_at, p.last_name, p.first_name;
end;
$$;

revoke execute on function public.appointments_to_remind(uuid, date)
  from public, anon, authenticated;
grant execute on function public.appointments_to_remind(uuid, date) to authenticated;
