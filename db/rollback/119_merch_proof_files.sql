-- Undo 119. Proofs sent with several files stop showing on the order page
-- (their files stay in R2); single-file proofs from before 119 are unaffected.
DROP TABLE IF EXISTS merch_proof_files;
