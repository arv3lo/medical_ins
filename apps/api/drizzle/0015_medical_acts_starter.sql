-- Starter set of medical acts for coverage requests (roadmap P3.1). The codes are local to the
-- project and follow no official nomenclature; the full referential (P1.5) replaces or links them.
-- The reference prices, in whole ariary, are INDICATIVE ONLY: the owner must validate them before
-- production (roadmap open question). This insert never overrides an existing act.
INSERT INTO medical_acts (code, label, reference_price) VALUES
  ('CONS-GEN', 'Consultation de médecine générale', 20000),
  ('CONS-SPE', 'Consultation spécialisée', 40000),
  ('CONS-PRENAT', 'Consultation prénatale', 15000),
  ('ECHO-ABD', 'Échographie abdominale', 60000),
  ('ECHO-OBST', 'Échographie obstétricale', 60000),
  ('RADIO-THX', 'Radiographie du thorax', 40000),
  ('SCAN-CRANE', 'Scanner cérébral', 300000),
  ('ECG', 'Électrocardiogramme', 30000),
  ('BIO-NFS', 'Numération formule sanguine', 25000),
  ('BIO-GLY', 'Glycémie', 8000),
  ('BIO-CREAT', 'Créatininémie', 15000),
  ('BIO-LIPID', 'Bilan lipidique', 40000),
  ('BIO-ECBU', 'Examen cytobactériologique des urines', 30000),
  ('TDR-PALU', 'Test de diagnostic rapide du paludisme', 5000),
  ('GOUTTE-EP', 'Goutte épaisse', 8000),
  ('SOIN-PANS', 'Pansement', 10000),
  ('CHIR-SUTURE', 'Suture de plaie', 50000),
  ('CHIR-APPEND', 'Appendicectomie', 1000000),
  ('ACC-VB', 'Accouchement par voie basse', 250000),
  ('ACC-CESAR', 'Césarienne', 1200000),
  ('HOSP-JOUR', 'Hospitalisation, par jour', 60000)
ON CONFLICT (code) DO NOTHING;
