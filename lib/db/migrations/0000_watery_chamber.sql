CREATE TYPE "public"."enhance_job_status" AS ENUM('running', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."enhance_result" AS ENUM('success', 'hold', 'down');--> statement-breakpoint
CREATE TYPE "public"."slot" AS ENUM('weapon', 'armor', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."raid_boss" AS ENUM('slime_king', 'orc_chief', 'stone_golem', 'dragon_west', 'fallen_angel');--> statement-breakpoint
CREATE TYPE "public"."raid_status" AS ENUM('active', 'settled');--> statement-breakpoint
CREATE TYPE "public"."mailbox_type" AS ENUM('enhance_result', 'raid_settlement', 'reward', 'notice');--> statement-breakpoint
CREATE TYPE "public"."share_trigger" AS ENUM('enh30', 'enh50', 'enh99', 'first_transcend', 'transcend_max', 'manual');--> statement-breakpoint
CREATE TYPE "public"."share_unit" AS ENUM('single', 'full');--> statement-breakpoint
CREATE TYPE "public"."iap_refund_reason" AS ENUM('user', 'minor_protection', 'error');--> statement-breakpoint
CREATE TYPE "public"."iap_status" AS ENUM('pending', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('kmc', 'pass');--> statement-breakpoint
CREATE TYPE "public"."ad_reward" AS ENUM('supply_box', 'mail_instant');--> statement-breakpoint
CREATE TYPE "public"."system_mode_value" AS ENUM('live', 'read_only', 'maintenance', 'emergency_stop');--> statement-breakpoint
CREATE TABLE "enhancement_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_instance_id" bigint NOT NULL,
	"slot" "slot" NOT NULL,
	"slot_lane" smallint NOT NULL,
	"from_level" integer NOT NULL,
	"target_level" integer NOT NULL,
	"base_rate_bp" integer NOT NULL,
	"duration_ms" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complete_at" timestamp with time zone NOT NULL,
	"total_reduced_ms" bigint DEFAULT 0 NOT NULL,
	"fodder_instance_id" bigint,
	"status" "enhance_job_status" DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enhancement_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_instance_id" bigint NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"result" "enhance_result" NOT NULL,
	"base_rate_bp" integer NOT NULL,
	"effective_rate_bp" integer NOT NULL,
	"elapsed_ms" bigint NOT NULL,
	"duration_ms" bigint NOT NULL,
	"reduced_ms" bigint DEFAULT 0 NOT NULL,
	"fodder_instance_id" bigint,
	"rng_seed" text,
	"rolled" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gem_time_reductions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"gems_spent" bigint NOT NULL,
	"reduced_ms" bigint NOT NULL,
	"conversion_ms_per_diamond" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot" "slot" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "equipment_instances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"enhance_level" integer DEFAULT 0 NOT NULL,
	"transcend_level" smallint DEFAULT 0 NOT NULL,
	"equipped_slot" "slot",
	"is_locked" boolean DEFAULT false NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcend_level_range" CHECK ("equipment_instances"."transcend_level" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "user_codex" (
	"user_id" uuid NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"max_enhance_level" integer DEFAULT 0 NOT NULL,
	"first_acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_codex_user_id_catalog_item_id_pk" PRIMARY KEY("user_id","catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"diamond" bigint DEFAULT 0 NOT NULL,
	"is_adult" boolean DEFAULT false NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"birth_year_hash" text,
	"representative_title_code" text,
	"tutorial_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "transcend_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_instance_id" bigint NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"from_t" smallint NOT NULL,
	"to_t" smallint NOT NULL,
	"fodder_count" integer NOT NULL,
	"fodder_instance_ids" bigint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disenchant_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"equipment_instance_id" bigint NOT NULL,
	"diamond_granted" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_open_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"slot" "slot" NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"is_new" boolean NOT NULL,
	"gem_drop" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_supply_boxes" (
	"user_id" uuid NOT NULL,
	"slot" "slot" NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "user_supply_boxes_user_id_slot_pk" PRIMARY KEY("user_id","slot")
);
--> statement-breakpoint
CREATE TABLE "raid_attacks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raid_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"damage" bigint NOT NULL,
	"is_crit" boolean NOT NULL,
	"is_extra" boolean NOT NULL,
	"diamond_cost" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_daily_counts" (
	"user_id" uuid NOT NULL,
	"kst_date" date NOT NULL,
	"started_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "raid_daily_counts_user_id_kst_date_pk" PRIMARY KEY("user_id","kst_date")
);
--> statement-breakpoint
CREATE TABLE "raid_participants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raid_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"attacks_used" integer DEFAULT 0 NOT NULL,
	"extra_attacks" integer DEFAULT 0 NOT NULL,
	"total_damage" bigint DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_rewards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"raid_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"base_diamond" bigint DEFAULT 0 NOT NULL,
	"phase_diamond" bigint DEFAULT 0 NOT NULL,
	"boxes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"host_user_id" uuid NOT NULL,
	"boss_code" "raid_boss" NOT NULL,
	"phase1_hp" bigint NOT NULL,
	"share_code" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"phases_cleared" integer DEFAULT 0 NOT NULL,
	"status" "raid_status" DEFAULT 'active' NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "raids_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "mailbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "mailbox_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"new_user_id" uuid NOT NULL,
	"share_code" text NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_attributions_new_user_id_unique" UNIQUE("new_user_id")
);
--> statement-breakpoint
CREATE TABLE "share_reward_claims" (
	"user_id" uuid NOT NULL,
	"kst_date" date NOT NULL,
	CONSTRAINT "share_reward_claims_user_id_kst_date_pk" PRIMARY KEY("user_id","kst_date")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"unit" "share_unit" NOT NULL,
	"trigger" "share_trigger" NOT NULL,
	"share_code" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
CREATE TABLE "iap_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"portone_order_id" text NOT NULL,
	"product_code" text NOT NULL,
	"amount_krw" bigint NOT NULL,
	"diamond_granted" bigint NOT NULL,
	"status" "iap_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iap_orders_portone_order_id_unique" UNIQUE("portone_order_id")
);
--> statement-breakpoint
CREATE TABLE "iap_refunds" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" "iap_refund_reason" NOT NULL,
	"amount_krw" bigint NOT NULL,
	"clawback_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_verifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"birth_year_hash" text NOT NULL,
	"is_adult" boolean NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_purchase_limits" (
	"user_id" uuid NOT NULL,
	"kst_month" text NOT NULL,
	"total_krw" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "monthly_purchase_limits_user_id_kst_month_pk" PRIMARY KEY("user_id","kst_month")
);
--> statement-breakpoint
CREATE TABLE "ad_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_token" text NOT NULL,
	"reward" "ad_reward" NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ad_views_ad_token_unique" UNIQUE("ad_token")
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probability_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_mode" (
	"key" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"mode" "system_mode_value" DEFAULT 'live' NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enhancement_jobs" ADD CONSTRAINT "enhancement_jobs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_jobs" ADD CONSTRAINT "enhancement_jobs_equipment_instance_id_equipment_instances_id_fk" FOREIGN KEY ("equipment_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_jobs" ADD CONSTRAINT "enhancement_jobs_fodder_instance_id_equipment_instances_id_fk" FOREIGN KEY ("fodder_instance_id") REFERENCES "public"."equipment_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gem_time_reductions" ADD CONSTRAINT "gem_time_reductions_job_id_enhancement_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."enhancement_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_instances" ADD CONSTRAINT "equipment_instances_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_codex" ADD CONSTRAINT "user_codex_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_codex" ADD CONSTRAINT "user_codex_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_open_logs" ADD CONSTRAINT "supply_open_logs_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_supply_boxes" ADD CONSTRAINT "user_supply_boxes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_daily_counts" ADD CONSTRAINT "raid_daily_counts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_participants" ADD CONSTRAINT "raid_participants_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_participants" ADD CONSTRAINT "raid_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_rewards" ADD CONSTRAINT "raid_rewards_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_rewards" ADD CONSTRAINT "raid_rewards_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_profiles_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_new_user_id_profiles_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_reward_claims" ADD CONSTRAINT "share_reward_claims_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_orders" ADD CONSTRAINT "iap_orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_refunds" ADD CONSTRAINT "iap_refunds_order_id_iap_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."iap_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_purchase_limits" ADD CONSTRAINT "monthly_purchase_limits_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ej_user_slot_lane_running_uq" ON "enhancement_jobs" USING btree ("user_id","slot","slot_lane") WHERE "enhancement_jobs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "ej_instance_running_uq" ON "enhancement_jobs" USING btree ("equipment_instance_id") WHERE "enhancement_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "ej_status_complete_idx" ON "enhancement_jobs" USING btree ("status","complete_at");--> statement-breakpoint
CREATE INDEX "ej_user_status_idx" ON "enhancement_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "eq_user_equipped_slot_uq" ON "equipment_instances" USING btree ("user_id","equipped_slot") WHERE "equipment_instances"."equipped_slot" is not null;--> statement-breakpoint
CREATE INDEX "eq_user_catalog_idx" ON "equipment_instances" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "eq_user_equipped_idx" ON "equipment_instances" USING btree ("user_id","equipped_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_participant_uq" ON "raid_participants" USING btree ("raid_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raid_reward_uq" ON "raid_rewards" USING btree ("raid_id","user_id");--> statement-breakpoint
CREATE INDEX "raid_status_expire_idx" ON "raids" USING btree ("status","expire_at");--> statement-breakpoint
CREATE INDEX "mailbox_user_claimed_idx" ON "mailbox" USING btree ("user_id","claimed_at");