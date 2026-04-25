-- Enable TimescaleDB for event metrics and throughput time-series data
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable uuid-ossp for UUID generation in the database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
