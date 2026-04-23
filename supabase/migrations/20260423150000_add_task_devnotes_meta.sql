alter table public.tasks
add column if not exists devnotes_meta text;

update public.tasks
set
  devnotes_meta = coalesce(
    nullif(btrim(devnotes_meta), ''),
    substring(description from '(\[DEVNOTES_META:[^]]+\])')
  ),
  description = nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            coalesce(description, ''),
            '\[DEVNOTES_META:[^]]+\]',
            '',
            'g'
          ),
          E'[ \t]+\n',
          E'\n',
          'g'
        ),
        E'\n{3,}',
        E'\n\n',
        'g'
      )
    ),
    ''
  )
where coalesce(description, '') ~ '\[DEVNOTES_META:[^]]+\]';
