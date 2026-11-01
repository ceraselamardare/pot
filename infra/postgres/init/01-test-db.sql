-- Runs once, on the first start of an empty volume.
-- pot      = local dev database (DATABASE_URL)
-- pot_test = API tests (DATABASE_URL_TEST), so test runs never touch dev data
CREATE DATABASE pot_test OWNER pot;
