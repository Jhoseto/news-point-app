-- Preserve the existing OpenAI Sol choice; no provider activation or generation.
begin;
alter table smart_settings add column openai_model text not null default 'gpt-6.1-sol'
  check(openai_model in ('gpt-6.1-sol','gpt-6-luna'));
commit;
