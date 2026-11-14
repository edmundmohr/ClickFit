-- Mehrere Trainingspläne: Ein Plan kann künftig einen festen Trainingsort haben.
-- Die Spalte gab es schon, sie wurde beim Erzeugen gefüllt, aber nie gelesen. Damit sich für
-- bestehende Pläne nichts ändert, gilt für sie „kein fester Ort“ (= aktueller Ort).
-- Neuer Status `extra` (Zusatzplan) braucht keine Schemaänderung.
UPDATE `training_plan` SET `gym_profile_id` = NULL;
