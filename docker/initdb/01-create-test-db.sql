-- Runs once when the Postgres volume is first created. The automated tests use this database,
-- so they can never touch development data.
CREATE DATABASE shiptrack_test OWNER shiptrack;
