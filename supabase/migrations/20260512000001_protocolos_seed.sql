-- Migration: protocolos_seed
-- Datos iniciales: 4 protocolos de lesión + 6 etapas GRTP

-- ── Variables de trabajo (UUIDs fijos para referencia cruzada) ─────────────────

DO $$
DECLARE
  p_conmocion      uuid := '00000001-0000-0000-0000-000000000001';
  p_columna        uuid := '00000001-0000-0000-0000-000000000002';
  p_tejidos        uuid := '00000001-0000-0000-0000-000000000003';
  p_sangrado       uuid := '00000001-0000-0000-0000-000000000004';
BEGIN

-- ── 1. CONMOCIÓN CEREBRAL ──────────────────────────────────────────────────────

INSERT INTO public.protocolos_lesion
  (id, tipo, grado, titulo, descripcion, retiro_inmediato, notas_uar, disponible_offline)
VALUES (
  p_conmocion,
  'conmocion',
  5,
  'Reconocer y Retirar',
  'Lesión cerebral traumática funcional. En rugby comunitario, juvenil e infantil el HIA no está permitido — el retiro es definitivo y permanente.',
  true,
  'Mínimo 21 días de ausencia según UAR. Tarjeta Azul = retiro permanente sin posibilidad de retorno.',
  true
);

INSERT INTO public.protocolo_pasos (protocolo_id, orden, titulo, descripcion, es_critico) VALUES
  (p_conmocion, 1, 'Método SAFE', 'Shout, Assess, Free from danger, Evaluate', true),
  (p_conmocion, 2, 'Evaluación ABC', 'Evaluar vía aérea, respiración y circulación', false),
  (p_conmocion, 3, 'Retiro inmediato del campo', 'Retirar al jugador del campo de juego de forma inmediata', true),
  (p_conmocion, 4, 'No mover si hay sospecha espinal', 'Si hay sospecha de lesión en columna, no mover al jugador', false),
  (p_conmocion, 5, 'Notificar al médico del partido', 'Informar al médico o responsable médico presente en el partido', false);

INSERT INTO public.protocolo_alertas (protocolo_id, descripcion, es_criterio1) VALUES
  (p_conmocion, 'Pérdida confirmada o sospechada del conocimiento', true),
  (p_conmocion, 'Convulsiones después del contacto', true),
  (p_conmocion, 'Postura tónica o rigidez muscular anormal', true),
  (p_conmocion, 'Ataxia o problemas evidentes de equilibrio y coordinación', true),
  (p_conmocion, 'Confusión clara o cambios en el comportamiento', true);

-- ── 2. LESIÓN DE COLUMNA / CUELLO ─────────────────────────────────────────────

INSERT INTO public.protocolos_lesion
  (id, tipo, grado, titulo, descripcion, retiro_inmediato, notas_uar, disponible_offline)
VALUES (
  p_columna,
  'columna',
  5,
  'Estabilización Espinal — Máximo Riesgo',
  'Tratar como fractura vertebral hasta descartarla. Solo personal con certificación en Atención Inmediata en Rugby puede mover al jugador.',
  true,
  NULL,
  true
);

INSERT INTO public.protocolo_pasos (protocolo_id, orden, titulo, descripcion, es_critico) VALUES
  (p_columna, 1, 'Técnica MILS', 'Mantener cabeza y cuello en posición neutra, sin rotación ni flexión', true),
  (p_columna, 2, 'No mover al jugador', 'No mover al jugador ni retirar protector bucal si está consciente', false),
  (p_columna, 3, 'Asegurar vía aérea', 'Asegurar que la vía aérea esté despejada', false),
  (p_columna, 4, 'Esperar personal médico certificado', 'Aguardar a personal médico con certificación en Atención Inmediata en Rugby', false),
  (p_columna, 5, 'Tabla espinal + collar', 'Usar tabla espinal y collar tipo Filadelfia para el traslado', false);

INSERT INTO public.protocolo_alertas (protocolo_id, descripcion, es_criterio1) VALUES
  (p_columna, 'Dolor de cuello post-impacto', false),
  (p_columna, 'Hormigueo en extremidades', false),
  (p_columna, 'Pérdida de sensibilidad', false),
  (p_columna, 'Incapacidad de movimiento voluntario', false);

