-- Разрешаем авторизованным пользователям читать и изменять файлы только в своей папке бакета avatars.
-- Ожидаемый путь файла: <auth.uid()>/avatar.jpg

create policy if not exists "avatars_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and owner = auth.uid()
);

create policy if not exists "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and owner = auth.uid()
)
with check (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);
