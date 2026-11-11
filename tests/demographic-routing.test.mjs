import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Exercise the real server pages and survey loader with controlled auth/data.
// Transpilation keeps this test independent of a running Next.js server or DB.
function loadModule(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
  });
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name),
    loadedModule,
    loadedModule.exports
  );
  return loadedModule.exports;
}

const settingsModule = loadModule("src/lib/account-settings.ts");
const skips = loadModule("src/lib/demographic-skips.ts");
const urls = loadModule("src/lib/url.ts");
const captionOrderModule = loadModule("src/lib/study-caption-order.ts");
const studyProgressModule = loadModule("src/lib/study-progress.ts");
const studiesModule = loadModule("src/lib/studies.ts", {
  "@/lib/study-caption-order": captionOrderModule,
  "@/lib/study-progress": studyProgressModule,
});
const participationModule = loadModule("src/lib/study-participation.ts");
const statsModule = loadModule("src/lib/study-stats.ts");
const completionStats = { likedCount: 1, viewedCount: 3, medianVoteTimeMs: 1200, medianNavigationTimeMs: 2000 };
const profileId = "participant-a";
const NullComponent = () => null;

function captionId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createCaptionScenario(count = 1205) {
  const mappings = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    study_id: 1,
    caption_id: captionId(index + 1),
    studies: studyRow(1, { is_private: true }),
    captions: { id: captionId(index + 1), content: `Caption ${index + 1}`, images: null },
  }));
  const requests = [];
  let failTable = null;
  let signedIn = true;
  const tables = {
    study_caption_mappings: mappings,
    caption_votes: [{ profile_id: profileId, caption_id: captionId(1), is_from_study: true, vote_value: 1 }],
    caption_saves: [{ profile_id: profileId, caption_id: captionId(2) }],
  };
  const valueAt = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: profileId } : null } }) },
    from(table) {
      const request = { table, selection: "", captionIds: null, from: 0, to: 999 };
      requests.push(request);
      const filters = [];
      const order = [];
      const query = {
        select(selection) {
          request.selection = selection;
          if (selection.includes("captions!inner")) filters.push((row) => Boolean(row.captions));
          return query;
        },
        eq(key, value) { filters.push((row) => valueAt(row, key) === value); return query; },
        gt(key, value) { filters.push((row) => valueAt(row, key) > value); return query; },
        in(key, values) {
          if (key === "caption_id") request.captionIds = [...values];
          filters.push((row) => values.includes(valueAt(row, key)));
          return query;
        },
        or(expression, { referencedTable }) {
          const alternatives = expression.split(",").map((condition) => {
            const [, key, operator, value] = condition.match(/^([^.]+)\.(lte|gte|is)\.(.+)$/);
            return (row) => {
              const actual = row[referencedTable][key];
              return operator === "is" ? actual === null : actual !== null &&
                (operator === "lte" ? actual <= value : actual >= value);
            };
          });
          filters.push((row) => alternatives.some((filter) => filter(row)));
          return query;
        },
        order(key) { order.push(key); return query; },
        range(from, to) { request.from = from; request.to = to; return query; },
        then(resolve, reject) {
          const data = tables[table].filter((row) => filters.every((filter) => filter(row)))
            .sort((a, b) => {
              for (const key of order) {
                if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
              }
              return 0;
            }).slice(request.from, request.to + 1);
          return Promise.resolve(failTable === table
            ? { data: null, error: { message: "Unavailable table" } }
            : { data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const actions = loadModule("src/app/actions.ts", {
    "@/lib/studies": studiesModule,
    "@/lib/study-caption-order": captionOrderModule,
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/caption-images": { resolveStudyCaptionImageUrl: () => null },
    "@/lib/caption-votes": loadModule("src/lib/caption-votes.ts"),
    "@/lib/study-vote-history": {},
  });
  return {
    client, mappings, requests, actions,
    fail(table) { failTable = table; },
    signOut() { signedIn = false; },
    initial(savedProgress) {
      return studiesModule.fetchInitialActiveStudyCaptions(client, profileId, {
        includePrivateStudies: true, studyId: 1,
        savedProgress,
      });
    },
    next(captionIds, studyId = 1) {
      return actions.loadMoreCaptionVoteCaptions({ captionIds, includePrivateStudies: true, studyId });
    },
  };
}

test("the full study is shuffled before batching, with every caption delivered once and likes preserved", async (t) => {
  t.mock.method(Math, "random", () => 0.5);
  const scenario = createCaptionScenario();
  // Duplicate mappings must neither duplicate captions nor inflate progress.
  scenario.mappings.push({ ...scenario.mappings[0], id: 2000 });
  const initial = await scenario.initial();
  assert.equal(initial.error, null);
  assert.equal(initial.captionOrder.length, 1205);
  assert.equal(initial.captions.length, 60);
  assert.equal(initial.nextOffset, 60);
  assert.equal(scenario.requests.filter((request) => request.selection.includes("content")).length, 1);
  assert.equal(scenario.requests.find((request) => request.selection.includes("content")).captionIds.length, 60);
  assert.ok(initial.captions.some((caption) => Number(caption.id.slice(-12)) > 1000), "first batch draws from the entire study");
  assert.deepEqual(initial.captions.map((caption) => caption.id), initial.captionOrder.slice(0, 60));

  const allCaptions = [...initial.captions];
  for (let offset = initial.nextOffset; offset < initial.captionOrder.length; offset += 200) {
    const ids = initial.captionOrder.slice(offset, offset + 200);
    const page = await scenario.next(ids);
    assert.equal(page.success, true);
    assert.deepEqual(page.captions.map((caption) => caption.id), ids);
    assert.deepEqual(await scenario.next(ids), page, "retrying a batch keeps its order");
    allCaptions.push(...page.captions.map((caption) => ({
      ...caption, is_liked: caption.isLiked, is_saved: caption.isSaved,
    })));
  }
  assert.deepEqual(allCaptions.map((caption) => caption.id), initial.captionOrder);
  assert.equal(new Set(allCaptions.map((caption) => caption.id)).size, 1205);
  assert.equal(allCaptions.find((caption) => caption.id === captionId(1)).is_liked, true);
  assert.equal(allCaptions.find((caption) => caption.id === captionId(2)).is_saved, true);

  t.mock.method(Math, "random", () => 0.25);
  const reopened = await scenario.initial();
  assert.notDeepEqual(reopened.captionOrder, initial.captionOrder);
  assert.deepEqual([...reopened.captionOrder].sort(), [...initial.captionOrder].sort());
});

test("resuming restores the saved caption order and fetches a batch centered at the checkpoint", async () => {
  const scenario = createCaptionScenario(1205);
  const captionOrder = Array.from({ length: 1205 }, (_, index) => captionId(index + 1));
  const progress = {
    captionOrder,
    currentCaptionIndex: 1000,
    sessionStats: {
      likedCaptionTimeMsByKey: {},
      navigationTimeMsByKey: {},
      viewedCaptionKeys: {},
    },
  };
  const initial = await scenario.initial(progress);
  assert.equal(initial.initialOffset, 970);
  assert.equal(initial.nextOffset, 1030);
  assert.deepEqual(initial.captionOrder, captionOrder);
  assert.deepEqual(
    initial.captions.map((caption) => caption.id),
    captionOrder.slice(970, 1030)
  );
});

test("randomized batch loading stays scoped and keeps its snapshot when mappings change", async (t) => {
  t.mock.method(Math, "random", () => 0.5);
  const scenario = createCaptionScenario(65);
  const initial = await scenario.initial();
  const remaining = initial.captionOrder.slice(initial.nextOffset);
  scenario.mappings.splice(scenario.mappings.findIndex((row) => row.caption_id === remaining[0]), 1);
  scenario.mappings.push({
    ...scenario.mappings[0], id: 3000, caption_id: captionId(3000),
    captions: { id: captionId(3000), content: "Added after entry", images: null },
  });
  const page = await scenario.next(remaining);
  assert.deepEqual(page.captions.map((caption) => caption.id), remaining.slice(1));
  assert.deepEqual((await scenario.next(remaining, 2)).captions, []);
  scenario.mappings.forEach((row) => { row.studies.end_datetime_utc = "2000-01-01T00:00:00Z"; });
  assert.deepEqual((await scenario.next(remaining)).captions, []);
});

test("empty and small shuffled studies terminate, and load failures remain errors", async (t) => {
  const empty = await createCaptionScenario(0).initial();
  assert.deepEqual(empty, { captionOrder: [], captions: [], error: null, initialOffset: 0, nextOffset: null });
  const small = await createCaptionScenario(3).initial();
  assert.equal(small.captions.length, 3);
  assert.equal(small.nextOffset, null);
  const scenario = createCaptionScenario(3);
  scenario.fail("study_caption_mappings");
  assert.ok((await scenario.initial()).error);
  scenario.fail("caption_votes");
  assert.ok((await scenario.initial()).error);
  t.mock.method(console, "error", () => {});
  assert.equal((await scenario.next([captionId(1)])).success, false);
});

test("batch actions reject invalid requests and signed-out users before querying captions", async () => {
  const scenario = createCaptionScenario(3);
  for (const ids of [[], null, [null], ["bad-id"], Array(201).fill(captionId(1))]) {
    assert.equal((await scenario.next(ids)).success, false);
  }
  assert.equal((await scenario.next([captionId(1)], null)).success, false);
  scenario.signOut();
  assert.equal((await scenario.next([captionId(1)])).success, false);
  assert.deepEqual(scenario.requests, []);
});

class Redirect extends Error {
  constructor(path) {
    super(path);
    this.path = path;
  }
}

function createScenario({
  answered = [], skipped, user = true, loadError = false,
  studies = [], studyLoadError = false,
  participations = [], participationLoadError = false,
  notificationPreferences = {}, notificationSkips, profileLoadError = false, exchangeError = false,
} = {}) {
  const cookieValues = new Map();
  if (notificationSkips) cookieValues.set("notification_skips", notificationSkips);
  if (skipped) cookieValues.set(skips.DEMOGRAPHIC_SKIPS_COOKIE, skipped);
  const cookieStore = {
    get: (name) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
    delete: (name) => cookieValues.delete(name),
  };
  const rows = {
    studies,
    study_participations: participations,
    profiles: [{ id: profileId, first_name: "Test", last_name: "Participant", is_superadmin: false, notify_new_study_email: false, notify_new_study_sms: false, notify_new_study_phone_call: false, ...notificationPreferences }],
    demographic_questions: [{ id: 1, question: "First question" }, { id: 2, question: "Second question" }],
    demographic_answers: [{ id: 1, answer: "First answer" }, { id: 2, answer: "Second answer" }],
    demographic_answer_question_mapping: [
      { id: 1, question_id: 1, answer_id: 1, display_order: 0, is_deleted: false },
      { id: 2, question_id: 2, answer_id: 2, display_order: 0, is_deleted: false },
    ],
    demographic_user_responses: answered.map((id) => ({
      user_id: profileId, answer_question_mapping_id: id,
    })),
  };
  let studyLoads = 0;
  const captionLoads = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: user ? { id: profileId } : null } }),
      exchangeCodeForSession: async () => ({ error: exchangeError ? { message: "Failed login" } : null }),
    },
    from(table) {
      if (table === "studies") studyLoads += 1;
      const filters = [];
      const filterKeys = new Set();
      let orderBy;
      const result = () => {
        if (!rows[table] || (profileLoadError && table === "profiles") || (loadError && table.startsWith("demographic")) || (studyLoadError && table === "studies") || (participationLoadError && table === "study_participations")) {
          return { data: null, error: { message: "Unavailable table" } };
        }
        if (table === "demographic_user_responses" && filterKeys.has("profile_id")) {
          return { data: null, error: { message: "Unknown column" } };
        }
        const data = rows[table].filter((row) => filters.every((filter) => filter(row)));
        if (orderBy) data.sort((a, b) => a[orderBy] - b[orderBy]);
        return {
          data,
          error: null,
        };
      };
      const query = {
        select: () => query,
        in: (key, values) => { filters.push((row) => values.includes(row[key])); return query; },
        eq: (key, value) => {
          filterKeys.add(key);
          filters.push((row) => row[key] === value);
          return query;
        },
        or: (expression) => {
          const alternatives = expression.split(",").map((condition) => {
            const [, key, operator, value] = condition.match(/^([^.]+)\.(lte|gte|is)\.(.+)$/);
            if (operator === "is") return (row) => row[key] === null;
            return (row) => row[key] !== null && (operator === "lte" ? row[key] <= value : row[key] >= value);
          });
          filters.push((row) => alternatives.some((filter) => filter(row)));
          return query;
        },
        order: (key) => { orderBy = key; return query; },
        single: async () => ({ ...result(), data: result().data?.[0] ?? null }),
        maybeSingle: async () => ({ ...result(), data: result().data?.[0] ?? null }),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  const imports = {
    "next/headers": { cookies: async () => cookieStore },
    "next/navigation": { redirect: (path) => { throw new Redirect(path); } },
    "next/server": { NextResponse: { redirect: (url, status) => ({ url, status, cookies: { set() {} } }) } },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/study-participation": participationModule,
    "@/lib/study-progress": studyProgressModule,
    "@/lib/url": urls,
    "@/lib/account-settings": settingsModule,
    "@/lib/demographic-skips": skips,
    "@/app/profile-actions": { signOut: async () => {} },
    "@/components/AccountMenu": { AccountMenu: NullComponent },
    "@/components/LocalDateTime": loadModule("src/components/LocalDateTime.tsx"),
    "@/components/ParticipantProgress": loadModule("src/components/ParticipantProgress.tsx"),
    "@/components/CompleteProfileForm": { CompleteProfileForm: NullComponent },
    "@/components/StudyEasterEgg": { StudyEasterEgg: NullComponent },
    "@/components/PrivateStudyDisclaimer": loadModule("src/components/PrivateStudyDisclaimer.tsx"),
    "@/components/SubmitButton": loadModule("src/components/SubmitButton.tsx"),
    "@/components/theme/ThemeMenu": { ThemeMenu: NullComponent },
    "@/components/DemographicQuestionCard": { DemographicQuestionCard: NullComponent },
    "@/lib/caption-images": { resolveStudyCaptionImageUrl: () => null },
  };
  imports["@/lib/studies"] = {
    ...studiesModule,
    fetchInitialActiveStudyCaptions: async (_client, _profileId, scope) => {
      captionLoads.push(scope);
      return { captionOrder: [], captions: [], error: null, nextOffset: null };
    },
  };
  imports["@/lib/notification-preferences"] = loadModule("src/lib/notification-preferences.ts", imports);
  imports["@/lib/study-progress"] = studyProgressModule;
  const demographics = loadModule("src/lib/demographics.ts", imports);
  imports["@/lib/demographics"] = demographics;
  imports["@/components/CaptionVoteSection"] = loadModule("src/components/CaptionVoteSection.tsx", {
    "./CaptionVoteFlow": { CaptionVoteFlow: NullComponent },
    "@/lib/study-participation": participationModule,
    "@/lib/study-progress": studyProgressModule,
    "@/components/CompletedStudy": loadModule("src/components/CompletedStudy.tsx", {
      "@/lib/study-stats": statsModule,
    }),
  });
  return {
    home: loadModule("src/app/page.tsx", imports).default,
    study: loadModule("src/app/study/[studyId]/page.tsx", imports).default,
    activeStudies: (now) => studiesModule.fetchPublicActiveStudyIdentities(client, now),
    survey: loadModule("src/app/demographics/page.tsx", imports).default,
    callback: loadModule("src/app/auth/callback/route.ts", imports).GET,
    get studyLoads() { return studyLoads; },
    captionLoads,
    cookieValues,
  };
}

test("the participant dashboard shows pending survey progress before opening studies", async () => {
  const scenario = createScenario();
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Your progress/);
  assert.match(html, /Demographics/);
  assert.match(html, /Needs attention/);
  assert.match(html, /href="\/demographics\?next=%2F"/);
  assert.equal(scenario.studyLoads, 1);
});

test("the participant dashboard links to previous studies for reviewing captions and likes", async () => {
  const scenario = createScenario({ answered: [1, 2] });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Browse previous studies/);
  assert.match(html, /href="\/previous-studies"/);
  assert.match(html, /Browse ended studies and update your own likes/);
});

