// Offline cross-repository acceptance test. Only local modules and in-memory PostgreSQL are used.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const studio = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const daily = resolve(process.argv[2] || "../selen-editions-site");
const requireDaily = createRequire(join(daily, "package.json"));
const studioOnly = process.argv[2] === "--studio-only";
const Stripe = studioOnly ? class {} : requireDaily("stripe");
async function isolatedDatabase() {
  const packageDir = process.argv[3];
  if (!packageDir) return new PGlite();
  const deps = createRequire(join(resolve(packageDir), "package.json"));
  const { default: EmbeddedPostgres } = await import(
    pathToFileURL(deps.resolve("embedded-postgres"))
  );
  const pg = deps("pg");
  const password = randomBytes(24).toString("hex");
  const port = 35432;
  const directory = mkdtempSync(join(tmpdir(), "daily-recipe-"));
  const server = new EmbeddedPostgres({
    databaseDir: directory,
    postgresFlags: ["-k", directory, "-c", "listen_addresses="],
    port,
    user: "postgres",
    password,
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: (message) => {
      if (message.includes("FATAL")) console.error(message);
    },
  });
  await server.initialise();
  await server.start();
  const pool = new pg.Pool({
    host: directory,
    port,
    user: "postgres",
    password,
    database: "postgres",
    options: "-c request.jwt.claim.role=service_role",
  });
  return {
    query: pool.query.bind(pool),
    exec: pool.query.bind(pool),
    async close() {
      await pool.end();
      await server.stop();
    },
  };
}
const db = await isolatedDatabase();
const sql = (query, params = []) => db.query(query, params).then((r) => r.rows);
const archived = new Map(),
  delivered = new Map();
let failUpload = true,
  loseReceipt = true;
const env = {
  STRIPE_SECRET_KEY: "sk_test_recipe",
  STRIPE_WEBHOOK_SECRET: "whsec_recipe",
  RESEND_API_KEY: "re_dummy",
  SELEN_DAILY_INVOICE_INTERNAL_SECRET: "x".repeat(40),
  SELEN_DAILY_INVOICE_FORWARD_ENABLED: "true",
  SELEN_DAILY_INVOICE_ISSUE_ENABLED: "true",
  SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL: "https://studio.invalid/issue",
  NEXT_PUBLIC_SUPABASE_URL: "https://db.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
};
const start = Date.parse("2026-12-14T10:15:00Z") / 1000,
  end = Date.parse("2027-01-14T10:15:00Z") / 1000;
const sub = {
  id: "sub_recipe",
  customer: "cus_recipe",
  metadata: { product_key: "selen_daily" },
};
const invoice = {
  id: "in_recipe",
  customer: sub.customer,
  number: "TEST-4",
  amount_paid: 6900,
  amount_remaining: 0,
  total: 6900,
  subtotal: 8900,
  status: "paid",
  currency: "eur",
  status_transitions: { paid_at: start },
  lines: { data: [{ period: { start, end }, proration: false }] },
  payments: {
    data: [
      {
        status: "paid",
        amount_paid: 6900,
        payment: { type: "payment_intent", payment_intent: "pi_recipe" },
      },
    ],
  },
  parent: {
    type: "subscription_details",
    subscription_details: { subscription: sub.id },
  },
};
const intent = {
  id: "pi_recipe",
  customer: sub.customer,
  status: "succeeded",
  currency: "eur",
  amount_received: 6900,
  latest_charge: {
    paid: true,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
  },
};

