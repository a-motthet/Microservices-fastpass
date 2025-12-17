


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."reservation_status" AS ENUM (
    'pending',
    'checked_in',
    'checked_out',
    'cancelled'
);


ALTER TYPE "public"."reservation_status" OWNER TO "postgres";


CREATE TYPE "public"."site_status" AS ENUM (
    'active',
    'inactive',
    'maintenance'
);


ALTER TYPE "public"."site_status" OWNER TO "postgres";


CREATE TYPE "public"."slot_status" AS ENUM (
    'available',
    'reserved',
    'occupied',
    'maintenance'
);


ALTER TYPE "public"."slot_status" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_type" AS ENUM (
    'car',
    'motorcycle',
    'ev'
);


ALTER TYPE "public"."vehicle_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_version integer;
    event_record jsonb;
BEGIN
    -- 1. Lock row in latest_versions (if exists) or prepare for insert
    SELECT version INTO current_version
    FROM public.latest_versions
    WHERE aggregate_id = p_aggregate_id
    FOR UPDATE;

    IF NOT FOUND THEN
        current_version := 0; -- Treat as version 0 if no record exists yet
    END IF;

    -- 2. Check version
    IF current_version != p_expected_version THEN
        -- Throw a specific error if versions don't match
        RAISE EXCEPTION 'CONCURRENCY_ERROR: Expected version % but found % for aggregate %', p_expected_version, current_version, p_aggregate_id
              USING ERRCODE = 'P0001'; -- Use a custom error code if desired
    END IF;

    -- 3. If version is correct -> Insert new events into event_store
    FOR event_record IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
        INSERT INTO public.event_store (aggregate_id, aggregate_type, event_type, event_data, version, created_at)
        VALUES (
            (event_record->>'aggregate_id')::uuid,
            event_record->>'aggregate_type',
            event_record->>'event_type',
            event_record->'event_data',
            (event_record->>'version')::integer,
            NOW()
        );
    END LOOP;

    -- 4. Update (or insert) the row in latest_versions to the new version
    INSERT INTO public.latest_versions (aggregate_id, version, updated_at)
    VALUES (p_aggregate_id, p_new_version, NOW())
    ON CONFLICT (aggregate_id) DO UPDATE SET
      version = EXCLUDED.version,
      updated_at = NOW();

END;
$$;


ALTER FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb", "p_latest_event_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_version integer;
    event_record jsonb;
BEGIN
    -- 1. Lock & Check
    SELECT version INTO current_version
    FROM public.latest_versions
    WHERE aggregate_id = p_aggregate_id
    FOR UPDATE;

    IF NOT FOUND THEN
        current_version := 0;
    END IF;

    IF current_version != p_expected_version THEN
        RAISE EXCEPTION 'CONCURRENCY_ERROR: Expected version % but found % for aggregate %', p_expected_version, current_version, p_aggregate_id
              USING ERRCODE = 'P0001';
    END IF;

    -- 2. Insert Events
    FOR event_record IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
        INSERT INTO public.event_store (aggregate_id, aggregate_type, event_type, event_data, version, created_at)
        VALUES (
            (event_record->>'aggregate_id')::uuid,
            event_record->>'aggregate_type',
            event_record->>'event_type',
            event_record->'event_data',
            (event_record->>'version')::integer,
            NOW()
        );
    END LOOP;

    -- 3. Update Latest Version
    INSERT INTO public.latest_versions (aggregate_id, version, updated_at, latest_event_data)
    VALUES (p_aggregate_id, p_new_version, NOW(), p_latest_event_data)
    ON CONFLICT (aggregate_id) DO UPDATE SET
      version = EXCLUDED.version,
      updated_at = NOW(),
      latest_event_data = EXCLUDED.latest_event_data;
END;
$$;


ALTER FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb", "p_latest_event_data" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" "text" NOT NULL,
    "parking_site_id" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "license_plate" character varying NOT NULL,
    "brand" character varying,
    "model" character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_type" "public"."vehicle_type" DEFAULT 'car'::"public"."vehicle_type" NOT NULL
);


ALTER TABLE "public"."cars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_store" (
    "id" bigint NOT NULL,
    "aggregate_id" "uuid" NOT NULL,
    "aggregate_type" character varying NOT NULL,
    "event_type" character varying NOT NULL,
    "event_data" "jsonb" NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_store" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."event_store_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."event_store_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."event_store_id_seq" OWNED BY "public"."event_store"."id";



CREATE TABLE IF NOT EXISTS "public"."floors" (
    "id" "text" NOT NULL,
    "building_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "level_order" integer DEFAULT 0
);


ALTER TABLE "public"."floors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."latest_versions" (
    "aggregate_id" "uuid" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "latest_event_data" "jsonb"
);


ALTER TABLE "public"."latest_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parking_sites" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "timezone" "text" DEFAULT 'Asia/Bangkok'::"text",
    "timezone_offset" integer DEFAULT 420,
    "status" "public"."site_status" DEFAULT 'active'::"public"."site_status" NOT NULL
);


ALTER TABLE "public"."parking_sites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recent_activities" (
    "id" bigint NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slot_id" character varying,
    "status" character varying,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_type" "public"."vehicle_type"
);


ALTER TABLE "public"."recent_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."recent_activities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recent_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recent_activities_id_seq" OWNED BY "public"."recent_activities"."id";



CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parking_site_id" "text" NOT NULL,
    "floor_id" "text",
    "slot_id" "text",
    "status" "public"."reservation_status" DEFAULT 'pending'::"public"."reservation_status" NOT NULL,
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "reserved_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status_code" "text" DEFAULT '1'::"text",
    "vehicle_type" "public"."vehicle_type" DEFAULT 'car'::"public"."vehicle_type" NOT NULL,
    "car_id" "uuid"
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations_history" (
    "id" bigint NOT NULL,
    "reservation_id" "uuid" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "description" "text" NOT NULL,
    "details" "jsonb"
);


ALTER TABLE "public"."reservations_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."reservations_history" IS 'Read Model: A human-readable history log for reservations.';



CREATE SEQUENCE IF NOT EXISTS "public"."reservations_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reservations_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reservations_history_id_seq" OWNED BY "public"."reservations_history"."id";



CREATE TABLE IF NOT EXISTS "public"."slots" (
    "id" "text" NOT NULL,
    "zone_id" "text" NOT NULL,
    "parking_site_id" "text" NOT NULL,
    "floor_id" "text" NOT NULL,
    "name" character varying NOT NULL,
    "slot_number" integer,
    "status" "public"."slot_status" DEFAULT 'available'::"public"."slot_status" NOT NULL,
    "details" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "vehicle_type" "public"."vehicle_type" DEFAULT 'car'::"public"."vehicle_type" NOT NULL
);


ALTER TABLE "public"."slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."snapshots" (
    "aggregate_id" "uuid" NOT NULL,
    "snapshot_data" "jsonb" NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" character varying,
    "email" character varying NOT NULL,
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status",
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "text" NOT NULL,
    "floor_id" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."zones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."event_store" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."event_store_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."recent_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."recent_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reservations_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reservations_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cars"
    ADD CONSTRAINT "cars_license_plate_key" UNIQUE ("license_plate");



ALTER TABLE ONLY "public"."cars"
    ADD CONSTRAINT "cars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_store"
    ADD CONSTRAINT "event_store_aggregate_version_unique" UNIQUE ("aggregate_id", "version");



ALTER TABLE ONLY "public"."event_store"
    ADD CONSTRAINT "event_store_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."floors"
    ADD CONSTRAINT "floors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."latest_versions"
    ADD CONSTRAINT "latest_versions_pkey" PRIMARY KEY ("aggregate_id");



ALTER TABLE ONLY "public"."parking_sites"
    ADD CONSTRAINT "parking_sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recent_activities"
    ADD CONSTRAINT "recent_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recent_activities"
    ADD CONSTRAINT "recent_activities_reservation_id_key" UNIQUE ("reservation_id");



ALTER TABLE ONLY "public"."reservations_history"
    ADD CONSTRAINT "reservations_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."snapshots"
    ADD CONSTRAINT "snapshots_pkey" PRIMARY KEY ("aggregate_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_event_store_aggregate_id" ON "public"."event_store" USING "btree" ("aggregate_id");



CREATE INDEX "idx_reservations_floor" ON "public"."reservations" USING "btree" ("floor_id");



CREATE INDEX "idx_reservations_history_reservation_id" ON "public"."reservations_history" USING "btree" ("reservation_id");



CREATE INDEX "idx_reservations_site" ON "public"."reservations" USING "btree" ("parking_site_id");



CREATE INDEX "idx_reservations_slot" ON "public"."reservations" USING "btree" ("slot_id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_parking_site_id_fkey" FOREIGN KEY ("parking_site_id") REFERENCES "public"."parking_sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cars"
    ADD CONSTRAINT "cars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."floors"
    ADD CONSTRAINT "floors_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recent_activities"
    ADD CONSTRAINT "recent_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_parking_site_id_fkey" FOREIGN KEY ("parking_site_id") REFERENCES "public"."parking_sites"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_parking_site_id_fkey" FOREIGN KEY ("parking_site_id") REFERENCES "public"."parking_sites"("id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE CASCADE;





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb", "p_latest_event_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb", "p_latest_event_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_events_and_update_version"("p_aggregate_id" "uuid", "p_expected_version" integer, "p_new_version" integer, "p_events" "jsonb", "p_latest_event_data" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON TABLE "public"."cars" TO "anon";
GRANT ALL ON TABLE "public"."cars" TO "authenticated";
GRANT ALL ON TABLE "public"."cars" TO "service_role";



GRANT ALL ON TABLE "public"."event_store" TO "anon";
GRANT ALL ON TABLE "public"."event_store" TO "authenticated";
GRANT ALL ON TABLE "public"."event_store" TO "service_role";



GRANT ALL ON SEQUENCE "public"."event_store_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."event_store_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."event_store_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."floors" TO "anon";
GRANT ALL ON TABLE "public"."floors" TO "authenticated";
GRANT ALL ON TABLE "public"."floors" TO "service_role";



GRANT ALL ON TABLE "public"."latest_versions" TO "anon";
GRANT ALL ON TABLE "public"."latest_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."latest_versions" TO "service_role";



GRANT ALL ON TABLE "public"."parking_sites" TO "anon";
GRANT ALL ON TABLE "public"."parking_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."parking_sites" TO "service_role";



GRANT ALL ON TABLE "public"."recent_activities" TO "anon";
GRANT ALL ON TABLE "public"."recent_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recent_activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recent_activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recent_activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."reservations_history" TO "anon";
GRANT ALL ON TABLE "public"."reservations_history" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reservations_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reservations_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reservations_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."slots" TO "anon";
GRANT ALL ON TABLE "public"."slots" TO "authenticated";
GRANT ALL ON TABLE "public"."slots" TO "service_role";



GRANT ALL ON TABLE "public"."snapshots" TO "anon";
GRANT ALL ON TABLE "public"."snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."zones" TO "anon";
GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