test("past-study loaders restrict the archive to ended public studies and paginate captions", async () => {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [], selection: null, order: null, range: null };
      calls.push(call);
      const query = {
        select(selection, options) {
          call.selection = selection;
          call.options = options;
          return query;
        },
        eq(key, value) {
          call.filters.push(["eq", key, value]);
          return query;
        },
        lt(key, value) {
          call.filters.push(["lt", key, value]);
          return query;
        },
        order(key, options) {
          call.order = [key, options];
          return query;
        },
        range(from, to) {
          call.range = [from, to];
          return query;
        },
        then(resolve, reject) {
          const response = table === "studies"
            ? { data: [{ id: 8, is_private: false, end_datetime_utc: "2026-01-01T00:00:00Z" }], error: null }
            : {
                data: [{
                  id: 32,
                  captions: { id: captionId(3), content: "Archived caption", image_id: null, images: null },
                }],
                count: 3,
                error: null,
              };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const now = new Date("2026-02-01T00:00:00Z");
  const pastStudies = await studiesModule.fetchPublicPastStudyIdentities(client, now);
  assert.equal(pastStudies.error, null);
  assert.equal(pastStudies.studies.length, 1);
  assert.deepEqual(calls[0].filters, [
    ["eq", "is_private", false],
    ["lt", "end_datetime_utc", now.toISOString()],
  ]);
  assert.deepEqual(calls[0].order, ["end_datetime_utc", { ascending: false }]);

  const page = await studiesModule.fetchPublicPastStudyCaptionPage(client, 8, 1, 2);
  assert.equal(page.error, null);
  assert.equal(page.count, 3);
  assert.equal(page.captions[0].content, "Archived caption");
  assert.deepEqual(calls[1].filters, [["eq", "study_id", 8]]);
  assert.deepEqual(calls[1].range, [2, 3]);
  assert.deepEqual(calls[1].options, { count: "exact" });
});

test("signed-in users can update hearts on ended public study captions", async (t) => {
  t.mock.method(console, "error", () => {});
  const caption = captionId(77);
  const calls = [];
  const writes = [];
  let signedIn = true;
  let study = { id: 8, end_datetime_utc: "2026-01-01T00:00:00Z" };
  const participation = null;
  let mapping = { id: 92 };
  let latestVote = null;
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? { id: profileId } : null },
      }),
    },
    from(table) {
      const call = { table, filters: [], selection: null, operation: null };
      calls.push(call);
      const query = {
        select(selection) { call.selection = selection; return query; },
        eq(key, value) { call.filters.push(["eq", key, value]); return query; },
        lt(key, value) { call.filters.push(["lt", key, value]); return query; },
        order(key, options) { call.order = [key, options]; return query; },
        limit(value) { call.limit = value; return query; },
        maybeSingle: async () => {
          if (table === "studies") return { data: study, error: null };
          if (table === "study_participations") return { data: participation, error: null };
          if (table === "study_caption_mappings") return { data: mapping, error: null };
          if (table === "study_caption_vote_events") return { data: latestVote, error: null };
          return { data: null, error: null };
        },
        upsert(payload, options) {
          call.operation = "upsert";
          writes.push({ table, payload, options });
          return query;
        },
        delete() {
          call.operation = "delete";
          return query;
        },
        then(resolve, reject) {
          const result = call.operation === "delete"
            ? { count: 1, error: null }
            : { error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const actions = loadModule("src/app/actions.ts", {
    "@/lib/caption-images": { resolveStudyCaptionImageUrl: () => null },
    "@/lib/supabase/server": {
      createClient: async () => client,
    },
    "@/lib/caption-votes": loadModule("src/lib/caption-votes.ts"),
    "@/lib/studies": {
      fetchActiveStudyCaptions: async () => ({ captions: [], error: null }),
      fetchActiveStudyCaptionPage: async () => ({ captions: [], error: null }),
    },
    "@/lib/study-vote-history": {},
    "@/lib/study-caption-order": { STUDY_CAPTION_BATCH_SIZE: 200 },
  });
  const request = {
    captionId: caption,
    isLiked: true,
    studyCaptionMappingId: 92,
    studyId: 8,
  };

  assert.equal((await actions.setPreviousStudyCaptionLike({ ...request, studyId: -1 })).success, false);
  signedIn = false;
  assert.equal((await actions.setPreviousStudyCaptionLike(request)).success, false);
  assert.equal(calls.length, 0);
  signedIn = true;

  study = null;
  assert.equal((await actions.setPreviousStudyCaptionLike(request)).success, false);
  study = { id: 8, end_datetime_utc: "2026-01-01T00:00:00Z" };
  mapping = null;
  assert.equal((await actions.setPreviousStudyCaptionLike(request)).success, false);
  mapping = { id: 92 };

  const addedSkippedLike = await actions.setPreviousStudyCaptionLike(request);
  assert.deepEqual(addedSkippedLike, { success: true });
  assert.equal(
    calls.some((call) => call.table === "study_participations"),
    false,
    "editing does not require a study participation record"
  );
  const eventWrite = writes.find((write) => write.table === "study_caption_vote_events");
  assert.equal(eventWrite.payload.profile_id, profileId);
  assert.equal(eventWrite.payload.study_caption_mapping_id, 92);
  assert.equal(eventWrite.payload.vote_value, "funny");
  assert.equal(eventWrite.payload.time_to_vote_ms, null);
  assert.ok(writes.some((write) =>
    write.table === "caption_votes" && write.payload.vote_value === 1
  ));

  const eventWriteCount = writes.length;
  latestVote = { vote_value: "funny" };
  assert.deepEqual(await actions.setPreviousStudyCaptionLike(request), { success: true });
  assert.equal(writes.length, eventWriteCount, "repeated likes do not add duplicate events");

  const removedLike = await actions.setPreviousStudyCaptionLike({
    ...request,
    isLiked: false,
  });
  assert.deepEqual(removedLike, { success: true });
  assert.ok(calls.some((call) =>
    call.table === "study_caption_vote_events" &&
    call.operation === "delete" &&
    call.filters.some((filter) =>
      filter[0] === "eq" &&
      filter[1] === "study_caption_mapping_id" &&
      filter[2] === 92
    )
  ));
});

test("previous-study caption cards expose a participant's current like state and an update action", () => {
  const { PreviousStudyCaptionCard } = loadModule(
    "src/components/PreviousStudyCaptionCard.tsx",
    {
      "@/app/actions": {
        setPreviousStudyCaptionLike: async () => ({ success: true }),
      },
      "next/image": "img",
      "@heroicons/react/24/outline": { HeartIcon: "svg" },
      "@heroicons/react/24/solid": { HeartIcon: "svg" },
    }
  );
  const html = renderToStaticMarkup(createElement(PreviousStudyCaptionCard, {
    caption: {
      id: captionId(78),
      content: "An archived caption",
      imageSrc: null,
      isLiked: false,
      studyCaptionMappingId: 93,
    },
    captionNumber: 1,
    canEditVotes: true,
    studyId: 8,
  }));
  assert.match(html, /Like this caption/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /An archived caption/);
  const browseOnlyHtml = renderToStaticMarkup(createElement(PreviousStudyCaptionCard, {
    caption: {
      id: captionId(78),
      content: "An archived caption",
      imageSrc: null,
      isLiked: true,
      studyCaptionMappingId: 93,
    },
    captionNumber: 1,
    canEditVotes: false,
    studyId: 8,
  }));
  assert.doesNotMatch(browseOnlyHtml, /Like this caption|remove like/);
});

test("participant progress cards stack status labels and use responsive columns", () => {
  const { ParticipantProgress } = loadModule("src/components/ParticipantProgress.tsx");
  const html = renderToStaticMarkup(ParticipantProgress({
    steps: [
      { label: "Profile", description: "Add your name.", status: "needs-action" },
      { label: "Notifications", description: "Choose your preferences.", status: "needs-action" },
      { label: "Demographics", description: "Six questions remain.", status: "needs-action" },
    ],
  }));
  assert.match(html, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(html, /flex min-w-0 flex-col items-start gap-2/);
  assert.match(html, /max-w-full rounded-full border/);
  assert.doesNotMatch(html, /shrink-0 text-xs font-semibold/);
});

test("study instructions make it clear that participants can continue without voting", () => {
  const source = readFileSync("src/components/CaptionVoteFlow.tsx", "utf8");
  assert.match(
    source,
    /You can move on without voting if a caption isn(?:'|&apos;)t funny or you(?:'|&apos;)re unsure\./
  );
  assert.match(source, /Like the captions you find funny\./);
});

test("study navigation can advance without voting and pause only after saving progress", () => {
  const source = readFileSync("src/components/CaptionVoteFlow.tsx", "utf8");
  assert.match(source, /aria-label="Next caption without voting"/);
  assert.match(source, /navigateToRelativeCaption\(1, "button"\)/);
  assert.match(source, /aria-label="Save study progress and return to studies"/);
  assert.match(
    source,
    /const progressSaved = await persistProgressAt\([\s\S]*?if \(!progressSaved\) return;[\s\S]*?router\.push\("\/"\);/
  );
  assert.match(source, /You can pause at any time\. We&apos;ll save your place/);
});

test("profile completion heading retains theme-aware readable contrast", async () => {
  const scenario = createScenario({ profileLoadError: true });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Tell us who you are/);
  assert.match(html, /text-\[var\(--foreground\)\]/);
  assert.doesNotMatch(html, /text-transparent animate-text-shimmer/);
});

test("unfinished direct study visits return to the progress dashboard while setup is pending", async () => {
  const scenario = createScenario({ studies: [studyRow(1)] });
  await assert.rejects(
    scenario.study({ params: Promise.resolve({ studyId: "1" }) }),
    (error) =>
      error instanceof Redirect &&
      error.path.startsWith("/?") &&
      error.path.includes("next=%2Fstudy%2F1")
  );
  assert.deepEqual(scenario.captionLoads, []);
});

test("signed-out users still go to login", async () => {
  const scenario = createScenario({ user: false });
  await assert.rejects(scenario.home({}), (error) => error instanceof Redirect && error.path === "/login");
  assert.equal(scenario.studyLoads, 0);
});

test("only unanswered questions appear when no study is active", async () => {
  const scenario = createScenario({ answered: [1] });
  const page = await scenario.survey({});
  assert.deepEqual(page.props.children.props.questions.map((question) => question.id), ["2"]);
});

test("completed demographics lead to the no-studies state instead of stats", async () => {
  const scenario = createScenario({ answered: [1, 2] });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /No active studies/);
  assert.doesNotMatch(html, /Your Study Stats/);
});

test("answering one question and skipping the other does not create a redirect loop", async () => {
  const scenario = createScenario({ answered: [1], skipped: skips.encodeDemographicSkips(profileId, ["2"]) });
  await assert.rejects(scenario.survey({}), (error) => error instanceof Redirect && error.path === "/");
  assert.match(renderToStaticMarkup(await scenario.home({})), /No active studies/);
});

test("skipping some questions still prompts for other unanswered questions", async () => {
  const scenario = createScenario({ skipped: skips.encodeDemographicSkips(profileId, ["1"]) });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /href="\/demographics\?next=%2F&amp;skipped=1"/);
  const page = await scenario.survey({});
  assert.deepEqual(page.props.children.props.questions.map((question) => question.id), ["2"]);
});

test("another account's skip preferences do not hide this user's questions", async () => {
  const scenario = createScenario({ skipped: skips.encodeDemographicSkips("different-participant", ["1", "2"]) });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Demographics/);
  assert.match(html, /Needs attention/);
});

