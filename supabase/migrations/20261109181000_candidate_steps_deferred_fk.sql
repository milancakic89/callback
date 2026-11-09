-- A fix to 20261109180000_candidate_steps.sql (features/candidate-steps.md), found by deleting a
-- throwaway employer account whose application was on a step: "Database error deleting user".
--
-- Deleting an account deletes its company, and the company's steps and jobs (and so the jobs'
-- applications) go in the same cascade. A foreign key that is checked at the end of each statement
-- looks at the step's deletion before the applications that point to it are gone, because those go
-- through the job, a separate step of the cascade, and refuses it. Deferred to the end of the
-- transaction, the check finds nothing pointing to the step any more.
--
-- It still refuses what it is there for: a step an application points to can't be deleted on its own
-- (save_company_steps() also refuses that, with `step_in_use`, before it gets here).

alter table public.job_applications
  drop constraint job_applications_step_id_fkey,
  drop constraint job_applications_candidate_step_id_fkey,
  add constraint job_applications_step_id_fkey
    foreign key (step_id) references public.company_steps (id) deferrable initially deferred,
  add constraint job_applications_candidate_step_id_fkey
    foreign key (candidate_step_id) references public.company_steps (id) deferrable initially deferred;
