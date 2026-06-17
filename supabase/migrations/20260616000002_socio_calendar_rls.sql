-- Migration: 20260616000002_socio_calendar_rls
-- Permite a socios leer eventos y resultados para el calendario público del club.

-- Socios pueden ver todos los eventos (partidos públicos del club)
CREATE POLICY "eventos_select_socio"
  ON eventos FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'socio');

-- Socios pueden ver todos los resultados
CREATE POLICY "resultados_select_socio"
  ON resultados FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'socio');