test("a fresh login clears skips and asks previously skipped questions again", async () => {
  const scenario = createScenario({ skipped: skips.encodeDemographicSkips(profileId, ["1", "2"]) });
  const response = await scenario.callback(new Request("https://example.test/auth/callback?code=test-code"));
  assert.equal(response.url.pathname, "/");
  assert.equal(scenario.cookieValues.has(skips.DEMOGRAPHIC_SKIPS_COOKIE), false);
});

test("login prompts NULL notifications before demographics and preserves a direct study destination", async () => {
  const scenario = createScenario({ notificationPreferences: { notify_new_study_sms: null } });
  const response = await scenario.callback(new Request("https://example.test/auth/callback?code=test-code&next=/study/42"));
  assert.equal(response.url.pathname, "/");
  assert.equal(response.url.searchParams.get("next"), "/study/42");
  assert.equal(response.status, 303);
  assert.equal(scenario.studyLoads, 0);
});

test("a fresh successful login clears notification skips and asks skipped NULL choices again", async () => {
  const cookie = encodeURIComponent(JSON.stringify({ profileId, preferences: ["notify_new_study_email"] }));
  const scenario = createScenario({ answered: [1, 2], notificationSkips: cookie, notificationPreferences: { notify_new_study_email: null } });
  assert.match(renderToStaticMarkup(await scenario.home({})), /No active studies/);
  const response = await scenario.callback(new Request("https://example.test/auth/callback?code=test-code"));
  assert.equal(response.url.pathname, "/");
  assert.equal(scenario.cookieValues.has("notification_skips"), false);
});