-- ── 3. TEJIDOS BLANDOS ────────────────────────────────────────────────────────

INSERT INTO public.protocolos_lesion
  (id, tipo, grado, titulo, descripcion, retiro_inmediato, notas_uar, disponible_offline)
VALUES (
  p_tejidos,
  'tejidos_blandos',
  2,
  'Protocolo RICE',
  'Esguinces de ligamentos y desgarros musculares. Manejo inicial adecuado puede reducir el tiempo de inactividad de semanas a días.',
  false,
  NULL,
  true
);

INSERT INTO public.protocolo_pasos (protocolo_id, orden, titulo, descripcion, es_critico) VALUES
  (p_tejidos, 1, 'Rest', 'Reposo inmediato de la zona afectada', false),
  (p_tejidos, 2, 'Ice', 'Hielo 20 minutos cada 2 horas durante 48hs, proteger la piel', false),
  (p_tejidos, 3, 'Compression', 'Aplicar vendaje compresivo en la zona afectada', false),
  (p_tejidos, 4, 'Elevation', 'Elevar la zona afectada por encima del nivel del corazón', false);

-- Alertas HARM (a evitar las primeras 72hs)
INSERT INTO public.protocolo_alertas (protocolo_id, descripcion, es_criterio1) VALUES
  (p_tejidos, 'Heat — calor aumenta el edema', false),
  (p_tejidos, 'Alcohol — incrementa la hinchazón', false),
  (p_tejidos, 'Running — puede agravar la rotura fibrilar', false),
  (p_tejidos, 'Massage — puede provocar hemorragias adicionales', false);

-- ── 4. SANGRADO ────────────────────────────────────────────────────────────────

INSERT INTO public.protocolos_lesion
  (id, tipo, grado, titulo, descripcion, retiro_inmediato, notas_uar, disponible_offline)
VALUES (
  p_sangrado,
  'sangrado',
  2,
  'Control de Heridas Sangrantes',
  'Retiro obligatorio. Si se controla y cubre en menos de 1 minuto puede regresar. Uso obligatorio de guantes clínicos.',
  true,
  NULL,
  true
);

INSERT INTO public.protocolo_pasos (protocolo_id, orden, titulo, descripcion, es_critico) VALUES
  (p_sangrado, 1, 'Retirar al jugador del campo', 'Retirar al jugador de forma inmediata', true),
  (p_sangrado, 2, 'Usar guantes clínicos', 'Usar guantes clínicos de forma obligatoria antes de cualquier intervención', false),
  (p_sangrado, 3, 'Controlar el sangrado', 'Aplicar gasa estéril con presión directa sobre la herida', false),
  (p_sangrado, 4, 'Si se controla en menos de 1 minuto', 'Cubrir la herida adecuadamente — el jugador puede regresar al campo', false),
  (p_sangrado, 5, 'Si no se controla', 'Sustitución definitiva del jugador', false);

END $$;

-- ── 6 Etapas GRTP (fuera del bloque DO para claridad) ─────────────────────────

INSERT INTO public.grtp_etapas
  (numero, titulo, descripcion, duracion_minima_horas_adultos, duracion_minima_horas_menores)
VALUES
  (1, 'Reposo absoluto',
   'Reposo físico y cognitivo. Sin pantallas, sin lectura, sin conducción.',
   24, 48),
  (2, 'Actividades diarias sin síntomas',
   'Actividades de la vida diaria que no provoquen síntomas.',
   24, 48),
  (3, 'Ejercicio aeróbico ligero',
   'Caminar o ciclismo estacionario a baja intensidad. Sin entrenamiento de resistencia.',
   24, 48),
  (4, 'Ejercicio específico del deporte',
   'Carreras, cambios de dirección y manejo de pelota. Sin riesgo de impacto en la cabeza.',
   24, 48),
  (5, 'Entrenamiento sin contacto',
   'Drills complejos, inicio de entrenamiento de fuerza progresivo y carga cognitiva elevada.',
   24, 48),
  (6, 'Contacto pleno',
   'Solo con alta médica firmada por profesional con experiencia en conmociones.',
   24, 48);
