-- membros_update_self (0002_rls.sql) só deixava cada membro editar a
-- própria linha. O sistema antigo tinha um botão de câmera (só Líder,
-- abrirCameraM) que troca a foto de QUALQUER membro -- a policy não
-- cobria isso. Substituída por uma que também libera liderança.
drop policy if exists membros_update_self on membros;

create policy membros_update_self_ou_lideranca on membros
  for update
  to authenticated
  using (id = auth_membro_id() or auth_e_lideranca())
  with check (id = auth_membro_id() or auth_e_lideranca());