test("home shows unanswered notification choices even with no active studies", async () => {
  const scenario = createScenario({ answered: [1, 2], notificationPreferences: { notify_new_study_phone_call: null } });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Notifications/);
  assert.match(html, /href="\/notification-preferences\?next=%2F"/);
  assert.equal(scenario.studyLoads, 1);
});

test("failed login retains notification skips and unavailable preference data fails open", async (t) => {
  t.mock.method(console, "error", () => {});
  const cookie = encodeURIComponent(JSON.stringify({ profileId, preferences: ["notify_new_study_email"] }));
  const failed = createScenario({ exchangeError: true, notificationSkips: cookie });
  assert.equal((await failed.callback(new Request("https://example.test/auth/callback?code=invalid"))).url.pathname, "/login");
  assert.equal(failed.cookieValues.get("notification_skips"), cookie);
  const unavailable = createScenario({ answered: [1, 2], profileLoadError: true });
  assert.equal((await unavailable.callback(new Request("https://example.test/auth/callback?code=test-code"))).url.pathname, "/");
});

test("the login callback keeps unsafe or recursive next paths on the application", async () => {
  const scenario = createScenario({ answered: [1, 2] });
  for (const next of ["//evil.test", "/\\evil.test", "/notification-preferences/"]) {
    const response = await scenario.callback(new Request(`https://example.test/auth/callback?code=test-code&next=${encodeURIComponent(next)}`));
    assert.equal(response.url.pathname, "/");
    assert.notEqual(response.url.hostname, "evil.test");
  }
});

