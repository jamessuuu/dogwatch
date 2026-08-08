CREATE TABLE "dogwatch_budget" (
	"day" date PRIMARY KEY NOT NULL,
	"llm_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"micro_usd" bigint DEFAULT 0 NOT NULL,
	"decide_attempts" integer DEFAULT 0 NOT NULL
);