async function prepareDatabase() {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean);
    create table organisations(id uuid primary key,legal_name text,company_name text,siret text,legal_form text,
      vat_number text,administrative_address text,administrative_email text,email text,client_notifications_paused boolean);
    set request.jwt.claims='{"role":"service_role"}';`);
  for (const file of [
    "20260629110000_create_lil_invoice_generator",
    "20260701090000_lil_invoice_statuses_and_email",
    "20260701120000_lil_invoice_generated_deposited_statuses",
    "20261118120000_lil_daily_invoice_links",
    "20261118130000_issue_paid_daily_lil_invoice",
  ]) {
    await db.exec(
      readFileSync(join(studio, "supabase/migrations", file + ".sql"), "utf8"),
    );
  }
  await db.exec(`update lil_invoice_sequence set last_number=437;
    insert into organisations values(gen_random_uuid(),'OF Test',null,'00000000000000',null,null,
      '1 rue Test, 10000 Troyes','compta@example.invalid',null,false);
    insert into lil_daily_billing_accounts select 'sub_recipe','cus_recipe',id,'2026-12-14T10:15Z' from organisations;
    update lil_invoice_settings set business_name='Recette',address='1 rue fictive',siren_siret='00000000000000';`);
}

// Test adapters implement only the PostgREST operations used by these routes.
// All business SQL, constraints, numbering, state transitions and PDF rendering run normally.
function from(table) {
  const where = [],
    params = [];
  let update;
  const bind = (value) => {
    params.push(value);
    return "$" + params.length;
  };
  const builder = {
    select() {
      return this;
    },
    update(value) {
      update = value;
      return this;
    },
    eq(key, value) {
      where.push(key + "=" + bind(value));
      return this;
    },
    is(key, value) {
      assert.equal(value, null);
      where.push(key + " is null");
      return this;
    },
    async single() {
      const out = await this.maybeSingle();
      assert.ok(out.data);
      return out;
    },
    async maybeSingle() {
      const filter = " where " + where.join(" and ");
      const stmt = update
        ? "update " +
          table +
          " set " +
          Object.entries(update)
            .map(([k, v]) => k + "=" + bind(v))
            .join(",") +
          filter +
          " returning *"
        : "select * from " + table + filter;
      const [data] = await sql(stmt, params);
      if (data && table === "lil_daily_billing_accounts")
        [data.organisations] = await sql(
          "select * from organisations where id=$1",
          [data.organisation_id],
        );
      if (data?.invoice_date instanceof Date)
        data.invoice_date = data.invoice_date.toISOString().slice(0, 10);
      return {
        data: data ? JSON.parse(JSON.stringify(data)) : null,
        error: null,
      };
    },
  };
  return builder;
}
let issuedArgs;
const admin = {
  from,
  async rpc(name, args) {
    if (name === "issue_paid_daily_lil_invoice") issuedArgs = args;
    const keys = Object.keys(args);
    const params = Object.values(args).map((v) =>
      typeof v === "object" ? JSON.stringify(v) : v,
    );
    const [data] = await sql(
      "select * from " +
        name +
        "(" +
        keys.map((k, i) => k + " => $" + (i + 1)).join(",") +
        ")",
      params,
    );
    return { data, error: null };
  },
  storage: {
    from(bucket) {
      assert.equal(bucket, "lil-daily-invoices");
      return {
        async upload(path, bytes, options) {
          assert.equal(options.upsert, false);
          if (failUpload) {
            failUpload = false;
            return { error: { message: "simulated interruption" } };
          }
          if (archived.has(path)) return { error: { statusCode: "409" } };
          archived.set(path, Buffer.from(bytes));
          return { error: null };
        },
        async download(path) {
          return { data: new Blob([archived.get(path)]) };
        },
      };
    },
  },
};

class MailSink {
  emails = {
    async send(message, options) {
      assert.equal(message.to, "compta@example.invalid");
      const key = options.idempotencyKey;
      assert.ok(key);
      if (delivered.has(key)) assert.deepEqual(message, delivered.get(key));
      else delivered.set(key, message);
      if (loseReceipt) {
        loseReceipt = false;
        throw Error("simulated lost provider response");
      }
      return { data: { id: "fixture" }, error: null };
    },
  };
}
class OfflineStripe extends Stripe {
  constructor(...args) {
    super(...args);
    this.subscriptions.retrieve = async (id) => {
      assert.equal(id, sub.id);
      return sub;
    };
  }
}
let studioPost;
async function offlineFetch(url, options) {
  if (url === env.SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL)
    return studioPost(new Request(url, options));
  const u = new URL(url);
  assert.equal(u.hostname, "api.stripe.com");
  const paths = {
    ["/v1/invoices/" + invoice.id]: invoice,
    ["/v1/subscriptions/" + sub.id]: sub,
    "/v1/payment_intents/pi_recipe": intent,
  };
  assert.ok(paths[u.pathname]);
  return Response.json(paths[u.pathname]);
}
function loader(root, base) {
  const native = createRequire(join(root, "package.json")),
    cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const compiled = { exports: {} };
    const require = (name) => {
      if (name === "@/lib/server/supabaseAdmin")
        return { createSupabaseAdminClient: () => admin };
      if (name === "@supabase/supabase-js")
        return { createClient: () => admin };
      if (name === "stripe") return OfflineStripe;
      if (name === "resend") return { Resend: MailSink };
      if (name.startsWith("@/"))
        return load(join(root, base, name.slice(2) + ".ts"));
      return native(name);
    };
    vm.runInNewContext(
      output,
      {
        Error,
        exports: compiled.exports,
        module: compiled,
        require,
        process: { env },
        Request,
        Response,
        fetch: offlineFetch,
        URL,
        Buffer,
        AbortSignal,
        console,
        Intl,
        Date,
      },
      { filename: file },
    );
    cache.set(file, compiled.exports);
    return compiled.exports;
  }
  return (file) => load(join(root, file));
}
try {
  await prepareDatabase();
  studioPost = loader(
    studio,
    "src",
  )("src/app/api/internal/daily-invoices/issue/route.ts").POST;
  const webhook =
    !studioOnly && loader(daily, "")("app/api/stripe/webhook/route.ts").POST;
  const signing = new Stripe(env.STRIPE_SECRET_KEY);
  async function replay(signature = true) {
    if (studioOnly) {
      const response = await studioPost(
        new Request(env.SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL, {
          method: "POST",
          headers: {
            authorization: signature
              ? "Bearer " + env.SELEN_DAILY_INVOICE_INTERNAL_SECRET
              : "",
          },
          body: JSON.stringify({ stripeInvoiceId: invoice.id }),
        }),
      );
      return response.status;
    }
    const payload = JSON.stringify({
      id: "evt_recipe",
      type: "invoice.paid",
      data: { object: invoice },
    });
    const header = signing.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    const response = await webhook(
      new Request("https://daily.invalid/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature ? header : "invalid" },
      }),
    );
    return response.status;
  }
  assert.equal(await replay(false), studioOnly ? 401 : 400);
  const retryStatus = studioOnly ? 503 : 500;
  env.SELEN_DAILY_INVOICE_ISSUE_ENABLED = "false";
  assert.equal(await replay(), retryStatus);
  assert.equal((await sql("select * from lil_invoices")).length, 0);
  env.SELEN_DAILY_INVOICE_ISSUE_ENABLED = "true";
  assert.equal(await replay(), retryStatus); // PDF store failed after numbering
  assert.equal(await replay(), retryStatus); // provider accepted the email, response lost
  assert.equal(await replay(), 200);
  assert.deepEqual(await Promise.all([replay(), replay()]), [200, 200]);
  const [row] = await sql("select * from lil_invoices");
  assert.equal(row.invoice_number, "F000438");
  assert.equal(row.total_cents, 6900);
  assert.equal(row.metadata.daily_period_start, "2026-12-14");
  assert.equal(row.metadata.daily_period_end, "2027-01-13");
  assert.equal(row.status, "paid");
  assert.ok(row.email_sent_at);
  assert.ok(row.pdf_url.startsWith("/agent/api/gestion/invoices/pdf?id="));
  assert.equal(archived.size, 1);
  assert.equal(delivered.size, 1);
  const bytes = archived.get(row.pdf_path);
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert.deepEqual([...delivered.values()][0].attachments[0].content, bytes);
  invoice.id = "in_overlap";
  assert.equal(await replay(), retryStatus);
  invoice.id = "in_historical";
  invoice.number = "TEST-3";
  invoice.lines.data[0].period = { start: start - 30 * 86400, end: start };
  await sql(
    "insert into lil_daily_prior_payments values(encode(sha256(convert_to($1,'UTF8')),'hex'),encode(sha256(convert_to($2,'UTF8')),'hex'),'F000430',encode(sha256(convert_to($3,'UTF8')),'hex'),to_timestamp($4),to_timestamp($5),6900)",
    [invoice.id, sub.id, invoice.number, start - 30 * 86400, start],
  );
  assert.equal(await replay(), 200);
  assert.equal((await sql("select * from lil_invoices")).length, 1);
  assert.equal(
    (await sql("select last_number from lil_invoice_sequence"))[0].last_number,
    438,
  );
  assert.equal(delivered.size, 1);
  const next = {
    ...issuedArgs,
    p_stripe_invoice_id: "in_repeat",
    p_period_start: "2027-01-14T10:15:00Z",
    p_period_end_exclusive: "2027-02-14T10:15:00Z",
  };
  const repeated = await Promise.all(
    Array.from({ length: 8 }, () =>
      admin.rpc("issue_paid_daily_lil_invoice", next),
    ),
  );
  assert.equal(new Set(repeated.map((r) => r.data.id)).size, 1);
  const race = await Promise.allSettled(
    [0, 1].map((i) =>
      admin.rpc("issue_paid_daily_lil_invoice", {
        ...next,
        p_stripe_invoice_id: "in_race" + i,
        p_period_start: `2027-02-1${4 + i}T10:15:00Z`,
        p_period_end_exclusive: "2027-03-14T10:15:00Z",
      }),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await sql("select last_number from lil_invoice_sequence"))[0].last_number,
    440,
  );
  console.log(
    "PASS: invoice processing, guards, atomic numbering, exact period, discounted payment, private PDF, email, retries, overlap and historical replay.",
  );
} finally {
  await db.close();
}