test("unavailable survey data fails open without a survey/home redirect loop", async (t) => {
  t.mock.method(console, "error", () => {});
  const scenario = createScenario({ loadError: true });
  assert.match(renderToStaticMarkup(await scenario.home({})), /No active studies/);
});

function studyRow(id, overrides = {}) {
  return {
    id, slug: `study-${id}`, description: `Description for study ${id}`,
    is_private: false, start_datetime_utc: null, end_datetime_utc: null,
    ...overrides,
  };
}

test("home lists public active studies after demographics and links to each study's caption route", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const scenario = createScenario({
    answered: [1, 2],
    studies: [
      studyRow(1, { start_datetime_utc: past, end_datetime_utc: future }),
      studyRow(2, { is_private: true }),
      studyRow(3, { start_datetime_utc: future }),
      studyRow(4, { end_datetime_utc: past }),
      studyRow(5, { slug: " ", description: null }),
      studyRow(6, { is_private: null }),
    ],
  });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /Active studies/);
  assert.match(html, /Study (?:<!-- -->)?1</);
  assert.match(html, /Study (?:<!-- -->)?5</);
  assert.doesNotMatch(html, /study-1|Description for study 1/);
  assert.deepEqual([...html.matchAll(/dateTime="([^"]+)"/g)].map((match) => match[1]), [past, future]);
  assert.match(html, /UTC<\/time>/);
  assert.match(html, /No start date/);
  assert.match(html, /No end date/);
  assert.deepEqual([...html.matchAll(/href="(\/study\/\d+)"/g)].map((match) => match[1]), ["/study/1", "/study/5"]);
  assert.equal(scenario.studyLoads, 1);
  assert.deepEqual(scenario.captionLoads, [], "captions only load after choosing a study");

  const page = await scenario.study({ params: Promise.resolve({ studyId: "1" }) });
  const studyContent = page.props.children.find((child) => child?.props?.id === "numeric-study-content");
  assert.equal(studyContent.props.children.props.studyId, 1);
  assert.equal(scenario.captionLoads.length, 1);
  assert.ok(scenario.captionLoads.every((scope) => scope.studyId === 1));
  const studyHtml = renderToStaticMarkup(page);
  assert.match(studyHtml, /No captions available for this study/);
  assert.match(studyHtml, /href="\/"[^>]*>Back to studies<\/a>/);
  assert.doesNotMatch(studyHtml, /No studies available|No active studies/);
});

test("only private, upcoming, or expired studies produce the exact empty-state copy", async () => {
  const scenario = createScenario({
    answered: [1, 2],
    studies: [
      studyRow(1, { is_private: true }),
      studyRow(2, { start_datetime_utc: new Date(Date.now() + 86_400_000).toISOString() }),
      studyRow(3, { end_datetime_utc: new Date(Date.now() - 86_400_000).toISOString() }),
    ],
  });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, />No active studies<\/h1>/);
  assert.doesNotMatch(html, /href="\/study\//);
});

test("active study windows include their boundaries and allow an open start or end", async () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  const atBoundary = now.toISOString();
  const scenario = createScenario({ studies: [
    studyRow(1, { start_datetime_utc: atBoundary, end_datetime_utc: atBoundary }),
    studyRow(2, { start_datetime_utc: atBoundary }),
    studyRow(3, { end_datetime_utc: atBoundary }),
    studyRow(4),
    studyRow(5, { start_datetime_utc: "2026-09-25T12:00:00.001Z" }),
    studyRow(6, { end_datetime_utc: "2026-09-25T11:59:59.999Z" }),
  ] });
  const result = await scenario.activeStudies(now);
  assert.equal(result.error, null);
  assert.deepEqual(result.studies.map((study) => study.id), [1, 2, 3, 4]);
});

test("a failed study lookup shows a load error instead of claiming there are no active studies", async (t) => {
  t.mock.method(console, "error", () => {});
  const scenario = createScenario({ answered: [1, 2], studyLoadError: true });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /couldn&#x27;t load studies/);
  assert.doesNotMatch(html, /No active studies/);
});

test("malformed skip cookies are ignored", () => {
  for (const value of [undefined, "not-json", "%", "null", '{"questionIds":[]}']) {
    assert.deepEqual(skips.readDemographicSkips(value, profileId), []);
  }
});

test("home marks only the current user's started-and-ended studies Completed", async () => {
  const savedProgress = {
    captionOrder: [captionId(1), captionId(2), captionId(3)],
    currentCaptionIndex: 2,
    sessionStats: {
      likedCaptionTimeMsByKey: {},
      navigationTimeMsByKey: {},
      viewedCaptionKeys: {},
    },
  };
  const scenario = createScenario({
    answered: [1, 2], studies: [studyRow(1), studyRow(2), studyRow(3)],
    participations: [
      { profile_id: profileId, study_id: 1, started_at: "2026-10-01T12:00:00Z", ended_at: "2026-10-01T13:00:00Z" },
      { profile_id: profileId, study_id: 2, started_at: "2026-10-01T12:00:00Z", ended_at: null, progress: savedProgress },
      { profile_id: "someone-else", study_id: 3, started_at: "2026-10-01T12:00:00Z", ended_at: "2026-10-01T13:00:00Z" },
    ],
  });
  const html = renderToStaticMarkup(await scenario.home({}));
  const cards = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((match) => match[1]);
  assert.match(cards[0], /Completed/);
  assert.match(cards[1], /In progress/);
  assert.match(cards[1], /Resume study/);
  assert.match(cards[1], /Caption 3 of 3/);
  assert.doesNotMatch(cards[1], /Completed/);
  assert.match(cards[0], /View results/);
  assert.doesNotMatch(cards[2], /Completed|In progress/);
});

test("the dashboard disables study links until required setup is complete", async () => {
  const scenario = createScenario({
    studies: [studyRow(1)],
    notificationPreferences: { notify_new_study_sms: null },
  });
  const html = renderToStaticMarkup(await scenario.home({}));
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Complete setup to continue/);
  assert.doesNotMatch(html, /href="\/study\/1"/);
});

test("reopening a completed study shows saved stats without loading captions or offering start/end", async () => {
  const scenario = createScenario({
    studies: [studyRow(1)],
    participations: [{ profile_id: profileId, study_id: 1, started_at: "2026-10-01T12:00:00Z", ended_at: "2026-10-01T13:00:00Z", completion_stats: completionStats }],
  });
  const html = renderToStaticMarkup(await scenario.study({ params: Promise.resolve({ studyId: "1" }) }));
  assert.match(html, /Study Completed/);
  assert.match(html, /Study Stats/);
  assert.match(html, /33.3%/);
  assert.match(html, /1,200 ms/);
  assert.match(html, /2,000 ms/);
  assert.doesNotMatch(html, /Start Study|Continue Study|End Study|No captions/);
  assert.deepEqual(scenario.captionLoads, []);
});

test("completed studies still show stats after expiration; unfinished studies stay expired", async () => {
  const studies = [studyRow(1, { end_datetime_utc: new Date(Date.now() - 86_400_000).toISOString() })];
  const completed = createScenario({ studies, participations: [
    { profile_id: profileId, study_id: 1, started_at: "2026-01-01T12:00:00Z", ended_at: "2026-01-01T13:00:00Z", completion_stats: completionStats },
  ] });
  const html = renderToStaticMarkup(await completed.study({ params: Promise.resolve({ studyId: "1" }) }));
  assert.match(html, /Study Stats/);
  assert.doesNotMatch(html, /expired|Start Study|End Study/);
  assert.deepEqual(completed.captionLoads, []);
  const unfinished = createScenario({ studies });
  assert.match(renderToStaticMarkup(await unfinished.study({ params: Promise.resolve({ studyId: "1" }) })), /this study is expired/);
});

test("stats validation rejects incomplete or invalid data and keeps real zero values", () => {
  for (const invalid of [null, {}, [], { ...completionStats, likedCount: 4 },
    { ...completionStats, viewedCount: -1 }, { ...completionStats, medianVoteTimeMs: Infinity },
    { ...completionStats, medianNavigationTimeMs: 1.5 }]) {
    assert.equal(statsModule.parseStudyStats(invalid), null);
  }
  const zero = { likedCount: 0, viewedCount: 0, medianVoteTimeMs: null, medianNavigationTimeMs: 0 };
  assert.deepEqual(statsModule.parseStudyStats(zero), zero);
});

test("saved study progress validation rejects unsafe cursor and timing data", () => {
  const valid = {
    captionOrder: [captionId(1), captionId(2)],
    currentCaptionIndex: 1,
    sessionStats: {
      likedCaptionTimeMsByKey: { "mapping:1": 120 },
      navigationTimeMsByKey: {},
      viewedCaptionKeys: { "mapping:1": true },
    },
  };
  assert.deepEqual(studyProgressModule.parseStudyProgress(valid), valid);
  for (const invalid of [
    { ...valid, captionOrder: [captionId(1), captionId(1)] },
    { ...valid, currentCaptionIndex: 2 },
    { ...valid, currentCaptionIndex: -1 },
    { ...valid, sessionStats: { ...valid.sessionStats, likedCaptionTimeMsByKey: { "mapping:1": -1 } } },
    { ...valid, sessionStats: { ...valid.sessionStats, viewedCaptionKeys: { "mapping:1": false } } },
  ]) {
    assert.equal(studyProgressModule.parseStudyProgress(invalid), null);
  }
});

test("progress lookup failures are visible and do not open an untracked study", async (t) => {
  t.mock.method(console, "error", () => {});
  const scenario = createScenario({ answered: [1, 2], studies: [studyRow(1)], participationLoadError: true });
  const home = renderToStaticMarkup(await scenario.home({}));
  assert.match(home, /couldn&#x27;t load your study completion status/);
  assert.match(home, /href="\/study\/1"/);
  const study = renderToStaticMarkup(await scenario.study({ params: Promise.resolve({ studyId: "1" }) }));
  assert.match(study, /couldn&#x27;t load your study progress/);
  assert.deepEqual(scenario.captionLoads, []);
});

test("study participation actions authenticate, validate, propagate failures, and refresh home", async (t) => {
  t.mock.method(console, "error", () => {});
  let signedIn = true;
  let fail = false;
  const calls = [];
  const revalidated = [];
  const participation = { profile_id: profileId, study_id: 1, started_at: "2026-10-01T12:00:00Z", ended_at: null };
  const actions = loadModule("src/app/study/actions.ts", {
    "@/lib/study-stats": statsModule,
    "@/lib/study-progress": studyProgressModule,
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: profileId } : null } }) },
      rpc: (name, args) => {
        calls.push({ name, args });
        return { single: async () => fail ? { data: null, error: { message: "offline" } } : { data: participation, error: null } };
      },
    }) },
  });
  for (const id of [0, -1, 1.2, NaN, Infinity, "1"]) {
    assert.equal((await actions.startStudy(id)).success, false);
  }
  signedIn = false;
  assert.equal((await actions.endStudy(1, completionStats)).success, false);
  assert.deepEqual(calls, []);
  signedIn = true;
  assert.equal((await actions.endStudy(1, { ...completionStats, likedCount: 4 })).success, false);
  const progress = {
    captionOrder: [captionId(1), captionId(2)],
    currentCaptionIndex: 1,
    sessionStats: {
      likedCaptionTimeMsByKey: {},
      navigationTimeMsByKey: {},
      viewedCaptionKeys: {},
    },
  };
  assert.equal((await actions.saveStudyProgress(1, { ...progress, currentCaptionIndex: 2 })).success, false);
  assert.deepEqual(calls, []);
  fail = true;
  assert.equal((await actions.startStudy(1)).success, false);
  assert.equal((await actions.saveStudyProgress(1, progress)).success, false);
  assert.deepEqual(revalidated, []);
  fail = false;
  assert.deepEqual(await actions.startStudy(1), { success: true, participation });
  assert.deepEqual(await actions.endStudy(1, completionStats), { success: true, participation });
  assert.deepEqual(await actions.saveStudyProgress(1, progress), { success: true, participation });
  assert.deepEqual(calls.slice(2), [
    { name: "start_study", args: { p_study_id: 1 } },
    { name: "end_study", args: { p_study_id: 1, p_completion_stats: completionStats } },
    { name: "save_study_progress", args: { p_study_id: 1, p_progress: progress } },
  ]);
  assert.deepEqual(revalidated, ["/", "/", "/"]);
});
